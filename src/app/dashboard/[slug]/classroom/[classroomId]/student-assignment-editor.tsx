"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bold, Italic, Underline, List, ListOrdered, Heading1, Heading2, Undo2, Redo2, FileDown, Send, LoaderCircle, CheckCircle2, AlignLeft, AlignCenter, AlignRight, Link2, Quote } from "lucide-react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createClient } from "@/lib/supabase/client";
import { submitClassroomAssignment } from "./actions";

type Props = {
  slug: string;
  classroomId: string;
  assignmentId: string;
  assignmentTitle: string;
  existingSubmissionId?: string;
  initialBody?: string | null;
  locked?: boolean;
};

const MAX_BODY = 20000;
const MAX_PDF_BYTES = 10 * 1024 * 1024;

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function richTextFromHtml(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,iframe,object").forEach((node) => node.remove());
  const render = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    if (!(node instanceof HTMLElement)) return "";
    const inner = Array.from(node.childNodes).map(render).join("");
    const tag = node.tagName.toLowerCase();
    if (tag === "h2") return "# " + inner.trim() + "\n\n";
    if (tag === "h3") return "## " + inner.trim() + "\n\n";
    if (tag === "blockquote") return "> " + inner.trim() + "\n";
    if (tag === "li") return "- " + inner.trim() + "\n";
    if (["strong","b"].includes(tag)) return "**" + inner + "**";
    if (["em","i"].includes(tag)) return "*" + inner + "*";
    if (["p","div","ul","ol"].includes(tag)) return inner.trim() + "\n";
    if (tag === "br") return "\n";
    return inner;
  };
  return Array.from(doc.body.childNodes).map(render).join("").replace(/\n{3,}/g, "\n\n").trim();
}

function plainTextFromHtml(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,iframe,object").forEach((node) => node.remove());
  return (doc.body.innerText || doc.body.textContent || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function createTaskPdf(title: string, body: string) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const pageSize: [number, number] = [595.28, 841.89];
  const margin = 54;
  const fontSize = 11;
  const lineHeight = 17;
  let page = pdf.addPage(pageSize);
  let y = page.getHeight() - margin;

  const addPage = () => {
    page = pdf.addPage(pageSize);
    y = page.getHeight() - margin;
  };
  const drawWrapped = (text: string, font = regular, size = fontSize, indent = 0) => {
    const maxWidth = page.getWidth() - margin * 2 - indent;
    const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
    let runs: { text: string; font: typeof regular }[] = [];
    let lineWidth = 0;
    const flushLine = () => {
      if (!runs.length) return;
      if (y < margin + lineHeight) addPage();
      let x = margin + indent;
      for (const run of runs) {
        page.drawText(run.text, { x, y, size, font: run.font, color: rgb(0.16, 0.20, 0.24) });
        x += run.font.widthOfTextAtSize(run.text, size);
      }
      y -= lineHeight;
      runs = [];
      lineWidth = 0;
    };
    for (const token of tokens) {
      const tokenFont = token.startsWith("**") ? bold : token.startsWith("*") ? italic : font;
      const clean = token.replace(/^\*\*|\*\*$/g, "").replace(/^\*|\*$/g, "");
      const pieces = clean.match(/\S+\s*/g) ?? [];
      for (const piece of pieces) {
        const width = tokenFont.widthOfTextAtSize(piece, size);
        if (lineWidth > 0 && lineWidth + width > maxWidth) flushLine();
        runs.push({ text: piece, font: tokenFont });
        lineWidth += width;
      }
    }
    flushLine();
  };

  const pdfTitle = title.replace(/[^\u0000-\u00FF]/g, "?").slice(0, 90);
  page.drawText(pdfTitle, { x: margin, y, size: 19, font: bold, color: rgb(0.08, 0.28, 0.22) });
  y -= 30;
  page.drawText("EDUNEXA · Entrega de actividad", { x: margin, y, size: 9, font: regular, color: rgb(0.40, 0.45, 0.48) });
  y -= 25;
  page.drawLine({ start: { x: margin, y }, end: { x: page.getWidth() - margin, y }, thickness: 1, color: rgb(0.83, 0.87, 0.85) });
  y -= 24;

  const lines = body.replace(/[^\u0000-\u00FF]/g, "?").split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) { y -= 8; continue; }
    if (/^#{1,2}\s/.test(line)) {
      y -= 5;
      drawWrapped(line.replace(/^#{1,2}\s/, ""), bold, line.startsWith("# ") ? 15 : 13);
      y -= 4;
    } else if (/^[-*]\s/.test(line)) {
      drawWrapped("- " + line.slice(2), regular, fontSize, 10);
    } else if (/^\d+[.)]\s/.test(line)) {
      drawWrapped(line, regular, fontSize, 10);
    } else {
      drawWrapped(line);
    }
  }

  const pages = pdf.getPages();
  pages.forEach((p, index) => {
    p.drawText("Documento generado desde EDUNEXA", { x: margin, y: 25, size: 8, font: regular, color: rgb(0.50, 0.54, 0.56) });
    const label = String(index + 1) + " / " + String(pages.length);
    p.drawText(label, { x: p.getWidth() - margin - regular.widthOfTextAtSize(label, 8), y: 25, size: 8, font: regular, color: rgb(0.50, 0.54, 0.56) });
  });
  return new Blob([await pdf.save()], { type: "application/pdf" });
}

