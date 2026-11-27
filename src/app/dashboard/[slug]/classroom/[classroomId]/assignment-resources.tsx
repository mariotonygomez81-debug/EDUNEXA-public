"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { FileText, Link2, LoaderCircle, Paperclip, PlayCircle, ExternalLink } from "lucide-react";

export type AssignmentResource = {
 resource_id:string; assignment_id:string; kind:"file"|"link"; title:string; url:string|null;
 object_path:string|null; original_filename:string|null; mime_type:string|null; byte_size:number|null;
 created_at:string; signedUrl:string|null;
};
const MAX_FILE_SIZE=10*1024*1024;
const ALLOWED_MIME_TYPES=new Set([
 "application/pdf","image/jpeg","image/png","text/plain",
 "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
 "application/vnd.openxmlformats-officedocument.presentationml.presentation",
 "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
function youtubeEmbed(value:string|null){
 if(!value)return null;
 try{
  const url=new URL(value);
  if(url.hostname==="youtu.be")return url.pathname.slice(1);
  if(["youtube.com","www.youtube.com","m.youtube.com"].includes(url.hostname)){
   if(url.pathname==="/watch")return url.searchParams.get("v");
   const match=url.pathname.match(/^\/(embed|shorts)\/([^/]+)/);return match?.[2]??null;
  }
 }catch{}
 return null;
}
export default function ClassroomAssignmentResources({assignmentId,resources,canManage}:{assignmentId:string;resources:AssignmentResource[];canManage:boolean}){
 const router=useRouter();const fileInput=useRef<HTMLInputElement>(null);
 const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
 const [title,setTitle]=useState("");const [url,setUrl]=useState("");
 const assignmentResources=resources.filter(item=>item.assignment_id===assignmentId);
 async function addLink(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;setBusy(true);setMessage("");
  try{
   const supabase=createClient();
   const {error}=await supabase.rpc("add_classroom_assignment_link",{p_assignment_id:assignmentId,p_title:title.trim(),p_url:url.trim()});
   if(error)throw error;
   setTitle("");setUrl("");setMessage("Enlace agregado a la actividad.");const y=window.scrollY;router.refresh();requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo({top:y,left:0,behavior:"auto"})));
  }catch{setMessage("No se pudo agregar el enlace. Verificá que sea una dirección HTTPS válida y que tengas permisos.");}
  finally{setBusy(false);}
 }
 async function uploadFiles(files:FileList|null){
  if(!files?.length||busy)return;setBusy(true);setMessage("");
  const supabase=createClient();let completed=0;const failures:string[]=[];
  try{
   for(const file of Array.from(files)){
    if(!ALLOWED_MIME_TYPES.has(file.type)){failures.push(file.name+": tipo no permitido");continue;}
    if(file.size<1||file.size>MAX_FILE_SIZE){failures.push(file.name+": supera 10 MB");continue;}
    const {data:intents,error:intentError}=await supabase.rpc("create_classroom_assignment_resource_upload",{
     p_assignment_id:assignmentId,p_original_filename:file.name,p_mime_type:file.type,p_byte_size:file.size
    });
    if(intentError||!intents?.[0]){failures.push(file.name+": no se pudo autorizar la carga");continue;}
    const intent=intents[0];
    const {error:uploadError}=await supabase.storage.from("classroom-files").upload(intent.object_path,file,{cacheControl:"3600",contentType:file.type,upsert:false});
    if(uploadError){failures.push(file.name+": error al subir");continue;}
    const {error:finalizeError}=await supabase.rpc("finalize_classroom_assignment_resource_upload",{p_resource_id:intent.resource_id});
    if(finalizeError){failures.push(file.name+": no pudo validarse");continue;}
    completed++;
   }
   setMessage(failures.length?(`Se adjuntaron ${completed} archivo(s). ${failures.join("; ")}.`):`Se adjuntaron ${completed} archivo(s) correctamente.`);
   if(completed){const y=window.scrollY;router.refresh();requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo({top:y,left:0,behavior:"auto"})));}
  }catch{setMessage("Se interrumpió la carga. Revisá los archivos y volvé a intentar.");}
  finally{setBusy(false);if(fileInput.current)fileInput.current.value="";}
 }
 return <section className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
  <div className="flex items-center gap-2"><Paperclip size={16} className="text-indigo-700"/><h4 className="text-sm font-bold text-slate-800">Materiales y recursos de la actividad</h4></div>
  {assignmentResources.length?<div className="mt-3 grid gap-2 sm:grid-cols-2">
   {assignmentResources.map(resource=>{
    const videoId=resource.kind==="link"?youtubeEmbed(resource.url):null;
    return <article key={resource.resource_id} className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
     <div className="flex items-start gap-2">
      <span className="mt-0.5 text-indigo-700">{resource.kind==="file"?<FileText size={18}/>:videoId?<PlayCircle size={18}/>:<Link2 size={18}/>}</span>
      <div className="min-w-0 flex-1">
       <p className="break-words text-sm font-semibold text-slate-800">{resource.title}</p>
       {resource.kind==="file"?resource.signedUrl?<a href={resource.signedUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex text-xs font-semibold text-indigo-700 underline">Abrir o descargar archivo</a>:<span className="text-xs text-rose-600">Archivo temporalmente no disponible</span>
       :resource.url?<a href={resource.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 break-all text-xs font-semibold text-indigo-700 underline">Abrir recurso <ExternalLink size={12}/></a>:null}
      </div>
     </div>
     {videoId?<div className="mt-3 aspect-video overflow-hidden rounded-lg bg-slate-950"><iframe className="h-full w-full" src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`} title={resource.title} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen/></div>:null}
    </article>
   })}
  </div>:<p className="mt-2 text-xs text-slate-500">Todavía no se agregaron archivos ni enlaces.</p>}
  {canManage?<div className="mt-4 grid gap-4 border-t border-slate-200 pt-4 lg:grid-cols-2">
   <form onSubmit={addLink} className="space-y-2">
    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Agregar enlace</p>
    <label className="block text-xs font-medium text-slate-700">Nombre del recurso<input required maxLength={180} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ej. Video explicativo" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"/></label>
    <label className="block text-xs font-medium text-slate-700">Enlace HTTPS<input required type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://..." className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"/></label>
    <button disabled={busy} className="rounded-lg bg-indigo-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Agregar enlace</button>
   </form>
   <div className="space-y-2">
    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Adjuntar archivos</p>
    <p className="text-xs text-slate-600">Podés seleccionar varios archivos a la vez: PDF, Word, PowerPoint, Excel, imágenes o TXT. Máximo 10 MB por archivo.</p>
    <button type="button" disabled={busy} onClick={()=>fileInput.current?.click()} className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-700 disabled:opacity-50"><Paperclip size={14}/> Seleccionar archivos</button>
    <input ref={fileInput} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.txt,.docx,.pptx,.xlsx" className="sr-only" disabled={busy} onChange={e=>void uploadFiles(e.currentTarget.files)}/>
   </div>
  </div>:null}
  {busy?<p className="mt-3 flex items-center gap-2 text-xs text-indigo-700" role="status"><LoaderCircle size={14} className="animate-spin"/> Procesando recursos sin recargar el aula…</p>:null}
  {message?<p role="status" aria-live="polite" className="mt-3 rounded-lg bg-white px-3 py-2 text-xs text-slate-700">{message}</p>:null}
 </section>;
}
