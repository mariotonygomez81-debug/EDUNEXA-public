"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, ShieldCheck, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Candidate={
  teacher_membership_id:string; teacher_name:string; is_auxiliary:boolean;
  can_edit_materials:boolean; can_edit_assignments:boolean; can_grade:boolean; can_attendance:boolean;
};
type PermissionKey="can_edit_materials"|"can_edit_assignments"|"can_grade"|"can_attendance";
const options:{key:PermissionKey;label:string;detail:string}[]=[
  {key:"can_edit_materials",label:"Publicar mensajes",detail:"Crear y editar avisos visibles en Novedades"},
  {key:"can_edit_assignments",label:"Gestionar actividades",detail:"Crear actividades, adjuntar recursos y editar consignas"},
  {key:"can_grade",label:"Revisión y calificación",detail:"Revisar entregas y registrar notas"},
  {key:"can_attendance",label:"Asistencia áulica",detail:"Consultar y completar la planilla de asistencia"},
];
const empty={can_edit_materials:false,can_edit_assignments:false,can_grade:false,can_attendance:false};
export default function ClassroomTeacherAccessManager({classroomId}:{classroomId:string}){
  const supabase=useMemo(()=>createClient(),[]);
  const [rows,setRows]=useState<Candidate[]>([]);
  const [selected,setSelected]=useState("");
  const [permissions,setPermissions]=useState(empty);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  const refresh=useCallback(async()=>{
    const {data,error}=await supabase.rpc("list_classroom_teacher_candidates",{p_classroom_id:classroomId});
    if(error)setError("No se pudieron cargar los docentes auxiliares.");
    else setRows((data??[]) as Candidate[]);
    setLoading(false);
  },[classroomId,supabase]);
  useEffect(()=>{
    let active=true;
    void supabase.rpc("list_classroom_teacher_candidates",{p_classroom_id:classroomId}).then(({data,error})=>{
      if(!active)return;
      if(error)setError("No se pudieron cargar los docentes auxiliares.");
      else setRows((data??[]) as Candidate[]);
      setLoading(false);
    });
    return ()=>{active=false;};
  },[classroomId,supabase]);
  const choose=(id:string)=>{
    setSelected(id);
    const row=rows.find(item=>item.teacher_membership_id===id);
    setPermissions(row?{
      can_edit_materials:row.can_edit_materials,can_edit_assignments:row.can_edit_assignments,
      can_grade:row.can_grade,can_attendance:row.can_attendance,
    }:empty);
    setNotice(null);setError(null);
  };
  const save=async(active:boolean)=>{
    if(!selected)return;
    setSaving(true);setError(null);setNotice(null);
    const {error}=await supabase.rpc("set_classroom_teacher_permissions",{
      p_classroom_id:classroomId,p_teacher_membership_id:selected,
      p_can_edit_materials:active&&permissions.can_edit_materials,
      p_can_edit_assignments:active&&permissions.can_edit_assignments,
      p_can_grade:active&&permissions.can_grade,
      p_can_attendance:active&&permissions.can_attendance,p_is_active:active,
    });
    if(error)setError("No se pudieron guardar los permisos. Verificá que el docente esté asignado a esta división.");
    else {setNotice(active?"Permisos del docente auxiliar actualizados.":"Acceso del docente auxiliar revocado.");await refresh();}
    setSaving(false);
  };
  return <section className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">
    <div className="flex items-center gap-3"><span className="rounded-xl bg-violet-100 p-2 text-violet-700"><ShieldCheck size={20}/></span><div><h3 className="font-bold text-slate-900">Docentes auxiliares</h3><p className="text-sm text-slate-500">Incorporá docentes de esta institución y definí qué tareas pueden realizar en esta aula. Los permisos se asignan por separado.</p></div></div>
    {loading?<p className="mt-4 flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin"/> Cargando docentes...</p>:rows.length?<div className="mt-4 space-y-3">
      <label className="block text-sm font-semibold">Seleccionar docente auxiliar<select value={selected} onChange={e=>choose(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal"><option value="">Seleccionar docente</option>{rows.map(row=><option key={row.teacher_membership_id} value={row.teacher_membership_id}>{row.teacher_name}{row.is_auxiliary?" · Auxiliar habilitado":""}</option>)}</select></label>
      {selected?<><div className="grid gap-2 sm:grid-cols-2">{options.map(option=><label key={option.key} className="flex items-start gap-3 rounded-xl border border-slate-100 p-3"><input type="checkbox" checked={permissions[option.key]} onChange={e=>setPermissions(old=>({...old,[option.key]:e.target.checked}))} className="mt-1"/><span><strong className="block text-sm text-slate-800">{option.label}</strong><span className="text-xs text-slate-500">{option.detail}</span></span></label>)}</div><div className="flex flex-wrap gap-2"><button type="button" disabled={saving} onClick={()=>void save(true)} className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving?<Loader2 size={15} className="animate-spin"/>:<Check size={15}/>} Guardar permisos</button>{rows.find(row=>row.teacher_membership_id===selected)?.is_auxiliary?<button type="button" disabled={saving} onClick={()=>void save(false)} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-700 disabled:opacity-50"><X size={15}/> Revocar acceso</button>:null}</div></>:null}
    </div>:<p className="mt-4 text-sm text-slate-500">No encontramos otros docentes activos y elegibles en esta institución para esta aula. Verificá que tengan una asignación vigente en la división correspondiente.</p>}
    {error?<p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>:null}
    {notice?<p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>:null}
    <p className="mt-4 text-xs text-slate-400">Los permisos se validan en la base de datos y cada cambio queda registrado en auditoría. El auxiliar no puede administrar otros docentes ni transferir la titularidad.</p>
  </section>;
}
