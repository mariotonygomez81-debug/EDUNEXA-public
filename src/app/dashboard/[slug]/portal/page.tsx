import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Bell, BookOpen, CalendarCheck, CheckCheck, FileText, GraduationCap, MessageCircle, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

type PublishedReportCard = {
  workflow_id: string;
  student_id: string;
  created_at: string;
  snapshot: {
    period?: { id?: string; name?: string; starts_on?: string; ends_on?: string };
    academic_year?: { id?: string; name?: string };
    published_at?: string;
    workflow_version?: number;
    grading_scale?: {
      id?: string;
      display_mode?: "numeric" | "descriptive" | "both";
      levels?: { minimum_percentage: number; maximum_percentage: number; label: string; grade_value: number | null; is_passing: boolean }[];
    } | null;
    subjects?: {
      subject: string;
      assessments?: { title: string; score: number | null; maximum_score: number; weight_percent: number | null }[];
    }[];
  };
};

type ChildAssignmentProgress = {
  assignment_id: string;
  classroom_id: string;
  subject_name: string;
  classroom_title: string;
  assignment_title: string;
  due_at: string | null;
  published_at: string | null;
  submitted: boolean;
  submitted_at: string | null;
  review_status: "visto" | "aprobado" | "desaprobado" | "corregir" | null;
  score: number | null;
  max_score: number | null;
  can_view_grade: boolean;
};

type PortalNotification = {
  id: string;
  notification_type: string;
  title: string;
  body: string;
  resource_type: string;
  resource_id: string;
  created_at: string;
  read_at: string | null;
};

type PortalStudent = {
  student_id: string;
  first_name: string;
  last_name: string;
  student_number: string | null;
  is_self: boolean;
  division_id: string | null;
  division_name: string | null;
  course_name: string | null;
  academic_year_id: string | null;
  academic_year_name: string | null;
  enrollment_status: string;
  can_view_grades: boolean;
  can_view_attendance: boolean;
  attendance_present: number;
  attendance_absent: number;
  attendance_late: number;
  attendance_justified: number;
  attendance_early_departure: number;
  attendance_total: number;
  last_attendance_on: string | null;
  published_report_card_count: number;
  latest_report_card_at: string | null;
};

function notificationLabel(type: string) {
  const labels: Record<string, string> = {
    message: "Mensaje", announcement: "Comunicado", appointment: "Citación",
    report_card: "Boletín", grade: "Calificación", attendance: "Asistencia",
    assignment_due: "Tarea", support: "Aviso institucional",
  };
  return labels[type] ?? "Notificación";
}

function notificationHref(slug: string, item: PortalNotification) {
  if (item.resource_type === "announcement") return `/dashboard/${slug}/announcements`;
  if (item.resource_type === "conversation") return `/dashboard/${slug}/messages/${item.resource_id}`;
  if (item.resource_type === "appointment" || item.notification_type === "appointment") return `/dashboard/${slug}/appointments`;
  if (item.resource_type === "report_card" || item.notification_type === "report_card" || item.notification_type === "grade") return `/dashboard/${slug}/report-cards`;
  if (item.resource_type === "assignment") return `/dashboard/${slug}/classroom`;
  return `/dashboard/${slug}/notifications`;
}

function dateLabel(value: string | null) {
  if (!value) return "Sin registros";
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium" }).format(new Date(value));
}

