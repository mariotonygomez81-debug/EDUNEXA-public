import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpenCheck, Filter, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";

type Division = { id: string; name: string; course_id: string };
type Course = { id: string; name: string };
type Period = { id: string; name: string; starts_on: string; ends_on: string };
type ConductRow = {
  id: string; division_id: string; student_id: string; grading_period_id: string;
  concept: string; observation: string | null; updated_at: string;
};
type Student = { id: string; first_name: string; last_name: string; student_number: string | null };
const labels: Record<string,string> = {
  muy_satisfactorio: "Muy satisfactorio",
  satisfactorio: "Satisfactorio",
  en_proceso: "En proceso",
  requiere_acompanamiento: "Requiere acompañamiento",
};
const styles: Record<string,string> = {
  muy_satisfactorio: "bg-emerald-50 text-emerald-800",
  satisfactorio: "bg-sky-50 text-sky-800",
  en_proceso: "bg-amber-50 text-amber-800",
  requiere_acompanamiento: "bg-rose-50 text-rose-800",
};
const dateLabel = (value: string) => new Date(value + "T12:00:00-03:00").toLocaleDateString("es-AR");

export default async function InstitutionalConductReport({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ division?: string }>;
}) {
  const { slug } = await params;
  const filters = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: institution } = await supabase.from("institutions")
    .select("id,display_name").eq("slug", slug).eq("status", "active").maybeSingle();
  if (!institution) redirect("/dashboard");
  const { data: membership } = await supabase.from("memberships").select("id")
    .eq("institution_id", institution.id).eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership) redirect("/dashboard");
  const { data: roles, error: roleError } = await supabase.from("membership_roles")
    .select("roles(key)").eq("membership_id", membership.id).eq("institution_id", institution.id);
  if (roleError) redirect(`/dashboard/${slug}`);
  if (!(roles ?? []).some(row => ["director", "institution_admin"].includes(row.roles?.key ?? "")))
    redirect(`/dashboard/${slug}`);
  const permissions = await getMembershipPermissions(supabase, membership.id);
  if (!permissions.has("prefect_conduct.manage") || !permissions.has("students.read"))
    redirect(`/dashboard/${slug}`);

  const { data: divisions, error: divisionError } = await supabase.from("divisions")
    .select("id,name,course_id").eq("institution_id", institution.id).order("name");
  if (divisionError) throw new Error("No se pudieron cargar las divisiones institucionales.");
  const divisionRows = (divisions ?? []) as Division[];
  const selectedDivision = divisionRows.some(d => d.id === filters.division) ? filters.division! : "";
  const courseIds = [...new Set(divisionRows.map(d => d.course_id))];
  const { data: courses } = courseIds.length
    ? await supabase.from("courses").select("id,name").eq("institution_id", institution.id).in("id", courseIds)
    : { data: [] as Course[] };
  const courseNames = new Map(((courses ?? []) as Course[]).map(c => [c.id, c.name]));
  const divisionNames = new Map(divisionRows.map(d => [d.id, `${courseNames.get(d.course_id) ?? "Curso"} · ${d.name}`]));

  const [{ data: periods, error: periodError }, { data: enrollments, error: enrollmentError }] = await Promise.all([
    supabase.from("grading_periods").select("id,name,starts_on,ends_on")
      .eq("institution_id", institution.id).order("starts_on", { ascending: true }),
    supabase.from("enrollments").select("division_id,students(id,first_name,last_name,student_number)")
      .eq("institution_id", institution.id).eq("status", "active"),
  ]);
  if (periodError || enrollmentError) throw new Error("No se pudo cargar la información académica.");
  const studentNames = new Map<string,string>();
  for (const enrollment of enrollments ?? []) {
    const student = enrollment.students as unknown as Student | null;
    if (student) studentNames.set(student.id, `${student.last_name}, ${student.first_name}${student.student_number ? ` · Legajo ${student.student_number}` : ""}`);
  }
  let conductQuery = supabase.from("prefect_conduct_concepts")
    .select("id,division_id,student_id,grading_period_id,concept,observation,updated_at")
    .eq("institution_id", institution.id).order("updated_at", { ascending: false }).limit(5000);
  if (selectedDivision) conductQuery = conductQuery.eq("division_id", selectedDivision);
  const { data: conductRows, error: conductError } = await conductQuery;
  if (conductError) throw new Error("No se pudo consultar el registro conductual institucional.");
  const periodRows = (periods ?? []) as Period[];
  const periodNames = new Map(periodRows.map(p => [p.id, p.name]));
  const periodOrder = new Map(periodRows.map((p, i) => [p.id, i]));

  // Keep only the most recently updated row for each student + division + grading period.
  const latest = new Map<string, ConductRow>();
  for (const row of (conductRows ?? []) as ConductRow[]) {
    const key = [row.student_id, row.division_id, row.grading_period_id].join(":");
    if (!latest.has(key)) latest.set(key, row);
  }
  const rows = [...latest.values()].sort((a,b) =>
    (periodOrder.get(a.grading_period_id) ?? -1) - (periodOrder.get(b.grading_period_id) ?? -1) ||
    (divisionNames.get(a.division_id) ?? "").localeCompare(divisionNames.get(b.division_id) ?? "") ||
    (studentNames.get(a.student_id) ?? "").localeCompare(studentNames.get(b.student_id) ?? "")
  );
  const periodGroups = periodRows.map(period => ({
    period,
    entries: rows.filter(row => row.grading_period_id === period.id),
  })).filter(group => group.entries.length);
  const counts = Object.keys(labels).map(key => ({
    key, label: labels[key], count: rows.filter(row => row.concept === key).length,
  }));

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
    <div className="mx-auto max-w-7xl space-y-6">
      <Link href={`/dashboard/${slug}/direction`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700"><ArrowLeft size={16}/> Volver al panel directivo</Link>
      <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white shadow-sm">
        <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest text-indigo-100"><BookOpenCheck size={15}/> SUPERVISIÓN INSTITUCIONAL</span>
        <h1 className="mt-4 text-3xl font-bold">Informe conductual institucional</h1>
        <p className="mt-2 text-sm text-indigo-100">{institution.display_name} · Último concepto vigente por alumno, división y trimestre.</p>
      </header>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="grid min-w-64 gap-1 text-xs font-semibold text-slate-600">División
            <select name="division" defaultValue={selectedDivision} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal">
              <option value="">Toda la institución</option>
              {divisionRows.map(d => <option key={d.id} value={d.id}>{divisionNames.get(d.id)}</option>)}
            </select>
          </label>
          <button className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800"><Filter size={15}/> Aplicar filtro</button>
          <Link href={`/dashboard/${slug}/direction/conduct`} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Limpiar</Link>
        </form>
      </section>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {counts.map(item => <article key={item.key} className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{item.count}</p>
          <p className="text-xs text-slate-500">Registros vigentes</p>
        </article>)}
      </section>
      <section className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
        <div><p className="font-semibold text-slate-900">Alcance del informe</p><p className="text-sm text-slate-500">{selectedDivision ? divisionNames.get(selectedDivision) : "Todas las divisiones de la institución"} · {rows.length} conceptos vigentes</p></div>
        <Users className="text-violet-700" size={22}/>
      </section>
      {periodGroups.length ? periodGroups.map(({period,entries}) => <section key={period.id} className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2"><div><h2 className="text-xl font-bold text-slate-900">{period.name}</h2><p className="text-xs text-slate-500">{dateLabel(period.starts_on)} al {dateLabel(period.ends_on)} · {entries.length} alumnos con concepto</p></div></div>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Alumno</th><th className="px-5 py-3">División</th><th className="px-5 py-3">Concepto vigente</th><th className="px-5 py-3">Observación</th><th className="px-5 py-3">Última actualización</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{entries.map(row => <tr key={row.id}>
              <td className="px-5 py-3 font-semibold text-slate-900">{studentNames.get(row.student_id) ?? "Alumno"}</td>
              <td className="px-5 py-3">{divisionNames.get(row.division_id) ?? "División"}</td>
              <td className="px-5 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${styles[row.concept] ?? "bg-slate-100 text-slate-700"}`}>{labels[row.concept] ?? row.concept}</span></td>
              <td className="max-w-sm whitespace-pre-wrap px-5 py-3 text-slate-600">{row.observation || "Sin observación"}</td>
              <td className="whitespace-nowrap px-5 py-3 text-slate-500">{new Intl.DateTimeFormat("es-AR",{dateStyle:"medium",timeZone:"America/Argentina/Buenos_Aires"}).format(new Date(row.updated_at))}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">Todavía no hay conceptos conductuales para el alcance seleccionado.</div>}
      <p className="text-xs leading-5 text-slate-500">Consulta de solo lectura. Se reutilizan los conceptos registrados por Preceptoría; no se crean ni modifican datos. El informe presenta el último registro por alumno, división y período, dentro de esta institución.</p>
    </div>
  </main>;
}
