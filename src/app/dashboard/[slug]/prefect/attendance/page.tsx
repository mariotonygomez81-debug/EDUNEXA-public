import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarCheck, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";
import { createPrefectAttendanceSession } from "./actions";
import PrefectAttendanceCalendar, { type PrefectAttendanceSession } from "./prefect-attendance-calendar";
import CourseDivisionSelect from "./course-division-select";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Assignment = { division_id: string; starts_on: string | null; ends_on: string | null };
type Division = { id: string; name: string; course_id: string };
type Course = { id: string; name: string };

export default async function PrefectAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { slug } = await params;
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
  if (!permissions.has("attendance.manage")) redirect(`/dashboard/${slug}`);

  const { data: roles } = await supabase.from("membership_roles")
    .select("roles(key)").eq("membership_id", membership.id).eq("institution_id", institution.id);
  if (!(roles ?? []).some((row) => row.roles?.key === "prefect")) redirect(`/dashboard/${slug}`);

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());
  const { data: assignments } = await supabase.from("staff_assignments")
    .select("division_id,starts_on,ends_on")
    .eq("institution_id", institution.id)
    .eq("membership_id", membership.id)
    .eq("assignment_type", "prefect")
    .not("division_id", "is", null);

  const divisionIds = [...new Set(((assignments ?? []) as Assignment[])
    .filter((item) => (!item.starts_on || item.starts_on <= today) && (!item.ends_on || item.ends_on >= today))
    .map((item) => item.division_id))];
  const { data: divisions } = divisionIds.length
    ? await supabase.from("divisions").select("id,name,course_id")
      .eq("institution_id", institution.id).in("id", divisionIds).order("name")
    : { data: [] as Division[] };
  const courseIds = [...new Set(((divisions ?? []) as Division[]).map((item) => item.course_id))];
  const { data: courses } = courseIds.length
    ? await supabase.from("courses").select("id,name")
      .eq("institution_id", institution.id).in("id", courseIds).order("name")
    : { data: [] as Course[] };

  const db = supabase as unknown as { from: (table: string) => any };
  const { data: sessionRows, error: sessionsError } = divisionIds.length
    ? await db.from("prefect_attendance_sessions")
      .select("id,division_id,held_on,period_label,status")
      .eq("institution_id", institution.id)
      .in("division_id", divisionIds)
      .order("held_on", { ascending: false }).limit(300)
    : { data: [] as PrefectAttendanceSession[], error: null };
  if (sessionsError) throw new Error("No se pudieron cargar las planillas de preceptoría.");

  const sessions = (sessionRows ?? []) as PrefectAttendanceSession[];
  const courseNames = new Map(((courses ?? []) as Course[]).map((item) => [item.id, item.name]));
  const divisionNames = Object.fromEntries(((divisions ?? []) as Division[]).map((item) => [
    item.id,
    `${courseNames.get(item.course_id) ?? "Curso"} · ${item.name}`,
  ]));

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto grid max-w-7xl items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0 space-y-5">
          <Link href={`/dashboard/${slug}/prefect`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700">
            <ArrowLeft size={16} /> Volver a preceptoría
          </Link>
          <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white shadow-sm sm:p-9">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-white/10 p-3 text-indigo-100"><CalendarCheck size={24} /></div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-100">Gestión académica · Preceptoría</p>
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Asistencia</h1>
              </div>
            </div>
            <p className="mt-3 text-sm text-indigo-100">{institution.display_name} · Calendario de asistencia por curso y división.</p>
          </header>

          {query.saved && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">La planilla independiente fue creada.</div>}
          {query.error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {query.error === "scope" ? "La división seleccionada no está entre tus asignaciones vigentes." : "No se pudo crear la planilla. Verificá el curso, la división, la fecha y el turno."}
          </div>}
          <PrefectAttendanceCalendar
            slug={slug}
            sessions={sessions}
            divisionLabels={divisionNames}
          />
        </section>

        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Plus size={18} className="text-indigo-700" />
            <h2 className="font-semibold">Nueva sesión</h2>
          </div>
          {(courses ?? []).length && (divisions ?? []).length ? (
            <form action={createPrefectAttendanceSession} className="space-y-4">
              <input type="hidden" name="slug" value={slug} />
              <CourseDivisionSelect
                courses={(courses ?? []) as Course[]}
                divisions={(divisions ?? []) as Division[]}
              />
              <label className="block text-sm font-medium">Fecha
                <input name="held_on" type="date" required defaultValue={today}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
              </label>
              <label className="block text-sm font-medium">Turno u horario (opcional)
                <input name="period_label" maxLength={80} placeholder="Ej.: Primera hora"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
              </label>
              <button className="w-full rounded-lg bg-indigo-700 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-800">
                Crear sesión
              </button>
            </form>
          ) : (
            <p className="text-sm text-slate-500">No hay cursos y divisiones asignados para registrar asistencia.</p>
          )}
        </aside>
      </div>
    </main>
  );
}
