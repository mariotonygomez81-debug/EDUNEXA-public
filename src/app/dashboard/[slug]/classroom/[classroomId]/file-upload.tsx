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

  async function uploadFiles(files: FileList | null) {
    const selected = Array.from(files ?? []);
    if (!selected.length) return;
    setMessage("");
    if (!materialId && !submissionId) {
      setMessage("No se indicó el destino del archivo.");
      return;
    }
    setBusy(true);
    let uploaded = 0;
    const errors: string[] = [];
    try {
      const supabase = createClient();
      for (const file of selected) {
        if (!ALLOWED_MIME_TYPES.has(file.type)) {
          errors.push(`${file.name}: formato no permitido.`);
          continue;
        }
        if (file.size < 1 || file.size > MAX_FILE_SIZE) {
          errors.push(`${file.name}: debe pesar hasta 10 MB.`);
          continue;
        }
        try {
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
          if (!intent) throw new Error("No se pudo autorizar la carga.");
          const { error: uploadError } = await supabase.storage.from("classroom-files").upload(
            intent.object_path, file, { cacheControl: "3600", contentType: file.type, upsert: false },
          );
          if (uploadError) throw uploadError;
          const { error: finalizeError } = await supabase.rpc("finalize_classroom_file_upload", { p_file_id: intent.file_id });
          if (finalizeError) throw new Error("No se pudo validar el archivo cargado.");
          uploaded += 1;
        } catch (error) {
          errors.push(`${file.name}: ${error instanceof Error ? error.message : "error de carga"}`);
        }
      }
      setMessage(errors.length
        ? `${uploaded} archivo(s) cargado(s). ${errors.join(" ")}`
        : `${uploaded} archivo(s) cargado(s) correctamente.`);
      if (uploaded) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <label className="w-fit cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
        {busy ? "Cargando archivos..." : "Adjuntar uno o varios archivos"}
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.txt,.docx,.pptx,.xlsx"
          disabled={busy}
          className="sr-only"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            void uploadFiles(event.currentTarget.files);
            event.currentTarget.value = "";
          }}
        />
      </label>
      {message ? (
        <p className="text-xs text-slate-600" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
      <p className="text-xs text-slate-400">Podés seleccionar varios archivos. Máximo 10 MB por archivo. Se guardan en un espacio privado.</p>
    </div>
  );
}
