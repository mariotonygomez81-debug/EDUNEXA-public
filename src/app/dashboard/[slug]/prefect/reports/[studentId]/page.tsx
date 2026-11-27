import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, FileText, History } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";
import PrefectFollowupPdf from "../report-pdf";

type Assignment = { division_id: string; starts_on: string | null; ends_on: string | null };
type Division = { id: string; name: string; course_id: string; academic_year_id: string };
type Student = { id: string; first_name: string; last_name: string; student_number: string | null };
type TimelineItem = {
  id: string; date: string; kind: "novelty" | "conduct" | "appointment" | "minute";
  division: string; title: string; status: string; detail: string; extra: string;
};
const labels = { novelty: "Novedad", conduct: "Concepto conductual", appointment: "Citación a tutor", minute: "Acta" };
const conductLabels: Record<string,string> = {
  muy_satisfactorio: "Muy satisfactorio", satisfactorio: "Satisfactorio",
  en_proceso: "En proceso", requiere_acompanamiento: "Requiere acompañamiento",
};
const statusLabels: Record<string,string> = {
  open: "Pendiente", in_progress: "En seguimiento", resolved: "Resuelta",
  requested: "Pendiente de respuesta", confirmed: "Confirmada", rejected: "Rechazada",
  declined: "Rechazada", completed: "Realizada", cancelled: "Cancelada",
};
function dateLabel(value: string) {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "America/Argentina/Buenos_Aires" })
    .format(new Date(value.length === 10 ? value + "T12:00:00-03:00" : value));
}

