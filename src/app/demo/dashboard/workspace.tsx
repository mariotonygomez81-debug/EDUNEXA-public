"use client";

import Link from "next/link";
import { BookOpen, CalendarCheck, ClipboardList, FileText, GraduationCap, Megaphone, MessagesSquare, ShieldCheck, Users } from "lucide-react";

const modules = [
  { name: "Alumnos", detail: "Legajos y trayectorias escolares", icon: Users, available: false },
  { name: "Asistencia", detail: "Presentismo y seguimiento", icon: CalendarCheck, available: false },
  { name: "Calificaciones", detail: "Evaluaciones y notas", icon: ClipboardList, available: false },
  { name: "Boletines", detail: "Informes académicos publicados", icon: FileText, available: false },
  { name: "Aula virtual", detail: "Clases, tareas y materiales", icon: BookOpen, available: false },
  { name: "Comunicaciones", detail: "Avisos para la comunidad", icon: Megaphone, available: false },
  { name: "Mensajes", detail: "Conversaciones institucionales", icon: MessagesSquare, available: false },
];

export const dynamic = "force-dynamic";

export default function LocalDemoWorkspace() {
  if (process.env.NODE_ENV !== "development") {
    // The server route also checks this; this client-side check is only defensive.
    return null;
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-7">
        <div className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white shadow-sm sm:p-9">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-white/15 bg-white/10 p-3"><GraduationCap size={25}/></div>
            <div><p className="text-lg font-bold tracking-wide">EDUNEXA</p><p className="text-xs text-indigo-200">PLATAFORMA EDUCATIVA</p></div>
          </div>
          <p className="mt-8 text-xs font-semibold uppercase tracking-[0.18em] text-indigo-200">Espacio institucional</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Módulos de EDUNEXA</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-indigo-100">Accedé a los espacios de trabajo desde un único tablero, como en la plataforma institucional.</p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-100"><ShieldCheck size={14}/> Demostración local · datos ficticios</div>
        </div>

        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-xs font-semibold uppercase tracking-wider text-violet-700">Espacio de trabajo</p><h2 className="mt-1 text-xl font-bold text-slate-950">Todos los módulos</h2></div>
            <span className="text-xs text-slate-500">1 módulo disponible en esta demostración</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Link href="/demo/dashboard/tutor" className="group flex min-h-36 items-start gap-4 rounded-2xl border border-violet-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-400 hover:shadow-md">
              <span className="rounded-xl bg-violet-100 p-3 text-violet-700"><GraduationCap size={23}/></span>
              <span className="min-w-0 flex-1"><strong className="block text-base text-slate-950">Tutor</strong><span className="mt-1 block text-sm leading-5 text-slate-500">Seguimiento académico y familiar</span><span className="mt-4 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Abrir módulo</span></span>
            </Link>
            {modules.map(({ name, detail, icon: Icon }) => (
              <div key={name} aria-disabled="true" className="flex min-h-36 items-start gap-4 rounded-2xl border border-slate-200 bg-white/70 p-5 opacity-65">
                <span className="rounded-xl bg-slate-100 p-3 text-slate-500"><Icon size={23}/></span>
                <span className="min-w-0 flex-1"><strong className="block text-base text-slate-800">{name}</strong><span className="mt-1 block text-sm leading-5 text-slate-500">{detail}</span><span className="mt-4 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">Requiere módulo institucional</span></span>
              </div>
            ))}
          </div>
        </section>
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">Este tablero reproduce la navegación por módulos para probar Tutor sin iniciar sesión ni conectarse a Supabase o Groq. Los demás módulos se muestran como referencia y no están habilitados en esta demostración local.</p>
      </div>
    </main>
  );
}
