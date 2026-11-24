"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bold, Italic, Underline, List, ListOrdered, Heading1, Heading2, Undo2, Redo2, FileDown, Send, LoaderCircle, CheckCircle2, AlignLeft, AlignCenter, AlignRight, Link2, Quote, Strikethrough, Highlighter, Subscript, Superscript, Indent, Outdent, Eraser, Table2, Minus, Palette, ImagePlus, Eye, Save, X, FileText } from "lucide-react";
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
    const tag = node.tagName.toLowerCase();
    if (tag === "img") { const src = node.getAttribute("src") || ""; return (src.startsWith("data:image/png;base64,") || src.startsWith("data:image/jpeg;base64,")) ? "[[EDUNEXA_IMAGE:" + src + "]]\\n" : ""; }
    const inner = Array.from(node.childNodes).map(render).join("");
    if (tag === "h2") return "# " + inner.trim() + "\n\n";
    if (tag === "h3") return "## " + inner.trim() + "\n\n";
    if (tag === "blockquote") return "> " + inner.trim() + "\n";
    if (tag === "li") return "- " + inner.trim() + "\n";
    if (tag === "tr") return Array.from(node.childNodes).map((cell) => render(cell)).join(" | ") + "\n";
    if (tag === "td" || tag === "th") return inner.trim();
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

