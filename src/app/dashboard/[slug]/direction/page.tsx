import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpen, BookOpenCheck, CalendarCheck, ClipboardList, FileText, GraduationCap, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";

type Division = {id:string;name:string;course_id:string};
type Course = {id:string;name:string};
type Session = {id:string;division_id:string;held_on:string;period_label:string|null;status:string};

function Metric({label,value,detail,icon:Icon}:{label:string;value:number|string;detail:string;icon:typeof Users}) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-slate-500">{label}</p><span className="rounded-xl bg-violet-50 p-2 text-violet-700"><Icon size={19}/></span></div>
    <p className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{value}</p>
    <p className="mt-1 text-xs text-slate-500">{detail}</p>
  </div>;
}

export default async function DirectorDashboard({params}:{params:Promise<{slug:string}>}) {
  const {slug}=await params;
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect("/login");
  const {data:institution}=await supabase.from("institutions")
    .select("id,display_name").eq("slug",slug).eq("status","active").maybeSingle();
  if(!institution) redirect("/dashboard");
  const {data:membership}=await supabase.from("memberships")
    .select("id").eq("institution_id",institution.id).eq("user_id",user.id)
    .eq("status","active").maybeSingle();
  if(!membership) redirect("/dashboard");
  const {data:roleRows,error:roleError}=await supabase.from("membership_roles")
    .select("roles(key)").eq("membership_id",membership.id).eq("institution_id",institution.id);
  if(roleError) redirect(`/dashboard/${slug}`);
  const roleKeys=(roleRows ?? []).map(row=>row.roles?.key);
  if(!roleKeys.some(role=>role==="director" || role==="institution_admin")) redirect(`/dashboard/${slug}`);
  const permissions=await getMembershipPermissions(supabase,membership.id);
  if(!permissions.has("reports.read") || !permissions.has("students.read") ||
     !permissions.has("attendance.read") || !permissions.has("grades.read")) redirect(`/dashboard/${slug}`);

  const since=new Date();
  since.setDate(since.getDate()-30);
  const sinceDate=since.toISOString().slice(0,10);

  const [
    students,enrollments,courses,divisions,sessions,absences,assessments,gradeRecords,recentSessions,
  ]=await Promise.all([
    supabase.from("students").select("id",{count:"exact",head:true}).eq("institution_id",institution.id).eq("status","active"),
    supabase.from("enrollments").select("id",{count:"exact",head:true}).eq("institution_id",institution.id).eq("status","active"),
    supabase.from("courses").select("id",{count:"exact",head:true}).eq("institution_id",institution.id),
    supabase.from("divisions").select("id",{count:"exact",head:true}).eq("institution_id",institution.id),
    supabase.from("attendance_sessions").select("id",{count:"exact",head:true}).eq("institution_id",institution.id).gte("held_on",sinceDate),
    supabase.from("attendance_records").select("id",{count:"exact",head:true}).eq("institution_id",institution.id).eq("status","absent"),
    supabase.from("assessments").select("id",{count:"exact",head:true}).eq("institution_id",institution.id),
    supabase.from("grade_records").select("id",{count:"exact",head:true}).eq("institution_id",institution.id),
    supabase.from("attendance_sessions").select("id,division_id,held_on,period_label,status")
      .eq("institution_id",institution.id).order("held_on",{ascending:false}).limit(8),
  ]);
  const failures=[students,enrollments,courses,divisions,sessions,absences,assessments,gradeRecords,recentSessions].filter(result=>result.error);
  if(failures.length) throw new Error("No se pudieron cargar todos los indicadores institucionales. Revisá los permisos de lectura del perfil directivo.");

  const recentRows=(recentSessions.data ?? []) as Session[];
  const divisionIds=[...new Set(recentRows.map(row=>row.division_id))];
  const {data:divisionRows}=divisionIds.length
    ? await supabase.from("divisions").select("id,name,course_id").eq("institution_id",institution.id).in("id",divisionIds)
    : {data:[] as Division[]};
  const courseIds=[...new Set((divisionRows ?? []).map(row=>row.course_id))];
  const {data:courseRows}=courseIds.length
    ? await supabase.from("courses").select("id,name").eq("institution_id",institution.id).in("id",courseIds)
    : {data:[] as Course[]};
  const divisionNames=new Map((divisionRows ?? []).map(row=>[row.id,row.name]));
  const courseNames=new Map((courseRows ?? []).map(row=>[row.id,row.name]));
  const sessionStatus:Record<string,string>={open:"Abierta",submitted:"Presentada",locked:"Cerrada"};


  // Seguimiento agregado por división: consulta de solo lectura sobre los registros existentes.
  const [{ data: allDivisions }, { data: periodsForBoard }, { data: activeEnrollments }] = await Promise.all([
    supabase.from("divisions").select("id,name,course_id").eq("institution_id", institution.id).order("name"),
    supabase.from("grading_periods").select("id,name,starts_on,ends_on,status")
      .eq("institution_id", institution.id).order("starts_on", { ascending: false }).limit(1),
    supabase.from("enrollments").select("division_id,student_id")
      .eq("institution_id", institution.id).eq("status", "active"),
  ]);
  const boardDivisions = (allDivisions ?? []) as Division[];
  const boardDivisionIds = boardDivisions.map((row) => row.id);
  const boardCourseIds = [...new Set(boardDivisions.map((row) => row.course_id))];
  const [{ data: boardCourses }, { data: attendanceSessions }] = await Promise.all([
    boardCourseIds.length
      ? supabase.from("courses").select("id,name").eq("institution_id", institution.id).in("id", boardCourseIds)
      : Promise.resolve({ data: [] as Course[] }),
    supabase.from("attendance_sessions").select("id,division_id,held_on")
      .eq("institution_id", institution.id).gte("held_on", sinceDate)
      .order("held_on", { ascending: false }).limit(2000),
  ]);
  const boardCourseNames = new Map((boardCourses ?? []).map((row) => [row.id, row.name]));
  const boardDivisionNames = new Map(boardDivisions.map((row) => [
    row.id, `${boardCourseNames.get(row.course_id) ?? "Curso"} · ${row.name}`,
  ]));
  const enrollmentCounts = new Map<string, number>();
  for (const row of activeEnrollments ?? []) enrollmentCounts.set(row.division_id, (enrollmentCounts.get(row.division_id) ?? 0) + 1);

  const boardSessionRows = attendanceSessions ?? [];
  const boardSessionIds = boardSessionRows.map((row) => row.id);
  const attendanceCounts = new Map<string, { present: number; absent: number; late: number; justified: number; early_departure: number }>();
  if (boardSessionIds.length) {
    for (let offset = 0; offset < boardSessionIds.length; offset += 500) {
      const batch = boardSessionIds.slice(offset, offset + 500);
      const { data: boardRecords } = await supabase.from("attendance_records")
        .select("session_id,status").eq("institution_id", institution.id).in("session_id", batch).limit(10000);
      const sessionDivision = new Map(boardSessionRows.map((row) => [row.id, row.division_id]));
      for (const record of boardRecords ?? []) {
        const divisionId = sessionDivision.get(record.session_id);
        if (!divisionId || !["present", "absent", "late", "justified", "early_departure"].includes(record.status)) continue;
        const counts = attendanceCounts.get(divisionId) ?? { present: 0, absent: 0, late: 0, justified: 0, early_departure: 0 };
        counts[record.status as keyof typeof counts] += 1;
        attendanceCounts.set(divisionId, counts);
      }
    }
  }

  const currentBoardPeriod = periodsForBoard?.[0] ?? null;
  let gradeSummary = new Map<string, { subject: string; total: number; count: number }>();
  let conductSummary = new Map<string, { muy_satisfactorio: number; satisfactorio: number; en_proceso: number; requiere_acompanamiento: number }>();
  let conductAvailable = permissions.has("prefect_conduct.manage");
  if (currentBoardPeriod) {
    const { data: boardAssessments } = await supabase.from("assessments")
      .select("id,division_id,course_subject_id,max_score")
      .eq("institution_id", institution.id).eq("grading_period_id", currentBoardPeriod.id)
      .limit(3000);
    const assessmentRows = boardAssessments ?? [];
    const assessmentIds = assessmentRows.map((row) => row.id);
    const courseSubjectIds = [...new Set(assessmentRows.map((row) => row.course_subject_id))];
    const [{ data: boardGrades }, { data: boardCourseSubjects }] = await Promise.all([
      assessmentIds.length
        ? supabase.from("grade_records").select("assessment_id,score")
            .eq("institution_id", institution.id).in("assessment_id", assessmentIds).limit(20000)
        : Promise.resolve({ data: [] as { assessment_id: string; score: number | null }[] }),
      courseSubjectIds.length
        ? supabase.from("course_subjects").select("id,subject_id")
            .eq("institution_id", institution.id).in("id", courseSubjectIds)
        : Promise.resolve({ data: [] as { id: string; subject_id: string }[] }),
    ]);
    const subjectIds = [...new Set((boardCourseSubjects ?? []).map((row) => row.subject_id))];
    const { data: boardSubjects } = subjectIds.length
      ? await supabase.from("subjects").select("id,name").eq("institution_id", institution.id).in("id", subjectIds)
      : { data: [] as { id: string; name: string }[] };
    const subjectNamesById = new Map((boardSubjects ?? []).map((row) => [row.id, row.name]));
    const subjectByCourseSubject = new Map((boardCourseSubjects ?? []).map((row) => [row.id, subjectNamesById.get(row.subject_id) ?? "Materia"]));
    const assessmentById = new Map(assessmentRows.map((row) => [row.id, row]));
    for (const grade of boardGrades ?? []) {
      if (grade.score === null) continue;
      const assessment = assessmentById.get(grade.assessment_id);
      if (!assessment || Number(assessment.max_score) <= 0) continue;
      const subject = subjectByCourseSubject.get(assessment.course_subject_id) ?? "Materia";
      const key = `${assessment.division_id}:${subject}`;
      const summary = gradeSummary.get(key) ?? { subject, total: 0, count: 0 };
      summary.total += (Number(grade.score) / Number(assessment.max_score)) * 100;
      summary.count += 1;
      gradeSummary.set(key, summary);
    }
    if (conductAvailable) {
      const { data: conductRows, error: conductError } = await supabase.from("prefect_conduct_concepts")
        .select("division_id,student_id,concept,updated_at")
        .eq("institution_id", institution.id).eq("grading_period_id", currentBoardPeriod.id)
        .order("updated_at", { ascending: false }).limit(10000);
      if (conductError) conductAvailable = false;
      else {
        const latestConduct = new Map<string, string>();
        for (const row of conductRows ?? []) {
          const key = `${row.division_id}:${row.student_id}`;
          if (!latestConduct.has(key)) latestConduct.set(key, row.concept);
        }
        for (const [key, concept] of latestConduct) {
          const divisionId = key.split(":")[0];
          if (!["muy_satisfactorio", "satisfactorio", "en_proceso", "requiere_acompanamiento"].includes(concept)) continue;
          const counts = conductSummary.get(divisionId) ?? { muy_satisfactorio: 0, satisfactorio: 0, en_proceso: 0, requiere_acompanamiento: 0 };
          counts[concept as keyof typeof counts] += 1;
          conductSummary.set(divisionId, counts);
        }
      }
    }
  }
  const attendanceLabel = (divisionId: string) => {
    const counts = attendanceCounts.get(divisionId);
    if (!counts) return "Sin registros";
    const total = counts.present + counts.absent + counts.late + counts.justified + counts.early_departure;
    const denominator = total - counts.justified;
    return denominator ? `${Math.round(((counts.present + counts.late + counts.early_departure) / denominator) * 100)}% de asistencia` : "Sin registros";
  };
  const gradeByDivision = new Map<string, { total: number; count: number }>();
  for (const [key, summary] of gradeSummary) {
    const divisionId = key.slice(0, key.indexOf(":"));
    const aggregate = gradeByDivision.get(divisionId) ?? { total: 0, count: 0 };
    aggregate.total += summary.total;
    aggregate.count += summary.count;
    gradeByDivision.set(divisionId, aggregate);
  }

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
    <div className="mx-auto max-w-7xl space-y-6">
      <Link href={`/dashboard/${slug}`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700"><ArrowLeft size={16}/> Volver al espacio institucional</Link>
      <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white shadow-sm">
        <span className="text-xs font-semibold tracking-widest text-indigo-100">SEGUIMIENTO Y SUPERVISIÓN</span>
        <h1 className="mt-3 text-3xl font-bold">Panel directivo</h1>
        <p className="mt-2 text-sm text-indigo-100">{institution.display_name} · Indicadores generales de actividad académica e institucional.</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Alumnos activos" value={students.count ?? 0} detail="Legajos activos en la institución" icon={GraduationCap}/>
        <Metric label="Matrículas activas" value={enrollments.count ?? 0} detail="Inscripciones vigentes" icon={Users}/>
        <Metric label="Cursos y divisiones" value={`${courses.count ?? 0} / ${divisions.count ?? 0}`} detail="Estructura académica" icon={BookOpen}/>
        <Metric label="Sesiones de asistencia" value={sessions.count ?? 0} detail="Últimos 30 días" icon={CalendarCheck}/>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Ausencias registradas</p>
          <p className="mt-2 text-3xl font-bold">{absences.count ?? 0}</p>
          <p className="mt-1 text-xs text-slate-500">Total histórico de registros de inasistencia disponibles para supervisión.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Actividad de evaluación</p>
          <p className="mt-2 text-3xl font-bold">{assessments.count ?? 0}</p>
          <p className="mt-1 text-xs text-slate-500">{gradeRecords.count ?? 0} calificaciones registradas en evaluaciones.</p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold">Últimas sesiones de asistencia</h2><p className="mt-1 text-xs text-slate-500">Actividad reciente registrada por curso y división.</p></div>
        {recentRows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Fecha</th><th className="px-5 py-3">Curso / división</th><th className="px-5 py-3">Turno</th><th className="px-5 py-3">Estado</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{recentRows.map(row=><tr key={row.id}>
            <td className="px-5 py-3">{new Date(`${row.held_on}T12:00:00`).toLocaleDateString("es-AR")}</td>
            <td className="px-5 py-3 font-medium">{courseNames.get(divisionRows?.find(d=>d.id===row.division_id)?.course_id ?? "") ?? "Curso"} · {divisionNames.get(row.division_id) ?? "División"}</td>
            <td className="px-5 py-3 text-slate-600">{row.period_label || "—"}</td>
            <td className="px-5 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold">{sessionStatus[row.status] ?? row.status}</span></td>
          </tr>)}</tbody>
        </table></div> : <p className="p-8 text-center text-sm text-slate-500">Todavía no hay sesiones de asistencia registradas.</p>}
      </section>


      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">Visión académica e institucional</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">Seguimiento por división</h2>
            <p className="mt-1 text-sm text-slate-500">Indicadores agregados de los últimos 30 días y del período académico más reciente.</p>
          </div>
          <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">{currentBoardPeriod?.name ?? "Sin período académico"}</span>
        </div>
        {boardDivisions.length ? <div className="grid gap-4 lg:grid-cols-2">
          {boardDivisions.map((division) => {
            const attendance = attendanceCounts.get(division.id);
            const grade = gradeByDivision.get(division.id);
            const conduct = conductSummary.get(division.id);
            const attendanceTotal = attendance ? attendance.present + attendance.absent + attendance.late + attendance.justified + attendance.early_departure : 0;
            const gradeAverage = grade?.count ? grade.total / grade.count : null;
            const conductTotal = conduct ? conduct.muy_satisfactorio + conduct.satisfactorio + conduct.en_proceso + conduct.requiere_acompanamiento : 0;
            return <article key={division.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-slate-900">{boardDivisionNames.get(division.id)}</h3>
                <span className="text-xs text-slate-500">{enrollmentCounts.get(division.id) ?? 0} alumnos activos</span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-[11px] font-semibold uppercase text-slate-500">Asistencia</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{attendanceLabel(division.id)}</p>
                  <p className="text-[11px] text-slate-500">{attendanceTotal} registros · 30 días</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-[11px] font-semibold uppercase text-slate-500">Rendimiento</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{gradeAverage === null ? "—" : `${numberLabel(gradeAverage)}%`}</p>
                  <p className="text-[11px] text-slate-500">{grade?.count ?? 0} notas · {currentBoardPeriod?.name ?? "sin período"}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-[11px] font-semibold uppercase text-slate-500">Conducta</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">{conductTotal || "—"}</p>
                  <p className="text-[11px] text-slate-500">{conductAvailable ? "Conceptos vigentes" : "Sin permiso de consulta"}</p>
                </div>
              </div>
              {conductAvailable && conductTotal > 0 && <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800">Muy satisfactorio: {conduct?.muy_satisfactorio ?? 0}</span>
                <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-800">Satisfactorio: {conduct?.satisfactorio ?? 0}</span>
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">En proceso: {conduct?.en_proceso ?? 0}</span>
                <span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-800">Acompañamiento: {conduct?.requiere_acompanamiento ?? 0}</span>
              </div>}
              <div className="mt-3 flex flex-wrap gap-3 border-t border-slate-100 pt-3 text-xs font-semibold">
                <Link href={`/dashboard/${slug}/attendance/reports?division=${division.id}`} className="text-violet-700 hover:underline">Ver asistencia</Link>
                <Link href={`/dashboard/${slug}/grades`} className="text-violet-700 hover:underline">Ver calificaciones</Link>
                {conductAvailable && <Link href={`/dashboard/${slug}/direction/conduct?division=${division.id}`} className="text-violet-700 hover:underline">Ver seguimiento conductual</Link>}
              </div>
            </article>;
          })}
        </div> : <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Todavía no hay divisiones configuradas.</p>}
        {gradeSummary.size > 0 && <div className="rounded-xl bg-slate-50 p-4">
          <h3 className="font-semibold text-slate-900">Rendimiento por materia</h3>
          <p className="mt-1 text-xs text-slate-500">Promedio simple de porcentajes de notas cargadas en el período más reciente; no representa un promedio ponderado ni una calificación final oficial.</p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {[...gradeSummary.entries()].map(([key, item]) => {
              const divisionId = key.slice(0, key.indexOf(":"));
              return <div key={key} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                <span className="min-w-0"><strong>{boardDivisionNames.get(divisionId) ?? "División"}</strong><span className="block text-xs text-slate-500">{item.subject} · {item.count} notas</span></span>
                <strong className="whitespace-nowrap">{numberLabel(item.total / item.count)}%</strong>
              </div>;
            })}
          </div>
        </div>}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link href={`/dashboard/${slug}/students`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 font-semibold text-slate-700 hover:border-violet-300"><GraduationCap className="text-violet-700"/> Alumnos</Link>
        <Link href={`/dashboard/${slug}/attendance`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 font-semibold text-slate-700 hover:border-violet-300"><CalendarCheck className="text-violet-700"/> Asistencia</Link>
        <Link href={`/dashboard/${slug}/grades`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 font-semibold text-slate-700 hover:border-violet-300"><ClipboardList className="text-violet-700"/> Calificaciones</Link>
        <Link href={`/dashboard/${slug}/report-cards`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 font-semibold text-slate-700 hover:border-violet-300"><FileText className="text-violet-700"/> Boletines</Link>\n        <Link href={`/dashboard/${slug}/direction/conduct`} className="flex items-center gap-3 rounded-xl border border-violet-200 bg-white p-4 font-semibold text-slate-700 hover:border-violet-300"><BookOpenCheck className="text-violet-700"/> Informe conductual</Link>
      </section>
      <p className="text-xs leading-relaxed text-slate-500">Los indicadores se calculan con los registros disponibles y los permisos efectivos de tu perfil. Este panel es de consulta: no modifica asistencia ni calificaciones.</p>
    </div>
  </main>;
}
