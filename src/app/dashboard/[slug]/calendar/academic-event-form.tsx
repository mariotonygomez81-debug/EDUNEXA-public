"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAcademicEvent } from "./actions";

const categoryOptions = [
  ["jornada", "Jornada"], ["feria", "Feria"], ["examen", "Examen"],
  ["previa", "Mesa de previas"], ["acto", "Acto escolar"], ["reunion", "Reunión"],
  ["feriado", "Feriado / asueto"], ["otro", "Otro"],
];
const audienceOptions = [
  ["all", "Toda la comunidad"], ["staff", "Todo el personal"],
  ["teachers", "Docentes"], ["students", "Alumnos"], ["families", "Tutores"], ["prefects", "Preceptores"],
];

export default function AcademicEventForm({ slug }: { slug: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ok:boolean;message:string}|null>(null);
  const router = useRouter();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await createAcademicEvent(data);
      setFeedback(result);
      if (result.ok) {
        formRef.current?.reset();
        router.refresh();
      }
    });
  }

  return <form ref={formRef} onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
    <input type="hidden" name="slug" value={slug}/>
    <label className="grid gap-1 text-sm font-medium sm:col-span-2">Nombre del evento
      <input name="title" required minLength={3} maxLength={160} placeholder="Ej.: Feria de ciencias y tecnología" className="rounded-xl border border-slate-300 px-3 py-2.5"/>
    </label>
    <label className="grid gap-1 text-sm font-medium">Tipo de evento
      <select name="category" className="rounded-xl border border-slate-300 px-3 py-2.5">{categoryOptions.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
    </label>
    <label className="grid gap-1 text-sm font-medium">Destinatarios
      <select name="audience" className="rounded-xl border border-slate-300 px-3 py-2.5">{audienceOptions.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
    </label>
    <label className="grid gap-1 text-sm font-medium">Comienza
      <input name="starts_at" type="datetime-local" required className="rounded-xl border border-slate-300 px-3 py-2.5"/>
    </label>
    <label className="grid gap-1 text-sm font-medium">Finaliza (opcional)
      <input name="ends_at" type="datetime-local" className="rounded-xl border border-slate-300 px-3 py-2.5"/>
    </label>
    <label className="grid gap-1 text-sm font-medium sm:col-span-2">Lugar
      <input name="location" maxLength={160} placeholder="Ej.: SUM / Patio central" className="rounded-xl border border-slate-300 px-3 py-2.5"/>
    </label>
    <label className="grid gap-1 text-sm font-medium sm:col-span-2">Descripción
      <textarea name="description" rows={3} maxLength={5000} placeholder="Información útil para los participantes." className="rounded-xl border border-slate-300 px-3 py-2.5"/>
    </label>
    {feedback && <p role={feedback.ok?"status":"alert"} className={"sm:col-span-2 rounded-xl p-3 text-sm " + (feedback.ok?"bg-emerald-50 text-emerald-800":"bg-rose-50 text-rose-800")}>{feedback.message}</p>}
    <div className="sm:col-span-2"><button disabled={pending} className="rounded-xl bg-violet-700 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60">{pending?"Publicando…":"Publicar evento"}</button></div>
  </form>;
}
