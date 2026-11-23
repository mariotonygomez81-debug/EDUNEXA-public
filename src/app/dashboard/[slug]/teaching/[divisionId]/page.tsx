import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarCheck, ClipboardList, GraduationCap, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";
import { createDirectConversation } from "../../messages/actions";
import { createTeacherGuardianAppointment } from "./actions";

type Enrollment = { id: string; student_id: string; enrolled_on: string };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}

export default async function DivisionRosterPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; divisionId: string }>;
  searchParams: Promise<{ appointment?: string; error?: string }>;
}) {
  const { slug, divisionId } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: institution } = await supabase.from("institutions")
    .select("id,display_name").eq("slug", slug).eq("status", "active").maybeSingle();
  if (!institution) redirect("/dashboard");

  const { data: membership } = await supabase.from("memberships")
    .select("id").eq("institution_id", institution.id)
    .eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership) redirect("/dashboard");

  const permissions = await getMembershipPermissions(supabase, membership.id);
  if (!permissions.has("students.read")) notFound();

  const { data: assignmentRows, error: assignmentError } = await supabase.from("staff_assignments")
    .select("assignment_type,division_id,course_subject_id,starts_on,ends_on")
    .eq("institution_id", institution.id)
    .eq("membership_id", membership.id);
  if (assignmentError) throw new Error("No se pudieron verificar tus asignaciones.");

  const { data: roleRows, error: roleError } = await supabase.from("membership_roles")
    .select("roles(key)").eq("membership_id", membership.id).eq("institution_id", institution.id);
  if (roleError) throw new Error("No se pudieron verificar tus funciones institucionales.");
  const roleKeys = (roleRows ?? []).map((item) => item.roles?.key);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());
  const activeAssignments = (assignmentRows ?? []).filter((item) =>
    (item.assignment_type === "teacher" || item.assignment_type === "prefect") &&
    roleKeys.includes(item.assignment_type) &&
    (!item.starts_on || item.starts_on <= today) && (!item.ends_on || item.ends_on >= today)
  );
  const directAccess = activeAssignments.some((item) => item.division_id === divisionId);
  const subjectIds = [...new Set(activeAssignments
    .filter((item) => !item.division_id && item.course_subject_id)
    .map((item) => item.course_subject_id as string))];

  let subjectAccess = false;
  if (subjectIds.length) {
    const { data: subjectRows, error: subjectError } = await supabase.from("course_subjects")
      .select("course_id").eq("institution_id", institution.id).in("id", subjectIds);
    if (subjectError) throw new Error("No se pudieron verificar las materias asignadas.");
    const courseIds = [...new Set((subjectRows ?? []).map((item) => item.course_id))];
    if (courseIds.length) {
      const { data: divisionRows, error: divisionError } = await supabase.from("divisions")
        .select("id").eq("institution_id", institution.id).eq("id", divisionId)
        .in("course_id", courseIds);
      if (divisionError) throw new Error("No se pudo verificar la división asignada.");
      subjectAccess = Boolean(divisionRows?.length);
    }
  }
  if (!directAccess && !subjectAccess) notFound();

  const { data: division, error: divisionError } = await supabase.from("divisions")
    .select("id,name,course_id,academic_year_id").eq("institution_id", institution.id)
    .eq("id", divisionId).maybeSingle();
  if (divisionError || !division) notFound();

  const [{ data: course }, { data: enrollments, error: enrollmentError }] = await Promise.all([
    supabase.from("courses").select("id,name").eq("institution_id", institution.id)
      .eq("id", division.course_id).maybeSingle(),
    supabase.from("enrollments").select("id,student_id,enrolled_on")
      .eq("institution_id", institution.id).eq("division_id", division.id)
      .eq("status", "active").order("enrolled_on", { ascending: true }).limit(500),
  ]);
  if (enrollmentError) throw new Error("No se pudo cargar la nómina de esta división.");

  const enrollmentRows = (enrollments ?? []) as Enrollment[];
  const studentIds = [...new Set(enrollmentRows.map((item) => item.student_id))];
  const { data: students, error: studentsError } = studentIds.length
    ? await supabase.from("students")
      .select("id,student_number,first_name,last_name,status")
      .eq("institution_id", institution.id).in("id", studentIds)
      .order("last_name", { ascending: true }).order("first_name", { ascending: true })
    : { data: [], error: null };
  if (studentsError) throw new Error("No se pudo consultar la información autorizada de los alumnos.");

  const enrollmentByStudent = new Map(enrollmentRows.map((item) => [item.student_id, item]));
  const canReadAttendance = permissions.has("attendance.read");
  const canReadGrades = permissions.has("grades.read");
  const isTeacher = roleKeys.includes("teacher");
  const { data: guardianContactsData, error: guardianContactsError } = isTeacher
    ? await supabase.rpc("list_teacher_guardian_contacts", { p_division_id: divisionId })
    : { data: [], error: null };
  const guardianContacts = (guardianContactsData ?? []) as {
    student_id: string; student_name: string; guardian_membership_id: string; guardian_name: string;
  }[];
  const contactsByStudent = new Map<string, typeof guardianContacts>();
  for (const contact of guardianContacts) {
    contactsByStudent.set(contact.student_id, [...(contactsByStudent.get(contact.student_id) ?? []), contact]);
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <Link href={`/dashboard/${slug}/teaching`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700">
          <ArrowLeft size={16} /> Volver a mis asignaciones
        </Link>
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-violet-100 p-3 text-violet-700"><GraduationCap size={25} /></div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">Nómina de alumnos</p>
                <h1 className="text-2xl font-bold">{course?.name ?? "Curso"} · {division.name}</h1>
                <p className="mt-1 text-sm text-slate-500">{institution.display_name} · Estudiantes con matrícula activa</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <Users size={17} /> {students?.length ?? 0} alumnos
            </span>
          </div>
        </header>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold">Alumnos de la división</h2>
            <span className="text-xs text-slate-400">Solo se muestran legajos autorizados y matrículas activas</span>
          </div>
          {students?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Alumno</th>
                    <th className="px-5 py-3 font-semibold">Matrícula</th>
                    <th className="px-5 py-3 font-semibold">Fecha de ingreso</th>
                    <th className="px-5 py-3 font-semibold">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {students.map((student) => {
                    const enrollment = enrollmentByStudent.get(student.id);
                    return (
                      <tr key={student.id} className="hover:bg-slate-50">
                        <td className="px-5 py-4">
                          <span className="font-semibold text-slate-800">{student.last_name}, {student.first_name}</span>
                        </td>
                        <td className="px-5 py-4 text-slate-600">{student.student_number || "—"}</td>
                        <td className="px-5 py-4 text-slate-600">{enrollment ? formatDate(enrollment.enrolled_on) : "—"}</td>
                        <td className="px-5 py-4">
                          <span className={student.status === "active" ? "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700" : "rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"}>
                            {student.status === "active" ? "Activo" : student.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-5 py-14 text-center">
              <Users size={32} className="mx-auto mb-3 text-slate-300" />
              <p className="font-semibold">No hay alumnos con matrícula activa</p>
              <p className="mt-1 text-sm text-slate-500">Cuando se registren matrículas en esta división, aparecerán en esta nómina.</p>
            </div>
          )}
        </section>

        {isTeacher ? (
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div><p className="text-xs font-bold uppercase tracking-wider text-violet-700">Comunicación docente</p><h2 className="mt-1 text-xl font-bold text-slate-900">Mensajes y citaciones a tutores</h2><p className="mt-1 text-sm text-slate-500">Solo aparecen tutores vinculados a alumnos activos de esta división.</p></div>
            {query.appointment==="created"?<p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">La solicitud de citación fue registrada.</p>:null}
            {query.error?.startsWith("appointment")?<p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">No se pudo registrar la citación. Verificá fecha, motivo y vínculo del tutor.</p>:null}
            {guardianContactsError ? <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">No se pudieron cargar los tutores autorizados.</p> : null}
            {guardianContacts.length ? <div className="space-y-3">{students?.map(student=>{
              const contacts=contactsByStudent.get(student.id)??[];
              if(!contacts.length) return null;
              return <article key={student.id} className="rounded-xl border border-slate-100 p-4">
                <h3 className="font-semibold text-slate-900">{student.last_name}, {student.first_name}</h3>
                <div className="mt-3 space-y-3">{contacts.map(contact=><div key={contact.guardian_membership_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3">
                  <div><p className="text-sm font-semibold text-slate-800">{contact.guardian_name}</p><p className="text-xs text-slate-500">Tutor vinculado</p></div>
                  <div className="flex flex-wrap gap-2">
                    <form action={createDirectConversation}><input type="hidden" name="slug" value={slug}/><input type="hidden" name="recipient_membership_id" value={contact.guardian_membership_id}/><input type="hidden" name="subject" value={`Seguimiento académico · ${student.last_name}, ${student.first_name}`}/><button className="rounded-lg bg-violet-700 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-800">Enviar mensaje</button></form>
                    <details className="w-full sm:w-auto"><summary className="cursor-pointer rounded-lg border border-violet-200 bg-white px-3 py-2 text-center text-xs font-semibold text-violet-800">Solicitar citación</summary>
                      <form action={createTeacherGuardianAppointment} className="mt-2 grid gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:min-w-72">
                        <input type="hidden" name="slug" value={slug}/><input type="hidden" name="division_id" value={divisionId}/><input type="hidden" name="student_id" value={student.id}/><input type="hidden" name="guardian_membership_id" value={contact.guardian_membership_id}/>
                        <label className="text-xs font-semibold">Fecha y hora<input name="scheduled_at" type="datetime-local" required className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"/></label>
                        <label className="text-xs font-semibold">Motivo<textarea name="reason" required minLength={3} maxLength={1000} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" placeholder="Motivo de la entrevista"/></label>
                        <button className="rounded-lg bg-indigo-700 px-3 py-2 text-xs font-semibold text-white">Enviar citación</button>
                      </form>
                    </details>
                  </div>
                </div>)}</div>
              </article>;
            })}</div> : <p className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">No hay tutores vinculados disponibles para los alumnos de esta división.</p>}
          </section>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {canReadAttendance && <Link href={`/dashboard/${slug}/attendance`} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><CalendarCheck size={16} /> Consultar asistencia</Link>}
          {canReadGrades && <Link href={`/dashboard/${slug}/grades`} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><ClipboardList size={16} /> Consultar calificaciones</Link>}
        </div>
      </div>
    </main>
  );
}
