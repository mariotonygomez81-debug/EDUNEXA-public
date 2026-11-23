import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarCheck, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAttendanceSession } from "./actions";
import AttendanceCalendar from "./attendance-calendar";
import AttendanceAjaxForm from "./ajax-form";
import { getMembershipPermissions } from "@/lib/auth/permissions";

export default async function AttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; created?: string }>;
}) {
  const { slug } = await params;
  const { error, created } = await searchParams;
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

  const { data: roleRows } = await supabase
    .from("membership_roles").select("roles(key)")
    .eq("membership_id", membership.id);
  const roleKeys = (roleRows ?? []).map((row) => row.roles?.key);
  const permissions = await getMembershipPermissions(supabase, membership.id);
  const isInstitutionAdmin = permissions.has("institution.manage");
  const canManageAttendance = permissions.has("attendance.manage");
  const canViewAttendanceReports =
    roleKeys.some((role) => ["institution_admin", "administrative", "director", "teacher", "prefect"].includes(role ?? "")) &&
    permissions.has("attendance.read") && permissions.has("students.read");
  if (!canViewAttendanceReports && !canManageAttendance) redirect(`/dashboard/${slug}`);


  let availableDivisionIds: string[] = [];
  if (isInstitutionAdmin) {
    const { data: allDivisions } = await supabase
      .from("divisions").select("id").eq("institution_id", institution.id);
    availableDivisionIds = (allDivisions ?? []).map((division) => division.id);
  } else if (canManageAttendance) {
    const { data: assignments } = await supabase
      .from("staff_assignments")
.select("division_id")
      .eq("institution_id", institution.id)
      .eq("membership_id", membership.id);
    availableDivisionIds = (assignments ?? [])
      .map((assignment) => assignment.division_id)
      .filter((id): id is string => Boolean(id));

    availableDivisionIds = [...new Set(availableDivisionIds)];
  }

  const { data: divisions } = availableDivisionIds.length
    ? await supabase.from("divisions").select("id,name,course_id").eq("institution_id", institution.id).in("id", availableDivisionIds).order("name")
    : { data: [] };
  const courseIds = [...new Set((divisions ?? []).map((division) => division.course_id))];
  const { data: courses } = courseIds.length
    ? await supabase.from("courses").select("id,name").eq("institution_id", institution.id).in("id", courseIds)
    : { data: [] };
  const courseNames = new Map((courses ?? []).map((course) => [course.id, course.name] as const));

  const { data: sessions, error: sessionsError } = await supabase
    .from("attendance_sessions")
    .select("id,division_id,held_on,period_label,status,created_at")
    .eq("institution_id", institution.id)
    .order("held_on", { ascending: false })
    .limit(100);

  const divisionNames = new Map((divisions ?? []).map((division) => [
    division.id,
    `${courseNames.get(division.course_id) ?? "Curso"} · ${division.name}`,
  ] as const));

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
      <div className={canManageAttendance ? "mx-auto grid max-w-7xl items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]" : "mx-auto max-w-7xl space-y-6"}>
        <section className="min-w-0 space-y-5">
          <Link href={`/dashboard/${slug}`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-blue-700">
            <ArrowLeft size={16} /> Volver al espacio institucional
          </Link>
          <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white shadow-sm sm:p-9">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-white/10 p-3 text-indigo-100"><CalendarCheck size={24} /></div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-100">Gestión académica</p>
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Asistencia</h1>
              </div>
            </div>
            <p className="mt-3 text-sm text-indigo-100">{institution.display_name} · Sesiones de presentismo por división</p>
          </header>

          {canViewAttendanceReports && (
            <div className="flex justify-end">
              <Link href={`/dashboard/${slug}/attendance/reports`} className="rounded-lg border border-indigo-200 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">Ver reportes de asistencia</Link>
            </div>
          )}

          {created === "1" && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">La sesión de asistencia se creó.</div>}
          {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error === "invalid" ? "Revisá la fecha y la división seleccionada." : error === "forbidden" ? "No tenés permisos para registrar asistencia en esa división." : "No se pudo crear la sesión. Verificá que tengas asignada esa división y que no exista otra sesión para el mismo período."}</div>}

          {sessionsError ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">No se pudieron cargar las sesiones de asistencia institucional.</p> : null}
          <AttendanceCalendar
            slug={slug}
            sessions={(sessions ?? []).map((session) => ({
              id: session.id,
              division_id: session.division_id,
              held_on: session.held_on,
              period_label: session.period_label,
              status: session.status,
            }))}
            divisionNames={Object.fromEntries(divisionNames)}
          />
        </section>

        {canManageAttendance && (
          <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Plus size={18} className="text-indigo-700" />
              <h2 className="font-semibold">Nueva sesión</h2>
            </div>
            {divisions?.length ? (
              <AttendanceAjaxForm action={createAttendanceSession} className="space-y-4" submitLabel="Crear sesión">
                <input type="hidden" name="slug" value={slug} />
                <label className="block text-sm font-medium">División
                  <select name="division_id" required className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm">
                    <option value="">Seleccionar división</option>
                    {divisions.map((division) => (
                      <option key={division.id} value={division.id}>{divisionNames.get(division.id)}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium">Fecha
                  <input name="held_on" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
                </label>
                <label className="block text-sm font-medium">Turno u horario (opcional)
                  <input name="period_label" maxLength={80} placeholder="Ej.: Primera hora" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
                </label>
                <button className="w-full rounded-lg bg-indigo-700 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-800">Crear sesión</button>
              </AttendanceAjaxForm>
            ) : (
              <p className="text-sm text-slate-500">No hay divisiones asignadas para registrar asistencia.</p>
            )}
          </aside>
        )}
      </div>
    </main>
  );
}
