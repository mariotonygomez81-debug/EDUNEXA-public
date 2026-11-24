"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, SlidersHorizontal, BookOpen, CalendarClock, CheckCircle2, Clock3, ClipboardList, ArrowRight, X, Sparkles, CircleAlert } from "lucide-react";

type Item = {
  id: string; title: string; instructions: string | null; dueLabel: string;
  classroomId: string; classroomName: string; subjectName: string;
  status: string; statusStyle: string; submittedLabel: string | null;
  score: number | null; feedback: string | null; statusKind: "pending" | "overdue" | "submitted" | "review" | "unknown";
};
type Props = { slug: string; items: Item[] };

const filters = [
  { id: "all", label: "Todas" }, { id: "pending", label: "Pendientes" },
  { id: "overdue", label: "Vencidas" }, { id: "submitted", label: "Entregadas" },
  { id: "review", label: "Corregidas" }, { id: "unknown", label: "Sin actualizar" },
] as const;

export default function StudentTaskList({ slug, items }: Props) {
  const [filter, setFilter] = useState<(typeof filters)[number]["id"]>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("date");
  const counts = useMemo(() => ({
    all: items.length,
    pending: items.filter((item) => item.statusKind === "pending").length,
    overdue: items.filter((item) => item.statusKind === "overdue").length,
    submitted: items.filter((item) => item.statusKind === "submitted").length,
    review: items.filter((item) => item.statusKind === "review").length,
    unknown: items.filter((item) => item.statusKind === "unknown").length,
  }), [items]);
  const knownTotal = items.length - counts.unknown;
  const completedTotal = counts.submitted + counts.review;
  const progress = knownTotal ? Math.round((completedTotal / knownTotal) * 100) : 0;
  const visible = useMemo(() => {
    const result = items.filter((item) => {
      const matchesFilter = filter === "all" || item.statusKind === filter;
      const term = query.trim().toLocaleLowerCase("es-AR");
      const matchesQuery = !term || [item.title, item.subjectName, item.classroomName].some((value) => value.toLocaleLowerCase("es-AR").includes(term));
      return matchesFilter && matchesQuery;
    });
    return result.sort((a, b) => {
      if (sort === "name") return a.title.localeCompare(b.title, "es");
      if (sort === "priority") {
        const rank = { overdue: 0, pending: 1, unknown: 2, submitted: 3, review: 4 };
        return rank[a.statusKind] - rank[b.statusKind];
      }
      return 0;
    });
  }, [items, filter, query, sort]);

  return <section className="space-y-4" aria-label="Listado interactivo de tareas">
    <div className="student-panel rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[.16em] text-emerald-800"><Sparkles size={13}/> Tu organización</p><h2 className="mt-1 text-base font-extrabold text-slate-900">Seguimiento de actividades</h2></div>
        <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-900">{completedTotal} de {knownTotal} resueltas</span>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Actividades entregadas o corregidas" aria-valuemin={0} aria-valuemax={knownTotal || 1} aria-valuenow={completedTotal}>
        <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-[width] duration-500 ease-out" style={{ width: `${progress}%` }}/>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          {label:"Pendientes",value:counts.pending,tint:"bg-amber-50 text-amber-900"},
          {label:"Vencidas",value:counts.overdue,tint:"bg-rose-50 text-rose-900"},
          {label:"Entregadas",value:counts.submitted,tint:"bg-sky-50 text-sky-900"},
          {label:"Corregidas",value:counts.review,tint:"bg-emerald-50 text-emerald-900"},
        ].map((item)=><div key={item.label} className={`rounded-xl px-3 py-2.5 ${item.tint}`}><p className="text-[11px] font-semibold opacity-80">{item.label}</p><p className="mt-0.5 text-xl font-black tabular-nums">{item.value}</p></div>)}
      </div>
      {counts.unknown > 0 ? <p className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 p-2.5 text-xs text-slate-600"><CircleAlert size={14}/> {counts.unknown} estados no pudieron consultarse; no se cuentan como pendientes.</p> : null}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <label className="relative min-w-0 flex-1"><Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><span className="sr-only">Buscar actividad</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por tarea, materia o aula..." className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-10 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"/>{query ? <button type="button" onClick={() => setQuery("")} aria-label="Limpiar búsqueda" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100"><X size={15}/></button> : null}</label>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><SlidersHorizontal size={15}/><span className="sr-only">Ordenar tareas</span><select value={sort} onChange={(event) => setSort(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="date">Por fecha</option><option value="priority">Por prioridad</option><option value="name">Por nombre</option></select></label>
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtrar tareas">{filters.map((item) => <button key={item.id} type="button" onClick={() => setFilter(item.id)} aria-pressed={filter === item.id} className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition-all duration-200 ${filter === item.id ? "bg-emerald-800 text-white shadow-md" : "bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-900"}`}>{item.label} · {counts[item.id]}</button>)}</div>
      <p className="mt-2 text-xs text-slate-500" aria-live="polite">Mostrando <strong className="text-slate-800">{visible.length}</strong> de {items.length} actividades</p>
    </div>
    {visible.length ? <div className="space-y-3">{visible.map((task) => <article key={task.id} className="student-task-card group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-emerald-800">{task.subjectName} · {task.classroomName}</p><h2 className="mt-1 text-lg font-bold text-slate-900">{task.title}</h2>{task.instructions ? <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{task.instructions}</p> : null}</div><span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${task.statusStyle}`}>{task.statusKind === "review" ? <CheckCircle2 size={14}/> : task.statusKind === "unknown" ? <Clock3 size={14}/> : <CalendarClock size={14}/>}{task.status}</span></div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3"><div className="text-xs text-slate-500"><span className="font-semibold text-slate-700">Fecha límite:</span> {task.dueLabel}{task.submittedLabel ? <span className="ml-2"><span className="font-semibold text-slate-700">Enviada:</span> {task.submittedLabel}</span> : null}</div><Link href={`/dashboard/${slug}/classroom/${task.classroomId}?section=work#lista-clases`} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-950 transition hover:-translate-y-0.5 hover:bg-emerald-100"><BookOpen size={14}/>{task.statusKind === "pending" || task.statusKind === "overdue" ? "Preparar entrega" : "Ver entrega y archivos"} <ArrowRight size={13}/></Link></div>
      {task.score !== null ? <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">Calificación: {task.score}</p> : null}
      {task.feedback ? <p className="mt-2 rounded-xl bg-sky-50 p-3 text-sm leading-6 text-sky-900">Devolución docente: {task.feedback}</p> : null}
    </article>)}</div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-9 text-center"><ClipboardList className="mx-auto text-emerald-700" size={32}/><h2 className="mt-3 text-lg font-bold text-slate-900">{items.length ? "No encontramos actividades" : "Todavía no hay tareas publicadas"}</h2><p className="mt-1 text-sm text-slate-500">{items.length ? "Probá con otro término o filtro." : "Cuando tus docentes publiquen actividades, vas a encontrarlas acá."}</p>{items.length ? <button type="button" onClick={() => {setQuery("");setFilter("all");}} className="mt-4 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold">Limpiar filtros</button> : null}</div>}
  </section>;
}
