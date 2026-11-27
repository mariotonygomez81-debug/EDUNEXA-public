"use server";

import ExcelJS from "exceljs";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";
import type { Json } from "@/types/database.types";

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function field(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function context(slug: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: institution } = await supabase
    .from("institutions").select("id").eq("slug", slug).maybeSingle();
  if (!institution) redirect("/dashboard");

  const { data: membership } = await supabase
    .from("memberships").select("id")
    .eq("institution_id", institution.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) redirect("/dashboard");

  const { data: roleRows } = await supabase
    .from("membership_roles").select("roles(key)")
    .eq("membership_id", membership.id);
  const roles = (roleRows ?? []).map((row) => row.roles?.key);
  return { supabase, user, institution, membership, roles };
}

export async function createAssessment(formData: FormData) {
  const slug = field(formData, "slug");
  const title = field(formData, "title");
  const divisionId = field(formData, "division_id");
  const courseSubjectId = field(formData, "course_subject_id");
  const gradingPeriodId = field(formData, "grading_period_id");
  const assessmentDate = field(formData, "assessment_date");
  const maxScoreRaw = field(formData, "max_score");
  const weightRaw = field(formData, "weight_percent");
  const weightPercent = weightRaw ? Number(weightRaw) : null;
  const description = field(formData, "description");
  const maxScore = Number(maxScoreRaw);

  if (!slug || title.length < 3 || title.length > 120 ||
      !divisionId || !courseSubjectId || !gradingPeriodId ||
      !Number.isFinite(maxScore) || maxScore <= 0 || maxScore > 1000 ||
      (weightPercent !== null && (!Number.isFinite(weightPercent) || weightPercent <= 0 || weightPercent > 100)) ||
      description.length > 1000 ||
      (assessmentDate && !isValidDate(assessmentDate))) {
    redirect(`/dashboard/${encodeURIComponent(slug)}/grades?error=invalid`);
  }

  const { supabase, user, institution, membership } = await context(slug);
  const permissions = await getMembershipPermissions(supabase, membership.id);
  if (!permissions.has("grades.manage")) redirect(`/dashboard/${encodeURIComponent(slug)}/grades?error=forbidden`);
  const [{ data: division }, { data: courseSubject }, { data: period }] = await Promise.all([
    supabase.from("divisions").select("id,course_id,academic_year_id")
      .eq("id", divisionId).eq("institution_id", institution.id).maybeSingle(),
    supabase.from("course_subjects").select("id,course_id")
      .eq("id", courseSubjectId).eq("institution_id", institution.id).maybeSingle(),
    supabase.from("grading_periods").select("id,academic_year_id,starts_on,ends_on,status")
      .eq("id", gradingPeriodId).eq("institution_id", institution.id).maybeSingle(),
  ]);
  if (!division || !courseSubject || !period ||
      division.course_id !== courseSubject.course_id ||
      division.academic_year_id !== period.academic_year_id ||
      (assessmentDate && (assessmentDate < period.starts_on || assessmentDate > period.ends_on))) {
    redirect(`/dashboard/${slug}/grades?error=invalid`);
  }

  const { error } = await supabase.from("assessments").insert({
    institution_id: institution.id,
    title,
    division_id: divisionId,
    course_subject_id: courseSubjectId,
    grading_period_id: gradingPeriodId,
    assessment_date: assessmentDate || null,
    max_score: maxScore,
    weight_percent: weightPercent,
    description: description || null,
    created_by: user.id,
  });

  if (error) redirect(`/dashboard/${slug}/grades?error=save`);
  revalidatePath(`/dashboard/${slug}/grades`);
  redirect(`/dashboard/${slug}/grades?created=1`);
}

