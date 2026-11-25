"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";

function value(formData: FormData, key: string) {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim() : "";
}

async function canManageDivision(
  supabase: Awaited<ReturnType<typeof createClient>>,
  institutionId: string,
  membershipId: string,
  divisionId: string,
  onDate: string,
) {
  const { data: roleRows, error: roleError } = await supabase
    .from("membership_roles")
    .select("roles(key)")
    .eq("membership_id", membershipId)
    .eq("institution_id", institutionId);
  if (roleError) return false;

  const roles = (roleRows ?? []).map((row) => row.roles?.key).filter((role): role is string => typeof role === "string");
  if (roles.includes("institution_admin")) {
    return true;
  }
  if (!roles.some((role) => role === "teacher" || role === "prefect")) {
    return false;
  }

  const { data: division, error: divisionError } = await supabase
    .from("divisions")
    .select("id")
    .eq("id", divisionId)
    .eq("institution_id", institutionId)
    .maybeSingle();
  if (divisionError || !division) return false;

  const { data: assignments, error: assignmentError } = await supabase
    .from("staff_assignments")
    .select("assignment_type,division_id,course_subject_id,starts_on,ends_on")
    .eq("institution_id", institutionId)
    .eq("membership_id", membershipId)
    .or(`starts_on.is.null,starts_on.lte.${onDate}`)
    .or(`ends_on.is.null,ends_on.gte.${onDate}`);
  if (assignmentError || !assignments?.length) return false;

  const scopedAssignments = assignments.filter((assignment) => roles.includes(assignment.assignment_type));
  if (scopedAssignments.some((assignment) => assignment.division_id === divisionId)) {
    return true;
  }

  const subjectIds = [...new Set(scopedAssignments
    .filter((assignment) => !assignment.division_id && assignment.course_subject_id)
    .map((assignment) => assignment.course_subject_id as string))];
  if (!subjectIds.length) return false;

  const { data: courseSubjects, error: courseSubjectError } = await supabase
    .from("course_subjects")
    .select("course_id")
    .eq("institution_id", institutionId)
    .in("id", subjectIds);
  if (courseSubjectError || !courseSubjects?.length) return false;

  const courseIds = [...new Set(courseSubjects.map((item) => item.course_id))];
  const { data: targetDivision, error: targetDivisionError } = await supabase
    .from("divisions")
    .select("id")
    .eq("institution_id", institutionId)
    .eq("id", divisionId)
    .in("course_id", courseIds)
    .maybeSingle();
  return !targetDivisionError && Boolean(targetDivision);
}

export type AttendanceActionResult = { ok: boolean; message: string };

export async function createAttendanceSession(formData: FormData): Promise<AttendanceActionResult> {
  const slug = value(formData, "slug");
  const divisionId = value(formData, "division_id");
  const heldOn = value(formData, "held_on");
  const periodLabel = value(formData, "period_label");
  if (!slug || !divisionId || !/^\d{4}-\d{2}-\d{2}$/.test(heldOn) || periodLabel.length > 80) return { ok: false, message: "Revisá la fecha, la división y el horario." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: institution } = await supabase.from("institutions").select("id").eq("slug", slug).eq("status", "active").maybeSingle();
  if (!institution) return { ok: false, message: "No se encontró la institución." };
  const { data: membership } = await supabase.from("memberships").select("id").eq("institution_id", institution.id).eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership) return { ok: false, message: "No tenés una membresía activa en esta institución." };
  const permissions = await getMembershipPermissions(supabase, membership.id);
  if (!permissions.has("attendance.manage")) return { ok: false, message: "No tenés permisos para crear sesiones de asistencia." };
  const authorized = await canManageDivision(supabase, institution.id, membership.id, divisionId, heldOn);
  if (!authorized) return { ok: false, message: "No tenés asignada esa división para la fecha seleccionada." };
  const { error } = await supabase.from("attendance_sessions").insert({ institution_id: institution.id, division_id: divisionId, held_on: heldOn, period_label: periodLabel || null, created_by: user.id, status: "open" });
  if (error) return { ok: false, message: "No se pudo crear la sesión. Puede que ya exista una planilla para esa fecha y división." };
  revalidatePath(`/dashboard/${slug}/attendance`);
  return { ok: true, message: "Sesión de asistencia creada correctamente." };
}

export async function saveAttendance(formData: FormData): Promise<AttendanceActionResult> {
  const slug = value(formData, "slug");
  const sessionId = value(formData, "session_id");
  const studentIds = [...new Set(formData.getAll("student_id").filter((entry): entry is string => typeof entry === "string" && entry.length > 0))];
  if (!slug || !sessionId || studentIds.length > 1000) return { ok: false, message: "No se pudo identificar la planilla o la cantidad de alumnos excede el límite." };
  const allowedStatuses = ["present", "absent", "late", "justified", "early_departure"] as const;
  const rows: { student_id: string; status: (typeof allowedStatuses)[number]; note: string | null }[] = [];
  for (const studentId of studentIds) {
    const status = value(formData, `status_${studentId}`);
    if (!status) continue;
    if (!allowedStatuses.includes(status as (typeof allowedStatuses)[number])) return { ok: false, message: "Hay un estado de asistencia inválido." };
    const note = value(formData, `note_${studentId}`);
    if (note.length > 500) return { ok: false, message: "Una observación supera los 500 caracteres." };
    rows.push({ student_id: studentId, status: status as (typeof allowedStatuses)[number], note: note || null });
  }
  if (!rows.length) return { ok: false, message: "Seleccioná al menos un estado de asistencia antes de guardar." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: institution } = await supabase.from("institutions").select("id").eq("slug", slug).eq("status", "active").maybeSingle();
  if (!institution) return { ok: false, message: "No se encontró la institución." };
  const { data: membership } = await supabase.from("memberships").select("id").eq("institution_id", institution.id).eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership) return { ok: false, message: "No tenés una membresía activa en esta institución." };
  const permissions = await getMembershipPermissions(supabase, membership.id);
  if (!permissions.has("attendance.manage")) return { ok: false, message: "No tenés permisos para modificar la asistencia." };
  const { data: session } = await supabase.from("attendance_sessions").select("id,division_id,held_on,status").eq("id", sessionId).eq("institution_id", institution.id).maybeSingle();
  if (!session) return { ok: false, message: "La planilla ya no existe o no pertenece a esta institución." };
  if (session.status !== "open") return { ok: false, message: "La sesión está cerrada y ya no admite modificaciones." };
  const authorized = await canManageDivision(supabase, institution.id, membership.id, session.division_id, session.held_on);
  if (!authorized) return { ok: false, message: "No tenés permisos sobre la división de esta planilla." };
  const payload = rows.map((row) => ({ institution_id: institution.id, session_id: session.id, student_id: row.student_id, status: row.status, note: row.note, recorded_by: user.id, recorded_at: new Date().toISOString() }));
  const { error } = await supabase.from("attendance_records").upsert(payload, { onConflict: "institution_id,session_id,student_id" });
  if (error) return { ok: false, message: "No se pudo guardar la asistencia. Revisá los datos e intentá nuevamente." };
  revalidatePath(`/dashboard/${slug}/attendance/${sessionId}`);
  revalidatePath(`/dashboard/${slug}/attendance`);
  return { ok: true, message: "La asistencia se guardó correctamente." };
}