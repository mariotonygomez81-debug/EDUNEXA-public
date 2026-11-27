import { FileText, Save } from "lucide-react";
import { updateClassroomMaterial } from "./actions";
import AjaxForm from "./ajax-form";

type Material = { id:string; title:string; body:string|null; published_at:string|null };

export default function ClassroomMaterialEditor({slug,classroomId,material}:{slug:string;classroomId:string;material:Material}) {
  return <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50">
    <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-indigo-700"><FileText size={16}/> Editar mensaje</summary>
    <AjaxForm action={updateClassroomMaterial} className="grid gap-3 border-t border-slate-200 p-4">
      <input type="hidden" name="slug" value={slug}/><input type="hidden" name="classroom_id" value={classroomId}/><input type="hidden" name="material_id" value={material.id}/>
      <label className="block text-sm font-medium">Título<input name="title" required minLength={3} maxLength={160} defaultValue={material.title} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2"/></label>
      <label className="block text-sm font-medium">Contenido<textarea name="body" maxLength={20000} rows={4} defaultValue={material.body??""} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2"/></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="publish" defaultChecked={Boolean(material.published_at)}/> Publicado y visible para los participantes</label>
      <button className="inline-flex w-fit items-center gap-2 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white"><Save size={15}/> Guardar material</button>
    </AjaxForm>
  </details>;
}
