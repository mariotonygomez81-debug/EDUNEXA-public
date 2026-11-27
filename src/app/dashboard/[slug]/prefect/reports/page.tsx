import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ClipboardList, History, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";
import PrefectFollowupPdf from "./report-pdf";

type Assignment = { division_id: string; starts_on: string | null; ends_on: string | null };
type Division = { id: string; name: string; course_id: string };
type Course = { id: string; name: string };
type Student = { id: string; first_name: string; last_name: string; student_number: string | null };
type TimelineItem = {
  id: string; date: string; kind: "novelty" | "conduct" | "appointment" | "minute";
  divisionId: string; studentId: string | null; title: string; status: string;
  detail: string; extra?: string;
};
const kindLabels: Record<TimelineItem["kind"], string> = {
  novelty: "Novedad", conduct: "Concepto conductual", appointment: "Citación a tutor", minute: "Acta",
};
const conductLabels: Record<string,string> = {
  muy_satisfactorio: "Muy satisfactorio", satisfactorio: "Satisfactorio",
  en_proceso: "En proceso", requiere_acompanamiento: "Requiere acompañamiento",
};
const noveltyStatus: Record<string,string> = { open: "Pendiente", in_progress: "En seguimiento", resolved: "Resuelta" };
const appointmentStatus: Record<string,string> = {
  requested: "Pendiente de respuesta", confirmed: "Confirmada", rejected: "Rechazada",
  declined: "Rechazada", completed: "Realizada", cancelled: "Cancelada",
};

function dateLabel(value: string) {
  const date = new Date(value.length === 10 ? value + "T12:00:00-03:00" : value);
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "America/Argentina/Buenos_Aires" }).format(date);
}

