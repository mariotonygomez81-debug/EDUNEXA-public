import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, AlertTriangle, CalendarDays, ClipboardCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";

type Assignment = { division_id: string; starts_on: string | null; ends_on: string | null };
type Division = { id: string; name: string; course_id: string };
type Course = { id: string; name: string };
type Session = { id: string; division_id: string; held_on: string };
type RecordRow = { session_id: string; student_id: string; status: string };
type Student = { id: string; first_name: string; last_name: string; student_number: string | null };
type AlertRow = { divisionId: string; studentId: string; absences: number; recorded: number; justified: number; lastAbsence: string; dates: string[] };

function localDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (key: string) => parts.find((part) => part.type === key)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value + "T12:00:00Z").getTime()) && new Date(value + "T12:00:00Z").toISOString().slice(0, 10) === value;
}
function dateLabel(value: string) {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(value + "T12:00:00-03:00"));
}

export default async function PrefectAttendanceAlertsPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string; to?: string; minimum?: string; division?: string }>;
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
  const permissions = await getMembershipPermissions(supabase, membership.id);
  if (!permissions.has("attendance.read") || !permissions.has("students.read")) redirect(`/dashboard/${slug}`);
  const { data: roles } = await supabase.from("membership_roles").select("roles(key)")
    .eq("membership_id", membership.id).eq("institution_id", institution.id);
  if (!(roles ?? []).some((row) => row.roles?.key === "prefect")) redirect(`/dashboard/${slug}`);

  const today = localDate(new Date());
  const defaultFrom = localDate(new Date(Date.parse(today + "T12:00:00-03:00") - 29 * 86400000));
  const from = query.from && validDate(query.from) ? query.from : defaultFrom;
  const to = query.to && validDate(query.to) ? query.to : today;
  const parsedMinimum = Number(query.minimum);
  const minimumAbsences = Number.isInteger(parsedMinimum) && parsedMinimum >= 2 && parsedMinimum <= 10 ? parsedMinimum : 3;
  const span = (Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000;
  const invalidRange = from > to || span > 366;

  const { data: assignments, error: assignmentError } = await supabase.from("staff_assignments")
    .select("division_id,starts_on,ends_on").eq("institution_id", institution.id)
    .eq("membership_id", membership.id).eq("assignment_type", "prefect").not("division_id", "is", null);
  if (assignmentError) throw new Error("No se pudieron cargar las divisiones asignadas.");
  const divisionIds = [...new Set(((assignments ?? []) as Assignment[])
    .filter((item) => (!item.starts_on || item.starts_on <= today) && (!item.ends_on || item.ends_on >= today))
    .map((item) => item.division_id))];
  const selectedDivision = query.division && divisionIds.includes(query.division) ? query.division : "";
  const { data: divisions, error: divisionError } = divisionIds.length
    ? await supabase.from("divisions").select("id,name,course_id").eq("institution_id", institution.id).in("id", divisionIds).order("name")
    : { data: [] as Division[], error: null };
  if (divisionError) throw new Error("No se pudieron cargar las divisiones.");
  const courseIds = [...new Set((divisions ?? []).map((item) => item.course_id))];
  const { data: courses, error: courseError } = courseIds.length
    ? await supabase.from("courses").select("id,name").eq("institution_id", institution.id).in("id", courseIds)
    : { data: [] as Course[], error: null };
  if (courseError) throw new Error("No se pudieron cargar los cursos.");
  const courseNames = new Map((courses ?? []).map((item) => [item.id, item.name]));
  const divisionNames = new Map((divisions ?? []).map((item) => [item.id, `${courseNames.get(item.course_id) ?? "Curso"} · ${item.name}`]));

  let sessions: Session[] = [];
  let records: RecordRow[] = [];
  let students: Student[] = [];
  let loadError = false;
  const scopeIds = selectedDivision ? [selectedDivision] : divisionIds;
  if (!invalidRange && scopeIds.length) {
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase.from("attendance_sessions").select("id,division_id,held_on")
        .eq("institution_id", institution.id).in("division_id", scopeIds).gte("held_on", from).lte("held_on", to)
        .order("held_on", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 499);
      if (error) { loadError = true; break; }
      sessions.push(...((data ?? []) as Session[]));
      if ((data ?? []).length < 500) break;
    }
    const collected: RecordRow[] = [];
    for (let index = 0; index < sessions.length; index += 100) {
      const sessionIds = sessions.slice(index, index + 100).map((item) => item.id);
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from("attendance_records").select("session_id,student_id,status")
          .eq("institution_id", institution.id).in("session_id", sessionIds)
          .order("session_id").order("student_id").range(offset, offset + 999);
        if (error) { loadError = true; break; }
        collected.push(...((data ?? []) as RecordRow[]));
        if ((data ?? []).length < 1000) break;
      }
      if (loadError) break;
    }
    records = collected;
    const studentIds = [...new Set(records.map((item) => item.student_id))];
    for (let index = 0; index < studentIds.length; index += 200) {
      const { data, error } = await supabase.from("students").select("id,first_name,last_name,student_number")
        .eq("institution_id", institution.id).in("id", studentIds.slice(index, index + 200));
      if (error) { loadError = true; break; }
      students.push(...((data ?? []) as Student[]));
    }
  }

  const sessionById = new Map(sessions.map((item) => [item.id, item]));
  const grouped = new Map<string, AlertRow>();
  for (const record of records) {
    const session = sessionById.get(record.session_id);
    if (!session) continue;
    const key = `${session.division_id}:${record.student_id}`;
    const row = grouped.get(key) ?? { divisionId: session.division_id, studentId: record.student_id, absences: 0, recorded: 0, justified: 0, lastAbsence: "", dates: [] };
    row.recorded += 1;
    if (record.status === "justified") row.justified += 1;
    if (record.status === "absent") {
      row.absences += 1;
      row.dates.push(session.held_on);
      if (!row.lastAbsence || session.held_on > row.lastAbsence) row.lastAbsence = session.held_on;
    }
    grouped.set(key, row);
  }
  const studentById = new Map(students.map((item) => [item.id, item]));
  const alerts = [...grouped.values()].filter((item) => item.absences >= minimumAbsences && studentById.has(item.studentId))
    .sort((a, b) => b.absences - a.absences || b.lastAbsence.localeCompare(a.lastAbsence) ||
      (studentById.get(a.studentId)?.last_name ?? "").localeCompare(studentById.get(b.studentId)?.last_name ?? "", "es"));
  const totalAbsences = alerts.reduce((sum, item) => sum + item.absences, 0);

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href={`/dashboard/${slug}/prefect`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700"><ArrowLeft size={16}/> Volver a preceptoría</Link>
      <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white shadow-sm">
        <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-wide text-indigo-100"><AlertTriangle size={15}/> PREVENCIÓN Y ACOMPAÑAMIENTO</span>
        <h1 className="mt-4 text-3xl font-bold">Alertas de ausentismo reiterado</h1>
        <p className="mt-2 text-sm text-indigo-100">{institution.display_name} · Estudiantes con ausencias sin justificar que requieren seguimiento.</p>
      </header>
      <form method="get" className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 md:grid-cols-4 md:items-end">
        <label className="grid gap-1 text-sm font-semibold text-slate-600">Desde<input type="date" name="from" value={from} required className="rounded-lg border border-slate-300 px-3 py-2 font-normal"/></label>
        <label className="grid gap-1 text-sm font-semibold text-slate-600">Hasta<input type="date" name="to" value={to} required className="rounded-lg border border-slate-300 px-3 py-2 font-normal"/></label>
        <label className="grid gap-1 text-sm font-semibold text-slate-600">División<select name="division" value={selectedDivision} className="rounded-lg border border-slate-300 px-3 py-2 font-normal"><option value="">Todas mis divisiones</option>{(divisions ?? []).map((item) => <option key={item.id} value={item.id}>{divisionNames.get(item.id)}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-semibold text-slate-600">Mínimo de ausencias<select name="minimum" value={String(minimumAbsences)} className="rounded-lg border border-slate-300 px-3 py-2 font-normal">{[2,3,4,5,6,7,8,9,10].map((value) => <option key={value} value={value}>{value} ausencias</option>)}</select></label>
        <div className="flex flex-wrap gap-2 md:col-span-4"><button className="rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">Aplicar filtros</button><Link href={`/dashboard/${slug}/prefect/attendance-alerts`} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">Restablecer</Link></div>
      </form>
      {invalidRange ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">El rango debe ser válido y no superar los 366 días.</p> : null}
      {loadError ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">No se pudieron recuperar todos los registros de asistencia. Ajustá el período o intentá nuevamente.</p> : null}
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">Estudiantes en alerta</p><p className="mt-1 text-3xl font-bold">{alerts.length}</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">Ausencias detectadas en alertas</p><p className="mt-1 text-3xl font-bold">{totalAbsences}</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">Sesiones consideradas</p><p className="mt-1 text-3xl font-bold">{sessions.length}</p></div>
      </section>
      <section className="space-y-3">
        <div><h2 className="text-xl font-bold text-slate-900">Estudiantes que requieren seguimiento</h2><p className="text-sm text-slate-500">Se cuentan únicamente registros «Ausente»; las ausencias justificadas no suman al umbral.</p></div>
        {alerts.length ? alerts.map((item) => {
          const student = studentById.get(item.studentId)!;
          const denominator = item.recorded - item.justified;
          const attendanceRate = denominator > 0 ? Math.round(((item.recorded - item.absences - item.justified) / denominator) * 100) : null;
          return <article key={item.divisionId + item.studentId} className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-bold text-slate-900">{student.last_name}, {student.first_name}</h3><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">{item.absences} ausencias</span></div>
              <p className="mt-1 text-sm text-slate-500">{divisionNames.get(item.divisionId) ?? "División"} · {student.student_number || "Sin matrícula"}</p>
              <p className="mt-1 text-sm text-slate-600">Última ausencia: {dateLabel(item.lastAbsence)} · {item.justified} justificadas · {attendanceRate === null ? "Sin porcentaje calculable" : `${attendanceRate}% de asistencia efectiva`}</p>
              <p className="mt-1 text-xs text-slate-500">Fechas de ausencia: {item.dates.sort().map(dateLabel).join(" · ")}</p>
            </div>
            <Link href={`/dashboard/${slug}/prefect/reports?division=${encodeURIComponent(item.divisionId)}&student=${encodeURIComponent(item.studentId)}&from=${from}&to=${to}`} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-semibold text-violet-800 hover:bg-violet-100"><ClipboardCheck size={16}/> Abrir seguimiento</Link>
          </article>;
        }) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><CalendarDays className="mx-auto text-slate-400" size={32}/><h3 className="mt-3 font-semibold text-slate-900">No hay alertas con estos criterios</h3><p className="mt-1 text-sm text-slate-500">No se encontraron estudiantes con {minimumAbsences} o más ausencias sin justificar en el período seleccionado.</p></div>}
      </section>
      <p className="text-xs leading-5 text-slate-500">Las alertas priorizan el acompañamiento; no constituyen sanciones ni reemplazan la revisión de cada situación con el estudiante y su familia.</p>
    </div>
  </main>;
}
