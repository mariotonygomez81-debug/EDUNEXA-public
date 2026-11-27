import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarCheck, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { saveAttendance } from "../actions";
import AttendanceAjaxForm from "../ajax-form";
import { getMembershipPermissions } from "@/lib/auth/permissions";

const statusLabels: Record<string, string> = {
  present: "Presente",
  absent: "Ausente",
  late: "Llegada tarde",
  justified: "Ausencia justificada",
  early_departure: "Retiro anticipado",
};

export default async function AttendanceSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; sessionId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { slug, sessionId } = await params;
  const { error, saved } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: institution } = await supabase
    .from("institutions").select("id,display_name")
    .eq("slug", slug).maybeSingle();
  if (!institution) redirect("/dashboard");

  const { data: membership } = await supabase
    .from("memberships").select("id")
    .eq("institution_id", institution.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) redirect("/dashboard");

  const permissions = await getMembershipPermissions(supabase, membership.id);
  const canManageAttendance = permissions.has("attendance.manage");

  const { data: session } = await supabase
    .from("attendance_sessions")
    .select("id,division_id,held_on,period_label,status")
    .eq("id", sessionId)
    .eq("institution_id", institution.id)
    .maybeSingle();
  if (!session) notFound();
  const canEditAttendance = canManageAttendance && session.status === "open";

  const { data: division } = await supabase
    .from("divisions").select("id,name,course_id")
    .eq("id", session.division_id)
    .eq("institution_id", institution.id)
    .maybeSingle();
  const { data: course } = division
    ? await supabase.from("courses").select("name").eq("id", division.course_id).maybeSingle()
    : { data: null };

  const { data: enrollments, error: enrollmentError } = await supabase
    .from("enrollments").select("student_id")
    .eq("institution_id", institution.id)
    .eq("division_id", session.division_id)
    .eq("status", "active");
  const studentIds = [...new Set((enrollments ?? []).map((item) => item.student_id))];

  const { data: students, error: studentsError } = studentIds.length
    ? await supabase.from("students")
        .select("id,student_number,first_name,last_name")
        .eq("institution_id", institution.id)
        .in("id", studentIds)
        .order("last_name")
        .order("first_name")
    : { data: [], error: null };

  const { data: records } = await supabase
    .from("attendance_records")
    .select("student_id,status,note,recorded_at")
    .eq("institution_id", institution.id)
    .eq("session_id", session.id);
  const recordByStudent = new Map((records ?? []).map((record) => [record.student_id, record] as const));

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href={`/dashboard/${slug}/attendance`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700">
          <ArrowLeft size={16} /> Volver a sesiones
        </Link>

        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-violet-100 p-3 text-violet-700"><CalendarCheck size={24} /></div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">Registro de asistencia</p>
              <h1 className="text-2xl font-bold">{course?.name ?? "Curso"} · {division?.name ?? "División"}</h1>
              <p className="mt-1 text-sm text-slate-500">{institution.display_name} · {new Date(`${session.held_on}T12:00:00`).toLocaleDateString("es-AR")} {session.period_label ? `· ${session.period_label}` : ""}</p>
            </div>
          </div>
        </header>

        {saved === "1" && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">La asistencia se guardó correctamente.</div>}
        {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error === "invalid" ? "Hay datos inválidos en el formulario." : error === "empty" ? "Seleccioná al menos un estado de asistencia." : error === "forbidden" ? "No tenés permisos para modificar la asistencia de esta división." : error === "closed" ? "La sesión está cerrada y ya no admite modificaciones." : "No se pudo guardar. Verificá tus permisos y la matrícula de los alumnos."}</div>}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="font-semibold">Alumnos de la división</h2>
              <p className="mt-1 text-xs text-slate-500">{students?.length ?? 0} alumnos visibles · Estado de sesión: {session.status}</p>
            </div>
            {canEditAttendance && <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700">Edición habilitada por permisos</span>}
          </div>

          {enrollmentError || studentsError ? (
            <p className="p-6 text-sm text-rose-700">No se pudo cargar la lista de alumnos.</p>
          ) : students?.length ? (
            canEditAttendance ? (
              <AttendanceAjaxForm action={saveAttendance} className="space-y-0" submitLabel="Guardar asistencia">
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="session_id" value={session.id} />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-5 py-3 font-semibold">Alumno</th>
                        <th className="px-5 py-3 font-semibold">Estado</th>
                        <th className="px-5 py-3 font-semibold">Observación</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {students.map((student) => {
                        const record = recordByStudent.get(student.id);
                        return (
                          <tr key={student.id}>
                            <td className="px-5 py-4">
                              <input type="hidden" name="student_id" value={student.id} />
                              <p className="font-semibold">{student.last_name}, {student.first_name}</p>
                              <p className="mt-1 text-xs text-slate-500">{student.student_number || "Sin matrícula"}</p>
                            </td>
                            <td className="px-5 py-4">
                              <select name={`status_${student.id}`} defaultValue={record?.status ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                                <option value="">No modificar</option>
                                <option value="present">Presente</option>
                                <option value="absent">Ausente</option>
                                <option value="late">Llegada tarde</option>
                                <option value="justified">Ausencia justificada</option>
                                <option value="early_departure">Retiro anticipado</option>
                              </select>
                            </td>
                            <td className="px-5 py-4">
                              <input name={`note_${student.id}`} maxLength={500} defaultValue={record?.note ?? ""} placeholder="Observación opcional" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end border-t border-slate-100 p-5">
                  <button className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-800">
                    <Save size={16} /> Guardar asistencia
                  </button>
                </div>
              </AttendanceAjaxForm>
            ) : (
              <div className="divide-y divide-slate-100">
                {students.map((student) => {
                  const record = recordByStudent.get(student.id);
                  return (
                    <div key={student.id} className="flex items-center justify-between gap-4 px-5 py-4">
                      <div>
                        <p className="font-semibold">{student.last_name}, {student.first_name}</p>
                        <p className="mt-1 text-xs text-slate-500">{student.student_number || "Sin matrícula"}</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{record ? statusLabels[record.status] ?? record.status : "Sin registrar"}</span>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <p className="p-8 text-center text-sm text-slate-500">No hay alumnos activos visibles para esta división.</p>
          )}
        </section>
      </div>
    </main>
  );
}
