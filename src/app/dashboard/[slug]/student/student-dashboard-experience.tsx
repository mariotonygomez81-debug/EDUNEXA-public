"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight, Bell, BookOpen, CalendarDays, CheckCircle2, ClipboardCheck,
  GraduationCap, LayoutGrid, List, MessageCircle, Plus, Search, Sparkles,
  UserRound, X,
} from "lucide-react";

type Student = {
  firstName: string;
  fullName: string;
  initials: string;
  courseName: string | null;
  divisionName: string | null;
  academicYearName: string | null;
  studentNumber: string | null;
  enrollmentStatus: string;
  canViewGrades: boolean;
  publishedReportCardCount: number;
  avatarUrl: string | null;
  avatarStyle: string;
};
type Classroom = {
  id: string;
  title: string;
  description: string | null;
  course_name: string;
  division_name: string;
  subject_name: string | null;
};
type Props = { slug: string; institutionName: string; student: Student; classrooms: Classroom[]; hasLoadError: boolean };

const filters = ["Todas", "Materias", "Aulas generales"] as const;

export default function StudentDashboardExperience({ slug, institutionName, student, classrooms, hasLoadError }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof filters)[number]>("Todas");
  const [view, setView] = useState<"grid" | "list">("grid");
  const subjectsCount = new Set(classrooms.map((item) => item.subject_name).filter(Boolean)).size;
  const visibleClassrooms = useMemo(() => classrooms.filter((item) => {
    const matchesQuery = [item.title, item.subject_name, item.course_name, item.division_name]
      .filter(Boolean).join(" ").toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es").trim());
    const matchesFilter = filter === "Todas" || (filter === "Materias" ? Boolean(item.subject_name) : !item.subject_name);
    return matchesQuery && matchesFilter;
  }), [classrooms, filter, query]);
  const profileHref = `/dashboard/${slug}/student/profile`;
  const joinHref = `/join/classroom?school=${encodeURIComponent(slug)}`;
  const nav = [
    { label: "Inicio", href: `/dashboard/${slug}/student`, icon: GraduationCap, active: true },
    { label: "Aulas", href: "#mis-aulas", icon: BookOpen },
    { label: "Mensajes", href: `/dashboard/${slug}/messages`, icon: MessageCircle },
    { label: "Mi avance", href: `/dashboard/${slug}/portal`, icon: ClipboardCheck },
  ];

  return (
    <main className="min-h-screen bg-[#f6f7f4] pb-28 text-slate-800">
      <div className="mx-auto max-w-6xl px-4 pb-8 pt-4 sm:px-7 sm:pt-7">
        <header className="mb-5 flex items-center justify-between">
          <Link href={`/dashboard/${slug}`} className="text-lg font-black tracking-[.17em] text-slate-900">EDUNEXA</Link>
          <Link href={profileHref} className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 shadow-sm transition hover:border-emerald-300" aria-label="Abrir mi perfil">
            <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-emerald-100 text-xl font-bold text-emerald-900">
              {student.avatarUrl ? <Image src={student.avatarUrl} alt="" width={40} height={40} unoptimized className="h-full w-full object-cover"/> : student.avatarStyle === "masculino" ? "👨🏻‍🎓" : student.avatarStyle === "femenino" ? "👩🏻‍🎓" : student.initials}
            </span>
            <span className="hidden text-left sm:block"><span className="block text-xs font-bold text-slate-800">{student.fullName}</span><span className="block text-[10px] text-slate-500">Mi perfil</span></span>
            <UserRound size={16} className="text-slate-400 sm:hidden"/>
          </Link>
        </header>

        <section className="relative overflow-hidden rounded-[30px] border border-emerald-900/10 bg-gradient-to-br from-[#174b3d] via-[#22634d] to-[#4b8064] p-5 text-white shadow-[0_18px_45px_rgba(27,78,60,.16)] sm:p-8">
          <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full border-[42px] border-white/[.07]"/>
          <div className="pointer-events-none absolute bottom-[-95px] right-[20%] h-48 w-48 rounded-full bg-amber-200/10 blur-2xl"/>
          <div className="relative flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-bold tracking-[.14em] text-emerald-50"><Sparkles size={14}/> TU ESPACIO DE APRENDIZAJE</span>
              <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">¡Hola, {student.firstName}!</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-emerald-50 sm:text-base">Todo lo que necesitás para organizar tus clases, seguir aprendiendo y estar en contacto con tus docentes.</p>
              <p className="mt-4 text-xs font-medium text-white/75">{institutionName}</p>
            </div>
            <Link href={profileHref} className="flex items-center gap-3 rounded-2xl border border-white/20 bg-white/10 p-3 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label="Abrir mi perfil"><span className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl border-2 border-white/40 bg-white/15 text-4xl font-bold text-white shadow-lg sm:h-24 sm:w-24">{student.avatarUrl ? <Image src={student.avatarUrl} alt={`Foto de ${student.fullName}`} width={96} height={96} unoptimized className="h-full w-full object-cover"/> : student.avatarStyle === "masculino" ? "👨🏻‍🎓" : student.avatarStyle === "femenino" ? "👩🏻‍🎓" : <span className="text-2xl">{student.initials}</span>}</span><span className="min-w-0 text-left"><span className="block text-xs font-semibold text-emerald-50">MI PERFIL</span><span className="mt-1 block max-w-[170px] truncate text-sm font-bold text-white">{student.fullName}</span><span className="mt-1 block text-xs text-emerald-50/90">Ver mis datos <ArrowRight size={12} className="ml-1 inline"/></span></span></Link>
          </div>
          <div className="relative mt-6 flex flex-wrap gap-2">
            {[student.courseName ?? "Curso sin asignar", student.divisionName ?? "División pendiente", student.academicYearName ? `Ciclo ${student.academicYearName}` : null].filter(Boolean).map((item) => <span key={item} className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-semibold">{item}</span>)}
          </div>
        </section>

        <section aria-label="Resumen académico" className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Mis aulas", value: String(classrooms.length), icon: BookOpen, tint: "bg-emerald-50 text-emerald-800" },
            { label: "Mis materias", value: String(subjectsCount), icon: GraduationCap, tint: "bg-amber-50 text-amber-800" },
            { label: "Boletines visibles", value: student.canViewGrades ? String(student.publishedReportCardCount) : "—", icon: CheckCircle2, tint: "bg-lime-50 text-lime-800" },
            { label: "Ciclo lectivo", value: student.academicYearName ?? "—", icon: CalendarDays, tint: "bg-stone-100 text-stone-700" },
          ].map((item) => <article key={item.label} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_4px_18px_rgba(15,23,42,.035)]">
            <div className="flex items-center gap-2"><span className={`grid h-9 w-9 place-items-center rounded-xl ${item.tint}`}><item.icon size={18}/></span><span className="text-xs font-semibold text-slate-500">{item.label}</span></div>
            <p className="mt-3 truncate text-2xl font-black tracking-tight text-slate-900">{item.value}</p>
          </article>)}
        </section>

        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-emerald-800">Accesos directos</p><h2 className="mt-1 text-lg font-extrabold text-slate-900">¿Qué necesitás hacer?</h2></div></div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Link href={`/dashboard/${slug}/student/tasks`} className="group flex min-h-[118px] flex-col justify-between rounded-2xl border border-amber-200 bg-[#fffaf0] p-4 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"><span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-100 text-amber-900"><ClipboardCheck size={20}/></span><span><span className="block text-sm font-bold text-slate-900">Mis tareas</span><span className="mt-0.5 block text-xs text-slate-600">Consultá consignas y entregas</span></span></Link>
            <Link href={`/dashboard/${slug}/announcements`} className="group flex min-h-[118px] flex-col justify-between rounded-2xl border border-orange-200 bg-[#fff7f2] p-4 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"><span className="grid h-10 w-10 place-items-center rounded-xl bg-orange-100 text-orange-900"><Bell size={20}/></span><span><span className="block text-sm font-bold text-slate-900">Novedades</span><span className="mt-0.5 block text-xs text-slate-600">Nuevos avisos por materia</span></span></Link>
            <Link href={`/dashboard/${slug}/messages`} className="group flex min-h-[118px] flex-col justify-between rounded-2xl border border-teal-200 bg-[#f1faf7] p-4 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"><span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-100 text-teal-900"><MessageCircle size={20}/></span><span><span className="block text-sm font-bold text-slate-900">Mensajes</span><span className="mt-0.5 block text-xs text-slate-600">Hablá con tus docentes</span></span></Link>
            <Link href={`/dashboard/${slug}/portal`} className="group flex min-h-[118px] flex-col justify-between rounded-2xl border border-lime-200 bg-[#f7faef] p-4 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime-600"><span className="grid h-10 w-10 place-items-center rounded-xl bg-lime-100 text-lime-900"><CheckCircle2 size={20}/></span><span><span className="block text-sm font-bold text-slate-900">Mi rendimiento</span><span className="mt-0.5 block text-xs text-slate-600">Notas y boletines publicados</span></span></Link>
          </div>
        </section>

        <section id="mis-aulas" className="mt-8 scroll-mt-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-emerald-800">Tus espacios de estudio</p><h2 className="mt-1 text-xl font-black text-slate-900">Mis aulas</h2><p className="mt-1 text-sm text-slate-500">Elegí una materia para ver sus actividades, materiales y novedades.</p></div>
            <Link href={joinHref} className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2.5 text-xs font-bold text-emerald-950 transition hover:bg-emerald-100 sm:text-sm"><Plus size={16}/> Agregar aula</Link>
          </div>
          {hasLoadError ? <div role="alert" className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">No pudimos cargar toda la información. Actualizá la página para volver a intentarlo.</div> : <>
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
              <div className="flex flex-col gap-3 sm:flex-row">
                <label className="relative min-w-0 flex-1"><Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><span className="sr-only">Buscar aula o materia</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por materia o nombre del aula..." className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-10 text-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"/>{query ? <button type="button" onClick={() => setQuery("")} aria-label="Limpiar búsqueda" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-200"><X size={15}/></button> : null}</label>
                <div className="flex items-center justify-between gap-2"><div className="flex gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label="Filtrar aulas">{filters.map((item) => <button key={item} type="button" onClick={() => setFilter(item)} aria-pressed={filter === item} className={`rounded-lg px-2.5 py-2 text-[11px] font-semibold transition sm:px-3 sm:text-xs ${filter === item ? "bg-white text-emerald-950 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>{item}</button>)}</div><div className="flex gap-1 rounded-xl border border-slate-200 p-1"><button type="button" onClick={() => setView("grid")} aria-label="Vista en tarjetas" aria-pressed={view === "grid"} className={`rounded-lg p-2 ${view === "grid" ? "bg-emerald-50 text-emerald-900" : "text-slate-500"}`}><LayoutGrid size={16}/></button><button type="button" onClick={() => setView("list")} aria-label="Vista en lista" aria-pressed={view === "list"} className={`rounded-lg p-2 ${view === "list" ? "bg-emerald-50 text-emerald-900" : "text-slate-500"}`}><List size={16}/></button></div></div>
              </div>
              <p className="mt-3 text-xs text-slate-500" aria-live="polite">Mostrando <strong className="text-slate-700">{visibleClassrooms.length}</strong> de {classrooms.length} aulas</p>
            </div>
            {visibleClassrooms.length ? <div className={view === "grid" ? "mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3" : "mt-3 space-y-2"}>
              {visibleClassrooms.map((classroom, index) => <Link key={classroom.id} href={`/dashboard/${slug}/classroom/${classroom.id}`} className={`group flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_3px_14px_rgba(15,23,42,.035)] transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${view === "list" ? "items-center" : "min-h-[174px] flex-col"}`}>
                <div className="flex w-full items-start justify-between gap-2"><span className={`grid h-11 w-11 place-items-center rounded-2xl ${index % 3 === 0 ? "bg-emerald-100 text-emerald-900" : index % 3 === 1 ? "bg-amber-100 text-amber-900" : "bg-stone-100 text-stone-800"}`}><BookOpen size={21}/></span><ArrowRight size={18} className="text-slate-300 transition group-hover:translate-x-1 group-hover:text-emerald-800"/></div>
                <div className="min-w-0 flex-1"><p className="text-[11px] font-semibold text-slate-500">{classroom.course_name} · {classroom.division_name}</p><h3 className="mt-1 truncate text-base font-bold text-slate-900">{classroom.title}</h3><p className="mt-1 text-sm text-slate-600">{classroom.subject_name ?? "Aula general"}</p>{view === "grid" && classroom.description ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{classroom.description}</p> : null}</div>
                {view === "list" ? <span className="hidden shrink-0 text-xs font-bold text-emerald-900 sm:block">Entrar al aula</span> : <span className="mt-auto inline-flex items-center gap-1 text-xs font-bold text-emerald-900">Abrir aula <ArrowRight size={13}/></span>}
              </Link>)}
            </div> : <div className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-800"><BookOpen size={23}/></div><h3 className="mt-3 font-bold text-slate-900">{classrooms.length ? "No encontramos resultados" : "Todavía no agregaste aulas"}</h3><p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-slate-500">{classrooms.length ? "Probá con otro nombre o cambiá el filtro." : "Pedile a tu docente el código o el QR de la materia para sumarla a tu espacio."}</p>{classrooms.length ? <button type="button" onClick={() => { setQuery(""); setFilter("Todas"); }} className="mt-4 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Limpiar filtros</button> : <Link href={joinHref} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-950 hover:bg-emerald-100"><Plus size={16}/> Agregar mi primera aula</Link>}</div>}
          </>}
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-emerald-100 text-2xl font-bold text-emerald-900">{student.avatarUrl ? <Image src={student.avatarUrl} alt="" width={48} height={48} unoptimized className="h-full w-full object-cover"/> : student.avatarStyle === "masculino" ? "👨🏻‍🎓" : student.avatarStyle === "femenino" ? "👩🏻‍🎓" : student.initials}</span>
            <div className="min-w-0 flex-1"><h2 className="font-bold text-slate-900">Mi perfil académico</h2><p className="mt-1 truncate text-sm text-slate-600">{student.fullName}</p><p className="mt-1 text-xs text-slate-500">{student.enrollmentStatus === "active" ? "Matrícula activa" : "Matrícula pendiente de confirmar"}</p></div>
            <Link href={profileHref} className="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">Ver perfil</Link>
          </div>
        </section>
      </div>
      <nav aria-label="Navegación principal" className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 shadow-[0_-8px_24px_rgba(15,23,42,.07)] backdrop-blur sm:hidden"><div className="mx-auto grid max-w-lg grid-cols-4 gap-1">{nav.map((item) => <Link key={item.label} href={item.href} className={`flex flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[10px] font-semibold ${item.active ? "bg-emerald-50 text-emerald-900" : "text-slate-600 hover:bg-slate-50"}`}><item.icon size={19}/>{item.label}</Link>)}</div></nav>
    </main>
  );
}
