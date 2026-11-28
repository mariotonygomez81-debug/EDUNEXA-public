import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpenCheck, ClipboardCheck, Clock3, GraduationCap, MessageSquareText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";

type Classroom = {
  id: string;
  title: string;
  division_name: string;
  course_name: string;
  subject_name: string | null;
};
type Assignment = { id: string; title: string; due_at: string | null; max_score: number | null };
type RosterRow = {
  assignment_id: string;
  student_id: string;
  student_first_name: string;
  student_last_name: string;
  student_number: string | null;
  submission_id: string | null;
  submitted: boolean;
  submitted_at: string | null;
  review_status: "visto" | "aprobado" | "desaprobado" | "corregir" | null;
  score: number | null;
};
type QueueItem = {
  classroom: Classroom;
  assignment: Assignment;
  row: RosterRow;
};

function dateTime(value: string | null) {
  if (!value) return "Fecha no registrada";
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function TeacherReviewQueuePage({ params }: { params: Promise<{ slug: string }> }) {
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

  const permissions = await getMembershipPermissions(supabase, membership.id);
  const { data: roleRows } = await supabase.from("membership_roles")
    .select("roles(key)").eq("membership_id", membership.id);
  const roles = (roleRows ?? []).map((row) => row.roles?.key);
  if (!permissions.has("classroom.read") || !roles.includes("teacher")) redirect(`/dashboard/${slug}`);

  const { data: classrooms, error: classroomsError } = await supabase.rpc(
    "list_accessible_classrooms", { p_institution_id: institution.id },
  );
  const queue: QueueItem[] = [];
  let classroomErrors = 0;

  for (const classroom of (classrooms ?? []) as Classroom[]) {
    const { data: capabilityData, error: capabilityError } = await supabase.rpc(
      "get_classroom_capabilities", { p_classroom_id: classroom.id },
    );
    if (capabilityError) {
      classroomErrors += 1;
      continue;
    }
    if ((capabilityData as { can_grade?: boolean } | null)?.can_grade !== true) continue;

    const [{ data: overviewData, error: overviewError }, { data: rosterData, error: rosterError }] = await Promise.all([
      supabase.rpc("get_classroom_overview", { p_classroom_id: classroom.id }),
      supabase.rpc("list_classroom_assignment_roster", { p_classroom_id: classroom.id }),
    ]);
    if (overviewError || rosterError || !overviewData) {
      classroomErrors += 1;
      continue;
    }

    const overview = overviewData as { assignments?: Assignment[] };
    const assignmentById = new Map((overview.assignments ?? []).map((assignment) => [assignment.id, assignment]));
    for (const row of (rosterData ?? []) as RosterRow[]) {
      if (!row.submitted || !row.submission_id) continue;
      const assignment = assignmentById.get(row.assignment_id);
      if (!assignment) continue;
      if (row.score !== null && row.review_status !== null && row.review_status !== "corregir") continue;
      queue.push({ classroom, assignment, row });
    }
  }

  queue.sort((a, b) => {
    const aDate = a.row.submitted_at ? new Date(a.row.submitted_at).getTime() : 0;
    const bDate = b.row.submitted_at ? new Date(b.row.submitted_at).getTime() : 0;
    return aDate - bDate;
  });

  const awaitingGrade = queue.filter((item) => item.row.score === null).length;
  const awaitingReview = queue.filter((item) => item.row.review_status === null || item.row.review_status === "corregir").length;
  const correctionCount = queue.filter((item) => item.row.review_status === "corregir").length;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <Link href={`/dashboard/${slug}/classroom`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-indigo-700">
          <ArrowLeft size={16} /> Volver a mis aulas
        </Link>

        <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white shadow-sm sm:p-9">
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-xl bg-white/10 p-3 text-indigo-100"><BookOpenCheck size={25} /></div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-200">Herramientas docentes</p>
              <h1 className="text-3xl font-bold tracking-tight">Entregas para corregir</h1>
            </div>
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-indigo-100">
            Una bandeja única con las entregas recibidas en tus aulas autorizadas para calificar. Abrí cada actividad para revisar el trabajo, actualizar su estado y enviar la devolución.
          </p>
          <p className="mt-3 text-xs text-indigo-200">{institution.display_name}</p>
        </header>

        {classroomsError ? (
          <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            No se pudo consultar el listado seguro de aulas. No se habilitó una lectura alternativa.
          </div>
        ) : null}
        {classroomErrors > 0 ? (
          <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Algunas aulas no pudieron consultarse; la bandeja muestra únicamente los resultados obtenidos mediante las consultas autorizadas.
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-3" aria-label="Resumen de correcciones pendientes">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500"><ClipboardCheck size={16} /> Entregas pendientes</div>
            <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{queue.length}</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-800"><Clock3 size={16} /> Sin calificación</div>
            <p className="mt-2 text-3xl font-bold tabular-nums text-amber-950">{awaitingGrade}</p>
          </div>
          <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-violet-800"><MessageSquareText size={16} /> Revisión pendiente / corregir</div>
            <p className="mt-2 text-3xl font-bold tabular-nums text-violet-950">{awaitingReview}</p>
            {correctionCount > 0 ? <p className="mt-1 text-xs text-violet-700">{correctionCount} marcada(s) para corregir</p> : null}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="font-semibold text-slate-900">Prioridad de revisión</h2>
              <p className="mt-1 text-xs text-slate-500">Primero aparecen las entregas que llevan más tiempo esperando.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{queue.length} pendientes</span>
          </div>
          {queue.length ? (
            <div className="divide-y divide-slate-100">
              {queue.map((item) => {
                const late = item.assignment.due_at && item.row.submitted_at
                  ? new Date(item.row.submitted_at).getTime() > new Date(item.assignment.due_at).getTime()
                  : false;
                const status = item.row.review_status === "corregir"
                  ? "Necesita corrección"
                  : item.row.score === null
                    ? "Pendiente de calificación"
                    : item.row.review_status === null
                      ? "Pendiente de revisión"
                      : "En seguimiento";
                return (
                  <article key={item.row.submission_id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-slate-900">{item.row.student_last_name}, {item.row.student_first_name}</h3>
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">{status}</span>
                        {late ? <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700">Entregada fuera de término</span> : null}
                      </div>
                      <p className="mt-1 text-sm font-medium text-slate-700">{item.assignment.title}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.classroom.course_name} · {item.classroom.division_name} · {item.classroom.subject_name ?? "Espacio general"} · {item.classroom.title}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        <GraduationCap size={13} className="mr-1 inline" /> Entregada: {dateTime(item.row.submitted_at)}
                        {item.assignment.due_at ? ` · Vencimiento: ${dateTime(item.assignment.due_at)}` : ""}
                        {item.row.student_number ? ` · Legajo ${item.row.student_number}` : ""}
                      </p>
                    </div>
                    <Link href={`/dashboard/${slug}/classroom/${item.classroom.id}?section=work`} className="inline-flex shrink-0 items-center justify-center rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50">
                      Abrir para corregir
                    </Link>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="px-6 py-12 text-center">
              <ClipboardCheck size={34} className="mx-auto text-emerald-600" />
              <h3 className="mt-3 font-semibold text-slate-900">No hay entregas pendientes de corrección</h3>
              <p className="mt-1 text-sm text-slate-500">Las nuevas entregas recibidas en tus aulas autorizadas aparecerán aquí.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
