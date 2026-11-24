import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarClock, CheckCircle2, ClipboardList, Clock3 } from "lucide-react";
import StudentTaskList from "./student-task-list";
import { createClient } from "@/lib/supabase/server";

type Classroom = { id: string; title: string; course_name: string; division_name: string; subject_name: string | null };
type Assignment = { id: string; title: string; instructions: string | null; due_at: string | null; max_score: number | null };
type Submission = { assignment_id: string; submitted_at: string | null; review_status?: "visto" | "aprobado" | "desaprobado" | "corregir" | null; score: number | null; feedback: string | null };
type TaskItem = { assignment: Assignment; classroom: Classroom; submission: Submission | null; submissionLoadError: boolean };

function statusFor(task: TaskItem, now: number) {
  if (task.submissionLoadError) return { label: "Estado no disponible", style: "bg-slate-100 text-slate-700", icon: Clock3 };
  const submission = task.submission;
  if (submission?.review_status === "aprobado") return { label: "Aprobada", style: "bg-emerald-100 text-emerald-800", icon: CheckCircle2 };
  if (submission?.review_status === "desaprobado") return { label: "No aprobada", style: "bg-rose-100 text-rose-800", icon: ClipboardList };
  if (submission?.review_status === "corregir") return { label: "Requiere corrección", style: "bg-amber-100 text-amber-900", icon: ClipboardList };
  if (submission?.score !== null && submission?.score !== undefined) return { label: "Corregida", style: "bg-emerald-100 text-emerald-800", icon: CheckCircle2 };
  if (submission?.review_status === "visto") return { label: "Vista por el docente", style: "bg-sky-100 text-sky-800", icon: Clock3 };
  if (submission) return { label: "Entregada · En revisión", style: "bg-indigo-100 text-indigo-800", icon: Clock3 };
  if (task.assignment.due_at && Date.parse(task.assignment.due_at) < now) return { label: "Vencida · Sin entregar", style: "bg-rose-100 text-rose-800", icon: CalendarClock };
  return { label: "Pendiente de entrega", style: "bg-amber-100 text-amber-900", icon: CalendarClock };
}

