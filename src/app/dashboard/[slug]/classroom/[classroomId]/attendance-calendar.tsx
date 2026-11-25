"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ClipboardCheck, Loader2, Save, CalendarDays } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type DaySession = {
  id: string;
  created_by: string;
  held_on: string;
  status: string;
  present_count: number;
  absent_count: number;
  half_absence_count: number;
  record_count: number;
};
type StudentRow = {
  student_id: string;
  student_number: string | null;
  name: string;
  status: "present" | "absent" | "half_absence" | null;
  observation: string | null;
};
type Sheet = { session_id: string | null; held_on: string; created_by: string | null; students: StudentRow[] };
const statusOptions = [
  { value: "present", label: "Presente", short: "P", style: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  { value: "absent", label: "Ausente", short: "A", style: "border-rose-200 bg-rose-50 text-rose-800" },
  { value: "half_absence", label: "Media falta", short: "½", style: "border-amber-200 bg-amber-50 text-amber-800" },
] as const;
const dateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};
const monthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

export default function ClassroomAttendanceCalendar({ classroomId, editable = true }: { classroomId: string; editable?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [month, setMonth] = useState(() => monthStart(new Date()));
  const [sessions, setSessions] = useState<DaySession[]>([]);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loadingCalendar, setLoadingCalendar] = useState(true);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => { if (!cancelled) setCurrentUserId(data.user?.id ?? null); });
    return () => { cancelled = true; };
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    const fetchMonth = async () => {
      const { data, error: rpcError } = await supabase.rpc("list_classroom_attendance_month", {
        p_classroom_id: classroomId, p_month: dateKey(month),
      });
      if (cancelled) return;
      if (rpcError) setError(rpcError.message);
      else setSessions((data ?? []) as unknown as DaySession[]);
      setLoadingCalendar(false);
    };
    void fetchMonth();
    return () => { cancelled = true; };
  }, [classroomId, month, supabase]);

  const openSession = async (sessionId: string) => {
    setLoadingSheet(true); setSheet(null); setError(null); setNotice(null);
    const { data, error: rpcError } = await supabase.rpc("get_classroom_attendance_sheet_by_session", { p_session_id: sessionId });
    if (rpcError) setError(rpcError.message); else setSheet(data as unknown as Sheet);
    setLoadingSheet(false);
  };
  const openDate = async (date: Date) => {
    const key=dateKey(date); setSelectedDay(key); setSheet(null); setError(null); setNotice(null);
    const daySessions=sessions.filter(item=>item.held_on===key);
    if(daySessions.length){ if(daySessions.length===1) await openSession(daySessions[0].id); return; }
    setLoadingSheet(true);
    const {data,error:rpcError}=await supabase.rpc("get_classroom_attendance_sheet",{p_classroom_id:classroomId,p_held_on:key});
    if(rpcError) setError(rpcError.message); else setSheet(data as unknown as Sheet);
    setLoadingSheet(false);
  };

  const days = useMemo(() => {
    const first = monthStart(month);
    const mondayOffset = (first.getDay() + 6) % 7;
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - mondayOffset);
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, [month]);

  const updateStudent = (studentId: string, patch: Partial<StudentRow>) => {
    setSheet(current => current ? {
      ...current,
      students: current.students.map(student => student.student_id === studentId ? { ...student, ...patch } : student),
    } : current);
  };

  const save = async () => {
    if (!sheet || !sheet.session_id || sheet.created_by !== currentUserId) return;
    const incomplete = sheet.students.filter(student => !student.status);
    if (incomplete.length) {
      setError(`Falta indicar la asistencia de ${incomplete.length} alumno(s).`);
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    const records = sheet.students.map(student => ({
      student_id: student.student_id,
      status: student.status,
      observation: student.observation ?? "",
    }));
    const { error: rpcError } = await supabase.rpc("save_classroom_attendance_sheet", {
      p_classroom_id: classroomId,
      p_session_id: sheet.session_id,
      p_records: records,
    });
    if (rpcError) setError(rpcError.message);
    else {
      setNotice("La planilla de asistencia se guardó correctamente.");
      const { data: refreshed } = await supabase.rpc("list_classroom_attendance_month", {
        p_classroom_id: classroomId, p_month: dateKey(month),
      });
      setSessions((refreshed ?? []) as unknown as DaySession[]);
    }
    setSaving(false);
  };

  const selectedDate = sheet?.held_on ?? selectedDay;
  const selectedSessions = selectedDay ? sessions.filter(item=>item.held_on===selectedDay) : [];
  const canEditSheet = Boolean(editable && sheet?.session_id && sheet.created_by===currentUserId);
  const monthLabel = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(month);
  const markedCount = sheet?.students.filter(student => student.status).length ?? 0;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><div className="flex items-center gap-2 text-indigo-700"><CalendarDays size={19}/><span className="text-xs font-bold uppercase tracking-widest">Calendario de clases</span></div><h3 className="mt-1 text-xl font-bold capitalize text-slate-900">{monthLabel}</h3><p className="mt-1 text-sm text-slate-500">Seleccioná una fecha para abrir la planilla de alumnos.</p></div>
          <div className="flex items-center gap-2"><button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth()-1,1))} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50" aria-label="Mes anterior"><ChevronLeft size={19}/></button><button type="button" onClick={() => { setMonth(monthStart(new Date())); setSheet(null); }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">Hoy</button><button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth()+1,1))} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50" aria-label="Mes siguiente"><ChevronRight size={19}/></button></div>
        </div>
        <div className="mt-5 grid grid-cols-7 gap-1 sm:gap-2">
          {["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].map(day=><div key={day} className="py-2 text-center text-xs font-bold text-slate-400">{day}</div>)}
          {days.map(day => {
            const key = dateKey(day);
            const daySessions = sessions.filter(item => item.held_on === key);
            const inMonth = day.getMonth() === month.getMonth();
            const isSelected = selectedDate === key;
            const isToday = key === dateKey(new Date());
            return <button type="button" key={key} onClick={() => void openDate(day)} className={`min-h-16 rounded-xl border p-1.5 text-left transition sm:min-h-20 sm:p-2 ${isSelected ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100" : "border-slate-100 hover:border-indigo-200 hover:bg-slate-50"} ${inMonth ? "bg-white" : "bg-slate-50/70"}`}>
              <span className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${isToday ? "bg-indigo-600 text-white" : inMonth ? "text-slate-800" : "text-slate-300"}`}>{day.getDate()}</span>
              {daySessions.length?<span className="mt-1 block truncate text-center text-[9px] font-semibold text-emerald-700 sm:text-[10px]">{daySessions.length} planilla(s)</span>:<span className="mt-1 block text-center text-[9px] text-slate-300 sm:text-[10px]">{inMonth ? "＋ Clase" : ""}</span>}
            </button>;
          })}
        </div>
        {loadingCalendar?<p className="mt-3 text-xs text-slate-400">Actualizando calendario…</p>:null}
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500"/> Planilla guardada</span><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full border border-slate-300"/> Fecha sin planilla</span></div>
      </div>

      {selectedDay && selectedSessions.length > 1 ? <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="font-bold text-slate-900">Planillas de esta fecha</h3><p className="mt-1 text-sm text-slate-500">Cada docente tiene su propio registro; las planillas ajenas son de solo lectura.</p>
        <div className="mt-3 flex flex-wrap gap-2">{selectedSessions.map((session,index)=><button key={session.id} type="button" onClick={()=>void openSession(session.id)} className="rounded-xl border border-indigo-200 px-4 py-2 text-sm font-semibold text-indigo-800 hover:bg-indigo-50">{session.created_by===currentUserId ? "Mi planilla" : `Registro docente ${index+1}`} · {session.record_count} registros</button>)}</div>
      </section> : null}
      {loadingSheet?<div className="flex items-center justify-center gap-2 rounded-2xl border bg-white p-10 text-sm text-slate-500"><Loader2 className="animate-spin" size={18}/> Abriendo planilla…</div>:null}
      {sheet?<section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-4 sm:px-6"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Planilla diaria</p><h3 className="mt-1 text-xl font-bold text-slate-900">{new Intl.DateTimeFormat("es-AR",{dateStyle:"full"}).format(new Date(sheet.held_on+"T12:00:00"))}</h3><p className="mt-1 text-sm text-slate-500">{sheet.students.length} alumnos · {markedCount} registrados</p></div><span className="rounded-full bg-indigo-100 px-3 py-1.5 text-xs font-bold text-indigo-800">{sheet.students.length-markedCount} pendientes</span></div>
        <div className="divide-y divide-slate-100">
          {sheet.students.map((student,index)=><div key={student.student_id} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6">
            <div className="min-w-0"><div className="flex items-center gap-2"><span className="w-7 text-xs font-semibold text-slate-400">{index+1}.</span><p className="truncate font-semibold text-slate-900">{student.name}</p></div>{student.student_number?<p className="ml-9 mt-0.5 text-xs text-slate-400">Legajo {student.student_number}</p>:null}</div>
            <div className="flex flex-wrap gap-1.5">
              {canEditSheet ? statusOptions.map(option=><button key={option.value} type="button" aria-pressed={student.status===option.value} onClick={()=>updateStudent(student.student_id,{status:option.value})} className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${student.status===option.value ? option.style+" ring-2 ring-offset-1" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}>{option.label}</button>) : <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">{statusOptions.find(option=>option.value===student.status)?.label ?? "Sin registrar"}</span>}
            </div>
            <div className="sm:col-span-2">{canEditSheet ? <label><span className="sr-only">Observaciones para {student.name}</span><input value={student.observation??""} onChange={event=>updateStudent(student.student_id,{observation:event.target.value})} maxLength={1000} placeholder="Observaciones (opcional)" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:bg-white"/></label> : <p className="text-sm text-slate-500">Observación: {student.observation || "Sin observaciones"}</p>}</div>
          </div>)}
          {!sheet.students.length?<p className="p-8 text-center text-sm text-slate-500">No hay alumnos con matrícula activa para esta fecha.</p>:null}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-4 py-4 sm:px-6">{canEditSheet ? <><p className="text-xs text-slate-500">Solo vos podés modificar esta planilla.</p><button type="button" onClick={()=>void save()} disabled={saving||!sheet.students.length||markedCount!==sheet.students.length} className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-slate-300"><Save size={17}/>{saving?"Guardando…":"Guardar asistencia"}</button></> : <p className="text-xs font-semibold text-slate-600">Vista de supervisión institucional. Solo lectura.</p>}</div>
      </section>:<div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><ClipboardCheck className="mx-auto text-slate-300" size={28}/><p className="mt-2 font-semibold text-slate-700">Seleccioná una fecha del calendario</p><p className="mt-1 text-sm text-slate-500">Se abrirá la planilla con la nómina activa de alumnos.</p></div>}
      {error?<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>:null}
      {notice?<div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>:null}
    </div>
  );
}
