import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, GraduationCap, Plus, Scale } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";
import { assignGradingScale } from "./actions";
import GradingScaleCreateForm from "./grading-scale-create-form";

type ScaleRow = { id: string; name: string; description: string | null; display_mode: string; minimum_value: number; maximum_value: number; passing_value: number | null };
type Level = { id: string; grading_scale_id: string; minimum_percentage: number; maximum_percentage: number; label: string; grade_value: number | null; is_passing: boolean; sort_order: number };
type Year = { id: string; name: string; grading_scale_id: string | null; status: string };

export default async function GradingScalesPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; created?: string; saved?: string; scale?: string }>;
}) {
  const { slug } = await params;
  const { error, created, saved, scale: selectedScaleId } = await searchParams;
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
  const permissions = await getMembershipPermissions(supabase, membership.id);
  if (!permissions.has("institution.manage")) redirect(`/dashboard/${slug}`);

  const [{ data: scalesRaw }, { data: levelsRaw }, { data: yearsRaw }] = await Promise.all([
    supabase.from("grading_scales").select("id,name,description,display_mode,minimum_value,maximum_value,passing_value")
      .eq("institution_id", institution.id).order("name"),
    supabase.from("grading_scale_levels").select("id,grading_scale_id,minimum_percentage,maximum_percentage,label,grade_value,is_passing,sort_order")
      .eq("institution_id", institution.id).order("sort_order"),
    supabase.from("academic_years").select("id,name,grading_scale_id,status")
      .eq("institution_id", institution.id).order("starts_on", { ascending: false }),
  ]);
  const scales = (scalesRaw ?? []) as ScaleRow[];
  const levels = (levelsRaw ?? []) as Level[];
  const years = (yearsRaw ?? []) as Year[];
  const selectedScale = scales.find((item) => item.id === selectedScaleId) ?? scales[0];
  const scaleLevels = selectedScale ? levels.filter((item) => item.grading_scale_id === selectedScale.id) : [];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <Link href={`/dashboard/${slug}`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700"><ArrowLeft size={16} /> Volver al espacio institucional</Link>
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3"><div className="rounded-xl bg-violet-100 p-3 text-violet-700"><Scale size={24} /></div><div>
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">Configuración institucional</p>
            <h1 className="text-2xl font-bold">Escalas de calificación</h1>
            <p className="mt-1 text-sm text-slate-500">{institution.display_name} · Definí los criterios de evaluación de cada ciclo lectivo.</p>
          </div></div>
        </header>
        {created && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{"La escala y sus niveles se crearon correctamente."}</div>}
        {saved && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">La escala del ciclo lectivo se actualizó.</div>}
        {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error === "scale_duplicate" ? "Ya existe una escala con ese nombre." : error === "scale_invalid" ? "Revisá el nombre, el tipo y los valores de la escala." : error === "level_invalid" ? "Los niveles deben cubrir del 0 al 100 en tramos consecutivos de 0,01 y no superponerse." : error === "assignment_invalid" ? "Seleccioná un ciclo lectivo y una escala válidos." : error === "assignment_save" ? "No se pudo asignar la escala. Si ya hay boletines publicados, el ciclo no puede cambiar de escala." : "No se pudo guardar. Verificá los datos y los permisos."}
        </div>}
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2"><Plus size={18} className="text-violet-700" /><h2 className="font-semibold">Crear escala</h2></div>
            <GradingScaleCreateForm slug={slug} />
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2"><GraduationCap size={18} className="text-violet-700" /><h2 className="font-semibold">Asignar escala al ciclo lectivo</h2></div>
            {years.length ? <div className="space-y-4">{years.map((year) => <form key={year.id} action={assignGradingScale} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <input type="hidden" name="slug" value={slug} /><input type="hidden" name="academic_year_id" value={year.id} />
              <div><p className="text-sm font-semibold">{year.name}</p><p className="text-xs text-slate-500">{year.status === "active" ? "En curso" : year.status === "closed" ? "Cerrado" : "Planificado"}</p></div>
              <label className="text-xs font-medium">Escala<select name="grading_scale_id" required disabled={year.status === "closed"} defaultValue={year.grading_scale_id ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm font-normal disabled:bg-slate-100"><option value="" disabled>Seleccioná una escala</option>{scales.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              {year.status !== "closed" && <button className="rounded-lg border border-violet-200 px-3 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50">Guardar</button>}
            </form>)}</div> : <p className="text-sm text-slate-500">Primero configurá un ciclo lectivo en el calendario académico.</p>}
          </section>
        </div>
        {selectedScale && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">{selectedScale.name}</h2><p className="mt-1 text-sm text-slate-500">{selectedScale.description ?? "Sin descripción"} · {selectedScale.display_mode === "descriptive" ? "Conceptual" : selectedScale.display_mode === "both" ? "Numérica y conceptual" : "Numérica"} · Rango {selectedScale.minimum_value}–{selectedScale.maximum_value}{selectedScale.passing_value !== null ? ` · Aprobación desde ${selectedScale.passing_value}` : ""}</p></div><div className="flex flex-wrap gap-2">{scales.map((item) => <Link key={item.id} href={`?scale=${item.id}`} className={`rounded-lg px-3 py-2 text-xs font-semibold ${item.id === selectedScale.id ? "bg-violet-700 text-white" : "border border-slate-200 text-slate-600"}`}>{item.name}</Link>)}</div></div>
          <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_1fr]">
            <div><h3 className="mb-3 text-sm font-semibold">Tramos configurados</h3>{scaleLevels.length ? <div className="space-y-2">{scaleLevels.map((level) => <div key={level.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"><div><p className="text-sm font-semibold">{level.label}</p><p className="text-xs text-slate-500">{level.minimum_percentage}%–{level.maximum_percentage}% del puntaje máximo</p></div><div className="text-right"><p className="text-sm font-semibold">{level.grade_value ?? "—"}</p><p className={`text-xs ${level.is_passing ? "text-emerald-700" : "text-slate-500"}`}>{level.is_passing ? "Aprobado" : "No aprobado"}</p></div></div>)}</div> : <p className="text-sm text-slate-500">Todavía no hay tramos. Agregá rangos porcentuales para convertir resultados.</p>}</div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
              Los niveles se crean junto con la escala para asegurar que cubran el rango completo de 0 a 100 sin superposiciones. Las escalas se conservan como configuración histórica; si necesitás cambiar criterios, creá una nueva escala y asignala a un ciclo lectivo que todavía no tenga boletines publicados.
            </div>
          </div>
          <p className="mt-4 text-xs text-slate-500">Los rangos se expresan como porcentaje del puntaje máximo de cada evaluación. No se recalculan ni modifican las notas ya registradas.</p>
        </section>}
        {!scales.length && <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Todavía no hay escalas. Creá la primera para comenzar.</div>}
      </div>
    </main>
  );
}
