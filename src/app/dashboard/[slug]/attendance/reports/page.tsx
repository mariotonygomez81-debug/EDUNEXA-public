import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BarChart3, CalendarDays, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";
import AttendanceReportExport from "./attendance-report-export";

type SearchParams = { from?: string; to?: string; division?: string };
type AttendanceStatus = "present" | "absent" | "late" | "justified" | "early_departure";

const labels: Record<AttendanceStatus, string> = {
  present: "Presentes",
  absent: "Ausentes",
  late: "Llegadas tarde",
  justified: "Justificadas",
  early_departure: "Retiros anticipados",
};

function dateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export default async function AttendanceReportsPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: institution } = await supabase.from("institutions")
    .select("id,display_name,timezone").eq("slug", slug).maybeSingle();
  if (!institution) redirect("/dashboard");

  const { data: membership } = await supabase.from("memberships").select("id")
    .eq("institution_id", institution.id).eq("user_id", user.id)
    .eq("status", "active").maybeSingle();
  if (!membership) redirect("/dashboard");

  const permissions = await getMembershipPermissions(supabase, membership.id);
  const { data: roleRows, error: rolesError } = await supabase.from("membership_roles").select("roles(key)")
    .eq("membership_id", membership.id).eq("institution_id", institution.id);
  if (rolesError) redirect(`/dashboard/${slug}/attendance`);
  const roles = (roleRows ?? []).map((row) => row.roles?.key).filter((role): role is string => typeof role === "string");
  const staffRole = roles.some((role) =>
    ["institution_admin", "administrative", "director", "teacher", "prefect"].includes(role)
  );
  if (!staffRole || !permissions.has("attendance.read") || !permissions.has("students.read")) {
    redirect(`/dashboard/${slug}/attendance`);
  }

  // Build the division filter from the current user's effective institutional roles.
  // RLS remains the final authority for sessions, records and student rows.
  const institutionWide = roles.some((role) =>
    ["institution_admin", "administrative", "director"].includes(role)
  );
  let accessibleDivisionIds: string[] = [];
  if (institutionWide) {
    const { data: divisionRows, error: divisionError } = await supabase.from("divisions")
      .select("id").eq("institution_id", institution.id);
    if (divisionError) redirect(`/dashboard/${slug}/attendance`);
    accessibleDivisionIds = (divisionRows ?? []).map((division) => division.id);
  } else {
    const assignmentTypes = roles.filter((role): role is "teacher" | "prefect" =>
      role === "teacher" || role === "prefect"
    );
    const { data: assignmentRows, error: assignmentError } = assignmentTypes.length
      ? await supabase.from("staff_assignments")
          .select("assignment_type,division_id,course_subject_id,starts_on,ends_on")
          .eq("institution_id", institution.id).eq("membership_id", membership.id)
      : { data: [], error: null };
    if (assignmentError) redirect(`/dashboard/${slug}/attendance`);
    const todayLocal = dateInTimeZone(new Date(), institution.timezone || "America/Argentina/Buenos_Aires");
    const activeAssignments = (assignmentRows ?? []).filter((assignment) =>
      assignmentTypes.some((type) => type === assignment.assignment_type) &&
      (!assignment.starts_on || assignment.starts_on <= todayLocal) &&
      (!assignment.ends_on || assignment.ends_on >= todayLocal)
    );
    accessibleDivisionIds = activeAssignments.map((assignment) => assignment.division_id)
      .filter((id): id is string => Boolean(id));
    const subjectIds = [...new Set(activeAssignments.map((assignment) => assignment.course_subject_id)
      .filter((id): id is string => Boolean(id)))];
    if (subjectIds.length) {
      const { data: subjects, error: subjectsError } = await supabase.from("course_subjects")
        .select("course_id").eq("institution_id", institution.id).in("id", subjectIds);
      if (subjectsError) redirect(`/dashboard/${slug}/attendance`);
      const courseIds = [...new Set((subjects ?? []).map((subject) => subject.course_id))];
      if (courseIds.length) {
        const { data: courseDivisions, error: courseDivisionError } = await supabase.from("divisions")
          .select("id").eq("institution_id", institution.id).in("course_id", courseIds);
        if (courseDivisionError) redirect(`/dashboard/${slug}/attendance`);
        accessibleDivisionIds.push(...(courseDivisions ?? []).map((division) => division.id));
      }
    }
    accessibleDivisionIds = [...new Set(accessibleDivisionIds)];
  }

  const today = dateInTimeZone(new Date(), institution.timezone || "America/Argentina/Buenos_Aires");
  const monthStart = `${today.slice(0, 7)}-01`;
  const from = query.from && validDate(query.from) ? query.from : monthStart;
  const to = query.to && validDate(query.to) ? query.to : today;
  const divisionFilter = query.division && /^[0-9a-f-]{36}$/i.test(query.division) ? query.division : "";
  const spanDays = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
  const invalidRange = from > to || spanDays > 366;
  const { data: divisions, error: visibleDivisionsError } = accessibleDivisionIds.length
    ? await supabase.from("divisions").select("id,name,course_id")
        .eq("institution_id", institution.id).in("id", accessibleDivisionIds).order("name")
    : { data: [], error: null };
  if (visibleDivisionsError) redirect(`/dashboard/${slug}/attendance`);
  const courseIds = [...new Set((divisions ?? []).map((division) => division.course_id))];
  const { data: courses } = courseIds.length
    ? await supabase.from("courses").select("id,name").eq("institution_id", institution.id).in("id", courseIds)
    : { data: [] };
  const courseNames = new Map((courses ?? []).map((course) => [course.id, course.name] as const));
  const divisionNames = new Map((divisions ?? []).map((division) => [
    division.id, `${courseNames.get(division.course_id) ?? "Curso"} · ${division.name}`,
  ] as const));

  let sessions: { id: string; division_id: string; held_on: string }[] = [];
  let records: { student_id: string; status: string; session_id: string }[] = [];
  let students: { id: string; student_number: string | null; first_name: string; last_name: string }[] = [];
  let loadError = false;
  let dataLimitReached = false;
  if (!invalidRange) {
    const sessionQuery = supabase.from("attendance_sessions")
      .select("id,division_id,held_on").eq("institution_id", institution.id)
      .gte("held_on", from).lte("held_on", to)
      .order("held_on", { ascending: false }).limit(500);
    const selectedDivisionAllowed = !divisionFilter || accessibleDivisionIds.includes(divisionFilter);
    const { data: sessionRows, error: sessionError } = !selectedDivisionAllowed
      ? { data: [], error: null }
      : divisionFilter
        ? await sessionQuery.eq("division_id", divisionFilter)
        : await sessionQuery;
    if (sessionError) loadError = true;
    sessions = sessionRows ?? [];
    if (sessions.length === 500) dataLimitReached = true;

    const sessionIds = sessions.map((session) => session.id);
    if (sessionIds.length) {
      const collectedRecords: typeof records = [];
      for (let offset = 0; offset < 5000; offset += 1000) {
        const { data: recordRows, error: recordError } = await supabase.from("attendance_records")
          .select("student_id,status,session_id").eq("institution_id", institution.id)
          .in("session_id", sessionIds).range(offset, offset + 999);
        if (recordError) {
          loadError = true;
          break;
        }
        collectedRecords.push(...(recordRows ?? []));
        if ((recordRows ?? []).length < 1000) break;
        if (offset === 4000) dataLimitReached = true;
      }
      records = collectedRecords;
      const studentIds = [...new Set(records.map((record) => record.student_id))];
      if (studentIds.length) {
        const { data: studentRows, error: studentError } = await supabase.from("students")
          .select("id,student_number,first_name,last_name").eq("institution_id", institution.id)
          .in("id", studentIds).order("last_name").order("first_name");
        if (studentError) loadError = true;
        students = studentRows ?? [];
      }
    }
  }

  const byStudent = new Map<string, Record<AttendanceStatus, number>>();
  for (const record of records) {
    const status = record.status as AttendanceStatus;
    if (!Object.hasOwn(labels, status)) continue;
    const counts = byStudent.get(record.student_id) ?? {
      present: 0, absent: 0, late: 0, justified: 0, early_departure: 0,
    };
    counts[status] += 1;
    byStudent.set(record.student_id, counts);
  }
  const studentRows = students.map((student) => {
    const counts = byStudent.get(student.id) ?? {
      present: 0, absent: 0, late: 0, justified: 0, early_departure: 0,
    };
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    const denominator = total - counts.justified;
    const attended = counts.present + counts.late + counts.early_departure;
    return { ...student, counts, total, rate: denominator ? Math.round((attended / denominator) * 100) : null };
  }).sort((a, b) => a.last_name.localeCompare(b.last_name, "es") || a.first_name.localeCompare(b.first_name, "es"));

  const totals = records.reduce((acc, record) => {
    if (Object.hasOwn(labels, record.status)) acc[record.status as AttendanceStatus] += 1;
    return acc;
  }, { present: 0, absent: 0, late: 0, justified: 0, early_departure: 0 });
  const recorded = Object.values(totals).reduce((sum, count) => sum + count, 0);
  const attendanceDenominator = recorded - totals.justified;
  const attendanceRate = attendanceDenominator
    ? Math.round(((totals.present + totals.late + totals.early_departure) / attendanceDenominator) * 100)
    : null;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <Link href={`/dashboard/${slug}/attendance`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700">
          <ArrowLeft size={16} /> Volver a asistencia
        </Link>
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-violet-100 p-3 text-violet-700"><BarChart3 size={24} /></div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">Gestión académica</p>
              <h1 className="text-2xl font-bold">Reportes de asistencia</h1>
            </div>
          </div>
          <p className="mt-3 text-sm text-slate-500">{institution.display_name} · Resumen por período y por estudiante</p>
        </header>

        <form method="get" className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-[1fr_1fr_1.5fr_auto] md:items-end">
          <label className="text-sm font-medium">Desde
            <input type="date" name="from" required value={from} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="text-sm font-medium">Hasta
            <input type="date" name="to" required value={to} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="text-sm font-medium">División
            <select name="division" value={divisionFilter} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5">
              <option value="">Todas las divisiones accesibles</option>
              {(divisions ?? []).map((division) => <option key={division.id} value={division.id}>{divisionNames.get(division.id)}</option>)}
            </select>
          </label>
          <button className="rounded-lg bg-violet-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">Aplicar filtros</button>
        </form>

        {invalidRange && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">El rango de fechas no es válido o supera los 366 días.</p>}
        {loadError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">Algunos datos no pudieron cargarse por permisos o por un error de consulta. Revisá el período o las asignaciones.</p>}
        {dataLimitReached && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">El reporte alcanzó el límite de consulta (500 sesiones o 5.000 registros). Acotá el rango de fechas o seleccioná una división para obtener un resultado completo.</p>}

        <div className="flex justify-end">
          <AttendanceReportExport institution={institution.display_name} from={from} to={to} totals={totals} rows={studentRows} />
        </div>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Sesiones registradas</p><p className="mt-2 text-3xl font-bold">{sessions.length}</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Registros cargados</p><p className="mt-2 text-3xl font-bold">{recorded}</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Asistencia efectiva</p><p className="mt-2 text-3xl font-bold">{attendanceRate === null ? "—" : `${attendanceRate}%`}</p><p className="mt-1 text-xs text-slate-400">Presentes, tardanzas y retiros; excluye justificadas</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Estudiantes con registros</p><p className="mt-2 text-3xl font-bold">{studentRows.length}</p></div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2"><CalendarDays size={18} className="text-violet-700" /><h2 className="font-semibold">Detalle del período</h2></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {(Object.keys(labels) as AttendanceStatus[]).map((status) => (
              <div key={status} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{labels[status]}</p><p className="mt-1 text-2xl font-semibold">{totals[status]}</p></div>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-500">Los porcentajes excluyen las ausencias justificadas del denominador. Los registros sin cargar no se contabilizan como presentes ni ausentes.</p>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div><div className="flex items-center gap-2"><Users size={18} className="text-violet-700" /><h2 className="font-semibold">Resumen por estudiante</h2></div><p className="mt-1 text-xs text-slate-500">{from} al {to} · {studentRows.length} estudiantes con registros visibles</p></div>
          </div>
          {studentRows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>
                  <th className="px-4 py-3">Estudiante</th><th className="px-3 py-3">Registros</th><th className="px-3 py-3">Presente</th><th className="px-3 py-3">Ausente</th><th className="px-3 py-3">Tarde</th><th className="px-3 py-3">Justificada</th><th className="px-3 py-3">Retiro</th><th className="px-3 py-3">% asistencia</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">{studentRows.map((student) => <tr key={student.id}>
                  <td className="px-4 py-3"><p className="font-semibold">{student.last_name}, {student.first_name}</p><p className="text-xs text-slate-500">{student.student_number || "Sin matrícula"}</p></td>
                  <td className="px-3 py-3 tabular-nums">{student.total}</td><td className="px-3 py-3 tabular-nums">{student.counts.present}</td><td className="px-3 py-3 tabular-nums">{student.counts.absent}</td><td className="px-3 py-3 tabular-nums">{student.counts.late}</td><td className="px-3 py-3 tabular-nums">{student.counts.justified}</td><td className="px-3 py-3 tabular-nums">{student.counts.early_departure}</td><td className="px-3 py-3 font-semibold tabular-nums">{student.rate === null ? "—" : `${student.rate}%`}</td>
                </tr>)}</tbody>
              </table>
            </div>
          ) : <div className="p-10 text-center text-sm text-slate-500">No hay registros de asistencia para los filtros seleccionados.</div>}
        </section>
      </div>
    </main>
  );
}
