import { PDFDocument, StandardFonts, rgb, PageSizes } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";

type Snapshot = {
  schema_version?: number;
  workflow_version?: number;
  supersedes_workflow_id?: string | null;
  rectification_reason?: string | null;
  published_at: string;
  institution: { display_name: string; legal_name: string; tax_id: string | null };
  student: { first_name: string; last_name: string; student_number: string | null };
  period: { name: string; starts_on: string; ends_on: string };
  academic_year: { name: string };
  grading_scale: null | {
    name: string;
    display_mode: "numeric" | "descriptive" | "both";
    minimum_value: number;
    maximum_value: number;
    passing_value: number | null;
    levels: { minimum_percentage: number; maximum_percentage: number; label: string; grade_value: number | null; is_passing: boolean }[];
  };
  subjects: {
    subject: string;
    course: string;
    division: string;
    assessments: { title: string; date: string | null; maximum_score: number; weight_percent: number | null; score: number | null; comment: string | null }[];
  }[];
  general_observation: string | null;
};

function safeText(value: unknown) {
  return String(value ?? "").replace(/[^\x20-\xFF]/g, " ").replace(/\s+/g, " ").trim();
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; workflowId: string }> },
) {
  const { slug, workflowId } = await params;
  if (!/^[a-z0-9-]{2,80}$/i.test(slug) || !/^[0-9a-f-]{36}$/i.test(workflowId)) {
    return new Response("Solicitud inválida", { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("No autorizado", { status: 401 });

  const { data: institution } = await supabase.from("institutions")
    .select("id").eq("slug", slug).maybeSingle();
  if (!institution) return new Response("No encontrado", { status: 404 });

  const { data: membership } = await supabase.from("memberships")
    .select("id").eq("institution_id", institution.id)
    .eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership) return new Response("No autorizado", { status: 403 });

  const permissions = await getMembershipPermissions(supabase, membership.id);
  if (!permissions.has("grades.read")) return new Response("No autorizado", { status: 403 });

  const { data: row, error } = await supabase.from("report_card_snapshots")
    .select("snapshot")
    .eq("institution_id", institution.id)
    .eq("workflow_id", workflowId)
    .maybeSingle();

  if (error || !row?.snapshot) return new Response("Boletín publicado no encontrado", { status: 404 });
  const snapshot = row.snapshot as unknown as Snapshot;

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Boletín - ${snapshot.student.last_name}, ${snapshot.student.first_name}`);
  pdf.setAuthor(snapshot.institution.display_name);
  pdf.setSubject(`Boletín oficial - ${snapshot.period.name}`);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize = PageSizes.A4;
  const margin = 46;
  let page = pdf.addPage(pageSize);
  let y = page.getHeight() - margin;

  const addPage = () => {
    page = pdf.addPage(pageSize);
    y = page.getHeight() - margin;
  };
  const drawLine = (text: string, options: { bold?: boolean; size?: number; color?: ReturnType<typeof rgb>; indent?: number } = {}) => {
    const font = options.bold ? bold : regular;
    const size = options.size ?? 10;
    const value = safeText(text);
    const maxWidth = page.getWidth() - margin * 2 - (options.indent ?? 0);
    const words = value.split(" ");
    let line = "";
    const lines: string[] = [];
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = candidate;
    }
    if (line) lines.push(line);
    for (const item of lines) {
      if (y < margin + size + 8) addPage();
      page.drawText(item, {
        x: margin + (options.indent ?? 0),
        y: y - size,
        size,
        font,
        color: options.color ?? rgb(0.13, 0.16, 0.22),
      });
      y -= size + 5;
    }
  };
  const section = (title: string) => {
    y -= 7;
    drawLine(title, { bold: true, size: 12, color: rgb(0.28, 0.2, 0.55) });
    y -= 2;
  };

  drawLine(snapshot.institution.display_name, { bold: true, size: 18, color: rgb(0.25, 0.18, 0.52) });
  drawLine(snapshot.institution.legal_name);
  if (snapshot.institution.tax_id) drawLine(`Identificación fiscal: ${snapshot.institution.tax_id}`);
  y -= 5;
  page.drawLine({ start: { x: margin, y }, end: { x: page.getWidth() - margin, y }, thickness: 1, color: rgb(0.82, 0.82, 0.87) });
  y -= 18;
  drawLine("BOLETÍN OFICIAL DE CALIFICACIONES", { bold: true, size: 14 });
  drawLine(`Ciclo lectivo: ${snapshot.academic_year.name}  |  Período: ${snapshot.period.name}`);
  drawLine(`Fechas: ${snapshot.period.starts_on} al ${snapshot.period.ends_on}`);
  if (snapshot.workflow_version) {
    drawLine(`Versión del boletín: ${snapshot.workflow_version}`);
  }
  if (snapshot.rectification_reason) {
    drawLine(`Motivo de rectificación: ${snapshot.rectification_reason}`, { size: 9, color: rgb(0.48, 0.31, 0.08) });
  }
  section("DATOS DEL ESTUDIANTE");
  drawLine(`Estudiante: ${snapshot.student.last_name}, ${snapshot.student.first_name}`, { bold: true });
  drawLine(`Legajo: ${snapshot.student.student_number ?? "Sin número asignado"}`);
  drawLine(`Fecha de publicación: ${new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeStyle: "short" }).format(new Date(snapshot.published_at))}`);

  section("RESULTADOS POR ESPACIO CURRICULAR");
  if (!snapshot.subjects.length) drawLine("No hay evaluaciones registradas para este período.");
  for (const subject of snapshot.subjects) {
    const rows = subject.assessments;
    const completed = rows.filter((item) => item.score !== null && Number(item.maximum_score) > 0);
    const anyWeighted = rows.some((item) => item.weight_percent !== null);
    const weightsComplete = anyWeighted && rows.every((item) => item.weight_percent !== null) &&
      Math.abs(rows.reduce((sum, item) => sum + Number(item.weight_percent ?? 0), 0) - 100) < 0.001;
    const allGradesComplete = completed.length === rows.length && rows.length > 0;
    const average = !anyWeighted && completed.length
      ? completed.reduce((sum, item) => sum + (Number(item.score) / Number(item.maximum_score)) * 100, 0) / completed.length
      : weightsComplete && allGradesComplete
        ? rows.reduce((sum, item) => sum + (Number(item.score) / Number(item.maximum_score)) * 100 * Number(item.weight_percent) / 100, 0)
        : null;
    const level = average === null ? null : snapshot.grading_scale?.levels.find((item) =>
      average >= Number(item.minimum_percentage) && average <= Number(item.maximum_percentage)) ?? null;
    drawLine(subject.subject, { bold: true, size: 11 });
    drawLine(`Curso: ${subject.course}  |  División: ${subject.division}`, { size: 9, color: rgb(0.38, 0.4, 0.45) });
    let result = average === null ? "Promedio: pendiente" : `Promedio: ${average.toFixed(2)} %`;
    if (level) {
      if (snapshot.grading_scale?.display_mode !== "descriptive" && level.grade_value !== null) result += `  |  Valor: ${level.grade_value}`;
      if (snapshot.grading_scale?.display_mode !== "numeric") result += `  |  ${level.label}`;
      result += level.is_passing ? "  |  Aprobado" : "  |  No aprobado";
    }
    drawLine(result, { bold: true, size: 9 });
    for (const item of rows) {
      const score = item.score === null ? "Pendiente" : `${item.score} / ${item.maximum_score}`;
      const weight = item.weight_percent === null ? "" : `  |  Peso: ${item.weight_percent}%`;
      drawLine(`- ${item.title} (${item.date ?? "Sin fecha"}): ${score}${weight}`, { size: 9, indent: 8 });
      if (item.comment) drawLine(`Observación: ${item.comment}`, { size: 9, indent: 16, color: rgb(0.35, 0.37, 0.42) });
    }
    y -= 5;
  }

  if (snapshot.general_observation) {
    section("OBSERVACIÓN GENERAL DEL PERÍODO");
    drawLine(snapshot.general_observation);
  }

  y -= 20;
  if (y < margin + 65) addPage();
  const signatureY = y - 36;
  page.drawLine({ start: { x: margin + 12, y: signatureY }, end: { x: margin + 205, y: signatureY }, thickness: 0.8, color: rgb(0.45, 0.45, 0.5) });
  page.drawLine({ start: { x: page.getWidth() - margin - 205, y: signatureY }, end: { x: page.getWidth() - margin - 12, y: signatureY }, thickness: 0.8, color: rgb(0.45, 0.45, 0.5) });
  page.drawText("Firma de autoridad institucional", { x: margin + 12, y: signatureY - 14, size: 8, font: regular, color: rgb(0.35, 0.35, 0.4) });
  page.drawText("Firma de responsable", { x: page.getWidth() - margin - 205, y: signatureY - 14, size: 8, font: regular, color: rgb(0.35, 0.35, 0.4) });

  const bytes = await pdf.save();
  const filename = `boletin-${safeText(snapshot.student.last_name).replace(/\s+/g, "-").toLowerCase()}-${workflowId}.pdf`;
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
