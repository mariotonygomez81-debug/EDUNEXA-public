"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, UploadCloud } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  createSupportTicketAttachmentIntent,
  finalizeSupportTicketAttachment,
} from "./actions";

const allowedMimeTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

const maxBytes = 10 * 1024 * 1024;

export default function SupportTicketAttachmentUploader({
  slug,
  ticketId,
}: {
  slug: string;
  ticketId: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy) return;

    if (!allowedMimeTypes.includes(file.type) || file.size < 1 || file.size > maxBytes) {
      setMessage("Tipo de archivo no permitido o tamaño superior a 10 MB.");
      return;
    }

    setBusy(true);
    setMessage("Preparando carga segura…");
    try {
      const intent = await createSupportTicketAttachmentIntent(
        slug,
        ticketId,
        file.name,
        file.type,
        file.size,
      );
      if (!intent.ok) {
        setMessage(intent.message);
        return;
      }

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(intent.bucket)
        .upload(intent.path, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        setMessage("No se pudo subir el archivo. Verificá tu conexión e intentá nuevamente.");
        return;
      }

      const finalized = await finalizeSupportTicketAttachment(
        slug,
        ticketId,
        intent.attachmentId,
      );
      if (!finalized.ok) {
        setMessage(finalized.message);
        return;
      }

      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setMessage("Archivo adjuntado correctamente.");
      router.refresh();
    } catch {
      setMessage("Ocurrió un error durante la carga. Intentá nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleUpload} className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <Paperclip size={17} className="text-violet-700" />
        Adjuntar un archivo
      </div>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.txt,.docx,.pptx,.xlsx"
          disabled={busy}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setMessage("");
          }}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-violet-800 hover:file:bg-violet-200"
        />
        <button
          type="submit"
          disabled={!file || busy}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <UploadCloud size={16} />
          {busy ? "Subiendo…" : "Subir archivo"}
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        PDF, imágenes, TXT, DOCX, PPTX o XLSX. Máximo 10 MB. No adjuntes contraseñas ni información sensible de alumnos.
      </p>
      {message && <p role="status" className="mt-3 text-sm text-slate-600">{message}</p>}
    </form>
  );
}
