"use client";

import { useMemo, useState } from "react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { BrainCircuit, Download, FileSearch, LoaderCircle, Sparkles } from "lucide-react";

type StudentOption = { id: string; first_name: string; last_name: string; student_number: string | null };
type ReportResult = { analysis: string; engine?: "groq"; coverage: { dataMayBeIncomplete?: boolean; grades: number; attendance: number; attendanceAvailable: boolean; observations: number; classroomRecords: number; subjects: string[] }; generatedAt: string };

function pdfSafe(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, " ");
}
function wrapText(text: string, maxChars: number) {
  const words = pdfSafe(text).split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > maxChars && line) { lines.push(line); line = word; }
    else line = (line + " " + word).trim();
  }
  if (line) lines.push(line);
  return lines;
}

export default function AcademicStudentReport({ slug, students }: { slug: string; students: StudentOption[] }) {
  const [studentId, setStudentId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [includeGrades, setIncludeGrades] = useState(true);
  const [includeAttendance, setIncludeAttendance] = useState(true);
  const [includeObservations, setIncludeObservations] = useState(true);
  const [includeClassroom, setIncludeClassroom] = useState(true);
  const [privacyConfirmed, setPrivacyConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ReportResult | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const student = useMemo(() => students.find((item) => item.id === studentId), [students, studentId]);

  async function generate() {
    if (!studentId || !privacyConfirmed) return;
    setBusy(true); setError(""); setResult(null); setIsDemo(false);
    try {
      const response = await fetch(`/api/dashboard/${encodeURIComponent(slug)}/teaching/reports/academic`, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          from: from || null,
          to: to || null,
          sections: { grades: includeGrades, attendance: includeAttendance, observations: includeObservations, classroom: includeClassroom },
        }),
      });
      const payload = await response.json() as ReportResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || "No se pudo generar el informe con Groq.");
      setResult(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Groq no pudo generar el informe. Volvé a intentar más tarde.");
    } finally {
      setBusy(false);
    }
  }

  async function testGroq() {
    setBusy(true); setError(""); setResult(null); setIsDemo(false);
    try {
      const response = await fetch(`/api/dashboard/${encodeURIComponent(slug)}/teaching/reports/academic/test`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
      });
      const payload = await response.json() as ReportResult & { error?: string; isDemo?: boolean };
      if (!response.ok) throw new Error(payload.error || "No se pudo probar Groq.");
      setResult(payload); setIsDemo(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ocurrió un error al probar Groq.");
    } finally { setBusy(false); }
  }

  async function downloadPdf() {
    if (!result || (!student && !isDemo)) return;
    const reportName = isDemo ? "Alumno ficticio de demostración" : `${student!.last_name}, ${student!.first_name}`;
    const pdf = await PDFDocument.create();
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    let page = pdf.addPage([595.28, 841.89]);
    let y = 790;
    const addPage = () => { page = pdf.addPage([595.28, 841.89]); y = 790; };
    page.drawRectangle({ x: 0, y: 735, width: 595.28, height: 106.89, color: rgb(0.06, 0.13, 0.28) });
    page.drawText("EDUNEXA  |  INFORME ACADEMICO INTEGRAL", { x: 42, y: 795, size: 15, font: bold, color: rgb(1,1,1) });
    page.drawText(pdfSafe(reportName), { x: 42, y: 765, size: 13, font: bold, color: rgb(0.83,0.91,1) });
    page.drawText(`Generado: ${new Date(result.generatedAt).toLocaleString("es-AR")}`, { x: 42, y: 744, size: 8, font: regular, color: rgb(0.83,0.91,1) });
    y = 710;
    const drawReadableLine = (text: string, font: typeof regular, size: number, color: ReturnType<typeof rgb>) => {
      // Dibujar palabra por palabra con una separación explícita mejora la
      // compatibilidad con visores PDF móviles que colapsan espacios estándar.
      let x = 42;
      const gap = font.widthOfTextAtSize(" ", size) * 1.8;
      for (const word of text.split(/\s+/).filter(Boolean)) {
        if (x > 550) break;
        page.drawText(word, { x, y, size, font, color });
        x += font.widthOfTextAtSize(word, size) + gap;
      }
    };
    const meta = pdfSafe(`Cobertura: ${result.coverage.grades} calificaciones | ${result.coverage.attendance} registros de asistencia | ${result.coverage.observations} observaciones | ${result.coverage.classroomRecords} registros de aula`);
    for (const line of wrapText(meta, 88)) {
      drawReadableLine(line, regular, 8, rgb(0.25,0.31,0.4));
      y -= 12;
    }
    y -= 16;
    for (const rawLine of result.analysis.split("\n")) {
      const trimmed = rawLine.trim();
      if (!trimmed) { y -= 8; continue; }
      const isHeading = trimmed.startsWith("#") || trimmed.startsWith("**");
      const clean = pdfSafe(trimmed.replace(/^#+\s*/, "").replace(/\*\*/g, ""));
      for (const line of wrapText(clean, 88)) {
        if (y < 55) addPage();
        drawReadableLine(line, isHeading ? bold : regular, isHeading ? 11 : 9, isHeading ? rgb(0.08,0.18,0.35) : rgb(0.16,0.2,0.27));
        y -= isHeading ? 18 : 14;
      }
    }
    const bytes = await pdf.save();
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `EDUNEXA-informe-${isDemo ? "demostracion" : `${student!.last_name.toLowerCase()}-${student!.first_name.toLowerCase()}`}.pdf`; anchor.click(); URL.revokeObjectURL(url);
  }

  return <section className="space-y-5">
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-2"><FileSearch className="text-indigo-700" size={20}/><h2 className="text-lg font-bold text-slate-900">Configurar informe</h2></div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <label className="md:col-span-3"><span className="mb-1 block text-sm font-semibold text-slate-700">Alumno</span><select value={studentId} onChange={(e)=>{setStudentId(e.target.value);setResult(null);}} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"><option value="">Seleccionar alumno…</option>{students.map((item)=><option key={item.id} value={item.id}>{item.last_name}, {item.first_name}{item.student_number? ` · ${item.student_number}`:""}</option>)}</select></label>
        <label><span className="mb-1 block text-sm font-semibold text-slate-700">Desde</span><input type="date" value={from} onChange={(e)=>setFrom(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/></label>
        <label><span className="mb-1 block text-sm font-semibold text-slate-700">Hasta</span><input type="date" value={to} onChange={(e)=>setTo(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/></label>
        <div className="flex items-end text-xs text-slate-500">Si no seleccionás fechas, se analiza todo el período disponible.</div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[[includeGrades,setIncludeGrades,"Calificaciones"],[includeAttendance,setIncludeAttendance,"Asistencia"],[includeObservations,setIncludeObservations,"Observaciones"],[includeClassroom,setIncludeClassroom,"Participación y actividades"]].map(([checked,setter,label])=><label key={String(label)} className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm font-medium text-slate-700"><input type="checkbox" checked={checked as boolean} onChange={(e)=>(setter as (v:boolean)=>void)(e.target.checked)} className="h-4 w-4 accent-indigo-700"/>{label as string}</label>)}
      </div>
      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <label className="flex items-start gap-3 text-sm leading-6 text-amber-950">
          <input type="checkbox" checked={privacyConfirmed} onChange={(e)=>setPrivacyConfirmed(e.target.checked)} className="mt-1 h-4 w-4 accent-amber-700"/>
          <span><strong>Autorización institucional y revisión docente.</strong> Confirmo que cuento con autorización institucional para elaborar este informe con IA. Los datos académicos minimizados se enviarán a Groq, un proveedor externo de IA. La identidad del alumno se omite y el informe será revisado por el docente.</span>
        </label>
      </div>
      {error ? <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" disabled={!studentId||!privacyConfirmed||busy||!(includeGrades||includeAttendance||includeObservations||includeClassroom)} onClick={generate} className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50">{busy?<LoaderCircle className="animate-spin" size={17}/>:<Sparkles size={17}/>} {busy?"Procesando…":"Generar informe con Groq"}</button>
        <button type="button" disabled={busy} onClick={testGroq} className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-3 text-sm font-bold text-emerald-900 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50">{busy?<LoaderCircle className="animate-spin" size={17}/>:<BrainCircuit size={17}/>} Probar Groq con datos ficticios</button>
      </div>
      {!students.length?<p className="mt-3 text-sm text-slate-500">No hay alumnos disponibles para los permisos de tu cuenta docente.</p>:null}
    </div>
    {result ? <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 p-5"><div><h2 className="text-lg font-bold text-slate-900">{isDemo ? "Prueba de Groq · datos ficticios" : `Análisis generado · ${student?.last_name}, ${student?.first_name}` }</h2><p className="mt-1 text-xs text-slate-500">{isDemo ? "Este resultado usa exclusivamente información inventada; no se consultaron expedientes de alumnos." : "Motor utilizado: Groq · Revisá y corregí el contenido antes de compartirlo."}</p></div><button type="button" onClick={downloadPdf} className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-800"><Download size={16}/> Descargar PDF</button></header>
      <div className="grid gap-2 border-b border-slate-100 p-4 text-xs text-slate-600 sm:grid-cols-4">{[["Calificaciones",result.coverage.grades],["Asistencia",result.coverage.attendance],["Observaciones",result.coverage.observations],["Registros de aula",result.coverage.classroomRecords]].map(([label,value])=><div key={String(label)} className="rounded-lg bg-slate-50 p-3"><strong className="block text-lg text-slate-900">{value}</strong>{label}</div>)}</div>
      {!result.coverage.attendanceAvailable?<div className="mx-5 mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">Tu perfil no tiene permiso para consultar la asistencia institucional. El análisis no incluye esa fuente.</div>:null}{result.coverage.dataMayBeIncomplete?<div className="mx-5 mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">La consulta alcanzó el límite de registros de alguna fuente. El informe puede no incluir todo el historial académico; verificá la cobertura antes de utilizarlo.</div>:null}<div className="whitespace-pre-wrap p-5 text-sm leading-7 text-slate-700">{result.analysis}</div>
      <footer className="border-t border-amber-100 bg-amber-50/70 px-5 py-3 text-xs leading-5 text-amber-900">{isDemo ? "Demostración con datos completamente ficticios. No representa a ningún alumno ni debe utilizarse como registro académico." : "Borrador asistido por IA. No constituye diagnóstico ni decisión automática. El docente es responsable de verificar cada dato, contextualizar las conclusiones y aprobar el informe."}</footer>
    </article>:null}
  </section>;
}
