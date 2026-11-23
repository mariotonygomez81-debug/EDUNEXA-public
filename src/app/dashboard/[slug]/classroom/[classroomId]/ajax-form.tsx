"use client";
import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
type Result={ok:boolean;message:string};
export default function AjaxForm({action,children,className,id,successMessage}:{action:(data:FormData)=>Promise<Result>;children:ReactNode;className?:string;id?:string;successMessage?:string}) {
 const router=useRouter();
 const [pending,startTransition]=useTransition();
 const [notice,setNotice]=useState<{ok:boolean;text:string}|null>(null);
 const scrollPosition=useRef<number|null>(null);
 useEffect(()=>{
  if(pending||scrollPosition.current===null)return;
  const y=scrollPosition.current;
  scrollPosition.current=null;
  // Next refreshes server components without reloading the document.
  // Restore the exact viewport position after React has committed the refreshed tree.
  requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo({top:y,left:0,behavior:"auto"})));
 },[pending]);
 function submit(event:FormEvent<HTMLFormElement>) {
  event.preventDefault();
  if(pending)return;
  const form=event.currentTarget;
  const data=new FormData(form);
  scrollPosition.current=window.scrollY;
  setNotice(null);
  startTransition(async()=>{
   try {
    const result=await action(data);
    setNotice({ok:result.ok,text:result.ok?(successMessage??result.message):result.message});
    if(result.ok)router.refresh();
    else scrollPosition.current=null;
   } catch {
    scrollPosition.current=null;
    setNotice({ok:false,text:"Ocurrió un problema de conexión. No se confirmó el cambio; intentá nuevamente."});
   }
  });
 }
 return <form id={id} onSubmit={submit} className={className} aria-busy={pending}>
  <fieldset disabled={pending} className="contents">{children}</fieldset>
  {notice?<p role={notice.ok?"status":"alert"} aria-live="polite" className={`rounded-lg px-3 py-2 text-sm ${notice.ok?"bg-emerald-50 text-emerald-800":"bg-rose-50 text-rose-800"}`}>{notice.text}</p>:null}
  {pending?<span className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-700"><LoaderCircle size={14} className="animate-spin"/> Guardando sin recargar el documento…</span>:null}
 </form>;
}
