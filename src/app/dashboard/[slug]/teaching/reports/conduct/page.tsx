import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ClipboardCheck, FileText, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";
import PrintButton from "./print-button";

type Classroom = { id: string; title: string; division_id: string; division_name: string; course_name: string; subject_name: string | null };
type Period = { id: string; name: string; starts_on: string; ends_on: string; status: "open" | "closed" };
type StudentRow = {
  student_id: string; student_number: string | null; name: string;
  conduct: string | null; participates_in_class: boolean; submits_practical_work: boolean;
  demonstrates_interest: boolean; observation: string | null;
};
const conductLabels: Record<string, string> = {
  regular: "Regular", buena: "Buena", muy_buena: "Muy buena", excelente: "Excelente",
};
function countBy<T>(rows: T[], pick: (row: T) => string | null) {
  return rows.reduce<Record<string, number>>((counts, row) => {
    const value = pick(row);
    if (value) counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}
export default async function TeacherConductReportPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ classroom?: string; period?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: institution } = await supabase.from("institutions").select("id,display_name")
    .eq("slug", slug).eq("status", "active").maybeSingle();
  if (!institution) redirect("/dashboard");
  const { data: membership } = await supabase.from("memberships").select("id")
    .eq("institution_id", institution.id).eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership) redirect("/dashboard");
  const [permissions, roleRows] = await Promise.all([
    getMembershipPermissions(supabase, membership.id),
    supabase.from("membership_roles").select("roles(key)").eq("membership_id", membership.id).eq("institution_id", institution.id),
  ]);
  if (!(roleRows.data ?? []).some((row) => row.roles?.key === "teacher") || !permissions.has("grades.read")) {
    redirect(`/dashboard/${slug}`);
  }

  const { data: accessible, error: classroomError } = await supabase.rpc("list_accessible_classrooms", {
    p_institution_id: institution.id,
  });
  const visible = (accessible ?? []) as Classroom[];
  const authorized: Classroom[] = [];
  for (const classroom of visible) {
    const { data: capability, error } = await supabase.rpc("get_classroom_capabilities", {
      p_classroom_id: classroom.id,
    });
    if (error) continue;
    if ((capability as { can_grade?: boolean } | null)?.can_grade) authorized.push(classroom);
  }
  const selectedClassroom = authorized.find((item) => item.id === query.classroom) ?? authorized[0] ?? null;

  let periods: Period[] = [];
  let rows: StudentRow[] = [];
  let selectedPeriod: Period | null = null;
  let reportError = Boolean(classroomError);
  if (selectedClassroom) {
    const { data: periodData, error: periodError } = await supabase.rpc("list_classroom_term_periods", {
      p_classroom_id: selectedClassroom.id,
    });
    if (periodError) reportError = true;
    periods = (periodData ?? []) as Period[];
    selectedPeriod = periods.find((period) => period.id === query.period) ?? periods[0] ?? null;
    if (selectedPeriod) {
      const { data: gradebookData, error: gradebookError } = await supabase.rpc("list_classroom_term_gradebook", {
        p_classroom_id: selectedClassroom.id,
        p_grading_period_id: selectedPeriod.id,
      });
      if (gradebookError) reportError = true;
      else rows = ((gradebookData as { students?: StudentRow[] } | null)?.students ?? []);
    }
  }

  const conductCounts = countBy(rows, (row) => row.conduct);
  const totals = {
    withObservation: rows.filter((row) => Boolean(row.observation?.trim())).length,
    participates: rows.filter((row) => row.participates_in_class).length,
    submits: rows.filter((row) => row.submits_practical_work).length,
    interested: rows.filter((row) => row.demonstrates_interest).length,
    withoutConcept: rows.filter((row) => !row.conduct).length,
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <Link href={`/dashboard/${slug}/teaching/reports`} className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-indigo-700 print:hidden">
          <ArrowLeft size={16}/> Volver al centro de informes
        </Link>
        <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-amber-950 to-orange-900 p-7 text-white shadow-sm sm:p-9 print:bg-white print:text-slate-900 print:shadow-none">
          <div className="flex items-center gap-3"><ShieldAlert size={28}/><div><p className="text-xs font-bold uppercase tracking-widest text-amber-200 print:text-amber-800">Seguimiento pedagógico</p><h1 className="text-3xl font-bold">Informe de convivencia y participación</h1></div></div>
          <p className="mt-3 text-sm leading-6 text-amber-100 print:text-slate-600">{institution.display_name} · Información registrada en la planilla trimestral del aula.</p>
        </header>

        <form method="get" className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end print:hidden">
          <label className="text-sm font-semibold text-slate-700">Aula
            <select name="classroom" defaultValue={selectedClassroom?.id ?? ""} onChange={undefined} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5">
              {authorized.map((item) => <option key={item.id} value={item.id}>{item.course_name} · {item.division_name} · {item.subject_name ?? item.title}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700">Período
            <select name="period" defaultValue={selectedPeriod?.id ?? ""} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5">
              {periods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}
            </select>
          </label>
          <button className="rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800">Consultar</button>
        </form>

        {reportError ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">No se pudo cargar toda la información. El informe muestra únicamente los datos obtenidos mediante consultas autorizadas.</div> : null}
        {!authorized.length ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <ShieldAlert size={34} className="mx-auto text-slate-400"/>
            <h2 className="mt-3 font-semibold">No hay aulas habilitadas para este informe</h2>
            <p className="mt-1 text-sm text-slate-500">Se requiere permiso de calificación en al menos un aula.</p>
          </div>
        ) : !selectedPeriod ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">El aula seleccionada no tiene períodos trimestrales configurados.</div>
        ) : (
          <>
            <section className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5">
              <div><p className="text-xs font-bold uppercase tracking-wider text-amber-700">Alcance del informe</p><h2 className="mt-1 text-xl font-bold text-slate-900">{selectedClassroom?.course_name} · {selectedClassroom?.division_name}</h2><p className="mt-1 text-sm text-slate-500">{selectedClassroom?.subject_name ?? selectedClassroom?.title} · {selectedPeriod.name} · {selectedPeriod.starts_on} al {selectedPeriod.ends_on}</p></div>
              <PrintButton/>
            </section>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Alumnos incluidos</p><p className="mt-1 text-2xl font-bold">{rows.length}</p></div>
              <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Con observaciones</p><p className="mt-1 text-2xl font-bold">{totals.withObservation}</p></div>
              <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Sin concepto registrado</p><p className="mt-1 text-2xl font-bold">{totals.withoutConcept}</p></div>
              <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Participación registrada</p><p className="mt-1 text-2xl font-bold">{totals.participates} / {rows.length}</p></div>
            </section>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(conductLabels).map(([key,label]) => <div key={key} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">Concepto {label}</p><p className="mt-1 text-2xl font-bold">{conductCounts[key] ?? 0}</p></div>)}
            </section>
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4"><ClipboardCheck size={19} className="text-amber-700"/><h2 className="font-bold">Registro individual de seguimiento</h2></div>
              {rows.length ? <div className="divide-y divide-slate-100">{rows.map((row) => <article key={row.student_id} className="grid gap-3 p-5 md:grid-cols-[1fr_2fr]">
                <div><h3 className="font-semibold text-slate-900">{row.name}</h3><p className="text-xs text-slate-500">{row.student_number ?? "Sin legajo"}</p><p className="mt-2 inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">{row.conduct ? conductLabels[row.conduct] ?? row.conduct : "Sin concepto registrado"}</p></div>
                <div className="grid gap-2 sm:grid-cols-3"><p className="rounded-lg bg-slate-50 p-3 text-sm">Participa en clase: <strong>{row.participates_in_class ? "Sí" : "No"}</strong></p><p className="rounded-lg bg-slate-50 p-3 text-sm">Entrega trabajos: <strong>{row.submits_practical_work ? "Sí" : "No"}</strong></p><p className="rounded-lg bg-slate-50 p-3 text-sm">Demuestra interés: <strong>{row.demonstrates_interest ? "Sí" : "No"}</strong></p>{row.observation ? <p className="rounded-lg border border-slate-200 p-3 text-sm leading-6 sm:col-span-3"><strong>Observación docente:</strong> {row.observation}</p> : null}</div>
              </article>)}</div> : <p className="p-8 text-center text-sm text-slate-500">No hay registros de convivencia para este período.</p>}
            </section>
            <p className="text-xs leading-5 text-slate-500">Este informe refleja únicamente los conceptos e indicadores registrados por el equipo docente en el período seleccionado. No constituye un diagnóstico ni una calificación definitiva de la conducta del alumno.</p>
          </>
        )}
      </div>
    </main>
  );
}
