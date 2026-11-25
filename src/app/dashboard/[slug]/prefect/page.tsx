import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarCheck, CalendarClock, ClipboardList, GraduationCap, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";

type Assignment = {
  division_id: string;
  starts_on: string | null;
  ends_on: string | null;
};
type Division = { id: string; name: string; course_id: string };
type Course = { id: string; name: string };

export default async function PrefectWorkspace({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
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
  if (!permissions.has("students.read") || !permissions.has("attendance.read")) redirect(`/dashboard/${slug}`);

  const { data: roleRows } = await supabase.from("membership_roles")
    .select("roles(key)").eq("membership_id", membership.id).eq("institution_id", institution.id);
  if (!(roleRows ?? []).some((row) => row.roles?.key === "prefect")) redirect(`/dashboard/${slug}`);

  const { data: assignmentRows, error: assignmentError } = await supabase.from("staff_assignments")
    .select("division_id,starts_on,ends_on")
    .eq("institution_id", institution.id)
    .eq("membership_id", membership.id)
    .eq("assignment_type", "prefect")
    .not("division_id", "is", null);
  if (assignmentError) throw new Error("No se pudieron consultar tus divisiones asignadas.");

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());
  const divisionIds = [...new Set(((assignmentRows ?? []) as Assignment[])
    .filter((item) => (!item.starts_on || item.starts_on <= today) && (!item.ends_on || item.ends_on >= today))
    .map((item) => item.division_id))];

  const { data: divisions, error: divisionsError } = divisionIds.length
    ? await supabase.from("divisions").select("id,name,course_id")
      .eq("institution_id", institution.id).in("id", divisionIds).order("name")
    : { data: [] as Division[], error: null };
  if (divisionsError) throw new Error("No se pudieron cargar las divisiones asignadas.");

  const courseIds = [...new Set((divisions ?? []).map((item) => item.course_id))];
  const { data: courses, error: coursesError } = courseIds.length
    ? await supabase.from("courses").select("id,name")
      .eq("institution_id", institution.id).in("id", courseIds)
    : { data: [] as Course[], error: null };
  if (coursesError) throw new Error("No se pudieron cargar los cursos.");
  const courseNames = new Map((courses ?? []).map((item) => [item.id, item.name]));

  const { data: enrollmentRows, error: enrollmentError } = divisionIds.length
    ? await supabase.from("enrollments").select("division_id")
      .eq("institution_id", institution.id).in("division_id", divisionIds).eq("status", "active")
    : { data: [], error: null };
  if (enrollmentError) throw new Error("No se pudo consultar la cantidad de alumnos.");
  const counts = new Map<string, number>();
  for (const row of enrollmentRows ?? []) counts.set(row.division_id, (counts.get(row.division_id) ?? 0) + 1);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <Link href={`/dashboard/${slug}`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700">
          <ArrowLeft size={16} /> Volver al espacio institucional
        </Link>
        <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white shadow-sm sm:p-9">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-indigo-100">
            <GraduationCap size={14} /> ESPACIO DE PRECEPTORÍA
          </span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight">Mis divisiones</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-indigo-100">{institution.display_name} · Nóminas y seguimiento de los cursos que tenés asignados.</p>
        </header>

        {divisions?.length ? (
          <section className="grid gap-4 md:grid-cols-2">
            {divisions.map((division) => (
              <article key={division.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">División asignada</p>
                    <h2 className="mt-2 text-xl font-bold text-slate-900">{courseNames.get(division.course_id) ?? "Curso"} · {division.name}</h2>
                    <p className="mt-2 flex items-center gap-2 text-sm text-slate-500"><Users size={16} /> {counts.get(division.id) ?? 0} alumnos con matrícula activa</p>
                  </div>
                  <div className="rounded-xl bg-violet-100 p-3 text-violet-700"><GraduationCap size={22} /></div>
                </div>
                <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                  <Link href={`/dashboard/${slug}/teaching/${division.id}`} className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-800">
                    <Users size={15} /> Ver nómina
                  </Link>
                  <Link href={`/dashboard/${slug}/prefect/attendance`} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    <CalendarCheck size={15} /> Mi asistencia
                  </Link>
                  <Link href={`/dashboard/${slug}/prefect/novelties`} className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-100">
                    <ClipboardList size={15} /> Novedades
                  </Link>
                  <Link href={`/dashboard/${slug}/appointments`} className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100">
                    <CalendarClock size={15} /> Citaciones a tutores
                  </Link>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <Users className="mx-auto text-slate-400" size={34} />
            <h2 className="mt-3 font-semibold text-slate-900">Todavía no tenés divisiones asignadas</h2>
            <p className="mt-1 text-sm text-slate-500">Cuando el administrador institucional te asigne una división como preceptor, aparecerá en este espacio.</p>
          </section>
        )}
      </div>
    </main>
  );
}
