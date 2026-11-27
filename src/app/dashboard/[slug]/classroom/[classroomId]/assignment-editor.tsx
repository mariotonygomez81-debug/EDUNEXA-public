import { ClipboardList, Save } from "lucide-react";
import { updateClassroomAssignment } from "./actions";
import AjaxForm from "./ajax-form";

type Assignment = { id:string; title:string; instructions:string|null; due_at:string|null; max_score:number|null; published_at:string|null };

function toLocalInput(value:string|null) {
  if(!value) return "";
  const date=new Date(value);
  if(Number.isNaN(date.getTime())) return "";
  const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);
  return local.toISOString().slice(0,16);
}

export default function ClassroomAssignmentEditor({slug,classroomId,assignment}:{slug:string;classroomId:string;assignment:Assignment}) {
  return <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50">
    <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-indigo-700"><ClipboardList size={16}/> Configurar actividad</summary>
    <AjaxForm action={updateClassroomAssignment} className="grid gap-3 border-t border-slate-200 p-4">
      <input type="hidden" name="slug" value={slug}/><input type="hidden" name="classroom_id" value={classroomId}/><input type="hidden" name="assignment_id" value={assignment.id}/>
      <label className="block text-sm font-medium">Título<input name="title" required minLength={3} maxLength={160} defaultValue={assignment.title} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2"/></label>
      <label className="block text-sm font-medium">Consigna<textarea name="instructions" maxLength={20000} rows={4} defaultValue={assignment.instructions??""} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2"/></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium">Fecha límite<input name="due_at" type="datetime-local" defaultValue={toLocalInput(assignment.due_at)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2"/></label>
        <label className="block text-sm font-medium">Evaluación<select name="grading_mode" defaultValue={assignment.max_score===null?"ungraded":"graded"} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2"><option value="graded">Con calificación · 100%</option><option value="ungraded">Sin puntaje · devolución cualitativa</option></select></label>
      </div>
      <p className="text-xs text-slate-500">Elegí si la actividad se calificará sobre 100% o si tendrá solamente devolución cualitativa.</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="publish" defaultChecked={Boolean(assignment.published_at)}/> Publicada y visible para los participantes</label>
      <p className="text-xs text-slate-500">No se podrá cambiar a “Sin puntaje” si la actividad ya tiene calificaciones numéricas guardadas.</p>
      <button className="inline-flex w-fit items-center gap-2 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white"><Save size={15}/> Guardar configuración</button>
    </AjaxForm>
  </details>;
}