export default async function PrefectReportsPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ division?: string; student?: string; from?: string; to?: string; kind?: string }>;
}) {
  const { slug } = await params;
  const filters = await searchParams;
  const validDate = (v?: string) => !!v && v.length === 10 && !Number.isNaN(Date.parse(v + "T12:00:00"));
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
  if (!(roles ?? []).some((row) => row.roles?.key === "prefect")) redirect(`/dashboard/${slug}`);

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
  const { data: assignments, error: assignmentError } = await supabase.from("staff_assignments")
    .select("division_id,starts_on,ends_on").eq("institution_id", institution.id)
    .eq("membership_id", membership.id).eq("assignment_type", "prefect").not("division_id", "is", null);
  if (assignmentError) throw new Error("No se pudieron cargar tus divisiones asignadas.");
  const divisionIds = [...new Set(((assignments ?? []) as Assignment[])
    .filter(a => (!a.starts_on || a.starts_on <= today) && (!a.ends_on || a.ends_on >= today))
    .map(a => a.division_id))];
  const { data: divisions, error: divisionError } = divisionIds.length
    ? await supabase.from("divisions").select("id,name,course_id").eq("institution_id", institution.id).in("id", divisionIds).order("name")
    : { data: [] as Division[], error: null };
  if (divisionError) throw new Error("No se pudieron cargar las divisiones.");
  const courseIds = [...new Set((divisions ?? []).map(d => d.course_id))];
  const { data: courses } = courseIds.length
    ? await supabase.from("courses").select("id,name").eq("institution_id", institution.id).in("id", courseIds)
    : { data: [] as Course[] };
  const courseNames = new Map(((courses ?? []) as Course[]).map(c => [c.id, c.name]));
  const divisionNames = new Map((divisions ?? []).map(d => [d.id, `${courseNames.get(d.course_id) ?? "Curso"} · ${d.name}`]));
  const { data: enrollments, error: enrollmentError } = divisionIds.length
    ? await supabase.from("enrollments").select("division_id,students(id,first_name,last_name,student_number)")
      .eq("institution_id", institution.id).in("division_id", divisionIds).eq("status", "active")
    : { data: [], error: null };
  if (enrollmentError) throw new Error("No se pudieron cargar los alumnos de tus divisiones.");
  const studentNames = new Map<string,string>();
  const studentDivision = new Map<string,string>();
  const studentOptions: { id: string; divisionId: string; label: string }[] = [];
  for (const row of enrollments ?? []) {
    const student = row.students as unknown as Student | null;
    if (!student) continue;
    studentNames.set(student.id, `${student.last_name}, ${student.first_name}`);
    studentDivision.set(student.id, row.division_id);
    studentOptions.push({ id: student.id, divisionId: row.division_id, label: `${student.last_name}, ${student.first_name}` });
  }

  const [noveltyResult, conductResult, minuteResult, appointmentResult] = await Promise.all([
    divisionIds.length ? supabase.from("prefect_novelties")
      .select("id,division_id,student_id,title,description,event_date,status,follow_up,follow_up_due_on")
      .eq("institution_id", institution.id).in("division_id", divisionIds)
      .order("event_date", { ascending: false }).limit(1000) : Promise.resolve({ data: [], error: null }),
    divisionIds.length ? supabase.from("prefect_conduct_concepts")
      .select("id,division_id,student_id,grading_period_id,concept,observation,updated_at")
      .eq("institution_id", institution.id).in("division_id", divisionIds)
      .order("updated_at", { ascending: false }).limit(1000) : Promise.resolve({ data: [], error: null }),
    divisionIds.length ? supabase.from("prefect_minutes")
      .select("id,folio,division_id,student_id,meeting_date,act_type,subject,development,agreements")
      .eq("institution_id", institution.id).in("division_id", divisionIds)
      .order("meeting_date", { ascending: false }).limit(1000) : Promise.resolve({ data: [], error: null }),
    supabase.rpc("list_my_teacher_guardian_appointment_details"),
  ]);
  if (noveltyResult.error || conductResult.error || minuteResult.error || appointmentResult.error) {
    throw new Error("No se pudo cargar el historial de seguimiento.");
  }
  const { data: periods } = await supabase.from("grading_periods").select("id,name")
    .eq("institution_id", institution.id);
  const periodNames = new Map((periods ?? []).map(p => [p.id, p.name]));
  const timeline: TimelineItem[] = [];
  for (const n of noveltyResult.data ?? []) timeline.push({
    id: n.id, date: n.event_date, kind: "novelty", divisionId: n.division_id, studentId: n.student_id,
    title: n.title, status: noveltyStatus[n.status] ?? n.status,
    detail: n.description, extra: n.follow_up ? `Seguimiento: ${n.follow_up}${n.follow_up_due_on ? ` · Próxima acción: ${dateLabel(n.follow_up_due_on)}` : ""}` : undefined,
  });
  for (const c of conductResult.data ?? []) timeline.push({
    id: c.id, date: c.updated_at, kind: "conduct", divisionId: c.division_id, studentId: c.student_id,
    title: conductLabels[c.concept] ?? c.concept, status: "Registrado",
    detail: c.observation ?? "Sin observación adicional.",
    extra: periodNames.get(c.grading_period_id) ?? "Período lectivo",
  });
  for (const m of minuteResult.data ?? []) timeline.push({
    id: m.id, date: m.meeting_date, kind: "minute", divisionId: m.division_id, studentId: m.student_id,
    title: `Acta N.º ${String(m.folio).padStart(6, "0")} · ${m.subject}`, status: m.act_type.replaceAll("_", " "),
    detail: m.development, extra: m.agreements ? `Acuerdos: ${m.agreements}` : undefined,
  });
  for (const a of appointmentResult.data ?? []) {
    const divisionId = studentDivision.get(a.student_id);
    if (!divisionId) continue;
    const finalObservation = ((a.conversation ?? []).filter((event: { event_type: string }) => event.event_type === "teacher_final_observation").slice(-1)[0]);
    timeline.push({
      id: a.appointment_id, date: a.scheduled_at, kind: "appointment", divisionId, studentId: a.student_id,
      title: a.reason, status: appointmentStatus[a.status] ?? a.status,
      detail: finalObservation?.body ?? `Tutor: ${a.guardian_name ?? "Tutor"}`,
      extra: a.guardian_response_note ?? undefined,
    });
  }

  const allowedKinds = ["all", "novelty", "conduct", "appointment", "minute"];
  const selectedKind = allowedKinds.includes(filters.kind ?? "all") ? (filters.kind ?? "all") : "all";
  const filtered = timeline.filter(item =>
    (!filters.division || filters.division === item.divisionId) &&
    (!filters.student || filters.student === item.studentId) &&
    (!validDate(filters.from) || item.date.slice(0,10) >= filters.from!) &&
    (!validDate(filters.to) || item.date.slice(0,10) <= filters.to!) &&
    (selectedKind === "all" || selectedKind === item.kind)
  ).sort((a,b) => b.date.localeCompare(a.date));
  const countByKind = (kind: TimelineItem["kind"]) => timeline.filter(item => item.kind === kind).length;
  const pluralLabels: Record<string,string> = { novelty: "Novedades", conduct: "Conceptos conductuales", appointment: "Citaciones", minute: "Actas" };
  const appliedFilters = [
    filters.division ? `División: ${divisionNames.get(filters.division) ?? "seleccionada"}` : "División: todas las asignadas",
    filters.student ? `Alumno: ${studentNames.get(filters.student) ?? "seleccionado"}` : "Alumnos: todos",
    validDate(filters.from) ? `Desde: ${dateLabel(filters.from!)}` : "Desde: sin límite",
    validDate(filters.to) ? `Hasta: ${dateLabel(filters.to!)}` : "Hasta: sin límite",
    selectedKind === "all" ? "Tipo: todos" : `Tipo: ${kindLabels[selectedKind as TimelineItem["kind"]]}`,
  ];

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href={`/dashboard/${slug}/prefect`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700"><ArrowLeft size={16}/> Volver a preceptoría</Link>
      <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white shadow-sm">
        <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-wide text-indigo-100"><History size={15}/> HISTORIAL INSTITUCIONAL</span>
        <h1 className="mt-4 text-3xl font-bold">Informes e historial de seguimiento</h1>
        <p className="mt-2 text-sm text-indigo-100">${institution.display_name} · Consulta integrada de novedades, conceptos conductuales, citaciones y actas.</p>
      </header>
      <section className="grid gap-3 sm:grid-cols-4">
        {(["novelty","conduct","appointment","minute"] as const).map(kind => <div key={kind} className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{pluralLabels[kind]}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{countByKind(kind)}</p>
        </div>)}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <form method="get" className="grid gap-3 md:grid-cols-5">
          <label className="grid gap-1 text-xs font-semibold text-slate-600">División
            <select name="division" defaultValue={filters.division ?? ""} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal">
              <option value="">Todas mis divisiones</option>
              {(divisions ?? []).map(d => <option key={d.id} value={d.id}>{divisionNames.get(d.id)}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">Alumno
            <select name="student" defaultValue={filters.student ?? ""} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal">
              <option value="">Todos</option>
              {studentOptions.filter(s => !filters.division || s.divisionId === filters.division).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">Desde
            <input type="date" name="from" defaultValue={filters.from ?? ""} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"/>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">Hasta
            <input type="date" name="to" defaultValue={filters.to ?? ""} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"/>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">Tipo de registro
            <select name="kind" defaultValue={selectedKind} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal">
              <option value="all">Todos</option><option value="novelty">Novedades</option><option value="conduct">Conceptos conductuales</option><option value="appointment">Citaciones</option><option value="minute">Actas</option>
            </select>
          </label>
          <div className="flex flex-wrap gap-2 md:col-span-5">
            <button className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800"><Search size={15}/> Aplicar filtros</button>
            <Link href={`/dashboard/${slug}/prefect/reports`} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Limpiar</Link>
          </div>
        </form>
      </section>
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4">
        <div><p className="font-semibold text-violet-950">Informe según los filtros aplicados</p><p className="text-sm text-violet-800">{filtered.length} registros · orden cronológico y agrupación por fecha y categoría</p></div>
        <PrefectFollowupPdf institution={institution.display_name} filters={appliedFilters} rows={filtered.map(item => ({
          date: item.date, kind: kindLabels[item.kind], categoryKey: item.kind, division: divisionNames.get(item.divisionId) ?? "División",
          student: item.studentId ? (studentNames.get(item.studentId) ?? "Alumno") : "Toda la división",
          title: item.title, status: item.status, detail: item.detail, extra: item.extra ?? "",
        }))} />
      </section>
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div><h2 className="text-xl font-bold text-slate-900">Registros encontrados</h2><p className="text-sm text-slate-500">{filtered.length} elementos · fuentes existentes, solo consulta</p></div>
        </div>
        {filtered.length ? filtered.map(item => <article key={item.kind + item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">{kindLabels[item.kind]} · {dateLabel(item.date)}</p>
              <h3 className="mt-1 text-lg font-bold text-slate-900">{item.title}</h3>
              <p className="mt-1 text-sm text-slate-500">{divisionNames.get(item.divisionId) ?? "División"}{item.studentId ? ` · ${studentNames.get(item.studentId) ?? "Alumno"}` : " · División completa"}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{item.status}</span>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.detail}</p>
          {item.extra ? <p className="mt-2 whitespace-pre-wrap text-sm text-slate-500">{item.extra}</p> : null}
        </article>) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No hay registros que coincidan con los filtros seleccionados.</div>}
      </section>
      <p className="text-xs leading-5 text-slate-500">Se muestran hasta 1.000 registros recientes por fuente. Los datos se consultan desde sus módulos de origen. Esta pantalla no modifica ni duplica novedades, conceptos, citaciones o actas. Las citaciones históricas de alumnos sin matrícula activa en una división actualmente asignada pueden no aparecer en este consolidado.</p>
    </div>
  </main>;
}
