import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ClipboardList, AlertCircle, CheckCircle2, Clock3, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";

type Classroom = { id: string; title: string; course_name: string; division_name: string; subject_name: string | null };
type Assignment = { id: string; title: string; due_at: string | null; max_score: number | null; published_at: string | null };
type RosterRow = {
  assignment_id: string; student_id: string; student_first_name: string; student_last_name: string;
  student_number: string | null; submission_id: string | null; submitted: boolean;
  submitted_at: string | null; review_status: "visto" | "aprobado" | "desaprobado" | "corregir" | null;
  score: number | null;
};
type StudentProgress = {
  id: string; firstName: string; lastName: string; studentNumber: string | null;
  total: number; submitted: number; missing: string[]; corrections: string[];
  awaitingReview: number; graded: number; failedReview: number; percentageScores: number[];
};
type Filter = "all" | "pending" | "correction" | "complete";

function dateLabel(value: string | null) {
  if (!value) return "Sin vencimiento";
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(value));
}

export default async function ClassroomFollowUpPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ classroom?: string; filter?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const filter: Filter = ["all", "pending", "correction", "complete"].includes(query.filter ?? "")
    ? query.filter as Filter : "all";
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
    supabase.from("membership_roles").select("roles(key)")
      .eq("membership_id", membership.id).eq("institution_id", institution.id),
  ]);
  const isTeacher = (roleRows.data ?? []).some((row) => row.roles?.key === "teacher");
  if (!isTeacher || !permissions.has("classroom.read")) redirect(`/dashboard/${slug}`);

  const { data: accessible, error: accessibleError } = await supabase.rpc("list_accessible_classrooms", {
    p_institution_id: institution.id,
  });
  const available: Classroom[] = [];
  let accessErrors = 0;
  for (const classroom of (accessible ?? []) as Classroom[]) {
    const { data: capability, error } = await supabase.rpc("get_classroom_capabilities", {
      p_classroom_id: classroom.id,
    });
    if (error) { accessErrors += 1; continue; }
    if ((capability as { can_grade?: boolean } | null)?.can_grade === true) available.push(classroom);
  }
  const selected = available.find((item) => item.id === query.classroom) ?? available[0] ?? null;

  let assignments: Assignment[] = [];
  let progress: StudentProgress[] = [];
  let dataError = Boolean(accessibleError);
  if (selected) {
    const [{ data: overview, error: overviewError }, { data: roster, error: rosterError }] = await Promise.all([
      supabase.rpc("get_classroom_overview", { p_classroom_id: selected.id }),
      supabase.rpc("list_classroom_assignment_roster", { p_classroom_id: selected.id }),
    ]);
    if (overviewError || rosterError || !overview) {
      dataError = true;
    } else {
      assignments = ((overview as { assignments?: Assignment[] }).assignments ?? [])
        .filter((item) => Boolean(item.published_at));
      const assignmentMap = new Map(assignments.map((item) => [item.id, item]));
      const byStudent = new Map<string, StudentProgress>();
      for (const row of (roster ?? []) as RosterRow[]) {
        const assignment = assignmentMap.get(row.assignment_id);
        if (!assignment) continue;
        let student = byStudent.get(row.student_id);
        if (!student) {
          student = {
            id: row.student_id, firstName: row.student_first_name, lastName: row.student_last_name,
            studentNumber: row.student_number, total: 0, submitted: 0, missing: [], corrections: [],
            awaitingReview: 0, graded: 0, failedReview: 0, percentageScores: [],
          };
          byStudent.set(row.student_id, student);
        }
        student.total += 1;
        if (!row.submitted) {
          student.missing.push(assignment.title);
          continue;
        }
        student.submitted += 1;
        if (row.review_status === "corregir") {
          student.corrections.push(assignment.title);
        } else if (row.review_status === "desaprobado") {
          student.failedReview += 1;
        }
        if (row.score === null) {
          student.awaitingReview += 1;
        } else {
          student.graded += 1;
          if (assignment.max_score && assignment.max_score > 0) {
            student.percentageScores.push((Number(row.score) / Number(assignment.max_score)) * 100);
          }
        }
      }
      progress = [...byStudent.values()].sort((a, b) =>
        (b.missing.length + b.corrections.length) - (a.missing.length + a.corrections.length)
        || a.lastName.localeCompare(b.lastName, "es")
        || a.firstName.localeCompare(b.firstName, "es")
      );
    }
  }

  const summary = {
    students: progress.length,
    pending: progress.filter((item) => item.missing.length > 0).length,
    corrections: progress.filter((item) => item.corrections.length > 0 || item.failedReview > 0).length,
    complete: progress.filter((item) => item.missing.length === 0 && item.corrections.length === 0 && item.failedReview === 0 && item.awaitingReview === 0).length,
  };
  const visible = progress.filter((item) => {
    if (filter === "pending") return item.missing.length > 0;
    if (filter === "correction") return item.corrections.length > 0 || item.failedReview > 0;
    if (filter === "complete") return item.missing.length === 0 && item.corrections.length === 0 && item.failedReview === 0 && item.awaitingReview === 0;
    return true;
  });

  const filterItems: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "Todos", count: summary.students },
    { id: "pending", label: "Con actividades pendientes", count: summary.pending },
    { id: "correction", label: "Con trabajos observados", count: summary.corrections },
    { id: "complete", label: "Seguimiento al día", count: summary.complete },
  ];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <Link href={`/dashboard/${slug}/classroom`} className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-indigo-700"><ArrowLeft size={16}/> Volver a mis aulas</Link>
        <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white shadow-sm sm:p-9">
          <div className="flex items-center gap-3"><ClipboardList size={28}/><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-200">Seguimiento pedagógico</p><h1 className="text-3xl font-bold">Avance de actividades por alumno</h1></div></div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-indigo-100">Consultá en una sola vista qué estudiantes todavía tienen actividades sin entregar, cuáles requieren corrección y cómo avanza el trabajo del grupo.</p>
          <p className="mt-2 text-xs text-indigo-200">{institution.display_name}</p>
        </header>

        {accessibleError ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">No se pudo consultar el listado autorizado de aulas.</div> : null}
        {accessErrors > 0 ? <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Algunas aulas no pudieron verificarse. Solo se muestran las que devolvieron permisos de seguimiento.</div> : null}
        {available.length ? <form method="get" className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm font-semibold text-slate-700">Aula
            <select name="classroom" defaultValue={selected?.id ?? ""} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5">
              {available.map((item) => <option key={item.id} value={item.id}>{item.course_name} · {item.division_name} · {item.subject_name ?? item.title}</option>)}
            </select>
          </label>
          {filter !== "all" ? <input type="hidden" name="filter" value={filter}/> : null}
          <button className="rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800">Consultar aula</button>
        </form> : null}

        {dataError ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">No se pudo cargar el seguimiento completo de esta aula. No se utilizó una consulta alternativa.</div> : null}
        {!available.length ? <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><Users size={34} className="mx-auto text-slate-400"/><h2 className="mt-3 font-semibold text-slate-900">No hay aulas habilitadas para este seguimiento</h2><p className="mt-1 text-sm text-slate-500">Se requiere permiso de calificación y revisión de entregas en al menos un aula.</p></section> : !selected ? null : (
          <>
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">Aula seleccionada</p>
              <h2 className="mt-1 text-xl font-bold text-slate-900">{selected.course_name} · {selected.division_name}</h2>
              <p className="mt-1 text-sm text-slate-500">{selected.subject_name ?? selected.title} · {assignments.length} actividades publicadas</p>
            </section>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="flex items-center gap-2 text-sm text-slate-500"><Users size={16}/> Alumnos incluidos</p><p className="mt-2 text-3xl font-bold text-slate-900">{summary.students}</p></div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="flex items-center gap-2 text-sm text-amber-800"><Clock3 size={16}/> Con entregas pendientes</p><p className="mt-2 text-3xl font-bold text-amber-950">{summary.pending}</p></div>
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4"><p className="flex items-center gap-2 text-sm text-rose-800"><AlertCircle size={16}/> Requieren corrección</p><p className="mt-2 text-3xl font-bold text-rose-950">{summary.corrections}</p></div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><p className="flex items-center gap-2 text-sm text-emerald-800"><CheckCircle2 size={16}/> Seguimiento al día</p><p className="mt-2 text-3xl font-bold text-emerald-950">{summary.complete}</p></div>
            </section>
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap gap-2 border-b border-slate-100 p-4">
                {filterItems.map((item) => <Link key={item.id} href={`/dashboard/${slug}/classroom/follow-up?classroom=${selected.id}${item.id === "all" ? "" : `&filter=${item.id}`}`} aria-current={filter === item.id ? "page" : undefined} className={`rounded-xl px-3 py-2 text-xs font-semibold ${filter === item.id ? "bg-indigo-700 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{item.label} · {item.count}</Link>)}
              </div>
              {visible.length ? <div className="divide-y divide-slate-100">{visible.map((student) => {
                const average = student.percentageScores.length
                  ? Math.round(student.percentageScores.reduce((sum, value) => sum + value, 0) / student.percentageScores.length)
                  : null;
                return <article key={student.id} className="space-y-3 px-5 py-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div><h3 className="font-semibold text-slate-900">{student.lastName}, {student.firstName}</h3><p className="text-xs text-slate-500">{student.studentNumber ? `Legajo ${student.studentNumber}` : "Sin legajo"}</p></div>
                    <div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-700">{student.submitted}/{student.total} entregadas</span><span className="rounded-full bg-indigo-50 px-3 py-1.5 font-semibold text-indigo-800">{student.graded} calificadas</span>{student.awaitingReview ? <span className="rounded-full bg-amber-50 px-3 py-1.5 font-semibold text-amber-800">{student.awaitingReview} sin calificar</span> : null}{average !== null ? <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-700">Promedio de entregas calificadas: {average}%</span> : null}</div>
                  </div>
                  {student.missing.length ? <div className="rounded-xl bg-amber-50 p-3"><p className="text-xs font-bold text-amber-900">Actividades sin entregar</p><p className="mt-1 text-sm text-amber-900">{student.missing.join(" · ")}</p></div> : null}
                  {student.corrections.length ? <div className="rounded-xl bg-rose-50 p-3"><p className="text-xs font-bold text-rose-900">Actividades marcadas para corregir</p><p className="mt-1 text-sm text-rose-900">{student.corrections.join(" · ")}</p></div> : null}
                  {student.failedReview ? <p className="text-xs text-slate-500">{student.failedReview} trabajo(s) con revisión desaprobada.</p> : null}
                  <div className="flex flex-wrap gap-3 text-xs text-slate-500"><span>{student.total - student.submitted} pendientes de entrega</span><span>{student.submitted - student.graded} entregadas sin nota</span><Link href={`/dashboard/${slug}/classroom/${selected.id}?section=work`} className="font-semibold text-indigo-700 hover:text-indigo-900">Abrir aula y seguimiento de entregas</Link></div>
                </article>;
              })}</div> : <div className="px-6 py-12 text-center"><CheckCircle2 size={34} className="mx-auto text-emerald-600"/><h3 className="mt-3 font-semibold text-slate-900">No hay alumnos en este filtro</h3><p className="mt-1 text-sm text-slate-500">Probá con otro estado de seguimiento.</p></div>}
            </section>
            <p className="text-xs leading-5 text-slate-500">La matriz refleja exclusivamente actividades publicadas y estados persistidos de entregas. Las actividades sin publicar no se incluyen y la ausencia de entrega no constituye por sí sola una valoración del desempeño del alumno.</p>
          </>
        )}
      </div>
    </main>
  );
}
