"use client";

import { useMemo, useState } from "react";
import { Copy, QrCode, RefreshCw, Check, Link2, Users } from "lucide-react";
import { rotateClassroomInvite } from "./actions";
import ClassroomPdfButton from "./classroom-pdf-button";
import AjaxForm from "./ajax-form";

type Invite = {
  join_code: string;
  join_token: string;
  enabled: boolean;
  expires_at: string | null;
};

export default function ClassroomInvitePanel({
  slug,
  classroomId,
  invite,
  institutionName,
  classroomTitle,
  courseName,
  divisionName,
  subjectName,
  teacherNames,
}: {
  slug: string;
  classroomId: string;
  invite: Invite | null;
  institutionName: string;
  classroomTitle: string;
  courseName: string;
  divisionName: string;
  subjectName: string;
  teacherNames: string[];
}) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const inviteUrl = useMemo(() => {
    if (typeof window === "undefined" || !invite) return "";
    return `${window.location.origin}/join/classroom?token=${invite.join_token}&school=${encodeURIComponent(slug)}`;
  }, [invite, slug]);
  const qrDestination = typeof window !== "undefined" ? `${window.location.origin}/join/classroom?school=${encodeURIComponent(slug)}` : "";
  const qrUrl = qrDestination
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(qrDestination)}`
    : "";

  async function copy(value: string, kind: "code" | "link") {
    if (!value || !navigator.clipboard) return;
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1800);
  }

  if (!invite) return (
    <section id="invitar" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
      No se pudo generar el acceso de invitación. Verificá los permisos de administración del aula.
    </section>
  );

  return (
    <section id="invitar" className="overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-indigo-50 via-white to-cyan-50 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-100 text-indigo-700"><Users size={19}/></span>
          <div><h2 className="font-bold text-slate-900">Invitar estudiantes</h2><p className="text-xs text-slate-500">Código, enlace o QR para incorporarse a esta aula</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2"><ClassroomPdfButton institutionName={institutionName} classroomTitle={classroomTitle} courseName={courseName} divisionName={divisionName} subjectName={subjectName} teacherNames={teacherNames} joinCode={invite?.join_code ?? ""} schoolSlug={slug}/><AjaxForm action={rotateClassroomInvite} className="inline-flex">
          <input type="hidden" name="slug" value={slug}/>
          <input type="hidden" name="classroom_id" value={classroomId}/>
          <button className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50"><RefreshCw size={14}/> Renovar invitación</button>
        </AjaxForm></div>
      </div>
      <div className="grid gap-5 p-5 md:grid-cols-[1fr_auto] md:items-center">
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Código de clase</p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <span className="font-mono text-2xl font-bold tracking-[.18em] text-slate-900">{invite.join_code}</span>
              <button type="button" onClick={() => copy(invite.join_code, "code")} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-100">
                {copied === "code" ? <Check size={14}/> : <Copy size={14}/>} {copied === "code" ? "Copiado" : "Copiar código"}
              </button>
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Enlace de invitación</p>
            <div className="mt-2 flex gap-2">
              <input readOnly value={inviteUrl || "Preparando enlace seguro…"} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"/>
              <button type="button" onClick={() => copy(inviteUrl, "link")} disabled={!inviteUrl} aria-label="Copiar enlace" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-indigo-700 text-white hover:bg-indigo-800 disabled:opacity-50">{copied === "link" ? <Check size={16}/> : <Link2 size={16}/>}</button>
            </div>
          </div>
          <p className="text-xs leading-5 text-slate-500">Solo podrán unirse estudiantes con matrícula activa en la división de esta aula. Renovar la invitación invalida el código y enlace anteriores.</p>
        </div>
        <div className="mx-auto w-fit rounded-2xl border border-slate-200 bg-white p-3 text-center">
          {qrUrl ? <img src={qrUrl} width="160" height="160" alt="Código QR de invitación al aula" className="h-40 w-40" /> : <div className="grid h-40 w-40 place-items-center bg-slate-50 text-slate-400"><QrCode size={38}/></div>}
          <p className="mt-2 text-xs font-semibold text-slate-600">Escaneá y escribí el código</p>
        </div>
      </div>
    </section>
  );
}
