import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpen, CalendarCheck, FileText, GraduationCap, MessageCircle, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

type PublishedReportCard = {
  workflow_id: string;
  student_id: string;
  created_at: string;
  snapshot: {
    period?: { name?: string };
    academic_year?: { name?: string };
    published_at?: string;
    workflow_version?: number;
    grading_scale?: {
      display_mode?: "numeric" | "descriptive" | "both";
      levels?: { minimum_percentage: number; maximum_percentage: number; label: string; grade_value: number | null; is_passing: boolean }[];
    } | null;
    subjects?: {
      subject: string;
      assessments?: { title: string; score: number | null; maximum_score: number; weight_percent: number | null }[];
    }[];
  };
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

  const { data: rows, error } = await supabase.rpc("list_my_portal_students", {
    p_institution_id: institution.id,
  });
  const students = (rows ?? []) as PortalStudent[];
  const gradeStudentIds = students
    .filter((student) => student.can_view_grades)
    .map((student) => student.student_id);
  const { data: publishedSnapshots } = gradeStudentIds.length
    ? await supabase.from("report_card_snapshots")
      .select("workflow_id,student_id,created_at,snapshot")
      .eq("institution_id", institution.id)
      .in("student_id", gradeStudentIds)
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

        {error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
            No fue posible cargar tu portal. Verificá que tu cuenta tenga un perfil de alumno o tutor activo.
          </div>
        ) : students.length ? (
          <div className="grid gap-5 lg:grid-cols-2">
            {students.map((student) => (
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
                  {student.can_view_grades ? (
                    <p className="mt-1 text-xs text-slate-500">
                      {student.published_report_card_count} boletines publicados · Último: {dateLabel(student.latest_report_card_at)}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400">Tu perfil no tiene habilitada la consulta de calificaciones para este estudiante.</p>
                  )}
                </div>

                {student.can_view_grades && (
                  <section className="border-t border-slate-100 px-5 py-4">
                    <h3 className="text-sm font-semibold text-slate-800">Boletines oficiales publicados</h3>
                    {publishedReportCards.filter((card) => card.student_id === student.student_id).length ? (
                      <ul className="mt-3 space-y-2">
                        {publishedReportCards
                          .filter((card) => card.student_id === student.student_id)
                          .map((card) => (
                            <li key={card.workflow_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                              <div>
                                <p className="text-sm font-medium text-slate-800">
                                  {card.snapshot.period?.name ?? "Boletín académico"}
                                  {card.snapshot.academic_year?.name ? ` · ${card.snapshot.academic_year.name}` : ""}
                                  {card.snapshot.workflow_version && card.snapshot.workflow_version > 1 ? ` · v${card.snapshot.workflow_version}` : ""}
                                </p>
                                <p className="text-xs text-slate-500">Publicado: {dateLabel(card.snapshot.published_at ?? card.created_at)}</p>
                                {publishedSubjectGrades(card.snapshot).length ? (
                                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                    {publishedSubjectGrades(card.snapshot).map((grade) => (
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
                              </div>
                              <Link
                                href={`/dashboard/${slug}/report-cards/${card.workflow_id}/pdf`}
                                className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50"
                              >
                                <FileText size={14} /> Descargar PDF
                              </Link>
                            </li>
                          ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs text-slate-500">Todavía no hay boletines oficiales publicados para este estudiante.</p>
                    )}
                  </section>
                )}

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
            ))}
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