function dateLabel(value: string | null) {
  if (!value) return "Sin fecha límite";
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function StudentTasksPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: institution } = await supabase.from("institutions").select("id,display_name").eq("slug", slug).maybeSingle();
  if (!institution) redirect("/dashboard");
  const { data: membership } = await supabase.from("memberships").select("id")
    .eq("institution_id", institution.id).eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership) redirect("/dashboard");
  const { data: roleRows } = await supabase.from("membership_roles").select("roles(key)").eq("membership_id", membership.id);
  if (!(roleRows ?? []).some((row) => row.roles?.key === "student")) redirect("/dashboard/" + slug);

  const { data: classroomRows, error: classroomsError } = await supabase.rpc("list_accessible_classrooms", { p_institution_id: institution.id });
  const classrooms = (classroomRows ?? []) as Classroom[];
  const now = new Date().getTime();
  const results = await Promise.all(classrooms.map(async (classroom) => {
    const [overviewResult, submissionsResult] = await Promise.all([
      supabase.rpc("get_classroom_overview", { p_classroom_id: classroom.id }),
      supabase.rpc("list_classroom_submissions", { p_classroom_id: classroom.id }),
    ]);
    if (overviewResult.error || !overviewResult.data) return { error: true, tasks: [] as TaskItem[] };
    const overview = overviewResult.data as { assignments?: Assignment[] };
    const submissions = (submissionsResult.data ?? []) as Submission[];
    return { error: Boolean(submissionsResult.error), tasks: (overview.assignments ?? []).map((assignment) => ({
      assignment, classroom,
      submission: submissionsResult.error ? null : submissions.find((item) => item.assignment_id === assignment.id) ?? null,
      submissionLoadError: Boolean(submissionsResult.error),
    })) };
  }));
  const tasks = results.flatMap((result) => result.tasks);
  const hasPartialError = Boolean(classroomsError) || results.some((result) => result.error);
  const knownTasks = tasks.filter((task) => !task.submissionLoadError);
  const overdueCount = knownTasks.filter((task) => !task.submission && task.assignment.due_at && Date.parse(task.assignment.due_at) < now).length;
  const pendingCount = knownTasks.filter((task) => !task.submission && (!task.assignment.due_at || Date.parse(task.assignment.due_at) >= now)).length;
  const submittedCount = knownTasks.filter((task) => Boolean(task.submission)).length;
  const unknownStatusCount = tasks.length - knownTasks.length;
  tasks.sort((a, b) => (a.assignment.due_at ? Date.parse(a.assignment.due_at) : Number.MAX_SAFE_INTEGER) -
    (b.assignment.due_at ? Date.parse(b.assignment.due_at) : Number.MAX_SAFE_INTEGER));

  return (
    <main className="student-subpage min-h-screen bg-[#f6f7f4 px-4 py-6 pb-12 text-slate-800 sm:px-7 sm:py-8">
      <div className="student-subpage-content mx-auto max-w-5xl space-y-6">
        <Link href={"/dashboard/" + slug + "/student"} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-emerald-800"><ArrowLeft size={16}/> Volver a mi espacio</Link>
        <header className="student-subpage-hero rounded-3xl bg-gradient-to-br from-[#174b3d] via-[#22634d] to-[#4b8064] p-6 text-white shadow-lg sm:p-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-bold tracking-[.14em] text-emerald-50"><ClipboardList size={14}/> ORGANIZACIÓN ESCOLAR</span>
          <h1 className="mt-4 text-3xl font-black tracking-tight">Mis tareas</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50">Revisá las actividades de tus aulas, las fechas de entrega y las devoluciones de tus docentes.</p>
          <p className="mt-2 text-xs text-white/75">{institution.display_name}</p>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:max-w-xl sm:grid-cols-3">
            <div className="rounded-2xl border border-white/15 bg-white/10 p-3"><p className="text-xs text-emerald-50">Por entregar</p><p className="mt-1 text-2xl font-black">{pendingCount}</p></div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-3"><p className="text-xs text-emerald-50">Vencidas</p><p className="mt-1 text-2xl font-black">{overdueCount}</p></div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-3"><p className="text-xs text-emerald-50">Entregadas</p><p className="mt-1 text-2xl font-black">{submittedCount}</p></div>
          </div>
          {unknownStatusCount > 0 ? <p className="mt-3 text-xs text-white/80">{unknownStatusCount} actividades con estado pendiente de consulta.</p> : null}
        </header>
        {hasPartialError ? <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Algunas actividades no pudieron cargarse. La información disponible se muestra sin habilitar accesos alternativos.</div> : null}
        <StudentTaskList slug={slug} items={tasks.map((task) => {
          const status = statusFor(task, now);
          const submission = task.submission;
          const statusKind: "pending" | "overdue" | "submitted" | "review" | "unknown" =
            task.submissionLoadError ? "unknown" :
            submission?.review_status === "aprobado" || submission?.review_status === "desaprobado" ||
            submission?.review_status === "corregir" || (submission?.score !== null && submission?.score !== undefined) ? "review" :
            submission ? "submitted" :
            task.assignment.due_at && Date.parse(task.assignment.due_at) < now ? "overdue" : "pending";
          return {
            id: task.assignment.id, title: task.assignment.title, instructions: task.assignment.instructions,
            dueLabel: dateLabel(task.assignment.due_at), classroomId: task.classroom.id,
            classroomName: `${task.classroom.course_name} · ${task.classroom.division_name}`,
            subjectName: task.classroom.subject_name ?? "Aula general", status: status.label,
            statusStyle: status.style, statusKind,
            submittedLabel: submission?.submitted_at ? dateLabel(submission.submitted_at) : null,
            score: task.submissionLoadError ? null : submission?.score ?? null,
            feedback: task.submissionLoadError ? null : submission?.feedback ?? null,
          };
        })} />
      </div>
    </main>
  );
}
