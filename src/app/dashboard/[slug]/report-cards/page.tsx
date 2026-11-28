import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, FileText, GraduationCap, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";
import { savePeriodObservation } from "./actions";
import { updateReportCardWorkflow } from "./workflow-actions";
import { closeGradingPeriod, reopenGradingPeriod } from "./grading-period-actions";

type Student = { id: string; first_name: string; last_name: string; student_number: string | null };
type Period = { id: string; name: string; starts_on: string; ends_on: string; academic_year_id: string; status: "open" | "closed"; closed_at: string | null; close_reason: string | null };
type Assessment = { id: string; title: string; division_id: string; course_subject_id: string; grading_period_id: string; assessment_date: string | null; max_score: number; weight_percent: number | null };
type Grade = { assessment_id: string; student_id: string; score: number | null; comment: string | null };
type CourseSubject = { id: string; subject_id: string; course_id: string };
type Subject = { id: string; name: string };
type PeriodObservation = { id: string; observation: string; author_membership_id: string };
type GradingScale = { id: string; name: string; display_mode: "numeric" | "descriptive" | "both"; minimum_value: number; maximum_value: number; passing_value: number | null };
type GradingScaleLevel = { id: string; grading_scale_id: string; minimum_percentage: number; maximum_percentage: number; label: string; grade_value: number | null; is_passing: boolean; sort_order: number };
type ReportCardWorkflow = { id: string; status: "draft" | "submitted" | "approved" | "published"; version_number: number; supersedes_workflow_id: string | null; rectification_reason: string | null; submitted_by_membership_id: string | null; submitted_at: string | null; approved_at: string | null; published_at: string | null };
type WorkflowEvent = { id: string; from_status: "draft" | "submitted" | "approved" | "published" | null; to_status: "draft" | "submitted" | "approved" | "published"; created_at: string };
type ReviewWorkflow = { id: string; student_id: string; grading_period_id: string; status: "submitted" | "approved"; version_number: number; submitted_at: string | null; submitted_by_membership_id: string | null };

function percentage(score: number, maximum: number) {
  return maximum > 0 ? (score / maximum) * 100 : 0;
}

function numberLabel(value: number) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(value);
}

