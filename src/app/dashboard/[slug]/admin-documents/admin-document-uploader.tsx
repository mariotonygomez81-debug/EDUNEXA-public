"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, UploadCloud } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createAdminDocumentFileIntent, finalizeAdminDocumentFile } from "./actions";

const allowedMimeTypes = [
  "application/pdf", "image/jpeg", "image/png", "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
const maxBytes = 10 * 1024 * 1024;

export default function AdminDocumentUploader({ slug, documentId }: { slug: string; documentId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy) return;
    if (!allowedMimeTypes.includes(file.type) || file.size < 1 || file.size > maxBytes) {
      setMessage("Tipo de archivo no permitido o tamaño superior a 10 MB.");
      return;
    }
    setBusy(true);
    setMessage("Preparando carga privada…");
    try {
      const intent = await createAdminDocumentFileIntent(slug, documentId, file.name, file.type, file.size);
      if (!intent.ok) { setMessage(intent.message); return; }
      const { error } = await createClient().storage.from(intent.bucket).upload(intent.path, file, {
        contentType: file.type, upsert: false,
      });
      if (error) { setMessage("No se pudo subir el archivo. Intentá nuevamente."); return; }
      const result = await finalizeAdminDocumentFile(slug, documentId, intent.fileId);
      if (!result.ok) { setMessage(result.message); return; }
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setMessage("Adjunto guardado correctamente.");
      router.refresh();
    } catch {
      setMessage("Ocurrió un error durante la carga. Intentá nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={upload} className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <Paperclip size={16} className="text-violet-700" /> Adjuntar documentación
      </div>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.txt,.docx,.pptx,.xlsx"
          disabled={busy} onChange={(event) => { setFile(event.target.files?.[0] ?? null); setMessage(""); }}
          className="min-w-0 flex-1 text-sm" />
        <button type="submit" disabled={!file || busy}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          <UploadCloud size={15} /> {busy ? "Subiendo…" : "Subir archivo"}
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">PDF, JPG, PNG, TXT, DOCX, PPTX o XLSX. Máximo 10 MB. Almacenamiento privado.</p>
      {message && <p role="status" className="mt-2 text-xs text-slate-600">{message}</p>}
    </form>
  );
}