function publishedSubjectGrades(snapshot: PublishedReportCard["snapshot"]) {
  return (snapshot.subjects ?? []).map((subject) => {
    const assessments = subject.assessments ?? [];
    const completed = assessments.filter((item) => item.score !== null && item.maximum_score > 0);
    const anyWeighted = assessments.some((item) => item.weight_percent !== null);
    const totalWeight = assessments.reduce((sum, item) => sum + (item.weight_percent ?? 0), 0);
    const weightsComplete = anyWeighted && assessments.every((item) => item.weight_percent !== null) &&
      Math.abs(totalWeight - 100) < 0.001;
    const allComplete = assessments.length > 0 && completed.length === assessments.length;
    let percentage: number | null = null;
    if (allComplete && !anyWeighted) {
      percentage = completed.reduce((sum, item) => sum + (Number(item.score) / Number(item.maximum_score)) * 100, 0) / completed.length;
    } else if (allComplete && weightsComplete) {
      percentage = assessments.reduce((sum, item) =>
        sum + (Number(item.score) / Number(item.maximum_score)) * Number(item.weight_percent), 0);
    }
    const level = percentage === null ? null : (snapshot.grading_scale?.levels ?? []).find((item) =>
      percentage! >= Number(item.minimum_percentage) && percentage! <= Number(item.maximum_percentage));
    return {
      subject: subject.subject,
      percentage,
      levelLabel: level?.label ?? null,
      gradeValue: level?.grade_value ?? null,
      isPassing: level?.is_passing ?? null,
      displayMode: snapshot.grading_scale?.display_mode ?? "numeric",
    };
  }).sort((a, b) => a.subject.localeCompare(b.subject, "es"));
}

function publishedSubjectProgress(snapshot: PublishedReportCard["snapshot"]) {
  const subjects = publishedSubjectGrades(snapshot);
  const evaluated = subjects.filter((subject) => subject.percentage !== null);
  return {
    subjects,
    total: subjects.length,
    evaluated: evaluated.length,
    approved: evaluated.filter((subject) => subject.isPassing === true).length,
    reinforce: evaluated.filter((subject) => subject.isPassing === false).length,
    withoutScale: evaluated.filter((subject) => subject.isPassing === null).length,
    completion: subjects.length ? Math.round((evaluated.length / subjects.length) * 100) : 0,
  };
}

function latestPublishedCardsByPeriod(cards: PublishedReportCard[]) {
  const latest = new Map<string, PublishedReportCard>();
  for (const card of cards) {
    const periodKey = [
      card.snapshot.academic_year?.id ?? card.snapshot.academic_year?.name ?? "year",
      card.snapshot.period?.id ?? card.snapshot.period?.name ?? card.workflow_id,
    ].join(":");
    const current = latest.get(periodKey);
    const currentVersion = current?.snapshot.workflow_version ?? 1;
    const nextVersion = card.snapshot.workflow_version ?? 1;
    if (!current || nextVersion > currentVersion ||
      (nextVersion === currentVersion && new Date(card.created_at).getTime() > new Date(current.created_at).getTime())) {
      latest.set(periodKey, card);
    }
  }
  return [...latest.values()].sort((a, b) => {
    const aDate = a.snapshot.period?.ends_on ?? a.snapshot.period?.starts_on ?? a.snapshot.published_at ?? a.created_at;
    const bDate = b.snapshot.period?.ends_on ?? b.snapshot.period?.starts_on ?? b.snapshot.published_at ?? b.created_at;
    return new Date(aDate).getTime() - new Date(bDate).getTime();
  });
}

function buildPublishedAcademicHistory(cards: PublishedReportCard[]) {
  const periods = latestPublishedCardsByPeriod(cards);
  const subjectPoints = new Map<string, {
    period: string;
    percentage: number | null;
    isPassing: boolean | null;
    scaleId: string | null;
  }[]>();

  for (const card of periods) {
    const periodLabel = [
      card.snapshot.period?.name ?? "Período",
      card.snapshot.academic_year?.name,
    ].filter(Boolean).join(" · ");
    for (const grade of publishedSubjectGrades(card.snapshot)) {
      const points = subjectPoints.get(grade.subject) ?? [];
      points.push({
        period: periodLabel,
        percentage: grade.percentage,
        isPassing: grade.isPassing,
        scaleId: card.snapshot.grading_scale?.id ?? null,
      });
      subjectPoints.set(grade.subject, points);
    }
  }

  const subjects = [...subjectPoints.entries()].map(([subject, points]) => {
    const current = points[points.length - 1];
    const previous = points.length > 1 ? points[points.length - 2] : null;
    const comparable = Boolean(previous && current.scaleId && previous.scaleId === current.scaleId &&
      previous.percentage !== null && current.percentage !== null);
    const delta = comparable ? Number(current.percentage) - Number(previous?.percentage) : null;
    const trend = delta === null ? "unavailable" : delta >= 3 ? "up" : delta <= -3 ? "down" : "stable";
    return {
      subject,
      points,
      current,
      trend,
      delta,
      needsSupport: current.isPassing === false || (delta !== null && delta <= -8),
    };
  }).sort((a, b) => Number(b.needsSupport) - Number(a.needsSupport) || a.subject.localeCompare(b.subject, "es"));

  return { periods, subjects, supportCount: subjects.filter((subject) => subject.needsSupport).length };
}