export async function saveGrades(formData: FormData) {
  const slug = field(formData, "slug");
  const assessmentId = field(formData, "assessment_id");
  const studentIds = [...new Set(formData.getAll("student_id").filter(
    (entry): entry is string => typeof entry === "string" && /^[0-9a-f-]{36}$/i.test(entry)
  ))];
  const changeReason = field(formData, "change_reason");

  if (!slug || !/^[0-9a-f-]{36}$/i.test(assessmentId) ||
      studentIds.length === 0 || studentIds.length > 100 || changeReason.length > 500) {
    redirect(`/dashboard/${encodeURIComponent(slug)}/grades?error=invalid`);
  }

  const { supabase, institution, membership } = await context(slug);
  const permissions = await getMembershipPermissions(supabase, membership.id);
  if (!permissions.has("grades.manage")) redirect(`/dashboard/${encodeURIComponent(slug)}/grades?error=forbidden`);
  const { data: assessment } = await supabase
    .from("assessments")
    .select("id,division_id,max_score")
    .eq("id", assessmentId)
    .eq("institution_id", institution.id)
    .maybeSingle();

  if (!assessment) redirect(`/dashboard/${slug}/grades?error=notfound`);

  const rows: { student_id: string; score: number | null; comment: string | null }[] = [];
  for (const studentId of studentIds) {
    const rawScore = field(formData, `score_${studentId}`);
    const comment = field(formData, `comment_${studentId}`);
    if (comment.length > 1000) redirect(`/dashboard/${slug}/grades?error=invalid`);
    const score = rawScore === "" ? null : Number(rawScore);
    if (score !== null && (!Number.isFinite(score) || score < 0 || score > Number(assessment.max_score))) {
      redirect(`/dashboard/${slug}/grades?error=range`);
    }
    rows.push({ student_id: studentId, score, comment: comment || null });
  }

  if (!rows.length) redirect(`/dashboard/${slug}/grades?error=empty`);

  const { error } = await supabase.rpc("save_grade_records_batch", {
    p_assessment_id: assessment.id,
    p_rows: rows as unknown as Json,
    p_change_reason: changeReason || null,
  });

  if (error) {
    const message = error.message.toLowerCase();
    if (error.code === "42501") redirect(`/dashboard/${slug}/grades?error=forbidden`);
    if (message.includes("closed")) redirect(`/dashboard/${slug}/grades?error=period_closed`);
    if (message.includes("reason")) redirect(`/dashboard/${slug}/grades?error=reason`);
    if (error.code === "23514") redirect(`/dashboard/${slug}/grades?error=range`);
    redirect(`/dashboard/${slug}/grades?error=save`);
  }

  revalidatePath(`/dashboard/${slug}/grades`);
  revalidatePath(`/dashboard/${slug}/report-cards`);
  redirect(`/dashboard/${slug}/grades?saved=1`);
}

export async function saveAssessmentWeight(formData: FormData) {
  const slug = field(formData, "slug");
  const assessmentId = field(formData, "assessment_id");
  const raw = field(formData, "weight_percent");
  const weightPercent = raw === "" ? null : Number(raw);
  if (!slug || !/^[0-9a-f-]{36}$/i.test(assessmentId) ||
      (weightPercent !== null && (!Number.isFinite(weightPercent) || weightPercent <= 0 || weightPercent > 100))) {
    redirect(`/dashboard/${encodeURIComponent(slug)}/grades?error=weight`);
  }
  const { supabase, institution, membership } = await context(slug);
  const permissions = await getMembershipPermissions(supabase, membership.id);
  if (!permissions.has("grades.manage")) redirect(`/dashboard/${slug}/grades?error=forbidden`);
  const { error } = await supabase.from("assessments")
    .update({ weight_percent: weightPercent })
    .eq("id", assessmentId).eq("institution_id", institution.id);
  if (error) redirect(`/dashboard/${slug}/grades?error=weight`);
  revalidatePath(`/dashboard/${slug}/grades`);
  revalidatePath(`/dashboard/${slug}/report-cards`);
  redirect(`/dashboard/${slug}/grades?saved=weight`);
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = []; let value = ""; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') { value += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) { cells.push(value.trim()); value = ""; }
    else value += char;
  }
  cells.push(value.trim());
  return cells;
}

function spreadsheetCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (typeof value === "object") {
    const cell = value as { text?: unknown; result?: unknown };
    if (typeof cell.text === "string") return cell.text.trim();
    if (typeof cell.result === "string" || typeof cell.result === "number" || typeof cell.result === "boolean") return String(cell.result).trim();
  }
  return "";
}

