"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

type ClassroomFileUploadProps = {
  materialId?: string;
  submissionId?: string;
};

export default function ClassroomFileUpload({
  materialId,
  submissionId,
}: ClassroomFileUploadProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function uploadFile(file: File | undefined) {
    if (!file) return;
    setMessage("");

    if (!materialId && !submissionId) {
      setMessage("No se indicó el destino del archivo.");
      return;
    }
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      setMessage("Tipo de archivo no permitido. Usá PDF, JPG, PNG, TXT, DOCX, PPTX o XLSX.");
      return;
    }
    if (file.size < 1 || file.size > MAX_FILE_SIZE) {
      setMessage("El archivo debe pesar como máximo 10 MB.");
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const { data: intentRows, error: intentError } = await supabase.rpc(
        "create_classroom_file_upload_intent",
        {
          p_material_id: materialId ?? null,
          p_submission_id: submissionId ?? null,
          p_original_filename: file.name,
          p_mime_type: file.type,
          p_byte_size: file.size,
        },
      );

      if (intentError) throw intentError;
      const intent = intentRows?.[0];
      if (!intent) throw new Error("No se pudo crear la autorización de carga.");

      const { error: uploadError } = await supabase.storage
        .from("classroom-files")
        .upload(intent.object_path, file, {
          cacheControl: "3600",
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { error: finalizeError } = await supabase.rpc(
        "finalize_classroom_file_upload",
        { p_file_id: intent.file_id },
      );
      if (finalizeError) {
        throw new Error("El archivo se cargó, pero no pudo validarse. No estará disponible para descarga hasta completar la validación.");
      }

      setMessage("Archivo cargado correctamente.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cargar el archivo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <label className="w-fit cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
        {busy ? "Cargando archivo..." : "Adjuntar archivo"}
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.txt,.docx,.pptx,.xlsx"
          disabled={busy}
          className="sr-only"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            void uploadFile(file);
            event.currentTarget.value = "";
          }}
        />
      </label>
      {message ? (
        <p className="text-xs text-slate-600" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
      <p className="text-xs text-slate-400">Máximo 10 MB. Los archivos se guardan en un espacio privado.</p>
    </div>
  );
}