export default async function PrefectStudentReportPage({ params, searchParams }: {
  params: Promise<{ slug: string; studentId: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { slug, studentId } = await params;
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
  const permissions = await getMembershipPermissions(supabase, membership.id);
  if (!permissions.has("students.read") || !permissions.has("attendance.read")) redirect(`/dashboard/${slug}`);
  const { data: roles } = await supabase.from("membership_roles").select("roles(key)")
    .eq("membership_id", membership.id).eq("institution_id", institution.id);
  if (!(roles ?? []).some(row => row.roles?.key === "prefect")) redirect(`/dashboard/${slug}`);

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
  const [{ data: assignments, error: assignmentError }, { data: years }] = await Promise.all([
    supabase.from("staff_assignments").select("division_id,starts_on,ends_on")
      .eq("institution_id", institution.id).eq("membership_id", membership.id)
      .eq("assignment_type", "prefect").not("division_id", "is", null),
    supabase.from("academic_years").select("id,name,starts_on,ends_on,status")
      .eq("institution_id", institution.id).order("starts_on", { ascending: false }),
  ]);
  if (assignmentError) throw new Error("No se pudieron cargar tus divisiones asignadas.");
  const divisionIds = [...new Set(((assignments ?? []) as Assignment[])
    .filter(a => (!a.starts_on || a.starts_on <= today) && (!a.ends_on || a.ends_on >= today))
    .map(a => a.division_id))];
  const { data: divisions, error: divisionError } = divisionIds.length
    ? await supabase.from("divisions").select("id,name,course_id,academic_year_id")
      .eq("institution_id", institution.id).in("id", divisionIds)
    : { data: [] as Division[], error: null };
  if (divisionError) throw new Error("No se pudieron cargar las divisiones asignadas.");
  const yearsList = years ?? [];
  const selectedYear = yearsList.find(y => y.id === filters.year) ?? yearsList.find(y => y.status === "active") ?? yearsList[0];
  if (!selectedYear) notFound();
  const yearDivisions = (divisions ?? []).filter(d => d.academic_year_id === selectedYear.id);
  const yearDivisionIds = yearDivisions.map(d => d.id);
  const courseIds = [...new Set(yearDivisions.map(d => d.course_id))];
  const [{ data: courses }, { data: enrollments }] = await Promise.all([
    courseIds.length ? supabase.from("courses").select("id,name").eq("institution_id", institution.id).in("id", courseIds)
      : Promise.resolve({ data: [] }),
    yearDivisionIds.length ? supabase.from("enrollments")
      .select("division_id,students(id,first_name,last_name,student_number)")
      .eq("institution_id", institution.id).in("division_id", yearDivisionIds).eq("status", "active")
      : Promise.resolve({ data: [] }),
  ]);
  const courseNames = new Map((courses ?? []).map(c => [c.id, c.name]));
  const divisionNames = new Map(yearDivisions.map(d => [d.id, `${courseNames.get(d.course_id) ?? "Curso"} · ${d.name}`]));
  const studentRows = (enrollments ?? []).flatMap(row => {
    const s = row.students as unknown as Student | null;
    return s ? [{ ...s, divisionId: row.division_id as string }] : [];
  });
  const student = studentRows.find(s => s.id === studentId);
  if (!student) notFound();
  const studentName = `${student.last_name}, ${student.first_name}`;
  const divisionName = divisionNames.get(student.divisionId) ?? "División asignada";
  const from = selectedYear.starts_on;
  const to = selectedYear.ends_on;

  const [novelties, conduct, minutes, appointments, periods] = await Promise.all([
    supabase.from("prefect_novelties").select("id,event_date,title,description,status,follow_up,follow_up_due_on")
      .eq("institution_id", institution.id).eq("division_id", student.divisionId).eq("student_id", studentId)
      .gte("event_date", from).lte("event_date", to).order("event_date", { ascending: false }),
    supabase.from("prefect_conduct_concepts").select("id,grading_period_id,concept,observation,updated_at")
      .eq("institution_id", institution.id).eq("division_id", student.divisionId).eq("student_id", studentId)
      .order("updated_at", { ascending: false }),
    supabase.from("prefect_minutes").select("id,folio,meeting_date,act_type,subject,development,agreements")
      .eq("institution_id", institution.id).eq("division_id", student.divisionId).eq("student_id", studentId)
      .gte("meeting_date", from).lte("meeting_date", to).order("meeting_date", { ascending: false }),
    supabase.rpc("list_my_teacher_guardian_appointment_details"),
    supabase.from("grading_periods").select("id,name,starts_on,ends_on")
      .eq("institution_id", institution.id).eq("academic_year_id", selectedYear.id),
  ]);
  if (novelties.error || conduct.error || minutes.error || appointments.error || periods.error) {
    throw new Error("No se pudo cargar el seguimiento individual.");
  }
  const periodNames = new Map((periods.data ?? []).map(p => [p.id, p.name]));
  const periodIds = new Set((periods.data ?? []).map(p => p.id));
  const timeline: TimelineItem[] = [];
  for (const n of novelties.data ?? []) timeline.push({
    id: n.id, date: n.event_date, kind: "novelty", division: divisionName,
    title: n.title, status: statusLabels[n.status] ?? n.status, detail: n.description,
    extra: n.follow_up ? `Seguimiento: ${n.follow_up}${n.follow_up_due_on ? ` · Próxima acción: ${dateLabel(n.follow_up_due_on)}` : ""}` : "",
  });
  for (const c of conduct.data ?? []) {
    if (!periodIds.has(c.grading_period_id)) continue;
    timeline.push({
      id: c.id, date: c.updated_at, kind: "conduct", division: divisionName,
      title: conductLabels[c.concept] ?? c.concept, status: "Registrado",
      detail: c.observation ?? "Sin observación adicional.", extra: periodNames.get(c.grading_period_id) ?? "",
    });
  }
  for (const m of minutes.data ?? []) timeline.push({
    id: m.id, date: m.meeting_date, kind: "minute", division: divisionName,
    title: `Acta N.º ${String(m.folio).padStart(6, "0")} · ${m.subject}`,
    status: m.act_type.replaceAll("_", " "), detail: m.development,
    extra: m.agreements ? `Acuerdos: ${m.agreements}` : "",
  });
  for (const a of appointments.data ?? []) {
    if (a.student_id !== studentId || !a.scheduled_at || a.scheduled_at.slice(0, 10) < from || a.scheduled_at.slice(0, 10) > to) continue;
    const finalObservation = (a.conversation ?? []).filter((event: { event_type: string }) =>
      event.event_type === "teacher_final_observation").slice(-1)[0];
    timeline.push({
      id: a.appointment_id, date: a.scheduled_at, kind: "appointment", division: divisionName,
      title: a.reason, status: statusLabels[a.status] ?? a.status,
      detail: finalObservation?.body ?? `Tutor: ${a.guardian_name ?? "Tutor"}`,
      extra: a.guardian_response_note ?? "",
    });
  }
  timeline.sort((a,b) => b.date.localeCompare(a.date));
  const counts = (Object.keys(labels) as (keyof typeof labels)[]).map(kind =>
    ({ kind, label: labels[kind], count: timeline.filter(row => row.kind === kind).length }));

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href={`/dashboard/${slug}/prefect/reports`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700"><ArrowLeft size={16}/> Volver al historial general</Link>
      <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white">
        <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-wide text-indigo-100"><History size={15}/> LEGAJO DE SEGUIMIENTO</span>
        <h1 className="mt-3 text-3xl font-bold">{studentName}</h1>
        <p className="mt-2 text-sm text-indigo-100">{institution.display_name} · {divisionName} · Ciclo lectivo {selectedYear.name}</p>
        {student.student_number ? <p className="mt-1 text-xs text-indigo-200">Legajo: {student.student_number}</p> : null}
      </header>
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs font-semibold text-slate-600">Ciclo lectivo
            <select name="year" defaultValue={selectedYear.id} className="min-w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal">
              {yearsList.map(y => <option key={y.id} value={y.id}>{y.name} · {y.status === "active" ? "En curso" : y.status === "closed" ? "Cerrado" : "Planificado"}</option>)}
            </select>
          </label>
          <button className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800">Consultar ciclo</button>
          <span className="text-xs text-slate-500">{dateLabel(from)} – {dateLabel(to)}</span>
        </form>
      </section>
      <section className="grid gap-3 sm:grid-cols-4">
        {counts.map(item => <div key={item.kind} className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">{item.label === "Concepto conductual" ? "Conceptos" : item.label + (item.kind === "novelty" ? "s" : "")}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{item.count}</p>
        </div>)}
      </section>
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4">
        <div><p className="font-semibold text-violet-950">Informe individual del ciclo {selectedYear.name}</p><p className="text-sm text-violet-800">{timeline.length} registros · fuentes originales, sin duplicación</p></div>
        <PrefectFollowupPdf institution={institution.display_name} filters={[`Alumno: ${studentName}`, `División: ${divisionName}`, `Ciclo lectivo: ${selectedYear.name}`, `Período: ${from} a ${to}`]} rows={timeline.map(item => ({
          date: item.date, kind: labels[item.kind], categoryKey: item.kind, division: item.division,
          student: studentName, title: item.title, status: item.status, detail: item.detail, extra: item.extra,
        }))}/>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-bold text-slate-900">Historial del alumno</h2>
        {timeline.length ? timeline.map(item => <article key={item.kind + item.id} className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div>
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">{labels[item.kind]} · {dateLabel(item.date)}</p>
            <h3 className="mt-1 text-lg font-bold text-slate-900">{item.title}</h3>
            <p className="mt-1 text-sm text-slate-500">{item.division}</p>
          </div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{item.status}</span></div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.detail}</p>
          {item.extra ? <p className="mt-2 whitespace-pre-wrap text-sm text-slate-500">{item.extra}</p> : null}
        </article>) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No hay registros de seguimiento para este alumno en el ciclo lectivo seleccionado.</div>}
      </section>
      <p className="text-xs leading-5 text-slate-500">El informe reúne únicamente registros asociados a este alumno y a una división actualmente asignada a tu preceptoría. Las fuentes se consultan en modo lectura; no se crean copias ni se alteran registros originales.</p>
    </div>
  </main>;
}
