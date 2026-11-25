"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

export type PrefectAttendanceSession = {
  id: string;
  division_id: string;
  held_on: string;
  period_label: string | null;
  status: string;
};
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;

export default function PrefectAttendanceCalendar({slug,courseId,divisionId,sessions,divisionLabels,selectedDate}:{
  slug:string;courseId:string;divisionId:string;sessions:PrefectAttendanceSession[];
  divisionLabels:Record<string,string>;selectedDate:string|null;
}) {
  const router=useRouter();
  const month=useMemo(()=>selectedDate?new Date(Number(selectedDate.slice(0,4)),Number(selectedDate.slice(5,7))-1,1):new Date(new Date().getFullYear(),new Date().getMonth(),1),[selectedDate]);
  const days=useMemo(()=>{
    const first=new Date(month.getFullYear(),month.getMonth(),1),offset=(first.getDay()+6)%7;
    const start=new Date(first.getFullYear(),first.getMonth(),1-offset);
    return Array.from({length:42},(_,i)=>new Date(start.getFullYear(),start.getMonth(),start.getDate()+i));
  },[month]);
  const monthLabel=new Intl.DateTimeFormat("es-AR",{month:"long",year:"numeric"}).format(month);
  const selectedSessions=sessions.filter(s=>s.held_on===selectedDate);
  const navigateDate=(date:string)=>router.push(`/dashboard/${slug}/prefect/attendance?courseId=${courseId}&divisionId=${divisionId}&date=${date}`);
  const navigateMonth=(delta:number)=>{const next=new Date(month.getFullYear(),month.getMonth()+delta,1);router.push(`/dashboard/${slug}/prefect/attendance?courseId=${courseId}&divisionId=${divisionId}&date=${dateKey(next)}`);};
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><div className="flex items-center gap-2 text-indigo-700"><CalendarDays size={19}/><span className="text-xs font-bold uppercase tracking-widest">Calendario de asistencia</span></div>
        <h2 className="mt-1 text-xl font-bold capitalize text-slate-900">{monthLabel}</h2>
        <p className="mt-1 text-sm text-slate-500">{divisionLabels[divisionId]} · Elegí una fecha para desplegar la planilla.</p></div>
      <div className="flex items-center gap-2"><button type="button" onClick={()=>navigateMonth(-1)} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50" aria-label="Mes anterior"><ChevronLeft size={19}/></button>
        <button type="button" onClick={()=>navigateDate(dateKey(new Date()))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50">Hoy</button>
        <button type="button" onClick={()=>navigateMonth(1)} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50" aria-label="Mes siguiente"><ChevronRight size={19}/></button></div>
    </div>
    <div className="mt-5 grid grid-cols-7 gap-1 sm:gap-2">
      {["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].map(day=><div key={day} className="py-2 text-center text-xs font-bold text-slate-400">{day}</div>)}
      {days.map(day=>{const key=dateKey(day),inMonth=day.getMonth()===month.getMonth(),isToday=key===dateKey(new Date()),selected=key===selectedDate,hasSheet=sessions.some(s=>s.held_on===key);
        return <button key={key} type="button" onClick={()=>navigateDate(key)} className={`min-h-16 rounded-xl border p-1.5 text-left transition sm:min-h-20 sm:p-2 ${selected?"border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100":"border-slate-100 hover:border-indigo-200 hover:bg-slate-50"} ${inMonth?"bg-white":"bg-slate-50/70"}`}>
          <span className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${isToday?"bg-indigo-600 text-white":inMonth?"text-slate-800":"text-slate-300"}`}>{day.getDate()}</span>
          <span className={`mt-1 block text-center text-[9px] font-semibold sm:text-[10px] ${hasSheet?"text-emerald-700":"text-slate-300"}`}>{hasSheet?"Planilla":" "}</span>
        </button>;
      })}
    </div>
    <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500"/>Fecha con planilla propia</span><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full border border-slate-300"/>Fecha sin planilla</span></div>
    {selectedDate&&selectedSessions.length>0?<p className="mt-3 text-sm font-medium text-emerald-700">{selectedSessions.length} planilla(s) guardada(s) en esta fecha.</p>:null}
  </section>;
}