export default async function StudentFamilyPortal({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: institution } = await supabase.from("institutions")
    .select("id,display_name").eq("slug", slug).maybeSingle();
  if (!institution) redirect("/dashboard");

  const { data: membership } = await supabase.from("memberships")
    .select("id").eq("institution_id", institution.id)
    .eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership) redirect("/dashboard");

  const { data: roleRows } = await supabase.from("membership_roles")
    .select("roles(key)").eq("membership_id", membership.id);
  const roleKeys = (roleRows ?? []).map((row) => row.roles?.key).filter(Boolean) as string[];
  if (!roleKeys.some((role) => role === "student" || role === "guardian")) {
    redirect(`/dashboard/${slug}`);
  }

  const [{ data: notificationRows, error: notificationError }, unreadResult] = await Promise.all([
    supabase.from("notifications")
      .select("id,notification_type,title,body,resource_type,resource_id,created_at,read_at")
      .eq("institution_id", institution.id)
      .eq("recipient_membership_id", membership.id)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase.from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("institution_id", institution.id)
      .eq("recipient_membership_id", membership.id)
      .is("read_at", null),
  ]);
  const portalNotifications = (notificationRows ?? []) as PortalNotification[];
  const unreadNotifications = unreadResult.count ?? 0;

  const { data: rows, error } = await supabase.rpc("list_my_portal_students", {
    p_institution_id: institution.id,
  });
  const students = (rows ?? []) as PortalStudent[];

  // Load academic progress independently for each linked child. The RPC enforces
  // guardian membership, active enrollment, classroom scope and grade visibility.
  const childProgressEntries = await Promise.all(students.filter((student) => !student.is_self).map(async (student) => {
    const { data, error: progressError } = await supabase.rpc("list_my_child_assignment_progress", {
      p_institution_id: institution.id,
      p_student_id: student.student_id,
    });
    return [student.student_id, {
      rows: (data ?? []) as ChildAssignmentProgress[],
      unavailable: Boolean(progressError),
    }] as const;
  }));
  const childProgress = new Map(childProgressEntries);

  // The database RLS policy filters each immutable snapshot by its publication audience.
  // Query all linked student IDs so a guardian with report-card-only access is not excluded.
  const portalStudentIds = students.map((student) => student.student_id);
  const { data: publishedSnapshots } = portalStudentIds.length
    ? await supabase.from("report_card_snapshots")
      .select("workflow_id,student_id,created_at,snapshot")
      .eq("institution_id", institution.id)
      .in("student_id", portalStudentIds)
      .order("created_at", { ascending: false })
    : { data: [] as PublishedReportCard[] };
  const publishedReportCards = (publishedSnapshots ?? []) as PublishedReportCard[];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <Link href={`/dashboard/${slug}`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700">
          <ArrowLeft size={16} /> Volver al espacio institucional
        </Link>

        <header className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white shadow-sm sm:p-9">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-indigo-100">
            <GraduationCap size={14} /> PORTAL DEL ESTUDIANTE Y LA FAMILIA
          </span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight">Mi espacio educativo</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-indigo-100">
            Consultá la información académica habilitada para tu cuenta en {institution.display_name}.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-amber-100 p-3 text-amber-700"><Bell size={21} /></div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Notificaciones</h2>
                <p className="text-sm text-slate-500">Mensajes, comunicados, citaciones, boletines y novedades académicas.</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-violet-100 px-3 py-1.5 text-xs font-semibold text-violet-800">{unreadNotifications} sin leer</span>
              <Link href={`/dashboard/${slug}/notifications`} className="text-sm font-semibold text-violet-700 hover:text-violet-900">Ver todas</Link>
            </div>
          </div>
          {notificationError ? (
            <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="alert">No fue posible cargar las notificaciones.</p>
          ) : portalNotifications.length ? (
            <ul className="mt-4 divide-y divide-slate-100">
              {portalNotifications.map((item) => (
                <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.read_at ? "bg-slate-300" : "bg-violet-600"}`} aria-label={item.read_at ? "Leída" : "No leída"} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{notificationLabel(item.notification_type)}</span>
                        <time className="text-[11px] text-slate-400">{dateLabel(item.created_at)}</time>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-slate-800">{item.title}</p>
                      <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs leading-5 text-slate-500">{item.body}</p>
                    </div>
                  </div>
                  <Link href={notificationHref(slug, item)} className="shrink-0 text-xs font-semibold text-violet-700 hover:text-violet-900">Abrir</Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-5 text-center">
              <CheckCheck className="mx-auto text-slate-300" size={24} />
              <p className="mt-2 text-sm text-slate-500">No tenés notificaciones nuevas.</p>
            </div>
          )}
        </section>

        {error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
            No fue posible cargar tu portal. Verificá que tu cuenta tenga un perfil de alumno o tutor activo.
          </div>
        ) : students.length ? (
          <div className="grid gap-5 lg:grid-cols-2">
            {students.map((student) => {
              const studentReportCards = publishedReportCards.filter((card) => card.student_id === student.student_id);
              const academicHistory = student.can_view_grades
                ? buildPublishedAcademicHistory(studentReportCards)
                : { periods: [], subjects: [], supportCount: 0 };
              return (
              <article key={student.student_id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 bg-slate-50/70 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-semibold text-slate-900">{student.last_name}, {student.first_name}</h2>
                        <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                          {student.is_self ? "Mi cuenta" : "Estudiante a cargo"}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">
                        {student.course_name && student.division_name
                          ? `${student.course_name} · ${student.division_name}`
                          : "Sin matrícula activa"}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {student.academic_year_name ? `Ciclo lectivo ${student.academic_year_name}` : "Ciclo lectivo no asignado"}
                        {student.student_number ? ` · Legajo ${student.student_number}` : ""}
                      </p>
                    </div>
                    <div className="rounded-xl bg-violet-100 p-3 text-violet-700"><GraduationCap size={23} /></div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-5">
                  <div className="rounded-xl bg-emerald-50 p-3">
                    <p className="text-xs text-emerald-700">Presentes</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-900">{student.can_view_attendance ? student.attendance_present : "—"}</p>
                  </div>
                  <div className="rounded-xl bg-rose-50 p-3">
                    <p className="text-xs text-rose-700">Ausentes</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-rose-900">{student.can_view_attendance ? student.attendance_absent : "—"}</p>
                  </div>
                  <div className="rounded-xl bg-amber-50 p-3">
                    <p className="text-xs text-amber-700">Tardanzas</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-amber-900">{student.can_view_attendance ? student.attendance_late : "—"}</p>
                  </div>
                  <div className="rounded-xl bg-sky-50 p-3">
                    <p className="text-xs text-sky-700">Justificadas</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-sky-900">{student.can_view_attendance ? student.attendance_justified : "—"}</p>
                  </div>
                  <div className="rounded-xl bg-orange-50 p-3">
                    <p className="text-xs text-orange-700">Retiros anticipados</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-orange-900">{student.can_view_attendance ? student.attendance_early_departure : "—"}</p>
                  </div>
                </div>

                <div className="px-5 pb-4">
                  {student.can_view_attendance ? (
                    <p className="text-xs text-slate-500">
                      {student.attendance_total} registros · Última asistencia: {dateLabel(student.last_attendance_on)}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-400">Tu perfil no tiene habilitada la consulta de asistencia para este estudiante.</p>
                  )}
                  {student.published_report_card_count > 0 ? (
                    <p className="mt-1 text-xs text-slate-500">
                      {student.published_report_card_count} boletines publicados · Último: {dateLabel(student.latest_report_card_at)}
                    </p>
                  ) : student.can_view_grades ? (
                    <p className="mt-1 text-xs text-slate-500">No hay boletines publicados disponibles.</p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400">No hay boletines habilitados para esta cuenta.</p>
                  )}
                </div>

                <section className="border-t border-slate-100 px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-800">Evolución histórica y seguimiento</h3>
                      <p className="mt-1 text-xs text-slate-500">Comparación basada únicamente en la última versión de cada boletín oficial publicado y visible para esta cuenta.</p>
                    </div>
                    {academicHistory.supportCount > 0 ? (
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
                        {academicHistory.supportCount} {academicHistory.supportCount === 1 ? "materia requiere" : "materias requieren"} acompañamiento
                      </span>
                    ) : null}
                  </div>
                  {academicHistory.periods.length ? (
                    <div className="mt-3 space-y-3">
                      <div className="flex flex-wrap gap-2" aria-label="Períodos incluidos en el historial">
                        {academicHistory.periods.map((period) => (
                          <span key={period.workflow_id} className="rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-900">
                            {period.snapshot.period?.name ?? "Período"}{period.snapshot.academic_year?.name ? ` · ${period.snapshot.academic_year.name}` : ""}
                          </span>
                        ))}
                      </div>
                      {academicHistory.subjects.length ? (
                        <ul className="grid gap-2 sm:grid-cols-2">
                          {academicHistory.subjects.map((item) => (
                            <li key={item.subject} className="rounded-xl border border-slate-200 bg-white p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs font-bold text-slate-800">{item.subject}</p>
                                {item.needsSupport ? (
                                  <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-900">Acompañamiento</span>
                                ) : item.trend === "up" ? (
                                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-800">En mejora</span>
                                ) : item.trend === "down" ? (
                                  <span className="rounded-full bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-800">En descenso</span>
                                ) : (
                                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-700">{item.trend === "stable" ? "Estable" : "Sin comparación"}</span>
                                )}
                              </div>
                              <div className="mt-3 space-y-2">
                                {item.points.map((point, index) => (
                                  <div key={`${point.period}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                                    <div className="min-w-0">
                                      <p className="truncate text-[10px] text-slate-500">{point.period}</p>
                                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                                        <div className={`h-full rounded-full ${point.isPassing === false ? "bg-rose-500" : point.isPassing === true ? "bg-emerald-500" : "bg-indigo-400"}`} style={{ width: `${point.percentage === null ? 0 : Math.max(0, Math.min(100, point.percentage))}%` }} />
                                      </div>
                                    </div>
                                    <span className="text-xs font-bold tabular-nums text-slate-800">{point.percentage === null ? "Sin nota final" : `${point.percentage.toFixed(1)}%`}</span>
                                  </div>
                                ))}
                              </div>
                              {item.delta !== null ? (
                                <p className={`mt-2 text-[10px] font-semibold ${item.delta < 0 ? "text-rose-700" : item.delta > 0 ? "text-emerald-700" : "text-slate-500"}`}>
                                  Variación respecto del período anterior: {item.delta > 0 ? "+" : ""}{item.delta.toFixed(1)} puntos porcentuales
                                </p>
                              ) : item.points.length > 1 ? (
                                <p className="mt-2 text-[10px] text-slate-500">No se calcula tendencia porque las escalas de calificación no son comparables.</p>
                              ) : (
                                <p className="mt-2 text-[10px] text-slate-500">Se necesita otro período publicado para calcular una tendencia.</p>
                              )}
                              {item.needsSupport ? (
                                <p className="mt-2 text-[11px] leading-5 text-amber-900">
                                  {item.current.isPassing === false ? "El último resultado publicado está por debajo del criterio de aprobación." : "Se observa una disminución significativa respecto del período anterior."}
                                </p>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-slate-500">Los boletines publicados todavía no contienen materias comparables.</p>
                      )}
                      <p className="text-[10px] leading-4 text-slate-400">Las tendencias solo se muestran cuando ambos períodos usan la misma escala. Las señales de acompañamiento orientan el seguimiento y no reemplazan la evaluación docente.</p>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">
                      {student.can_view_grades
                        ? "Todavía no hay períodos con boletines publicados disponibles para construir el historial."
                        : "La institución no habilitó la consulta de calificaciones para esta cuenta."}
                    </p>
                  )}
                </section>

                <section className="border-t border-slate-100 px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-800">Tareas y entregas por materia</h3>
                      <p className="mt-1 text-xs text-slate-500">Estado de entrega y revisión docente. El contenido de los trabajos y los archivos privados no se muestran en este portal.</p>
                    </div>
                    <BookOpen size={18} className="text-violet-600" />
                  </div>
                  {(() => {
                    const progress = childProgress.get(student.student_id);
                    if (!progress || progress.unavailable) {
                      return <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">El seguimiento de tareas todavía no está habilitado en la base institucional. Los boletines y demás datos autorizados siguen disponibles.</p>;
                    }
                    if (!progress.rows.length) {
                      return <p className="mt-3 text-xs text-slate-500">No hay tareas publicadas para las materias de la matrícula activa.</p>;
                    }
                    return (
                      <ul className="mt-3 space-y-2">
                        {progress.rows.map((item) => (
                          <li key={item.assignment_id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-[11px] font-semibold text-violet-700">{item.subject_name}</p>
                                <p className="mt-1 text-sm font-semibold text-slate-800">{item.assignment_title}</p>
                                <p className="mt-1 text-[11px] text-slate-500">{item.classroom_title}</p>
                              </div>
                              <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${!item.submitted ? "bg-amber-100 text-amber-900" : item.review_status === "aprobado" ? "bg-emerald-100 text-emerald-800" : item.review_status === "desaprobado" || item.review_status === "corregir" ? "bg-rose-100 text-rose-800" : "bg-sky-100 text-sky-800"}`}>
                                {!item.submitted ? "Sin entregar" : item.review_status === "aprobado" ? "Aprobada" : item.review_status === "desaprobado" ? "Desaprobada" : item.review_status === "corregir" ? "Requiere corrección" : item.review_status === "visto" ? "Vista por docente" : "Entregada · pendiente"}
                              </span>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500">
                              <span>Vencimiento: {dateLabel(item.due_at)}</span>
                              {item.submitted_at ? <span>Entregada: {dateLabel(item.submitted_at)}</span> : null}
                              {item.can_view_grade && item.score !== null ? <span className="font-semibold text-slate-700">Calificación: {item.score}{item.max_score !== null ? ` / ${item.max_score}` : ""}</span> : null}
                              {item.submitted && !item.can_view_grade ? <span>Calificación no habilitada para esta cuenta</span> : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    );
                  })()}
                </section>

                <section className="border-t border-slate-100 px-5 py-4">
                    <h3 className="text-sm font-semibold text-slate-800">Boletines oficiales publicados</h3>
                    {publishedReportCards.filter((card) => card.student_id === student.student_id).length ? (
                      <ul className="mt-3 space-y-2">
                        {publishedReportCards
                          .filter((card) => card.student_id === student.student_id)
                          .map((card) => {
                            const progress = publishedSubjectProgress(card.snapshot);
                            return (
                              <li key={card.workflow_id} className="rounded-lg bg-slate-50 px-3 py-3">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-medium text-slate-800">
                                      {card.snapshot.period?.name ?? "Boletín académico"}
                                      {card.snapshot.academic_year?.name ? ` · ${card.snapshot.academic_year.name}` : ""}
                                      {card.snapshot.workflow_version && card.snapshot.workflow_version > 1 ? ` · v${card.snapshot.workflow_version}` : ""}
                                    </p>
                                    <p className="text-xs text-slate-500">Publicado: {dateLabel(card.snapshot.published_at ?? card.created_at)}</p>
                                  </div>
                                  <Link
                                    href={`/dashboard/${slug}/report-cards/${card.workflow_id}/pdf`}
                                    className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50"
                                  >
                                    <FileText size={14} /> Descargar PDF
                                  </Link>
                                </div>
                                {progress.total ? (
                                  <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <p className="text-xs font-semibold text-slate-700">Avance de calificaciones publicadas</p>
                                      <p className="text-xs font-bold tabular-nums text-slate-800">{progress.evaluated} de {progress.total} materias</p>
                                    </div>
                                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Materias con calificación final disponible" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.evaluated}>
                                      <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-[width] duration-500" style={{ width: `${progress.completion}%` }} />
                                    </div>
                                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
                                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800">{progress.approved} aprobadas</span>
                                      <span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-800">{progress.reinforce} a reforzar</span>
                                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{progress.total - progress.evaluated} sin nota final</span>
                                      {progress.withoutScale > 0 ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">{progress.withoutScale} sin equivalencia de escala</span> : null}
                                    </div>
                                  </div>
                                ) : null}
                                {progress.subjects.length ? (
                                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                    {progress.subjects.map((grade) => (
                                      <div key={grade.subject} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                                        <p className="text-xs font-semibold text-slate-600">{grade.subject}</p>
                                        {grade.percentage === null ? (
                                          <p className="mt-1 text-xs text-slate-500">Calificación final no disponible</p>
                                        ) : (
                                          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                            {grade.displayMode !== "descriptive" && grade.gradeValue !== null ? (
                                              <span className="text-lg font-bold text-slate-900">{grade.gradeValue}</span>
                                            ) : null}
                                            {grade.displayMode !== "numeric" && grade.levelLabel ? (
                                              <span className="text-sm font-semibold text-slate-800">{grade.levelLabel}</span>
                                            ) : null}
                                            <span className={`text-[11px] font-semibold ${grade.isPassing === false ? "text-rose-700" : "text-emerald-700"}`}>
                                              {grade.isPassing === false ? "A reforzar" : grade.isPassing === true ? "Aprobada" : "Publicada"}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                              </li>
                            );
                          })}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs text-slate-500">Todavía no hay boletines oficiales publicados para este estudiante.</p>
                    )}
                </section>

                <div className="flex flex-wrap gap-2 border-t border-slate-100 p-5">
                  {student.can_view_grades ? (
                    <Link href={`/dashboard/${slug}/report-cards?student=${student.student_id}`}
                      className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-800">
                      <FileText size={15} /> Boletines
                    </Link>
                  ) : null}
                  {student.can_view_attendance ? (
                    <Link href={`/dashboard/${slug}/portal/attendance/${student.student_id}`}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                      <CalendarCheck size={15} /> Ver asistencia
                    </Link>
                  ) : null}
                  <Link href={`/dashboard/${slug}/classroom`}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    <BookOpen size={15} /> Aula virtual
                  </Link>
                  <Link href={`/dashboard/${slug}/messages`}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    <MessageCircle size={15} /> Mensajes
                  </Link>
                  <Link href={`/dashboard/${slug}/appointments`}
                    className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800 hover:bg-violet-100">
                    <CalendarCheck size={15} /> Citaciones
                  </Link>
                </div>
              </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <ShieldCheck className="mx-auto text-slate-300" size={32} />
            <h2 className="mt-4 font-semibold text-slate-800">Todavía no hay estudiantes vinculados</h2>
            <p className="mt-2 text-sm text-slate-500">
              Cuando la institución vincule tu cuenta con un legajo y una matrícula, la información autorizada aparecerá aquí.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
