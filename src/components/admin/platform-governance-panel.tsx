"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, KeyRound, Loader2, RefreshCw, ShieldCheck } from "lucide-react";

type Superadmin = { user_id: string; email: string | null; created_at: string; last_sign_in_at: string | null };
type ChangeRequest = {
  request_id: string; target_user_id: string; target_email: string | null;
  requested_action: "grant" | "revoke"; requested_by: string; requested_by_email: string | null;
  approved_by: string | null; approved_by_email: string | null; executed_by: string | null;
  status: string; reason: string; created_at: string; approved_at: string | null;
  completed_at: string | null; failure_code: string | null;
};
type AuditEvent = {
  id: string; occurred_at: string; actor_user_id: string; action: string;
  target_type: string; target_id: string | null; institution_id: string | null;
  reason: string; request_id: string; outcome: string; metadata_redacted: Record<string, unknown>;
};

const statusLabel: Record<string,string> = {
  pending: "Pendiente de aprobación", approved: "Aprobada · lista para ejecutar",
  executing: "En ejecución", completed: "Completada", failed: "Fallida", rejected: "Rechazada",
};
const dateLabel = (value: string | null) => value
  ? new Intl.DateTimeFormat("es-AR",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value))
  : "—";

export default function PlatformGovernancePanel() {
  const [superadmins,setSuperadmins] = useState<Superadmin[]>([]);
  const [requests,setRequests] = useState<ChangeRequest[]>([]);
  const [events,setEvents] = useState<AuditEvent[]>([]);
  const [targetUserId,setTargetUserId] = useState("");
  const [action,setAction] = useState<"grant"|"revoke">("grant");
  const [reason,setReason] = useState("");
  const [busy,setBusy] = useState("");
  const [loading,setLoading] = useState(false);
  const [message,setMessage] = useState("");
  const [loadError,setLoadError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const responses = await Promise.all([
        fetch("/api/platform/superadmins",{cache:"no-store"}),
        fetch("/api/platform/superadmins/requests?limit=50",{cache:"no-store"}),
        fetch("/api/platform/audit?limit=30",{cache:"no-store"}),
      ]);
      if(responses.some(response=>!response.ok)) throw new Error("No se pudo consultar el registro global. Verificá que las migraciones versionadas estén disponibles en el entorno.");
      const [adminsData,requestsData,auditData] = await Promise.all(responses.map(response=>response.json()));
      setSuperadmins(Array.isArray(adminsData.superadmins)?adminsData.superadmins:[]);
      setRequests(Array.isArray(requestsData.requests)?requestsData.requests:[]);
      setEvents(Array.isArray(auditData.events)?auditData.events:[]);
    } catch(error) {
      setLoadError(error instanceof Error?error.message:"No se pudo actualizar la consola.");
    } finally { setLoading(false); }
  },[]);

  useEffect(()=>{ void refresh(); },[refresh]);

  async function send(url:string,body?:Record<string,unknown>) {
    setBusy(url); setMessage("");
    try {
      const response=await fetch(url,{
        method:"POST",headers:{"Content-Type":"application/json"},
        ...(body?{body:JSON.stringify(body)}:{}),
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(typeof data.error==="string"?data.error:"La operación fue rechazada.");
      setMessage("Operación registrada. Se actualizó el estado del control global.");
      await refresh();
      return true;
    } catch(error) {
      setMessage(error instanceof Error?error.message:"No se pudo completar la operación.");
      return false;
    } finally { setBusy(""); }
  }

  async function requestChange(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetUserId.trim())
      || reason.trim().length<12) return;
    const ok=await send("/api/platform/superadmins/requests",{
      targetUserId:targetUserId.trim(),action,reason:reason.trim(),
    });
    if(ok){setTargetUserId("");setReason("");}
  }

  const inputClass="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-cyan-300/40 focus:outline-none";
  return <div className="space-y-6">
    <section id="superadmin-governance" className="scroll-mt-6 space-y-4 rounded-2xl border border-amber-200/15 bg-amber-950/15 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-[11px] font-bold tracking-[.16em] text-amber-200">GOBIERNO DE PRIVILEGIOS GLOBALES</p><h2 className="mt-1 text-xl font-bold text-white">Superadministradores</h2><p className="mt-1 text-sm text-slate-400">Las altas y revocaciones se solicitan, aprueban por otra persona y ejecutan en una operación auditada.</p></div>
        <button type="button" onClick={()=>void refresh()} disabled={loading||!!busy} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-50"><RefreshCw size={14} className={loading?"animate-spin":""}/>Actualizar</button>
      </div>
      {loadError&&<p role="alert" className="rounded-lg border border-amber-200/20 bg-amber-200/5 p-3 text-sm text-amber-100">{loadError}</p>}
      {message&&<p role="status" className="rounded-lg border border-cyan-200/20 bg-cyan-200/5 p-3 text-sm text-cyan-100">{message}</p>}
      <form onSubmit={requestChange} className="grid gap-3 rounded-xl border border-white/10 bg-slate-950/50 p-4 md:grid-cols-[1.2fr_.7fr_1.5fr_auto]">
        <label className="space-y-1"><span className="text-xs text-slate-300">UUID de usuario existente</span><input className={inputClass} value={targetUserId} onChange={e=>setTargetUserId(e.target.value)} placeholder="UUID de Supabase Auth" required/></label>
        <label className="space-y-1"><span className="text-xs text-slate-300">Acción solicitada</span><select className={inputClass} value={action} onChange={e=>setAction(e.target.value as "grant"|"revoke")}><option value="grant">Otorgar privilegio</option><option value="revoke">Revocar privilegio</option></select></label>
        <label className="space-y-1"><span className="text-xs text-slate-300">Motivo (mínimo 12 caracteres)</span><input className={inputClass} value={reason} onChange={e=>setReason(e.target.value)} minLength={12} maxLength={1000} placeholder="Justificación administrativa" required/></label>
        <button type="submit" disabled={!!busy||loading} className="self-end rounded-lg bg-amber-300 px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-50"><KeyRound size={14} className="mr-1 inline"/>{busy==="/api/platform/superadmins/requests"?"Registrando…":"Solicitar"}</button>
      </form>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-white">Privilegios activos · {superadmins.length}</h3>
          {superadmins.length===0?<p className="rounded-xl border border-white/10 p-4 text-sm text-slate-500">No hay datos disponibles o no se pudo consultar el registro.</p>:superadmins.map(item=><article key={item.user_id} className="rounded-xl border border-white/10 bg-slate-950/40 p-3"><p className="text-sm font-semibold text-white">{item.email||"Usuario sin correo"}</p><p className="mt-1 break-all font-mono text-[10px] text-slate-500">{item.user_id}</p><p className="mt-1 text-xs text-slate-500">Último acceso: {dateLabel(item.last_sign_in_at)}</p></article>)}
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-white">Solicitudes de cambio · {requests.length}</h3>
          {requests.length===0?<p className="rounded-xl border border-white/10 p-4 text-sm text-slate-500">No hay solicitudes registradas.</p>:requests.map(item=><article key={item.request_id} className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-semibold text-white">{item.requested_action==="grant"?"Alta de Superadministrador":"Revocación de privilegio"}</span><span className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-slate-300">{statusLabel[item.status]||item.status}</span></div>
            <p className="mt-2 text-xs text-slate-300">Destino: {item.target_email||item.target_user_id}</p>
            <p className="mt-1 text-xs text-slate-500">Solicitó: {item.requested_by_email||item.requested_by} · {dateLabel(item.created_at)}</p>
            <p className="mt-2 text-xs leading-5 text-slate-400">{item.reason}</p>
            {item.approved_by_email&&<p className="mt-2 text-xs text-emerald-200">Aprobó: {item.approved_by_email}</p>}
            {item.failure_code&&<p className="mt-2 text-xs text-rose-200">Código de fallo: {item.failure_code}</p>}
            {item.status==="pending"&&<button type="button" disabled={!!busy} onClick={()=>void send(`/api/platform/superadmins/requests/${item.request_id}/approve`)} className="mt-3 rounded-lg border border-emerald-300/20 px-3 py-2 text-xs font-semibold text-emerald-200 disabled:opacity-50"><ShieldCheck size={13} className="mr-1 inline"/>Aprobar como segundo responsable</button>}
            {item.status==="approved"&&<button type="button" disabled={!!busy} onClick={()=>void send(`/api/platform/superadmins/requests/${item.request_id}/execute`)} className="mt-3 rounded-lg border border-cyan-300/20 px-3 py-2 text-xs font-semibold text-cyan-100 disabled:opacity-50">{busy.endsWith("/execute")?"Ejecutando…":"Ejecutar cambio aprobado"}</button>}
          </article>)}
        </div>
      </div>
    </section>

    <section id="global-audit" className="scroll-mt-6 space-y-4 rounded-2xl border border-cyan-200/15 bg-cyan-950/15 p-5">
      <div className="flex items-center gap-3"><Activity size={20} className="text-cyan-200"/><div><p className="text-[11px] font-bold tracking-[.16em] text-cyan-200">TRAZABILIDAD INTEGRAL</p><h2 className="text-xl font-bold text-white">Auditoría global</h2><p className="mt-1 text-sm text-slate-400">Registro append-only de operaciones privilegiadas, con actor, motivo, resultado y correlación.</p></div></div>
      {events.length===0?<p className="rounded-xl border border-white/10 p-4 text-sm text-slate-500">No hay eventos disponibles para mostrar.</p>:<div className="space-y-2">{events.map(event=><article key={event.id} className="grid gap-2 rounded-xl border border-white/10 bg-slate-950/40 p-3 md:grid-cols-[170px_1fr_auto]">
        <div><p className="text-xs font-semibold text-white">{dateLabel(event.occurred_at)}</p><p className="mt-1 text-[10px] text-slate-500">{event.outcome}</p></div>
        <div><p className="text-sm font-semibold text-cyan-100">{event.action}</p><p className="mt-1 text-xs text-slate-300">{event.reason}</p><p className="mt-1 break-all font-mono text-[10px] text-slate-600">Actor {event.actor_user_id} · {event.target_type} {event.target_id||""}</p></div>
        <span className="self-start rounded-full border border-white/10 px-2 py-1 text-[10px] text-slate-400">{event.institution_id?"Institucional":"Global"}</span>
      </article>)}</div>}
      <p className="text-[11px] text-slate-500">Se muestran hasta 30 eventos recientes. La lectura de la bitácora también queda auditada.</p>
    </section>
  </div>;
}
