import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarClock, CalendarDays, CheckCircle2, Clock3, ListTodo } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";

type Classroom = {
  id: string; title: string; course_name: string; division_name: string; subject_name: string | null;
};
type Assignment = {
  id: string; title: string; due_at: string | null; published_at: string | null; created_at: string;
};
type AgendaItem = { classroom: Classroom; assignment: Assignment };
type Filter = "all" | "overdue" | "today" | "upcoming" | "undated";

function localDateKey(value: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(value);
}
function formatDate(value: string | null) {
  if (!value) return "Sin fecha límite";
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(value));
}
function daysFromToday(value: string, today: string) {
  const target = new Date(`${value}T12:00:00`).getTime();
  const base = new Date(`${today}T12:00:00`).getTime();
  return Math.round((target - base) / 86400000);
}
function classify(item: AgendaItem, today: string): "overdue" | "today" | "upcoming" | "later" | "undated" {
  if (!item.assignment.due_at) return "undated";
  const day = localDateKey(new Date(item.assignment.due_at));
  if (day < today) return "overdue";
  if (day === today) return "today";
  if (daysFromToday(day, today) <= 30) return "upcoming";
  return "later";
}
const labels: Record<ReturnType<typeof classify>, string> = {
  overdue: "Vencida", today: "Vence hoy", upcoming: "Próxima", later: "Más adelante", undated: "Sin fecha límite",
};

export default async function TeacherClassroomAgendaPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const filter: Filter = ["all", "overdue", "today", "upcoming", "undated"].includes(query.filter ?? "")
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

  const { data: classrooms, error: classroomError } = await supabase.rpc("list_accessible_classrooms", {
    p_institution_id: institution.id,
  });
  const items: AgendaItem[] = [];
  let partialErrors = 0;
  for (const classroom of (classrooms ?? []) as Classroom[]) {
    const { data: capabilities, error: capabilityError } = await supabase.rpc("get_classroom_capabilities", {
      p_classroom_id: classroom.id,
    });
    if (capabilityError || (capabilities as { can_read?: boolean } | null)?.can_read !== true) {
      partialErrors += 1;
      continue;
    }
    const { data: overview, error } = await supabase.rpc("get_classroom_overview", {
      p_classroom_id: classroom.id,
    });
    if (error || !overview) {
      partialErrors += 1;
      continue;
    }
    const assignments = (overview as { assignments?: Assignment[] }).assignments ?? [];
    for (const assignment of assignments) items.push({ classroom, assignment });
  }

  const today = localDateKey(new Date());
  const counts = {
    overdue: items.filter((item) => classify(item, today) === "overdue").length,
    today: items.filter((item) => classify(item, today) === "today").length,
    upcoming: items.filter((item) => classify(item, today) === "upcoming").length,
    undated: items.filter((item) => classify(item, today) === "undated").length,
  };
  const visible = items
    .filter((item) => {
      const status = classify(item, today);
      if (filter === "all") return true;
      if (filter === "upcoming") return status === "upcoming";
      return status === filter;
    })
    .sort((a, b) => {
      const aTime = a.assignment.due_at ? new Date(a.assignment.due_at).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.assignment.due_at ? new Date(b.assignment.due_at).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });
  const filters: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "Todas", count: items.length },
    { id: "overdue", label: "Vencidas", count: counts.overdue },
    { id: "today", label: "Vencen hoy", count: counts.today },
    { id: "upcoming", label: "Próximas (30 días)", count: counts.upcoming + items.filter((item) => classify(item, today) === "later").length },
    { id: "undated", label: "Sin fecha", count: counts.undated },
  ];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <Link href={`/dashboard/${slug}/classroom`} className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-indigo-700">
          <ArrowLeft size={16}/> Volver a mis aulas
        </Link>
        <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-cyan-900 p-7 text-white shadow-sm sm:p-9">
          <div className="flex items-center gap-3"><CalendarClock size={28}/><div><p className="text-xs font-bold uppercase tracking-widest text-cyan-200">Organización docente</p><h1 className="text-3xl font-bold">Agenda de actividades</h1></div></div>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-cyan-100">Fechas de entrega y actividades publicadas en tus aulas, reunidas en una sola vista para anticipar vencimientos y organizar el seguimiento.</p>
          <p className="mt-2 text-xs text-cyan-200">{institution.display_name}</p>
        </header>

        {classroomError ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">No se pudo consultar el listado autorizado de aulas.</div> : null}
        {partialErrors > 0 ? <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Algunas aulas no pudieron consultarse. La agenda muestra solo actividades obtenidas mediante las consultas autorizadas.</div> : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4"><p className="flex items-center gap-2 text-sm font-medium text-rose-800"><Clock3 size={16}/> Vencidas</p><p className="mt-2 text-3xl font-bold text-rose-950">{counts.overdue}</p></div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="flex items-center gap-2 text-sm font-medium text-amber-800"><CalendarDays size={16}/> Vencen hoy</p><p className="mt-2 text-3xl font-bold text-amber-950">{counts.today}</p></div>
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4"><p className="flex items-center gap-2 text-sm font-medium text-indigo-800"><CalendarClock size={16}/> Próximas (30 días)</p><p className="mt-2 text-3xl font-bold text-indigo-950">{counts.upcoming}</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="flex items-center gap-2 text-sm font-medium text-slate-600"><ListTodo size={16}/> Sin fecha límite</p><p className="mt-2 text-3xl font-bold text-slate-900">{counts.undated}</p></div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap gap-2 border-b border-slate-100 p-4">
            {filters.map((item) => <Link key={item.id} href={item.id === "all" ? `/dashboard/${slug}/classroom/agenda` : `/dashboard/${slug}/classroom/agenda?filter=${item.id}`} aria-current={filter === item.id ? "page" : undefined} className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${filter === item.id ? "bg-indigo-700 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{item.label} · {item.count}</Link>)}
          </div>
          {visible.length ? <div className="divide-y divide-slate-100">{visible.map((item) => {
            const status = classify(item, today);
            const badge = status === "overdue" ? "bg-rose-50 text-rose-800" : status === "today" ? "bg-amber-50 text-amber-800" : status === "upcoming" ? "bg-indigo-50 text-indigo-800" : "bg-slate-100 text-slate-700";
            return <article key={item.assignment.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-slate-900">{item.assignment.title}</h2><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${badge}`}>{labels[status]}</span>{!item.assignment.published_at ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">Borrador</span> : null}</div>
              <p className="mt-1 text-sm text-slate-600">{item.classroom.course_name} · {item.classroom.division_name} · {item.classroom.subject_name ?? item.classroom.title}</p>
              <p className="mt-1 text-xs text-slate-500">Fecha límite: {formatDate(item.assignment.due_at)}</p></div>
              <Link href={`/dashboard/${slug}/classroom/${item.classroom.id}?section=work`} className="inline-flex shrink-0 items-center justify-center rounded-xl border border-indigo-200 px-4 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">Abrir actividad</Link>
            </article>;
          })}</div> : <div className="px-6 py-12 text-center"><CheckCircle2 size={34} className="mx-auto text-emerald-600"/><h2 className="mt-3 font-semibold text-slate-900">No hay actividades en este filtro</h2><p className="mt-1 text-sm text-slate-500">Cuando publiques actividades en tus aulas, sus fechas aparecerán aquí.</p></div>}
        </section>
      </div>
    </main>
  );
}