export async function importGradesSpreadsheet(formData: FormData) {
  const slug = field(formData, "slug");
  const assessmentId = field(formData, "assessment_id");
  const file = formData.get("file");
  if (!slug || !/^[0-9a-f-]{36}$/i.test(assessmentId) || !(file instanceof File) ||
      file.size < 1 || file.size > 5_000_000 || !/\.(csv|xlsx)$/i.test(file.name)) {
    redirect(`/dashboard/${encodeURIComponent(slug)}/grades?error=import_file`);
  }
  const { supabase, institution, membership } = await context(slug);
  const permissions = await getMembershipPermissions(supabase, membership.id);
  if (!permissions.has("grades.manage")) redirect(`/dashboard/${slug}/grades?error=forbidden`);
  const { data: assessment } = await supabase.from("assessments")
    .select("id,division_id,max_score,grading_period_id")
    .eq("id", assessmentId).eq("institution_id", institution.id).maybeSingle();
  if (!assessment) redirect(`/dashboard/${slug}/grades?error=import_assessment`);
  const { data: period } = await supabase.from("grading_periods").select("status")
    .eq("id", assessment.grading_period_id).eq("institution_id", institution.id).maybeSingle();
  if (period?.status !== "open") redirect(`/dashboard/${slug}/grades?error=period_closed`);
  let header: string[];
  let parsed: string[][];
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "xlsx") {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const worksheet = workbook.worksheets[0];
      if (!worksheet || worksheet.rowCount < 2 || worksheet.rowCount > 501) redirect(`/dashboard/${slug}/grades?error=import_format`);
      const matrix: string[][] = [];
      worksheet.eachRow((row) => {
        const values = row.values as unknown[];
        matrix.push(values.slice(1).map(spreadsheetCell));
      });
      header = (matrix.shift() ?? []).map(value => value.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[ _-]/g, ""));
      parsed = matrix.filter(row => row.some(value => value.trim()));
      if (parsed.length > 500) redirect(`/dashboard/${slug}/grades?error=import_format`);
    } catch { redirect(`/dashboard/${slug}/grades?error=import_format`); }
  } else {
    const lines = (await file.text()).replace(/^\uFEFF/, "").split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2 || lines.length > 501) redirect(`/dashboard/${slug}/grades?error=import_format`);
    const delimiter = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
    header = parseCsvLine(lines[0], delimiter).map(value => value.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[ _-]/g, ""));
    parsed = lines.slice(1).map(line => parseCsvLine(line, delimiter));
  }
  const numberIndex = header.findIndex(value => ["matricula","legajo","studentnumber"].includes(value));
  const scoreIndex = header.findIndex(value => ["nota","calificacion","score"].includes(value));
  const commentIndex = header.findIndex(value => ["observacion","comentario","comment"].includes(value));
  if (numberIndex < 0 || scoreIndex < 0 || !parsed.length) redirect(`/dashboard/${slug}/grades?error=import_format`);
  const numbers = [...new Set(parsed.map(row => row[numberIndex]?.trim()).filter(Boolean))];
  if (!numbers.length || numbers.length > 500) redirect(`/dashboard/${slug}/grades?error=import_format`);
  const { data: enrollments } = await supabase.from("enrollments").select("student_id")
    .eq("institution_id", institution.id).eq("division_id", assessment.division_id).eq("status", "active");
  const ids = [...new Set((enrollments ?? []).map(row => row.student_id))];
  const { data: students } = ids.length ? await supabase.from("students")
    .select("id,student_number").eq("institution_id", institution.id).in("id", ids) : { data: [] };
  const byNumber = new Map((students ?? []).filter(row => row.student_number)
    .map(row => [String(row.student_number).trim().toLocaleLowerCase(), row.id]));
  const seen = new Set<string>();
  const rows: { student_id: string; score: number | null; comment: string | null }[] = [];
  for (const row of parsed) {
    const number = row[numberIndex]?.trim() ?? "";
    const studentId = byNumber.get(number.toLocaleLowerCase());
    const scoreText = row[scoreIndex]?.trim().replace(",", ".") ?? "";
    const score = scoreText === "" ? null : Number(scoreText);
    if (!studentId || seen.has(studentId) || (score !== null && (!Number.isFinite(score) || score < 0 || score > Number(assessment.max_score)))) {
      redirect(`/dashboard/${slug}/grades?error=import_rows`);
    }
    seen.add(studentId);
    rows.push({ student_id: studentId, score, comment: commentIndex >= 0 ? (row[commentIndex]?.slice(0,1000) || null) : null });
  }
  const { error } = await supabase.rpc("save_grade_records_batch", {
    p_assessment_id: assessment.id, p_rows: rows as unknown as Json,
    p_change_reason: "Importación de calificaciones desde planilla",
  });
  if (error) redirect(`/dashboard/${slug}/grades?error=import_save`);
  revalidatePath(`/dashboard/${slug}/grades`);
  revalidatePath(`/dashboard/${slug}/report-cards`);
  redirect(`/dashboard/${slug}/grades?imported=${rows.length}`);
}