export default function StudentAssignmentEditor({
  slug, classroomId, assignmentId, assignmentTitle, existingSubmissionId, initialBody, locked = false,
}: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [html, setHtml] = useState((initialBody || "").split("\n").map(escapeHtml).join("<br>"));

  function syncEditor() {
    const value = editorRef.current?.innerHTML ?? "";
    const text = plainTextFromHtml(value);
    setHtml(value);
    setWordCount(text ? text.split(/\s+/).length : 0);
    setSaved(false);
  }

  function command(name: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(name, false, value);
    syncEditor();
  }

  async function downloadPdf() {
    const text = richTextFromHtml(editorRef.current?.innerHTML ?? html);
    if (!plainTextFromHtml(editorRef.current?.innerHTML ?? html)) { setMessage("Escribí el contenido de tu tarea antes de generar el PDF."); return; }
    try {
      const blob = await createTaskPdf(assignmentTitle, text);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "Tarea-" + assignmentTitle.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 55) + ".pdf";
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage("PDF generado. Al enviar la tarea, también se adjuntará automáticamente.");
    } catch {
      setMessage("No se pudo generar el PDF. Probá nuevamente.");
    }
  }

  async function submit() {
    const body = plainTextFromHtml(editorRef.current?.innerHTML ?? html);
    if (!body) { setMessage("Completá el documento antes de entregar."); return; }
    if (body.length > MAX_BODY) { setMessage("El documento supera el máximo de 20.000 caracteres."); return; }
    setBusy(true);
    setMessage("");
    try {
      const pdfBlob = await createTaskPdf(assignmentTitle, richTextFromHtml(editorRef.current?.innerHTML ?? html));
      if (pdfBlob.size > MAX_PDF_BYTES) throw new Error("El PDF supera el límite de 10 MB.");
      const formData = new FormData();
      formData.set("slug", slug);
      formData.set("classroom_id", classroomId);
      formData.set("assignment_id", assignmentId);
      formData.set("body", body);
      const result = await submitClassroomAssignment(formData);
      if (!result.ok || !result.submissionId) throw new Error(result.message || "No se pudo registrar la entrega.");

      const supabase = createClient();
      const fileName = "Tarea-" + assignmentTitle.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 55) + ".pdf";
      const { data: intentRows, error: intentError } = await supabase.rpc("create_classroom_file_upload_intent", {
        p_material_id: null,
        p_submission_id: result.submissionId,
        p_original_filename: fileName,
        p_mime_type: "application/pdf",
        p_byte_size: pdfBlob.size,
      });
      if (intentError) throw new Error("La respuesta se guardó, pero no se pudo preparar el PDF para adjuntarlo.");
      const intent = intentRows?.[0];
      if (!intent) throw new Error("La respuesta se guardó, pero no se recibió la autorización de carga del PDF.");
      const { error: uploadError } = await supabase.storage.from("classroom-files").upload(intent.object_path, pdfBlob, {
        cacheControl: "3600", contentType: "application/pdf", upsert: false,
      });
      if (uploadError) throw new Error("La respuesta se guardó, pero falló la carga del PDF. Podés adjuntarlo nuevamente.");
      const { error: finalizeError } = await supabase.rpc("finalize_classroom_file_upload", { p_file_id: intent.file_id });
      if (finalizeError) throw new Error("El PDF se cargó, pero no pudo validarse. Volvé a intentarlo desde los archivos adjuntos.");
      setSaved(true);
      setMessage("¡Tarea entregada! El documento PDF quedó adjunto para tu docente.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo completar la entrega.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-sm">
      <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50 to-indigo-50 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><p className="text-xs font-bold uppercase tracking-wider text-violet-700">Espacio de producción</p><h4 className="mt-1 text-base font-bold text-slate-900">Editor de tu tarea</h4></div>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-violet-800">Documento → PDF</span>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-600">Redactá, organizá y dale formato a tu trabajo. EDUNEXA genera el PDF y lo adjunta automáticamente a tu entrega.</p>
      </div>
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 p-2">
        <button type="button" title="Negrita" aria-label="Negrita" disabled={locked || busy} onClick={() => command("bold")} className="rounded-lg p-2 text-slate-700 hover:bg-white disabled:opacity-40"><Bold size={17}/></button>
        <button type="button" title="Cursiva" aria-label="Cursiva" disabled={locked || busy} onClick={() => command("italic")} className="rounded-lg p-2 text-slate-700 hover:bg-white disabled:opacity-40"><Italic size={17}/></button>
        <button type="button" title="Subrayado" aria-label="Subrayado" disabled={locked || busy} onClick={() => command("underline")} className="rounded-lg p-2 text-slate-700 hover:bg-white disabled:opacity-40"><Underline size={17}/></button>
        <span className="mx-1 h-6 w-px bg-slate-200"/>
        <button type="button" title="Título" disabled={locked || busy} onClick={() => command("formatBlock", "h2")} className="rounded-lg p-2 text-slate-700 hover:bg-white disabled:opacity-40"><Heading1 size={17}/></button>
        <button type="button" title="Subtítulo" disabled={locked || busy} onClick={() => command("formatBlock", "h3")} className="rounded-lg p-2 text-slate-700 hover:bg-white disabled:opacity-40"><Heading2 size={17}/></button>
        <span className="mx-1 h-6 w-px bg-slate-200"/>
        <button type="button" title="Lista con viñetas" disabled={locked || busy} onClick={() => command("insertUnorderedList")} className="rounded-lg p-2 text-slate-700 hover:bg-white disabled:opacity-40"><List size={17}/></button>
        <button type="button" title="Lista numerada" disabled={locked || busy} onClick={() => command("insertOrderedList")} className="rounded-lg p-2 text-slate-700 hover:bg-white disabled:opacity-40"><ListOrdered size={17}/></button>
        <button type="button" title="Cita" disabled={locked || busy} onClick={() => command("formatBlock", "blockquote")} className="rounded-lg p-2 text-slate-700 hover:bg-white disabled:opacity-40"><Quote size={17}/></button>
        <button type="button" title="Alinear a la izquierda" disabled={locked || busy} onClick={() => command("justifyLeft")} className="rounded-lg p-2 text-slate-700 hover:bg-white disabled:opacity-40"><AlignLeft size={17}/></button>
        <button type="button" title="Centrar" disabled={locked || busy} onClick={() => command("justifyCenter")} className="rounded-lg p-2 text-slate-700 hover:bg-white disabled:opacity-40"><AlignCenter size={17}/></button>
        <button type="button" title="Alinear a la derecha" disabled={locked || busy} onClick={() => command("justifyRight")} className="rounded-lg p-2 text-slate-700 hover:bg-white disabled:opacity-40"><AlignRight size={17}/></button>
        <button type="button" title="Insertar enlace" disabled={locked || busy} onClick={() => { const url = window.prompt("Pegá la dirección del enlace (https://...)"); if (url && /^https?:\/\//i.test(url)) command("createLink", url); }} className="rounded-lg p-2 text-slate-700 hover:bg-white disabled:opacity-40"><Link2 size={17}/></button>
        <span className="mx-1 h-6 w-px bg-slate-200"/>
        <button type="button" title="Deshacer" disabled={locked || busy} onClick={() => command("undo")} className="rounded-lg p-2 text-slate-700 hover:bg-white disabled:opacity-40"><Undo2 size={17}/></button>
        <button type="button" title="Rehacer" disabled={locked || busy} onClick={() => command("redo")} className="rounded-lg p-2 text-slate-700 hover:bg-white disabled:opacity-40"><Redo2 size={17}/></button>
        <span className="ml-auto text-[11px] text-slate-500">{wordCount} palabras</span>
      </div>
      <div className="p-3 sm:p-5">
        <div
          ref={editorRef}
          contentEditable={!locked && !busy}
          suppressContentEditableWarning
          onInput={syncEditor}
          onBlur={syncEditor}
          dangerouslySetInnerHTML={{ __html: html }}
          role="textbox"
          aria-label="Contenido de la tarea"
          aria-multiline="true"
          data-placeholder="Comenzá a escribir tu tarea acá. Podés agregar títulos, subtítulos, listas y destacar ideas importantes..."
          className="min-h-[320px] rounded-xl border border-slate-200 bg-white px-4 py-4 text-sm leading-7 text-slate-800 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100 [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:text-lg [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:my-1"
        />
        {locked ? <p className="mt-2 text-xs text-amber-700">Esta entrega ya tiene calificación y no puede modificarse.</p> : null}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={downloadPdf} disabled={busy || locked} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><FileDown size={16}/> Descargar vista previa PDF</button>
          <button type="button" onClick={submit} disabled={busy || locked || saved} className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-700 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-400">{busy ? <LoaderCircle className="animate-spin" size={17}/> : saved ? <CheckCircle2 size={17}/> : <Send size={16}/>} {busy ? "Preparando y entregando..." : saved ? "Entrega realizada" : existingSubmissionId ? "Actualizar entrega y PDF" : "Entregar tarea en PDF"}</button>
        </div>
        {message ? <p role="status" aria-live="polite" className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700">{message}</p> : null}
        <p className="mt-3 text-[11px] leading-5 text-slate-400">El documento se guarda como PDF en el espacio privado del aula. También podés adjuntar otros archivos después de entregar.</p>
      </div>
    </section>
  );
}
