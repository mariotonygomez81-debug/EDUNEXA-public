import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ClipboardList, Plus, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAssessment, saveGrades, saveAssessmentWeight, importGradesSpreadsheet } from "./actions";
import { getMembershipPermissions } from "@/lib/auth/permissions";
import GradeAuditPdf from "./grade-audit-pdf";
import GradebookExcel from "./gradebook-excel";

type Division = { id: string; name: string; course_id: string };
type Course = { id: string; name: string };
type Subject = { id: string; name: string };
type CourseSubject = { id: string; course_id: string; subject_id: string };
type Period = { id: string; name: string; starts_on: string; ends_on: string; status: string };
type Student = { id: string; first_name: string; last_name: string; student_number: string | null };
type Assessment = { id: string; title: string; division_id: string; course_subject_id: string; grading_period_id: string; assessment_date: string | null; max_score: number; weight_percent: number | null; description: string | null };
type GradeEvent = { id: string; student_id: string; action: "created" | "updated" | "cleared"; old_score: number | null; new_score: number | null; change_reason: string | null; created_at: string };

function numberLabel(value: number) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(value);
}

export default async function GradesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; created?: string; saved?: string; imported?: string }>;
}) {
  const { slug } = await params;
  const { error, created, saved, imported } = await searchParams;
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
  const roles = (roleRows ?? []).map((row) => row.roles?.key);
  const permissions = await getMembershipPermissions(supabase, membership.id);
  if (!permissions.has("grades.read")) redirect(`/dashboard/${slug}`);
  const canManageGrades = permissions.has("grades.manage");
  const canApproveReportCards = permissions.has("report_cards.approve");
  const canViewGradeAudit = canManageGrades || canApproveReportCards;
  const isInstitutionAdmin = canManageGrades && roles.includes("institution_admin");

  const { data: periods } = await supabase.from("grading_periods")
    .select("id,name,starts_on,ends_on,status").eq("institution_id", institution.id)
    .order("sort_order");

  let divisionIds: string[] = [];
  let staffAssignments: { division_id: string | null; course_subject_id: string | null }[] = [];
  if (isInstitutionAdmin) {
    const { data } = await supabase.from("divisions").select("id")
      .eq("institution_id", institution.id);
    divisionIds = (data ?? []).map((row) => row.id);
  } else if (canManageGrades) {
    const { data: assignments } = await supabase.from("staff_assignments")
      .select("division_id,course_subject_id").eq("institution_id", institution.id)
      .eq("membership_id", membership.id);
    staffAssignments = (assignments ?? []) as typeof staffAssignments;
    divisionIds = [...new Set(staffAssignments
      .map((assignment) => assignment.division_id)
      .filter((id): id is string => Boolean(id)))];
  }

  const { data: divisionsRaw } = divisionIds.length
    ? await supabase.from("divisions").select("id,name,course_id")
      .eq("institution_id", institution.id).in("id", divisionIds).order("name")
    : { data: [] as Division[] };
  const divisions = (divisionsRaw ?? []) as Division[];
  const courseIds = [...new Set(divisions.map((row) => row.course_id))];
  const { data: coursesRaw } = courseIds.length
    ? await supabase.from("courses").select("id,name").eq("institution_id", institution.id).in("id", courseIds)
    : { data: [] as Course[] };
  const courses = (coursesRaw ?? []) as Course[];
  const courseNames = new Map(courses.map((row) => [row.id, row.name]));

  const { data: subjectsRaw } = await supabase.from("subjects")
    .select("id,name").eq("institution_id", institution.id).order("name");
  const subjects = (subjectsRaw ?? []) as Subject[];
  const { data: courseSubjectsRaw } = await supabase.from("course_subjects")
    .select("id,course_id,subject_id").eq("institution_id", institution.id);
  const allCourseSubjects = (courseSubjectsRaw ?? []) as CourseSubject[];
  const assignedCourseSubjectIds = new Set(staffAssignments
    .map((assignment) => assignment.course_subject_id)
    .filter((id): id is string => Boolean(id)));
  const unrestrictedCourseIds = new Set(divisions
    .filter((division) => staffAssignments.some((assignment) =>
      assignment.division_id === division.id && !assignment.course_subject_id
    ))
    .map((division) => division.course_id));
  const courseSubjects = isInstitutionAdmin
    ? allCourseSubjects
    : allCourseSubjects.filter((item) =>
        assignedCourseSubjectIds.has(item.id) || unrestrictedCourseIds.has(item.course_id)
      );
  const subjectNames = new Map(subjects.map((row) => [row.id, row.name]));

  const { data: assessmentsRaw } = await supabase.from("assessments")
    .select("id,title,division_id,course_subject_id,grading_period_id,assessment_date,max_score,weight_percent,description")
    .eq("institution_id", institution.id).order("assessment_date", { ascending: false }).limit(50);
  const assessments = (assessmentsRaw ?? []) as Assessment[];
  const assessmentDivisionIds = [...new Set(assessments.map((row) => row.division_id))];
  const { data: allDivisionRows } = assessmentDivisionIds.length
    ? await supabase.from("divisions").select("id,name,course_id").eq("institution_id", institution.id).in("id", assessmentDivisionIds)
    : { data: [] as Division[] };
  const allDivisions = (allDivisionRows ?? []) as Division[];
  const divisionNames = new Map(allDivisions.map((row) => [row.id, `${courseNames.get(row.course_id) ?? "Curso"} · ${row.name}`]));
  const periodRows = (periods ?? []) as Period[];
  const openPeriods = periodRows.filter((row) => row.status === "open");
  const periodNames = new Map(periodRows.map((row) => [row.id, row.name]));
  const periodStatuses = new Map(periodRows.map((row) => [row.id, row.status]));

  const gradePanels = await Promise.all(assessments.map(async (assessment) => {
    const { data: enrollments } = await supabase.from("enrollments")
      .select("student_id").eq("institution_id", institution.id)
      .eq("division_id", assessment.division_id).eq("status", "active");
    const studentIds = [...new Set((enrollments ?? []).map((row) => row.student_id))];
    const [{ data: studentRows }, { data: gradeRows }, { data: eventRows }] = await Promise.all([
      studentIds.length ? supabase.from("students").select("id,first_name,last_name,student_number")
        .eq("institution_id", institution.id).in("id", studentIds).order("last_name")
        : Promise.resolve({ data: [] as Student[] }),
      supabase.from("grade_records").select("student_id,score,comment")
        .eq("institution_id", institution.id).eq("assessment_id", assessment.id),
      canViewGradeAudit
        ? supabase.from("grade_record_events").select("id,student_id,action,old_score,new_score,change_reason,created_at")
          .eq("institution_id", institution.id).eq("assessment_id", assessment.id)
          .order("created_at", { ascending: false }).limit(20)
        : Promise.resolve({ data: [] as GradeEvent[] }),
    ]);
    const grades = new Map((gradeRows ?? []).map((row) => [row.student_id, row]));
    return { assessment, students: (studentRows ?? []) as Student[], grades, events: (eventRows ?? []) as GradeEvent[] };
  }));

  const finalGrades = new Map<string, number | null>();
  const finalGroups = new Map<string, typeof gradePanels>();
  for (const panel of gradePanels) { const key = [panel.assessment.division_id,panel.assessment.course_subject_id,panel.assessment.grading_period_id].join(":"); finalGroups.set(key,[...(finalGroups.get(key)??[]),panel]); }
  for (const [groupKey,panels] of finalGroups) {
    const hasWeights=panels.some(panel=>panel.assessment.weight_percent!==null);
    const weightsComplete=hasWeights&&panels.every(panel=>panel.assessment.weight_percent!==null)&&Math.abs(panels.reduce((sum,panel)=>sum+Number(panel.assessment.weight_percent??0),0)-100)<0.001;
    const studentIds=[...new Set(panels.flatMap(panel=>panel.students.map(student=>student.id)))];
    for(const studentId of studentIds){const rows=panels.map(panel=>({assessment:panel.assessment,grade:panel.grades.get(studentId)})).filter(row=>row.grade?.score!==null&&row.grade?.score!==undefined);const complete=rows.length===panels.length&&panels.length>0;let value:number|null=null;if(complete&&!hasWeights)value=rows.reduce((sum,row)=>sum+(Number(row.grade?.score)/Number(row.assessment.max_score))*100,0)/rows.length;if(complete&&weightsComplete)value=rows.reduce((sum,row)=>sum+(Number(row.grade?.score)/Number(row.assessment.max_score))*Number(row.assessment.weight_percent),0);finalGrades.set(`${groupKey}:${studentId}`,value);}
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <Link href={`/dashboard/${slug}`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700">
          <ArrowLeft size={16} /> Volver al espacio institucional
        </Link>
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-violet-100 p-3 text-violet-700"><ClipboardList size={24} /></div>
            <div><p className="text-xs font-semibold uppercase tracking-wider text-violet-700">Gestión académica</p>
              <h1 className="text-2xl font-bold">Calificaciones</h1>
              <p className="mt-1 text-sm text-slate-500">{institution.display_name} · Evaluaciones y registro de notas</p>
            </div>
          </div>
        </header>

        {created === "1" && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">La evaluación se creó correctamente.</div>}
        {saved === "1" && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Las calificaciones se guardaron.</div>}
        {imported && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Se importaron {imported} calificaciones correctamente.</div>}
        {saved === "weight" && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">La ponderación se actualizó.</div>}
        {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error === "import_file" ? "Seleccioná un archivo CSV válido de hasta 2 MB." : error === "import_assessment" ? "La evaluación seleccionada no existe." : error === "import_format" ? "El CSV debe incluir columnas matrícula y nota, con hasta 500 filas." : error === "import_rows" ? "Hay matrículas repetidas o inexistentes, o notas fuera del rango permitido. No se importó ninguna fila." : error === "import_save" ? "No se pudo guardar la importación. Revisá los permisos y el período." : error === "invalid" ? "Revisá los datos ingresados." : error === "range" ? "Una nota está fuera del rango permitido para la evaluación." : error === "reason" ? "Para modificar una nota ya registrada debés indicar un motivo de corrección de al menos 10 caracteres." : error === "period_closed" ? "El período está cerrado. Un administrador debe reabrirlo con un motivo para permitir correcciones." : error === "forbidden" ? "Tu perfil no tiene permiso para modificar calificaciones de esta división." : error === "notfound" ? "La evaluación no está disponible." : error === "weight" ? "La ponderación no se pudo guardar porque supera el 100 % acumulado o no es válida." : "No se pudo completar la operación. Verificá tus permisos y las asignaciones."}
        </div>}

        {canManageGrades && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2"><Plus size={18} className="text-violet-700" /><h2 className="font-semibold">Nueva evaluación</h2></div>
            {divisions.length && openPeriods.length && courseSubjects.length ? (
              <form action={createAssessment} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <input type="hidden" name="slug" value={slug} />
                <label className="text-sm font-medium">Título
                  <input name="title" required minLength={3} maxLength={120} placeholder="Ej.: Evaluación integradora" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
                </label>
                <label className="text-sm font-medium">División
                  <select name="division_id" required className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal">
                    <option value="">Seleccionar</option>
                    {divisions.map((division) => <option key={division.id} value={division.id}>{courseNames.get(division.course_id) ?? "Curso"} · {division.name}</option>)}
                  </select>
                </label>
                <label className="text-sm font-medium">Materia / curso
                  <select name="course_subject_id" required className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal">
                    <option value="">Seleccionar</option>
                    {courseSubjects.map((item) => <option key={item.id} value={item.id}>{subjectNames.get(item.subject_id) ?? "Materia"} · {courseNames.get(item.course_id) ?? "Curso"}</option>)}
                  </select>
                </label>
                <label className="text-sm font-medium">Período
                  <select name="grading_period_id" required className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal">
                    <option value="">Seleccionar</option>
                    {openPeriods.map((period) => <option key={period.id} value={period.id}>{period.name} ({period.starts_on} – {period.ends_on})</option>)}
                  </select>
                </label>
                <label className="text-sm font-medium">Fecha
                  <input name="assessment_date" type="date" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
                </label>
                <label className="text-sm font-medium">Puntaje máximo
                  <input name="max_score" type="number" required min="0.01" max="1000" step="0.01" defaultValue="10" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
                </label>
                <label className="text-sm font-medium">Ponderación (%) · opcional
                  <input name="weight_percent" type="number" min="0.01" max="100" step="0.01" placeholder="Ej.: 30" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
                  <span className="mt-1 block text-xs font-normal text-slate-500">Las ponderaciones de la misma materia y período no pueden superar el 100 %.</span>
                </label>
                <label className="text-sm font-medium md:col-span-2 xl:col-span-3">Descripción (opcional)
                  <textarea name="description" maxLength={1000} rows={2} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
                </label>
                <div className="md:col-span-2 xl:col-span-3"><button className="rounded-lg bg-violet-700 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-800">Crear evaluación</button></div>
              </form>
            ) : <p className="text-sm text-slate-500">Para crear evaluaciones necesitás divisiones, materias vinculadas a cursos y períodos de calificación configurados, además de los permisos correspondientes.</p>}
          </section>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-100 bg-violet-50 p-4">
          <div><p className="font-semibold text-violet-950">Boletines de calificaciones</p><p className="mt-1 text-sm text-violet-800">Consultá el resumen académico por alumno y período.</p></div>
          <Link href={`/dashboard/${slug}/report-cards`} className="rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">Abrir boletines</Link>
        </div>


        {canManageGrades && assessments.length > 0 ? <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-3"><h2 className="font-semibold text-slate-900">Importar calificaciones desde una planilla de Excel</h2><p className="mt-1 text-sm text-slate-500">Subí directamente una planilla .xlsx o un archivo CSV. Columnas requeridas: matrícula y nota; observación es opcional. Se valida toda la planilla antes de guardar.</p></div><form action={importGradesSpreadsheet} className="grid gap-3 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end"><input type="hidden" name="slug" value={slug}/><label className="text-sm font-medium">Evaluación<select name="assessment_id" required className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5">{assessments.map(item=><option key={item.id} value={item.id}>{item.title} · {divisionNames.get(item.division_id) ?? "División"}</option>)}</select></label><label className="text-sm font-medium">Planilla Excel o CSV<input type="file" name="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" required className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></label><button className="rounded-lg bg-indigo-700 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-800">Importar notas</button></form><p className="mt-2 text-xs text-slate-400">Columnas requeridas: matricula, nota y observacion (opcional) · Máximo 500 alumnos y 5 MB.</p></section> : null}

        <section className="space-y-4">
          <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Evaluaciones registradas</h2><span className="text-xs text-slate-500">{gradePanels.length} visibles · máximo 50</span></div>
          {gradePanels.length ? gradePanels.map(({ assessment, students, grades, events }) => {
            const periodStatus = periodStatuses.get(assessment.grading_period_id) ?? "open";
            const isEditable = canManageGrades && periodStatus === "open";
            const formId = `grade-form-${assessment.id}`;
            return (
            <article key={assessment.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><h3 className="font-semibold">{assessment.title}</h3>
                    <p className="mt-1 text-sm text-slate-500">{divisionNames.get(assessment.division_id) ?? "División"} · {subjectNames.get(courseSubjects.find((item) => item.id === assessment.course_subject_id)?.subject_id ?? "") ?? "Materia"} · {periodNames.get(assessment.grading_period_id) ?? "Período"}</p>
                    {assessment.description && <p className="mt-2 text-sm text-slate-600">{assessment.description}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">Máximo: {assessment.max_score}</span>
                  <GradebookExcel
                    institution={institution.display_name}
                    assessment={assessment.title}
                    division={divisionNames.get(assessment.division_id) ?? "División"}
                    subject={subjectNames.get(courseSubjects.find((item) => item.id === assessment.course_subject_id)?.subject_id ?? "") ?? "Materia"}
                    period={periodNames.get(assessment.grading_period_id) ?? "Período"}
                    assessmentDate={assessment.assessment_date}
                    maxScore={Number(assessment.max_score)}
                    weightPercent={assessment.weight_percent}
                    rows={students.map((student) => {
                      const grade = grades.get(student.id);
                      const periodResult = finalGrades.get([assessment.division_id,assessment.course_subject_id,assessment.grading_period_id,student.id].join(":"));
                      return {
                        studentName: `${student.last_name}, ${student.first_name}`,
                        studentNumber: student.student_number,
                        score: grade?.score === null || grade?.score === undefined ? null : Number(grade.score),
                        comment: grade?.comment ?? null,
                        periodResult: periodResult === null || periodResult === undefined ? null : periodResult,
                      };
                    })}
                  />
                  {isEditable && <form action={saveAssessmentWeight} className="flex items-center gap-2"><input type="hidden" name="slug" value={slug} /><input type="hidden" name="assessment_id" value={assessment.id} /><label className="text-xs text-slate-500">Ponderación % <input aria-label="Ponderación porcentual" name="weight_percent" type="number" min="0.01" max="100" step="0.01" defaultValue={assessment.weight_percent ?? ""} placeholder="Sin ponderar" className="ml-1 w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800" /></label><button className="rounded-md border border-violet-200 px-2 py-1.5 text-xs font-semibold text-violet-700">Guardar</button></form>}</div>
                </div>
              </div>
              {students.length ? (
                <div className="space-y-3 p-5">
                  {isEditable && <form id={formId} action={saveGrades}>
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="assessment_id" value={assessment.id} />
                  </form>}
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px] text-left text-sm">
                      <thead className="text-xs uppercase tracking-wide text-slate-500"><tr>
                        <th className="pb-3 pr-3">Alumno</th><th className="w-36 pb-3 pr-3">Nota / {assessment.max_score}</th><th className="pb-3 pr-3">Nota final del período</th><th className="pb-3">Observación</th>
                      </tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {students.map((student) => {
                          const grade = grades.get(student.id);
                          return <tr key={student.id}>
                            <td className="py-3 pr-3"><span className="font-medium">{student.last_name}, {student.first_name}</span>{student.student_number && <span className="ml-2 text-xs text-slate-400">#{student.student_number}</span>}<input type="hidden" form={formId} name="student_id" value={student.id} /></td>
                            <td className="py-3 pr-3"><input aria-label={`Nota de ${student.first_name} ${student.last_name}`} name={`score_${student.id}`} form={formId} type="number" min="0" max={assessment.max_score} step="0.01" readOnly={!isEditable} defaultValue={grade?.score ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2" /></td>
                            <td className="py-3 pr-3"><span className="inline-flex rounded-lg bg-indigo-50 px-3 py-2 text-sm font-bold text-indigo-800">{(() => { const value = finalGrades.get([assessment.division_id,assessment.course_subject_id,assessment.grading_period_id,student.id].join(":")); return value === null || value === undefined ? "Pendiente" : `${numberLabel(value)} %`; })()}</span></td>
                            <td className="py-3"><input aria-label={`Observación de ${student.first_name} ${student.last_name}`} name={`comment_${student.id}`} form={formId} maxLength={1000} readOnly={!isEditable} defaultValue={grade?.comment ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2" /></td>
                          </tr>;
                        })}
                      </tbody>
                    </table>
                  </div>
                  {isEditable && <label className="block text-sm font-medium text-slate-700">
                    Motivo de corrección (obligatorio si modificás una nota existente)
                    <textarea form={formId} name="change_reason" minLength={10} maxLength={500} rows={2} placeholder="Explicá brevemente por qué se modifica una calificación ya registrada." className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
                  </label>}
                  {isEditable
                    ? <button form={formId} type="submit" className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800"><Save size={16} /> Guardar calificaciones</button>
                    : <p className="text-xs text-slate-500">{periodStatus === "closed" ? "Período cerrado. Las calificaciones quedan en modo de consulta; una reapertura administrativa requiere motivo y queda auditada." : "Vista de consulta. No podés modificar estas calificaciones."}</p>}
                </div>
              ) : <p className="p-5 text-sm text-slate-500">No hay alumnos matriculados activos visibles en esta división.</p>}
              {events.length > 0 && <details className="border-t border-slate-100 px-5 py-3">
                <summary className="cursor-pointer text-sm font-semibold text-slate-700">Historial de cambios de calificaciones · {events.length} registros recientes</summary>
                <GradeAuditPdf institution={institution.display_name} assessment={assessment.title} division={divisionNames.get(assessment.division_id) ?? "División"} period={periodNames.get(assessment.grading_period_id) ?? "Período"} events={events.map((event) => ({ ...event, student: (() => { const item = students.find((student) => student.id === event.student_id); return item ? `${item.last_name}, ${item.first_name}` : "Alumno"; })() }))} />
                <ol className="mt-3 space-y-3">
                  {events.map((event) => {
                    const student = students.find((item) => item.id === event.student_id);
                    const actionLabel = event.action === "created" ? "Carga inicial" : event.action === "cleared" ? "Nota anulada" : "Nota modificada";
                    return <li key={event.id} className="border-l-2 border-violet-200 pl-3 text-xs text-slate-600">
                      <p className="font-semibold text-slate-800">{actionLabel} · {student ? `${student.last_name}, ${student.first_name}` : "Alumno"}</p>
                      <p className="mt-0.5">{event.old_score === null ? "—" : numberLabel(Number(event.old_score))} → {event.new_score === null ? "—" : numberLabel(Number(event.new_score))} · {new Intl.DateTimeFormat("es-AR",{dateStyle:"medium",timeStyle:"short"}).format(new Date(event.created_at))}</p>
                      {event.change_reason && <p className="mt-1 whitespace-pre-wrap">Motivo: {event.change_reason}</p>}
                    </li>;
                  })}
                </ol>
                <p className="mt-3 text-[11px] text-slate-500">Historial de auditoría de solo lectura. Los registros no se pueden editar ni eliminar desde la plataforma.</p>
              </details>}
            </article>
            );
          }) : <div className="rounded-2xl border border-slate-200 bg-white px-5 py-14 text-center text-sm text-slate-500">Todavía no hay evaluaciones visibles para tu perfil.</div>}
        </section>
      </div>
    </main>
  );
}
