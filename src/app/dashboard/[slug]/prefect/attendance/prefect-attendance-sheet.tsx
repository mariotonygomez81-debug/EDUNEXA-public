"use client";

import { useState } from "react";
import { Save } from "lucide-react";

type Student={id:string;first_name:string;last_name:string;student_number:string|null};
type RecordRow={student_id:string;status:string;note:string|null};
type Status="present"|"absent"|"half_absence";
const options:{value:Status;label:string;style:string}[]=[
 {value:"present",label:"Presente",style:"border-emerald-300 bg-emerald-50 text-emerald-800"},
 {value:"absent",label:"Ausente",style:"border-rose-300 bg-rose-50 text-rose-800"},
 {value:"half_absence",label:"Media falta",style:"border-amber-300 bg-amber-50 text-amber-800"},
];
export default function PrefectAttendanceSheet({slug,sessionId,students,records,status,saveAction}:{
 slug:string;sessionId:string;students:Student[];records:RecordRow[];status:string;saveAction:(data:FormData)=>void;
}) {
 const initial=new Map(records.map(r=>[r.student_id,r]));
 const [values,setValues]=useState<Record<string,{status:Status;note:string}>>(()=>Object.fromEntries(students.map(s=>{
  const old=initial.get(s.id);return [s.id,{status:(old?.status==="absent"||old?.status==="half_absence"?"absent":old?.status==="present"?"present":"present") as Status,note:old?.note??""}];
 })));
 const marked=students.filter(s=>Boolean(values[s.id]?.status)).length;
 return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-4 sm:px-6">
   <div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Planilla diaria</p>
    <h2 className="mt-1 text-xl font-bold capitalize text-slate-900">{new Intl.DateTimeFormat("es-AR",{dateStyle:"full"}).format(new Date(students.length?new Date().toISOString().slice(0,10)+"T12:00:00":new Date().toISOString()))}</h2>
    <p className="mt-1 text-sm text-slate-500">{students.length} alumnos · {marked} listos para guardar</p></div>
   <span className="rounded-full bg-indigo-100 px-3 py-1.5 text-xs font-bold text-indigo-800">{students.length-marked} pendientes</span>
  </div>
  {students.length?<form action={saveAction}>
   <input type="hidden" name="slug" value={slug}/><input type="hidden" name="session_id" value={sessionId}/>
   <div className="divide-y divide-slate-100">{students.map((student,index)=>{const current=values[student.id]??{status:"present" as Status,note:""};return <article key={student.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-6">
    <div className="min-w-0"><div className="flex items-center gap-2"><span className="w-7 text-xs font-semibold text-slate-400">{index+1}.</span><p className="truncate font-semibold text-slate-900">{student.last_name} {student.first_name}</p></div>{student.student_number?<p className="ml-9 mt-0.5 text-xs text-slate-400">Legajo {student.student_number}</p>:null}</div>
    <div className="flex flex-wrap gap-1.5">{options.map(option=><button key={option.value} type="button" aria-pressed={current.status===option.value} onClick={()=>setValues(old=>({...old,[student.id]:{...old[student.id],status:option.value}}))} className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${current.status===option.value?option.style+" ring-2 ring-offset-1":"border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}>{option.label}</button>)}</div>
    <label className="sm:col-span-2"><span className="sr-only">Observaciones para {student.first_name}</span><input name={`note_${student.id}`} value={current.note} onChange={e=>setValues(old=>({...old,[student.id]:{...old[student.id],note:e.target.value}}))} maxLength={500} placeholder="Observaciones (opcional)" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"/></label>
    <input type="hidden" name="student_id" value={student.id}/><input type="hidden" name={`status_${student.id}`} value={current.status}/>
   </article>})}</div>
   <div className="flex justify-end border-t border-slate-100 p-4 sm:px-6"><button disabled={status!=="open"} className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300"><Save size={16}/>Guardar asistencia</button></div>
  </form>:<p className="p-8 text-center text-sm text-slate-500">No hay alumnos matriculados en esta división para la fecha seleccionada.</p>}
 </section>;
}