export default async function ReportCardsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ student?: string; period?: string; saved?: string; error?: string; workflow_saved?: string; period_action?: string; period_error?: string }>;
}) {
  const { slug } = await params;
  const { student: selectedStudentId, period: selectedPeriodId, saved, error, workflow_saved, period_action, period_error } = await searchParams;
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

  const permissions = await getMembershipPermissions(supabase, membership.id);
  if (!permissions.has("grades.read")) redirect(`/dashboard/${slug}`);
  const canManageGrades = permissions.has("grades.manage");
  const canApproveReportCards = permissions.has("report_cards.approve");
  const canPublishReportCards = permissions.has("report_cards.publish");
  const canClosePeriod = permissions.has("grades.close_period");
  const canReopenPeriod = permissions.has("grades.reopen_period");

  const [{ data: studentsRaw }, { data: periodsRaw }] = await Promise.all([
    supabase.rpc("list_students_for_grades", { p_institution_id: institution.id }),
    supabase.from("grading_periods").select("id,name,starts_on,ends_on,academic_year_id,status,closed_at,close_reason")
      .eq("institution_id", institution.id).order("sort_order"),
  ]);
  const students = (studentsRaw ?? []) as Student[];
  const periods = (periodsRaw ?? []) as Period[];
  const selectedStudent = students.find((item) => item.id === selectedStudentId);
  const selectedPeriod = periods.find((item) => item.id === selectedPeriodId) ?? periods[0];

  // Bandeja institucional: concentra boletines que esperan aprobación o publicación.
  let reviewQueue: ReviewWorkflow[] = [];
  const canUseReviewQueue = canManageGrades || canApproveReportCards || canPublishReportCards;
  if (selectedPeriod && canUseReviewQueue) {
    for (let offset = 0; ; offset += 500) {
      const { data: queueRows, error: queueError } = await supabase.from("report_card_workflows")
        .select("id,student_id,grading_period_id,status,version_number,submitted_at,submitted_by_membership_id")
        .eq("institution_id", institution.id)
        .eq("grading_period_id", selectedPeriod.id)
        .in("status", ["submitted", "approved"])
        .order("submitted_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + 499);
      if (queueError) break;
      reviewQueue.push(...((queueRows ?? []) as ReviewWorkflow[]));
      if ((queueRows ?? []).length < 500) break;
    }
  }
  const studentById = new Map(students.map((item) => [item.id, item]));

  let periodObservation: PeriodObservation | null = null;
  let workflow: ReportCardWorkflow | null = null;
  let publishedWorkflow: { id: string; version_number: number } | null = null;
  let workflowEvents: WorkflowEvent[] = [];
  let gradingScale: GradingScale | null = null;
  let gradingScaleLevels: GradingScaleLevel[] = [];
  if (selectedPeriod) {
    const { data: yearData } = await supabase.from("academic_years")
      .select("grading_scale_id").eq("id", selectedPeriod.academic_year_id)
      .eq("institution_id", institution.id).maybeSingle();
    if (yearData?.grading_scale_id) {
      const [{ data: scaleData }, { data: levelsData }] = await Promise.all([
        supabase.from("grading_scales").select("id,name,display_mode,minimum_value,maximum_value,passing_value")
          .eq("id", yearData.grading_scale_id).eq("institution_id", institution.id).maybeSingle(),
        supabase.from("grading_scale_levels").select("id,grading_scale_id,minimum_percentage,maximum_percentage,label,grade_value,is_passing,sort_order")
          .eq("grading_scale_id", yearData.grading_scale_id).eq("institution_id", institution.id).order("sort_order"),
      ]);
      gradingScale = (scaleData ?? null) as GradingScale | null;
      gradingScaleLevels = (levelsData ?? []) as GradingScaleLevel[];
    }
  }

  if (selectedStudent && selectedPeriod) {
    const [{ data: workflowData }, { data: eventsData }] = await Promise.all([
      supabase.from("report_card_workflows").select("id,status,version_number,supersedes_workflow_id,rectification_reason,submitted_by_membership_id,submitted_at,approved_at,published_at")
        .eq("institution_id", institution.id).eq("student_id", selectedStudent.id)
        .eq("grading_period_id", selectedPeriod.id).order("version_number", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("report_card_workflow_events").select("id,from_status,to_status,created_at")
        .eq("institution_id", institution.id).eq("student_id", selectedStudent.id)
        .eq("grading_period_id", selectedPeriod.id).order("created_at", { ascending: false }).limit(20),
    ]);
    workflow = (workflowData ?? null) as ReportCardWorkflow | null;
    workflowEvents = (eventsData ?? []) as WorkflowEvent[];
    const { data: publishedWorkflowData } = await supabase.from("report_card_workflows")
      .select("id,version_number")
      .eq("institution_id", institution.id)
      .eq("student_id", selectedStudent.id)
      .eq("grading_period_id", selectedPeriod.id)
      .eq("status", "published")
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    publishedWorkflow = (publishedWorkflowData ?? null) as { id: string; version_number: number } | null;
  }

  const canViewAcademicDetails = canManageGrades || canApproveReportCards;

  if (selectedStudent && selectedPeriod && canViewAcademicDetails) {
    const { data } = await supabase.from("student_period_observations")
      .select("id,observation,author_membership_id")
      .eq("institution_id", institution.id)
      .eq("student_id", selectedStudent.id)
      .eq("grading_period_id", selectedPeriod.id)
      .maybeSingle();
    periodObservation = (data ?? null) as PeriodObservation | null;
  }

  let subjectReports: {
    subject: string;
    average: number | null;
    completed: number;
    weightingStatus: "simple" | "invalid" | "pending" | "weighted";
    gradeLabel: string | null;
    gradeValue: number | null;
    gradePassing: boolean | null;
    assessments: { title: string; date: string | null; score: number | null; maximum: number; weight: number | null; comment: string | null }[];
  }[] = [];

  if (selectedStudent && selectedPeriod && canViewAcademicDetails) {
    const { data: enrollmentsRaw } = await supabase.from("enrollments")
      .select("division_id,enrolled_on,ended_on")
      .eq("institution_id", institution.id)
      .eq("student_id", selectedStudent.id);
    const enrolledDivisionIds = [...new Set((enrollmentsRaw ?? [])
      .filter((row) => row.enrolled_on <= selectedPeriod.ends_on && (!row.ended_on || row.ended_on >= selectedPeriod.starts_on))
      .map((row) => row.division_id))];
    const { data: divisionsRaw } = enrolledDivisionIds.length
      ? await supabase.from("divisions").select("id").eq("institution_id", institution.id)
        .eq("academic_year_id", selectedPeriod.academic_year_id).in("id", enrolledDivisionIds)
      : { data: [] as { id: string }[] };
    const periodDivisionIds = (divisionsRaw ?? []).map((row) => row.id);
    const { data: assessmentsRaw } = periodDivisionIds.length
      ? await supabase.from("assessments")
        .select("id,title,division_id,course_subject_id,grading_period_id,assessment_date,max_score,weight_percent")
        .eq("institution_id", institution.id)
        .eq("grading_period_id", selectedPeriod.id)
        .in("division_id", periodDivisionIds)
        .order("assessment_date", { ascending: true }).limit(1000)
      : { data: [] as Assessment[] };
    const assessments = (assessmentsRaw ?? []) as Assessment[];
    const assessmentIds = assessments.map((item) => item.id);

    const [{ data: gradesRaw }, { data: courseSubjectsRaw }, { data: subjectsRaw }] = await Promise.all([
      assessmentIds.length
        ? supabase.from("grade_records").select("assessment_id,student_id,score,comment")
          .eq("institution_id", institution.id).eq("student_id", selectedStudent.id)
          .in("assessment_id", assessmentIds)
        : Promise.resolve({ data: [] as Grade[] }),
      supabase.from("course_subjects").select("id,subject_id,course_id")
        .eq("institution_id", institution.id),
      supabase.from("subjects").select("id,name").eq("institution_id", institution.id),
    ]);
    const grades = (gradesRaw ?? []) as Grade[];
    const courseSubjects = (courseSubjectsRaw ?? []) as CourseSubject[];
    const subjects = (subjectsRaw ?? []) as Subject[];
    const subjectNames = new Map(subjects.map((item) => [item.id, item.name]));
    const courseSubjectById = new Map(courseSubjects.map((item) => [item.id, item]));
    const gradeByAssessment = new Map(grades.map((item) => [item.assessment_id, item]));
    const grouped = new Map<string, Assessment[]>();

    for (const assessment of assessments) {
      const courseSubject = courseSubjectById.get(assessment.course_subject_id);
      if (!courseSubject) continue;
      const key = courseSubject.subject_id;
      grouped.set(key, [...(grouped.get(key) ?? []), assessment]);
    }

    subjectReports = [...grouped.entries()].map(([subjectId, subjectAssessments]) => {
      const rows = subjectAssessments.map((assessment) => {
        const grade = gradeByAssessment.get(assessment.id);
        return {
          title: assessment.title,
          date: assessment.assessment_date,
          score: grade?.score ?? null,
          maximum: Number(assessment.max_score),
          weight: assessment.weight_percent === null ? null : Number(assessment.weight_percent),
          comment: grade?.comment ?? null,
        };
      });
      const completed = rows.filter((row) => row.score !== null && row.maximum > 0);
      const anyWeighted = rows.some((row) => row.weight !== null);
      const totalWeight = rows.reduce((sum, row) => sum + (row.weight ?? 0), 0);
      const weightsComplete = anyWeighted && rows.every((row) => row.weight !== null) && Math.abs(totalWeight - 100) < 0.001;
      const allGradesComplete = completed.length === rows.length && rows.length > 0;
      const weightingStatus: "simple" | "invalid" | "pending" | "weighted" = !anyWeighted ? "simple" : !weightsComplete ? "invalid" : !allGradesComplete ? "pending" : "weighted";
      const average = !anyWeighted && completed.length
        ? completed.reduce((sum, row) => sum + percentage(Number(row.score), row.maximum), 0) / completed.length
        : weightsComplete && allGradesComplete
          ? rows.reduce((sum, row) => sum + percentage(Number(row.score), row.maximum) * Number(row.weight) / 100, 0)
          : null;
      const matchedLevel = average === null ? null : gradingScaleLevels.find((level) =>
        average >= Number(level.minimum_percentage) && average <= Number(level.maximum_percentage));
      return {
        subject: subjectNames.get(subjectId) ?? "Materia",
        average,
        completed: completed.length,
        weightingStatus,
        gradeLabel: matchedLevel?.label ?? null,
        gradeValue: matchedLevel?.grade_value === null || matchedLevel?.grade_value === undefined ? null : Number(matchedLevel.grade_value),
        gradePassing: matchedLevel ? matchedLevel.is_passing : null,
        assessments: rows,
      };
    }).sort((a, b) => a.subject.localeCompare(b.subject, "es"));
  }

  const today = new Date().toISOString().slice(0, 10);
  const periodEnded = Boolean(selectedPeriod && selectedPeriod.ends_on <= today);
  const periodClosed = selectedPeriod?.status === "closed";
  const allAssessmentsComplete = subjectReports.length > 0 &&
    subjectReports.every((report) => report.assessments.length > 0 &&
      report.assessments.every((item) => item.score !== null));
  const canSubmitWorkflow = canManageGrades && periodEnded && periodClosed && allAssessmentsComplete;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <Link href={`/dashboard/${slug}/grades`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700">
          <ArrowLeft size={16} /> Volver a calificaciones
        </Link>
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-violet-100 p-3 text-violet-700"><FileText size={24} /></div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">Gestión académica</p>
              <h1 className="text-2xl font-bold">Boletines de calificaciones</h1>
              <p className="mt-1 text-sm text-slate-500">{institution.display_name} · Consulta por alumno y período</p>
            </div>
          </div>
        </header>

        <form method="get" className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label className="text-sm font-medium">Alumno
            <select name="student" defaultValue={selectedStudentId ?? ""} required className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal">
              <option value="">Seleccionar alumno</option>
              {students.map((item) => <option key={item.id} value={item.id}>{item.last_name}, {item.first_name}{item.student_number ? ` · #${item.student_number}` : ""}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">Período de calificación
            <select name="period" defaultValue={selectedPeriod?.id ?? ""} required className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal">
              {periods.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.status === "closed" ? "Cerrado" : "Abierto"}</option>)}
            </select>
          </label>
          <button className="rounded-lg bg-violet-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">Consultar boletín</button>
        </form>

        {saved === "1" && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">La observación del período se guardó correctamente.</div>}
        {workflow_saved === "1" && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">El estado del boletín se actualizó correctamente.</div>}
        {period_action === "closed" && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">El período se cerró correctamente. Ya se puede continuar con la revisión de los boletines.</div>}
        {period_action === "reopened" && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">El período se reabrió. Las correcciones quedarán registradas en el historial.</div>}
        {period_error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{period_error === "forbidden" ? "Tu perfil no tiene permiso para esta operación." : period_error === "invalid" || period_error === "reason" ? "El motivo debe tener entre 10 y 500 caracteres." : period_error === "not_ready" ? "No se puede cerrar: el período debe haber finalizado, tener evaluaciones y contar con todas las notas cargadas." : period_error === "reopen_blocked" ? "No se puede reabrir mientras haya boletines enviados o aprobados pendientes." : "No se pudo actualizar el estado del período."}</div>}
        {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error === "forbidden" ? "No tenés permiso para registrar observaciones en este curso." : error === "workflow_forbidden" ? "Tu perfil no tiene permiso para realizar esta etapa del circuito de boletines." : error === "workflow_state" ? "El boletín cambió de estado o no se encuentra en la etapa requerida." : error === "workflow_reason" ? "La rectificación requiere un motivo de al menos 10 caracteres." : error.startsWith("workflow_") ? "No se pudo actualizar el circuito del boletín. Verificá el estado y tus permisos." : "No se pudo guardar la observación. Verificá los datos y tu asignación docente."}</div>}

        {canUseReviewQueue && selectedPeriod ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-900">Bandeja de revisión institucional</h2>
                <p className="mt-1 text-sm text-slate-500">Boletines del período {selectedPeriod.name} que todavía requieren una decisión institucional.</p>
              </div>
              <div className="flex gap-2 text-xs font-semibold">
                <span className="rounded-full bg-amber-50 px-3 py-1.5 text-amber-800">{reviewQueue.filter((item) => item.status === "submitted").length} para aprobar</span>
                <span className="rounded-full bg-violet-50 px-3 py-1.5 text-violet-800">{reviewQueue.filter((item) => item.status === "approved").length} para publicar</span>
              </div>
            </div>
            {reviewQueue.length ? (
              <div className="mt-4 divide-y divide-slate-100">
                {reviewQueue.map((item) => {
                  const student = studentById.get(item.student_id);
                  if (!student) return null;
                  const awaitingApproval = item.status === "submitted";
                  return (
                    <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800">{student.last_name}, {student.first_name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {awaitingApproval ? "Enviado a revisión" : "Aprobado · pendiente de publicación"}
                          {item.version_number > 1 ? ` · Versión ${item.version_number}` : ""}
                          {item.submitted_at ? ` · ${new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.submitted_at))}` : ""}
                        </p>
                      </div>
                      <Link href={`/dashboard/${slug}/report-cards?student=${encodeURIComponent(item.student_id)}&period=${encodeURIComponent(selectedPeriod.id)}`}
                        className="shrink-0 rounded-lg border border-violet-200 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50">
                        Abrir boletín →
                      </Link>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">No hay boletines pendientes de aprobación o publicación para este período.</p>
            )}
          </section>
        ) : null}

        {selectedStudent && selectedPeriod ? (
          <section className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Informe académico · {selectedPeriod.name}</p>
                  <h2 className="mt-1 text-xl font-bold">{selectedStudent.last_name}, {selectedStudent.first_name}</h2>
                  <p className="mt-1 text-sm text-slate-500">{selectedStudent.student_number ? `Legajo #${selectedStudent.student_number}` : "Legajo sin número registrado"}</p>
                </div>
                <div className="text-right"><span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">Consulta autorizada</span><p className="mt-2 text-xs text-slate-500">{gradingScale ? `Escala: ${gradingScale.name}` : "Este ciclo lectivo no tiene una escala asignada."}</p></div>
              </div>
            </div>

            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div><h3 className="font-semibold">Estado institucional del boletín</h3>
                  <p className="mt-1 text-sm text-slate-600">{workflow ? ({draft:"Borrador",submitted:"Enviado a revisión",approved:"Aprobado",published:"Publicado"}[workflow.status]) : "Todavía no fue enviado a revisión."}</p>
                  <p className="mt-1 text-xs text-slate-500">Solo un boletín publicado queda habilitado como documento oficial de consulta.</p>
                  {workflow && <p className="mt-1 text-xs text-slate-500">Versión {workflow.version_number}{workflow.supersedes_workflow_id ? " · Rectificación de una versión anterior" : ""}</p>}
                  {!workflow && canManageGrades && !periodEnded && <p className="mt-2 text-xs text-amber-700">El período debe finalizar antes de iniciar el circuito del boletín.</p>}
                  {!workflow && canManageGrades && periodEnded && !periodClosed && <p className="mt-2 text-xs text-amber-700">El período ya finalizó, pero todavía debe cerrarse institucionalmente para habilitar los boletines.</p>}
                  {periodClosed && selectedPeriod.closed_at && <p className="mt-2 text-xs text-slate-500">Cerrado el {new Intl.DateTimeFormat("es-AR",{dateStyle:"medium",timeStyle:"short"}).format(new Date(selectedPeriod.closed_at))}{selectedPeriod.close_reason ? ` · Motivo: ${selectedPeriod.close_reason}` : ""}</p>}
                  {!workflow && canManageGrades && periodClosed && !allAssessmentsComplete && <p className="mt-2 text-xs text-amber-700">Completá todas las calificaciones del período antes de enviar el boletín.</p>}
                  {workflow?.rectification_reason && <p className="mt-2 text-xs text-amber-800">Motivo de rectificación: {workflow.rectification_reason}</p>}
                </div>
                {(canClosePeriod && selectedPeriod.status === "open" && periodEnded) && <form action={closeGradingPeriod} className="w-full space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="grading_period_id" value={selectedPeriod.id} />
                <input type="hidden" name="student_id" value={selectedStudent.id} />
                <label className="block text-sm font-semibold text-amber-950">Cerrar período de calificación
                  <textarea name="reason" required minLength={10} maxLength={500} rows={2} placeholder="Motivo del cierre del período." className="mt-1.5 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 font-normal" />
                </label>
                <p className="text-xs text-amber-800">El sistema comprobará que todas las evaluaciones tengan calificaciones antes de cerrar. Luego se habilitará el envío de boletines.</p>
                <button className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800">Cerrar período</button>
              </form>}
              {canClosePeriod && selectedPeriod.status === "open" && !periodEnded && <p className="w-full text-xs text-slate-500">El cierre estará disponible cuando finalice la fecha del período ({selectedPeriod.ends_on}).</p>}
              {canReopenPeriod && selectedPeriod.status === "closed" && <form action={reopenGradingPeriod} className="w-full space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="grading_period_id" value={selectedPeriod.id} />
                <input type="hidden" name="student_id" value={selectedStudent.id} />
                <label className="block text-sm font-semibold text-amber-950">Reabrir período para correcciones
                  <textarea name="reason" required minLength={10} maxLength={500} rows={2} placeholder="Motivo institucional de la reapertura." className="mt-1.5 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 font-normal" />
                </label>
                <p className="text-xs text-amber-800">La reapertura queda auditada. No se permite mientras existan boletines enviados o aprobados pendientes de resolución.</p>
                <button className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100">Reabrir período</button>
              </form>}
              <div className="flex flex-wrap gap-2">
                  {!workflow && canSubmitWorkflow && <form action={updateReportCardWorkflow}>
                    <input type="hidden" name="slug" value={slug} /><input type="hidden" name="student_id" value={selectedStudent.id} /><input type="hidden" name="grading_period_id" value={selectedPeriod.id} /><input type="hidden" name="workflow_action" value="submit" />
                    <button className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800">Enviar a revisión</button>
                  </form>}
                  {workflow?.status === "published" && canSubmitWorkflow && <form action={updateReportCardWorkflow} className="w-full space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <input type="hidden" name="slug" value={slug} /><input type="hidden" name="student_id" value={selectedStudent.id} /><input type="hidden" name="grading_period_id" value={selectedPeriod.id} /><input type="hidden" name="workflow_action" value="submit" />
                    <label className="block text-sm font-semibold text-amber-950">Solicitar rectificación del boletín
                      <textarea name="rectification_reason" required minLength={10} maxLength={1000} rows={3} placeholder="Explicá por qué debe rectificarse el boletín publicado." className="mt-1.5 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 font-normal" />
                    </label>
                    <p className="text-xs text-amber-800">La rectificación crea una nueva versión y conserva el boletín publicado anterior.</p>
                    <button className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100">Crear nueva versión para revisión</button>
                  </form>}
                  {workflow?.status === "submitted" && canApproveReportCards && workflow.submitted_by_membership_id !== membership.id && <form action={updateReportCardWorkflow}>
                    <input type="hidden" name="slug" value={slug} /><input type="hidden" name="student_id" value={selectedStudent.id} /><input type="hidden" name="grading_period_id" value={selectedPeriod.id} /><input type="hidden" name="workflow_action" value="approve" />
                    <button className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">Aprobar boletín</button>
                  </form>}
                  {workflow?.status === "approved" && canPublishReportCards && <form action={updateReportCardWorkflow}>
                    <input type="hidden" name="slug" value={slug} /><input type="hidden" name="student_id" value={selectedStudent.id} /><input type="hidden" name="grading_period_id" value={selectedPeriod.id} /><input type="hidden" name="workflow_action" value="publish" />
                    <button className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800">Publicar boletín</button>
                  </form>}
                  {publishedWorkflow && <Link
                    href={`/dashboard/${slug}/report-cards/${publishedWorkflow.id}/pdf`}
                    className="rounded-lg border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50"
                  >Descargar boletín PDF · v{publishedWorkflow.version_number}</Link>}
                  {publishedWorkflow && <Link
                    href={`/dashboard/${slug}/report-cards/${publishedWorkflow.id}/csv`}
                    className="rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                  >Exportar datos CSV · v{publishedWorkflow.version_number}</Link>}
                </div>
              </div>
              {workflowEvents.length > 0 && <ol className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-xs text-slate-600">
                {workflowEvents.map((event) => <li key={event.id}>{({draft:"Borrador",submitted:"Enviado a revisión",approved:"Aprobado",published:"Publicado"}[event.to_status] ?? event.to_status)} · {new Intl.DateTimeFormat("es-AR",{dateStyle:"medium",timeStyle:"short"}).format(new Date(event.created_at))}</li>)}
              </ol>}
            </article>

{canViewAcademicDetails && <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="font-semibold">Observación general del período</h3>
              {periodObservation ? (
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{periodObservation.observation}</p>
              ) : (
                <p className="mt-3 text-sm text-slate-500">Todavía no se registró una observación general para este período.</p>
              )}
              {canManageGrades && (!periodObservation || periodObservation.author_membership_id === membership.id) && (
                <form action={savePeriodObservation} className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="student_id" value={selectedStudent.id} />
                  <input type="hidden" name="grading_period_id" value={selectedPeriod.id} />
                  <label className="block text-sm font-medium">Registrar o actualizar observación
                    <textarea name="observation" required minLength={1} maxLength={2000} rows={4}
                      defaultValue={periodObservation?.observation ?? ""}
                      placeholder="Describí el desempeño, los avances y los aspectos a fortalecer durante el período."
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
                  </label>
                  <p className="text-xs text-slate-500">Máximo 2.000 caracteres. Solo el autor puede modificar una observación ya registrada.</p>
                  <button className="rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">Guardar observación</button>
                </form>
              )}
            </article>}

            {canViewAcademicDetails ? (
              subjectReports.length ? subjectReports.map((report) => (
                <article key={report.subject} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
                    <h3 className="font-semibold">{report.subject}</h3>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">{report.weightingStatus === "weighted" ? "Promedio ponderado" : report.weightingStatus === "simple" ? "Promedio simple" : report.weightingStatus === "pending" ? "Promedio pendiente · faltan notas" : "Ponderaciones incompletas"}</p>
                      <p className="text-lg font-bold text-violet-700">{report.average === null ? "—" : `${numberLabel(report.average)} %`}</p>
                      {gradingScale && report.average !== null && <p className="mt-1 text-sm font-semibold">{gradingScale.display_mode !== "descriptive" && report.gradeValue !== null ? numberLabel(report.gradeValue) : ""}{gradingScale.display_mode === "both" && report.gradeValue !== null && report.gradeLabel ? " · " : ""}{gradingScale.display_mode !== "numeric" ? report.gradeLabel ?? "Sin tramo configurado" : ""}</p>}
                      {gradingScale && report.gradePassing !== null && <p className={`text-xs ${report.gradePassing ? "text-emerald-700" : "text-rose-700"}`}>{report.gradePassing ? "Aprobado según escala" : "No aprobado según escala"}</p>}
                    </div>
                  </div>
                  <div className="overflow-x-auto p-5">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead className="text-xs uppercase tracking-wide text-slate-500">
                        <tr><th className="pb-3 pr-3">Evaluación</th><th className="pb-3 pr-3">Fecha</th><th className="pb-3 pr-3">Resultado</th><th className="pb-3 pr-3">Peso</th><th className="pb-3">Observación</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {report.assessments.map((item, index) => (
                          <tr key={`${item.title}-${index}`}>
                            <td className="py-3 pr-3 font-medium">{item.title}</td>
                            <td className="py-3 pr-3 text-slate-500">{item.date ?? "—"}</td>
                            <td className="py-3 pr-3">{item.score === null ? "Pendiente" : `${numberLabel(Number(item.score))} / ${numberLabel(item.maximum)}`}</td>
                            <td className="py-3 pr-3">{item.weight === null ? "—" : `${numberLabel(item.weight)} %`}</td>
                            <td className="py-3 text-slate-600">{item.comment ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="px-5 pb-4 text-xs text-slate-500">{report.completed} de {report.assessments.length} evaluaciones con nota registrada.</p>
                </article>
              )) : (
                <div className="rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center text-sm text-slate-500">
                  <GraduationCap size={28} className="mx-auto mb-3 text-slate-400" />
                  No hay evaluaciones visibles para este alumno en el período seleccionado.
                </div>
              )
            ) : (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-6 text-sm text-amber-900">
                {workflow?.status === "published"
                  ? "El boletín oficial ya fue publicado. Abrí el documento inmutable desde el enlace de la etapa institucional para consultar las calificaciones y observaciones emitidas."
                  : "El boletín todavía no fue publicado por la institución. Las calificaciones y observaciones estarán disponibles cuando finalice la aprobación."}
              </div>
            )}
            {canViewAcademicDetails && <div className="flex items-start gap-2 rounded-xl border border-sky-100 bg-sky-50 p-4 text-xs text-sky-900">
              <ShieldCheck size={16} className="mt-0.5 shrink-0" />
              {workflow?.status === "published" ? "Boletín publicado por la institución." : "Este informe es una vista de consulta calculada a partir de las evaluaciones cargadas. No reemplaza un boletín institucional publicado."}
            </div>}
          </section>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center text-sm text-slate-500">
            {students.length && periods.length ? "Seleccioná un alumno y un período para consultar el resumen académico." : "No hay alumnos o períodos disponibles para tu perfil en esta institución."}
          </div>
        )}
      </div>
    </main>
  );
}