async function createTaskPdf(title: string, body: string, header = "", footer = "") {
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
    if (header.trim()) p.drawText(header.slice(0, 100), { x: margin, y: p.getHeight() - 25, size: 8, font: regular, color: rgb(0.40, 0.45, 0.48) });
    p.drawText((footer.trim() || "Documento generado desde EDUNEXA").slice(0, 100), { x: margin, y: 25, size: 8, font: regular, color: rgb(0.50, 0.54, 0.56) });
    const label = String(index + 1) + " / " + String(pages.length);
    p.drawText(label, { x: p.getWidth() - margin - regular.widthOfTextAtSize(label, 8), y: 25, size: 8, font: regular, color: rgb(0.50, 0.54, 0.56) });
  });
  const pdfBytes = await pdf.save();
  const pdfBuffer = new ArrayBuffer(pdfBytes.byteLength);
  new Uint8Array(pdfBuffer).set(pdfBytes);
  return new Blob([pdfBuffer], { type: "application/pdf" });
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
  const [charCount, setCharCount] = useState(0);
  const [html, setHtml] = useState((initialBody || "").split("\n").map(escapeHtml).join("<br>"));
  const [header, setHeader] = useState("");
  const [footer, setFooter] = useState("");
  const [draftStatus, setDraftStatus] = useState("Sin cambios guardados");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const draftKey = "edunexa:draft:" + slug + ":" + classroomId + ":" + assignmentId;
  useEffect(() => { try { const raw = sessionStorage.getItem(draftKey); if (raw && !initialBody) { const d = JSON.parse(raw); if (typeof d.html === "string" && d.html.length < 1000000) { setHtml(d.html); setHeader(d.header || ""); setFooter(d.footer || ""); setDraftStatus("Borrador recuperado"); } } } catch { setDraftStatus("No se pudo recuperar"); } }, [draftKey, initialBody]);
  useEffect(() => { if (locked || saved) return; const timer = window.setTimeout(() => { try { sessionStorage.setItem(draftKey, JSON.stringify({html,header,footer})); setDraftStatus("Borrador guardado en este dispositivo"); } catch { setDraftStatus("No se pudo guardar"); } }, 700); return () => window.clearTimeout(timer); }, [draftKey, html, header, footer, locked, saved]);

  function syncEditor() {
    const value = editorRef.current?.innerHTML ?? "";
    const text = plainTextFromHtml(value);
    setHtml(value);
    setWordCount(text ? text.split(/\s+/).length : 0);
    setCharCount(text.length);
    setSaved(false);
  }

  function command(name: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(name, false, value);
    syncEditor();
  }

  function insertTable() {
    const rows = Math.max(2, Math.min(8, Number(window.prompt("Filas (2 a 8)", "3")) || 3));
    const cols = Math.max(2, Math.min(6, Number(window.prompt("Columnas (2 a 6)", "3")) || 3));
    const table = "<table><tbody>" + Array.from({ length: rows }, (_, row) => "<tr>" + Array.from({ length: cols }, () => row === 0 ? "<th>Encabezado</th>" : "<td>Escribí aquí</td>").join("") + "</tr>").join("") + "</tbody></table><p><br></p>";
    command("insertHTML", table);
  }

  function insertImage(file?: File) {
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 4 * 1024 * 1024) { setMessage("Elegí una imagen PNG o JPG de hasta 4 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => { const src = typeof reader.result === "string" ? reader.result : ""; if (src) command("insertHTML", "<img src=\"" + src + "\" alt=\"" + escapeHtml(file.name) + "\" style=\"max-width:100%;height:auto\"/><p><br></p>"); };
    reader.onerror = () => setMessage("No se pudo leer la imagen.");
    reader.readAsDataURL(file);
  }

  function applyTemplate(kind: string) {
    const templates: Record<string,string> = {
      practical: "<h2>Trabajo práctico</h2><p><strong>Objetivos</strong></p><p><strong>Materiales y procedimiento</strong></p><p><strong>Resultados</strong></p><p><strong>Conclusión</strong></p>",
      report: "<h2>Informe</h2><p><strong>Introducción</strong></p><p><strong>Desarrollo</strong></p><p><strong>Conclusión</strong></p><p><strong>Bibliografía</strong></p>",
      monograph: "<h2>Monografía</h2><p><strong>Resumen</strong></p><p><strong>Introducción</strong></p><p><strong>Marco teórico</strong></p><p><strong>Desarrollo</strong></p><p><strong>Conclusiones</strong></p><p><strong>Bibliografía</strong></p>",
      project: "<h2>Proyecto</h2><p><strong>Fundamentación</strong></p><p><strong>Problema</strong></p><p><strong>Objetivos</strong></p><p><strong>Plan de trabajo</strong></p><p><strong>Resultados esperados</strong></p>"
    };
    if (templates[kind] && (!plainTextFromHtml(editorRef.current?.innerHTML ?? html) || window.confirm("La plantilla se agregará al contenido actual. ¿Continuar?"))) command("insertHTML", templates[kind]);
  }

  function insertLink() {
    const url = window.prompt("Pegá un enlace http:// o https://");
    if (!url) return;
    try { const parsed = new URL(url); if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("invalid"); command("createLink", parsed.toString()); }
    catch { setMessage("Ingresá una dirección válida que comience con http:// o https://."); }
  }

  async function downloadPdf() {
    const text = richTextFromHtml(editorRef.current?.innerHTML ?? html);
    if (!plainTextFromHtml(editorRef.current?.innerHTML ?? html)) { setMessage("Escribí el contenido de tu tarea antes de generar el PDF."); return; }
    try {
      const blob = await createTaskPdf(assignmentTitle, text, header, footer);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
      setMessage("Vista previa del PDF lista. Revisá el documento antes de entregarlo.");
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
      const pdfBlob = await createTaskPdf(assignmentTitle, richTextFromHtml(editorRef.current?.innerHTML ?? html), header, footer);
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
      try { sessionStorage.removeItem(draftKey); } catch { /* storage unavailable */ }
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
    <section className="student-assignment-editor mt-4 overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-sm">
      <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50 to-indigo-50 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><p className="text-xs font-bold uppercase tracking-wider text-violet-700">Espacio de producción</p><h4 className="mt-1 text-base font-bold text-slate-900">Editor de tu tarea</h4></div>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-violet-800">Documento → PDF</span>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-600">Redactá, organizá y dale formato a tu trabajo: títulos, listas, citas, tablas, enlaces, color, resaltado y fórmulas simples. EDUNEXA genera el PDF y lo adjunta automáticamente a tu entrega.</p>
      </div>
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 p-2">
        <label className="sr-only" htmlFor="student-editor-block">Formato de párrafo</label><select id="student-editor-block" defaultValue="p" disabled={locked || busy} onMouseDown={(e) => e.preventDefault()} onChange={(e) => command("formatBlock", e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"><option value="p">Normal</option><option value="h2">Título</option><option value="h3">Subtítulo</option><option value="pre">Código</option></select>
        <button type="button" title="Negrita" aria-label="Negrita" disabled={locked || busy} onMouseDown={(e) => e.preventDefault()} onClick={() => command("bold")} className="rounded-lg p-2 text-slate-700 hover:bg-white disabled:opacity-40"><Bold size={17}/></button>
        <button type="button" title="Cursiva" aria-label="Cursiva" disabled={locked || busy} onMouseDown={(e) => e.preventDefault()} onClick={() => command("italic")} className="rounded-lg p-2 text-slate-700 hover:bg-white disabled:opacity-40"><Italic size={17}/></button>
        <button type="button" title="Subrayado" aria-label="Subrayado" disabled={locked || busy} onMouseDown={(e) => e.preventDefault()} onClick={() => command("underline")} className="rounded-lg p-2 text-slate-700 hover:bg-white disabled:opacity-40"><Underline size={17}/></button>
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
        <button type="button" title="Insertar enlace" disabled={locked || busy} onMouseDown={(e) => e.preventDefault()} onClick={insertLink} className="rounded-lg p-2 text-slate-700 hover:bg-white disabled:opacity-40"><Link2 size={17}/></button>
        <button type="button" title="Tachado" disabled={locked || busy} onMouseDown={(e) => e.preventDefault()} onClick={() => command("strikeThrough")} className="rounded-lg p-2 text-slate-700 hover:bg-white disabled:opacity-40"><Strikethrough size={17}/></button>
        <button type="button" title="Resaltar" disabled={locked || busy} onMouseDown={(e) => e.preventDefault()} onClick={() => command("hiliteColor", "#fff2a8")} className="rounded-lg p-2 text-slate-700 hover:bg-white disabled:opacity-40"><Highlighter size={17}/></button>
        <button type="button" title="Subíndice" disabled={locked || busy} onMouseDown={(e) => e.preventDefault()} onClick={() => command("subscript")} className="rounded-lg p-2 text-slate-700 hover:bg-white disabled:opacity-40"><Subscript size={17}/></button>
        <button type="button" title="Superíndice" disabled={locked || busy} onMouseDown={(e) => e.preventDefault()} onClick={() => command("superscript")} className="rounded-lg p-2 text-slate-700 hover:bg-white disabled:opacity-40"><Superscript size={17}/></button>
        <button type="button" title="Aumentar sangría" disabled={locked || busy} onMouseDown={(e) => e.preventDefault()} onClick={() => command("indent")} className="rounded-lg p-2 text-slate-700 hover:bg-white disabled:opacity-40"><Indent size={17}/></button>
        <button type="button" title="Reducir sangría" disabled={locked || busy} onMouseDown={(e) => e.preventDefault()} onClick={() => command("outdent")} className="rounded-lg p-2 text-slate-700 hover:bg-white disabled:opacity-40"><Outdent size={17}/></button>
        <button type="button" title="Insertar tabla" disabled={locked || busy} onMouseDown={(e) => e.preventDefault()} onClick={insertTable} className="rounded-lg p-2 text-slate-700 hover:bg-white disabled:opacity-40"><Table2 size={17}/></button>
        <button type="button" title="Línea divisoria" disabled={locked || busy} onMouseDown={(e) => e.preventDefault()} onClick={() => command("insertHorizontalRule")} className="rounded-lg p-2 text-slate-700 hover:bg-white disabled:opacity-40"><Minus size={17}/></button>
        <button type="button" title="Quitar formato" disabled={locked || busy} onMouseDown={(e) => e.preventDefault()} onClick={() => command("removeFormat")} className="rounded-lg p-2 text-slate-700 hover:bg-white disabled:opacity-40"><Eraser size={17}/></button>
        <label title="Color de texto" className="flex items-center gap-1 rounded-lg p-2 text-slate-700 hover:bg-white"><Palette size={16}/><input type="color" aria-label="Color de texto" defaultValue="#263445" disabled={locked || busy} onChange={(e) => command("foreColor", e.target.value)} className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"/></label>
        <span className="mx-1 h-6 w-px bg-slate-200"/>
        <button type="button" title="Deshacer" disabled={locked || busy} onMouseDown={(e) => e.preventDefault()} onClick={() => command("undo")} className="rounded-lg p-2 text-slate-700 hover:bg-white disabled:opacity-40"><Undo2 size={17}/></button>
        <button type="button" title="Rehacer" disabled={locked || busy} onMouseDown={(e) => e.preventDefault()} onClick={() => command("redo")} className="rounded-lg p-2 text-slate-700 hover:bg-white disabled:opacity-40"><Redo2 size={17}/></button>
        <span className="ml-auto text-[11px] text-slate-500">{wordCount} palabras · {charCount} caracteres</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-3">
        <FileText size={16} className="text-violet-600"/>
        <select aria-label="Plantillas de documento" defaultValue="" disabled={locked || busy} onChange={(e) => { applyTemplate(e.target.value); e.currentTarget.value = ""; }} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs"><option value="" disabled>Plantillas…</option><option value="practical">Trabajo práctico</option><option value="report">Informe</option><option value="monograph">Monografía</option><option value="project">Proyecto</option></select>
        <label className="ml-auto inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold"><ImagePlus size={15}/> Insertar imagen<input type="file" accept="image/png,image/jpeg" className="sr-only" disabled={locked || busy} onChange={(e) => { insertImage(e.target.files?.[0]); e.currentTarget.value = ""; }}/></label>
      </div>
      <div className="grid gap-2 border-b border-slate-100 bg-slate-50 px-3 py-3 sm:grid-cols-2">
        <label className="grid gap-1 text-[11px] font-semibold text-slate-600">Encabezado PDF<input value={header} onChange={(e) => setHeader(e.target.value)} maxLength={100} disabled={locked || busy} placeholder="Institución · materia" className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-normal"/></label>
        <label className="grid gap-1 text-[11px] font-semibold text-slate-600">Pie de página<input value={footer} onChange={(e) => setFooter(e.target.value)} maxLength={100} disabled={locked || busy} placeholder="Curso · ciclo lectivo" className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-normal"/></label>
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
          className="min-h-[320px] rounded-xl border border-slate-200 bg-white px-4 py-4 text-sm leading-7 text-slate-800 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100 [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:text-lg [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:my-1 [&_blockquote]:border-l-4 [&_blockquote]:border-violet-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-slate-300 [&_td]:p-2 [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-50 [&_th]:p-2 [&_pre]:rounded-lg [&_pre]:bg-slate-100 [&_pre]:p-3 [&_pre]:font-mono"
        />
        {locked ? <p className="mt-2 text-xs text-amber-700">Esta entrega ya tiene calificación y no puede modificarse.</p> : null}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={downloadPdf} disabled={busy || locked} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Eye size={16}/> Vista previa PDF</button>
          <button type="button" onClick={submit} disabled={busy || locked || saved} className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-700 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-400">{busy ? <LoaderCircle className="animate-spin" size={17}/> : saved ? <CheckCircle2 size={17}/> : <Send size={16}/>} {busy ? "Preparando y entregando..." : saved ? "Entrega realizada" : existingSubmissionId ? "Actualizar entrega y PDF" : "Entregar tarea en PDF"}</button>
        </div>
        {message ? <p role="status" aria-live="polite" className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700">{message}</p> : null}
        <p className="mt-3 flex items-center gap-2 text-[11px] leading-5 text-slate-500"><Save size={13}/>{draftStatus}. El borrador se conserva en esta sesión del dispositivo.</p>{previewUrl ? <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-2" role="dialog" aria-modal="true" aria-label="Vista previa PDF"><div className="flex h-[95vh] w-full max-w-5xl flex-col rounded-2xl bg-white"><div className="flex items-center justify-between border-b p-3"><strong>Vista previa PDF</strong><button type="button" onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }} aria-label="Cerrar vista previa"><X size={20}/></button></div><iframe title="Vista previa PDF" src={previewUrl} className="min-h-0 flex-1"/><div className="p-3 text-right"><button type="button" onClick={() => { const a=document.createElement("a"); a.href=previewUrl; a.download="EDUNEXA-entrega.pdf"; a.click(); }} className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white">Descargar PDF</button></div></div></div> : null}
      </div>
    </section>
  );
}
