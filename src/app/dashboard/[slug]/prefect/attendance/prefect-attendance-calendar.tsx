"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardList } from "lucide-react";

export type PrefectAttendanceSession = {
  id: string;
  division_id: string;
  held_on: string;
  period_label: string | null;
  status: string;
};

const dateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function PrefectAttendanceCalendar({
  slug,
  sessions,
  divisionLabels,
}: {
  slug: string;
  sessions: PrefectAttendanceSession[];
  divisionLabels: Record<string, string>;
}) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(dateKey(new Date()));
  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const mondayOffset = (first.getDay() + 6) % 7;
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - mondayOffset);
    return Array.from({ length: 42 }, (_, index) =>
      new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
  }, [month]);
  const monthLabel = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(month);
  const selectedSessions = sessions.filter((session) => session.held_on === selectedDate);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-indigo-700">
              <CalendarDays size={19} />
              <span className="text-xs font-bold uppercase tracking-widest">Calendario de asistencia</span>
            </div>
            <h2 className="mt-1 text-xl font-bold capitalize text-slate-900">{monthLabel}</h2>
            <p className="mt-1 text-sm text-slate-500">Elegí una fecha para consultar o abrir las planillas de Preceptoría.</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50" aria-label="Mes anterior"><ChevronLeft size={19} /></button>
            <button type="button" onClick={() => { const now = new Date(); setMonth(new Date(now.getFullYear(), now.getMonth(), 1)); setSelectedDate(dateKey(now)); }}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">Hoy</button>
            <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50" aria-label="Mes siguiente"><ChevronRight size={19} /></button>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-7 gap-1 sm:gap-2">
          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) =>
            <div key={day} className="py-2 text-center text-xs font-bold text-slate-400">{day}</div>)}
          {days.map((day) => {
            const key = dateKey(day);
            const daySessions = sessions.filter((session) => session.held_on === key);
            const inMonth = day.getMonth() === month.getMonth();
            const isToday = key === dateKey(new Date());
            const selected = key === selectedDate;
            return (
              <button key={key} type="button" onClick={() => setSelectedDate(key)}
                className={`min-h-16 rounded-xl border p-1.5 text-left transition sm:min-h-20 sm:p-2 ${selected ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100" : "border-slate-100 hover:border-indigo-200 hover:bg-slate-50"} ${inMonth ? "bg-white" : "bg-slate-50/70"}`}>
                <span className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${isToday ? "bg-indigo-600 text-white" : inMonth ? "text-slate-800" : "text-slate-300"}`}>{day.getDate()}</span>
                {daySessions.length
                  ? <span className="mt-1 block truncate text-center text-[9px] font-semibold text-emerald-700 sm:text-[10px]">{daySessions.length} planilla(s)</span>
                  : <span className="mt-1 block text-center text-[9px] text-slate-300 sm:text-[10px]">{inMonth ? "＋" : ""}</span>}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Fecha con planilla</span>
          <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full border border-slate-300" /> Fecha sin planilla</span>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-4 sm:px-6">
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Planillas del día</p>
          <h3 className="mt-1 text-lg font-bold capitalize text-slate-900">
            {new Intl.DateTimeFormat("es-AR", { dateStyle: "full" }).format(new Date(selectedDate + "T12:00:00"))}
          </h3>
        </div>
        {selectedSessions.length ? (
          <div className="divide-y divide-slate-100">
            {selectedSessions.map((session) => (
              <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
                <div>
                  <p className="font-semibold text-slate-900">{divisionLabels[session.division_id] ?? "División"}</p>
                  <p className="mt-1 text-xs text-slate-500">{session.period_label || "Turno sin especificar"} · {session.status === "open" ? "Abierta" : "Cerrada"}</p>
                </div>
                <Link href={`/dashboard/${slug}/prefect/attendance/${session.id}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-violet-200 px-4 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-50">
                  <ClipboardList size={16} /> Abrir planilla
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <p className="p-8 text-center text-sm text-slate-500">No hay planillas registradas para esta fecha. Podés crear una desde el panel Nueva sesión.</p>
        )}
      </section>
    </div>
  );
}
