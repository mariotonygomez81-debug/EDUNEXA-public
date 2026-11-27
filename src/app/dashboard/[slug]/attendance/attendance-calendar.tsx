"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardCheck } from "lucide-react";

type Session = { id: string; division_id: string; held_on: string; period_label: string | null; status: string };
type Props = { slug: string; sessions: Session[]; divisionNames: Record<string,string> };

const keyOf=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

export default function AttendanceCalendar({slug,sessions,divisionNames}:Props) {
  const [month,setMonth]=useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1));
  const [selected,setSelected]=useState(keyOf(new Date()));
  const days=useMemo(()=>{
    const first=new Date(month.getFullYear(),month.getMonth(),1);
    const offset=(first.getDay()+6)%7;
    const start=new Date(first.getFullYear(),first.getMonth(),1-offset);
    return Array.from({length:42},(_,i)=>new Date(start.getFullYear(),start.getMonth(),start.getDate()+i));
  },[month]);
  const daySessions=sessions.filter(s=>s.held_on===selected);
  const label=new Intl.DateTimeFormat("es-AR",{month:"long",year:"numeric"}).format(month);
  return <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5 sm:p-6">
      <div><div className="flex items-center gap-2 text-indigo-700"><CalendarDays size={18}/><span className="text-xs font-bold uppercase tracking-widest">Calendario institucional</span></div><h2 className="mt-1 text-xl font-bold capitalize text-slate-900">{label}</h2><p className="mt-1 text-sm text-slate-500">Elegí una fecha para consultar las planillas de preceptoría.</p></div>
      <div className="flex items-center gap-2"><button type="button" aria-label="Mes anterior" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))} className="rounded-xl border p-2 hover:bg-slate-50"><ChevronLeft size={18}/></button><button type="button" onClick={()=>{setMonth(new Date(new Date().getFullYear(),new Date().getMonth(),1));setSelected(keyOf(new Date()));}} className="rounded-xl border px-3 py-2 text-sm font-semibold hover:bg-slate-50">Hoy</button><button type="button" aria-label="Mes siguiente" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))} className="rounded-xl border p-2 hover:bg-slate-50"><ChevronRight size={18}/></button></div>
    </div>
    <div className="grid grid-cols-7 gap-1 p-3 sm:gap-2 sm:p-5">
      {["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].map(d=><div key={d} className="py-2 text-center text-xs font-bold text-slate-400">{d}</div>)}
      {days.map(day=>{const k=keyOf(day);const count=sessions.filter(s=>s.held_on===k).length;const inMonth=day.getMonth()===month.getMonth();const today=k===keyOf(new Date());return <button key={k} type="button" onClick={()=>setSelected(k)} aria-pressed={selected===k} className={`min-h-16 rounded-xl border p-1.5 text-left transition sm:min-h-20 sm:p-2 ${selected===k?"border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100":"border-slate-100 hover:border-indigo-200 hover:bg-slate-50"} ${inMonth?"bg-white":"bg-slate-50/70"}`}>
        <span className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${today?"bg-indigo-600 text-white":inMonth?"text-slate-800":"text-slate-300"}`}>{day.getDate()}</span>
        {count>0?<span className="mt-1 block truncate text-center text-[9px] font-bold text-emerald-700 sm:text-[10px]">{count} planilla(s)</span>:<span className="mt-1 block text-center text-[9px] text-slate-300 sm:text-[10px]">{inMonth?"—":""}</span>}
      </button>})}
    </div>
    <div className="border-t border-slate-100 bg-slate-50/70 p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2"><ClipboardCheck size={17} className="text-indigo-700"/><h3 className="font-semibold text-slate-900">{new Intl.DateTimeFormat("es-AR",{dateStyle:"full"}).format(new Date(selected+"T12:00:00"))}</h3></div>
      {daySessions.length?<div className="grid gap-2 sm:grid-cols-2">{daySessions.map(s=><Link key={s.id} href={`/dashboard/${slug}/attendance/${s.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:border-indigo-300 hover:bg-indigo-50/40"><span className="min-w-0"><strong className="block truncate text-sm text-slate-900">{divisionNames[s.division_id]??"División"}</strong><span className="mt-1 block text-xs text-slate-500">{s.period_label??"Asistencia institucional"}</span></span><span className="shrink-0 rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-800">{s.status==="open"?"Abierta":s.status==="submitted"?"Presentada":"Cerrada"}</span></Link>)}</div>:<p className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center text-sm text-slate-500">No hay planillas institucionales para esta fecha. Si tenés permiso, podés crear una desde el panel lateral.</p>}
    </div>
  </section>;
}
