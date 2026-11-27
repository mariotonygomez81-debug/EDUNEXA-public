import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAcademicYear, createGradingPeriod } from "./actions";

type Year = { id: string; name: string; starts_on: string; ends_on: string; status: string };
type Period = { id: string; academic_year_id: string; name: string; starts_on: string; ends_on: string; sort_order: number; status: "open" | "closed" };

const yearStatus: Record<string, string> = { planned: "Planificado", active: "En curso", closed: "Cerrado" };

export default async function AcademicCalendarPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; created?: string }>;
}) {
  const { slug } = await params;
  const { error, created } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: institution } = await supabase.from("institutions")
    .select("id,display_name").eq("slug", slug).maybeSingle();
  if (!institution) redirect("/dashboard");
  const { data: membership } = await supabase.from("memberships")
    .select("id").eq("institution_id", institution.id).eq("user_id", user.id)
    .eq("status", "active").maybeSingle();
  if (!membership) redirect("/dashboard");
  const { data: roles } = await supabase.from("membership_roles")
    .select("roles(key)").eq("membership_id", membership.id);
  if (!(roles ?? []).some((row) => row.roles?.key === "institution_admin")) redirect(`/dashboard/${slug}`);

  const [{ data: yearsRaw }, { data: periodsRaw }] = await Promise.all([
    supabase.from("academic_years").select("id,name,starts_on,ends_on,status")
      .eq("institution_id", institution.id).order("starts_on", { ascending: false }),
    supabase.from("grading_periods").select("id,academic_year_id,name,starts_on,ends_on,sort_order,status")
      .eq("institution_id", institution.id).order("sort_order"),
  ]);
  const years = (yearsRaw ?? []) as Year[];
  const periods = (periodsRaw ?? []) as Period[];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <Link href={`/dashboard/${slug}`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700"><ArrowLeft size={16} /> Volver al espacio institucional</Link>
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3"><div className="rounded-xl bg-violet-100 p-3 text-violet-700"><CalendarDays size={24} /></div><div>
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">Configuración institucional</p><h1 className="text-2xl font-bold">Calendario académico</h1>
            <p className="mt-1 text-sm text-slate-500">{institution.display_name} · Ciclos lectivos y períodos de calificación</p>
          </div></div>
        </header>
        {created && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{created === "year" ? "El ciclo lectivo se creó." : "El período de calificación se creó."}</div>}
        {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error === "year_overlap" ? "Las fechas del ciclo se superponen con otro ciclo." : error === "active_year_exists" ? "Ya existe un ciclo lectivo activo." : error === "period_overlap" ? "Las fechas se superponen con otro período del mismo ciclo." : error === "period_range" ? "El período debe quedar dentro de las fechas del ciclo lectivo." : "No se pudo guardar. Revisá los datos y los permisos."}
        </div>}
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2"><Plus size={18} className="text-violet-700" /><h2 className="font-semibold">Nuevo ciclo lectivo</h2></div>
            <form action={createAcademicYear} className="space-y-4">
              <input type="hidden" name="slug" value={slug} />
              <label className="block text-sm font-medium">Nombre del ciclo<input name="name" required minLength={2} maxLength={80} placeholder="2027" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium">Inicio<input name="starts_on" type="date" required className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
                <label className="block text-sm font-medium">Finalización<input name="ends_on" type="date" required className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
              </div>
              <label className="block text-sm font-medium">Estado<select name="status" defaultValue="planned" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal"><option value="planned">Planificado</option><option value="active">En curso</option><option value="closed">Cerrado</option></select></label>
              <button className="w-full rounded-lg bg-violet-700 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-800">Crear ciclo lectivo</button>
            </form>
          </section>
          <section className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2"><Plus size={18} className="text-violet-700" /><h2 className="font-semibold">Nuevo período de calificación</h2></div>
            {years.length ? <form action={createGradingPeriod} className="space-y-4">
              <input type="hidden" name="slug" value={slug} />
              <label className="block text-sm font-medium">Ciclo lectivo<select name="academic_year_id" required className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal"><option value="">Seleccionar</option>{years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></label>
              <label className="block text-sm font-medium">Nombre<input name="name" required minLength={2} maxLength={80} placeholder="Segundo trimestre" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium">Inicio<input name="starts_on" type="date" required className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
                <label className="block text-sm font-medium">Finalización<input name="ends_on" type="date" required className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
              </div>
              <label className="block text-sm font-medium">Orden<input name="sort_order" type="number" min="0" max="100" step="1" defaultValue="1" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
              <button className="w-full rounded-lg bg-violet-700 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-800">Crear período</button>
            </form> : <p className="text-sm text-slate-500">Primero creá un ciclo lectivo.</p>}
          </section>
        </div>
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold">Ciclos y períodos configurados</h2></div>
          <div className="divide-y divide-slate-100">
            {years.map((year) => <div key={year.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">{year.name}</h3><p className="mt-1 text-sm text-slate-500">{year.starts_on} – {year.ends_on}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium">{yearStatus[year.status] ?? year.status}</span></div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{periods.filter((period) => period.academic_year_id === year.id).map((period) => <div key={period.id} className="rounded-lg border border-slate-200 p-3"><div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold">{period.name}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${period.status === "closed" ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700"}`}>{period.status === "closed" ? "Cerrado" : "Abierto"}</span></div><p className="mt-1 text-xs text-slate-500">{period.starts_on} – {period.ends_on}</p></div>)}</div>
            </div>)}
            {!years.length && <p className="p-8 text-center text-sm text-slate-500">Todavía no hay ciclos lectivos configurados.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
