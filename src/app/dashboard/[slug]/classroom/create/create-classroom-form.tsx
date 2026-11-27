"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Plus } from "lucide-react";
import { createTeacherClassroom, type CreateClassroomResult } from "./actions";

export default function CreateClassroomForm({ slug, children }: { slug: string; children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<CreateClassroomResult | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setResult(null);
    startTransition(async () => {
      try {
        const response = await createTeacherClassroom(data);
        setResult(response);
        if (response.ok && response.classroomId) {
          router.push(`/dashboard/${encodeURIComponent(slug)}/classroom/${response.classroomId}?created=classroom`);
        }
      } catch {
        setResult({ ok: false, message: "No se pudo completar la operación. Revisá tu conexión e intentá nuevamente." });
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8" aria-busy={pending}>
      <fieldset disabled={pending} className="contents">{children}</fieldset>
      {result ? <p role={result.ok ? "status" : "alert"} aria-live="polite" className={`rounded-xl px-4 py-3 text-sm ${result.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{result.message}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
        <p className="text-xs text-slate-500">Podrás compartir el acceso y configurar sus contenidos después de crearla.</p>
        <button type="submit" disabled={pending} className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-800 focus:outline-none focus:ring-4 focus:ring-indigo-200 disabled:cursor-wait disabled:opacity-70">
          {pending ? <LoaderCircle size={17} className="animate-spin"/> : <Plus size={17}/>}
          {pending ? "Creando aula…" : "Crear aula virtual"}
        </button>
      </div>
    </form>
  );
}
