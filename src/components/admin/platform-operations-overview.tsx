"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock3, Loader2, RefreshCw, ShieldAlert } from "lucide-react";

type Item = {
  id: string; kind: "clone" | "delegation" | "copilot" | "superadmin";
  title: string; detail: string; status: string; createdAt: string; href: string;
  lane: "pending" | "running" | "attention";
};
type AlertItem = {
  key: string; group: "expiry" | "pending" | "failed" | "action";
  title: string; detail: string; timestamp: string; href: string;
  tone: "warning" | "critical" | "neutral";
};
type ApiRow = Record<string, unknown>;
type AuditEvent = {
  id: string; occurred_at: string; actor_user_id: string; action: string;
  target_type: string; target_id: string | null; institution_id: string | null;
  reason: string; request_id: string; outcome: string;
  metadata_redacted: Record<string, unknown>;
};
const str = (value: unknown) => typeof value === "string" ? value : "";
const date = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Fecha no disponible" : new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
};
const age = (value: string) => {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "antigüedad no disponible";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 60) return "hace " + minutes + " min";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return "hace " + hours + (hours === 1 ? " hora" : " horas");
  const days = Math.floor(hours / 24);
  return "hace " + days + (days === 1 ? " día" : " días");
};
const statusText: Record<string,string> = {
  pending_approval: "Pendiente de segunda aprobación", pending: "Pendiente de aprobación",
  approved: "Aprobada · pendiente de ejecución", queued: "Aprobado · en cola de ejecución",
  running: "En ejecución", executing: "En ejecución", failed: "Fallida · requiere intervención",
};

export default function PlatformOperationsOverview() {
  const [items,setItems] = useState<Item[]>([]);
  const [alerts,setAlerts] = useState<AlertItem[]>([]);
  const [auditEvents,setAuditEvents] = useState<AuditEvent[]>([]);
  const [selectedIncident,setSelectedIncident] = useState<AuditEvent|null>(null);
  const [incidentLoading,setIncidentLoading] = useState(false);
  const [incidentError,setIncidentError] = useState("");
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState("");
  const [filter,setFilter] = useState<"all"|"pending"|"running"|"attention">("all");

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const paths = ["/api/platform/clones","/api/platform/delegations","/api/platform/copilot/plans","/api/platform/superadmins/requests?limit=100","/api/platform/audit?limit=100"];
      const responses = await Promise.all(paths.map(path => fetch(path,{cache:"no-store"})));
      if (responses.some(response => !response.ok)) throw new Error("No se pudo recuperar el estado completo de las operaciones globales. No se muestran resultados parciales.");
      const [cloneData,delegationData,planData,requestData,auditData] = await Promise.all(responses.map(response => response.json()));
      const auditRows = Array.isArray(auditData.events) ? auditData.events as AuditEvent[] : [];
      const next: Item[] = [];
      const nextAlerts: AlertItem[] = [];
      const add = (row: ApiRow, kind: Item["kind"], title: string, detail: string, href: string) => {
        const status = str(row.status);
        let lane: Item["lane"] | null = null;
        if (["pending","pending_approval"].includes(status)) lane = "pending";
        else if (["running","executing"].includes(status)) lane = "running";
        else if (["approved","queued","failed"].includes(status)) lane = "attention";
        if (!lane) return;
        next.push({ id: str(row.id ?? row.request_id), kind, title, detail, status, createdAt: str(row.created_at), href, lane });
      };
      const addAlert = (key: string, group: AlertItem["group"], title: string, detail: string, timestamp: string, href: string, tone: AlertItem["tone"]) => {
        nextAlerts.push({key,group,title,detail,timestamp,href,tone});
      };

      for (const row of (Array.isArray(cloneData.clones)?cloneData.clones:[]) as ApiRow[]) {
        const id=str(row.id), created=str(row.created_at), status=str(row.status);
        const target=str(row.target_name)||"Clonación institucional";
        const detail="Origen: "+(str(row.source_name)||"No disponible")+" · Intentos: "+(typeof row.attempt_count==="number"?row.attempt_count:"—");
        add(row,"clone",target,detail,"#operations-panel");
        if(status==="pending_approval") addAlert("clone:"+id,"pending","Clonación pendiente de aprobación",target+" · "+age(created),created,"#operations-panel","warning");
        if(status==="queued") addAlert("clone:"+id,"action","Clonación aprobada en cola",target+" · "+age(created),created,"#operations-panel","warning");
        if(status==="failed") addAlert("clone:"+id,"failed","Clonación fallida",target+" · Código: "+(str(row.last_error_code)||"No informado"),str(row.completed_at)||created,"#operations-panel","critical");
      }

      const now=Date.now(), expiryWindow=24*60*60*1000;
      for (const row of (Array.isArray(delegationData.delegations)?delegationData.delegations:[]) as ApiRow[]) {
        const id=str(row.id), status=str(row.status), expires=str(row.expires_at), expiry=new Date(expires).getTime();
        const institution=str(row.institution_name)||"Acceso delegado";
        const detail="Institución: "+(str(row.institution_slug)||"—")+" · Vence: "+(expires?date(expires):"—");
        add(row,"delegation",institution,detail,"#operations-panel");
        if((status==="active" || status==="pending") && Number.isFinite(expiry) && expiry>now && expiry-now<=expiryWindow) {
          const title=status==="pending"?"Solicitud de acceso delegado próxima a vencer":"Acceso delegado próximo a vencer";
          addAlert("delegation:"+id,"expiry",title,institution+" · "+(status==="pending"?"Pendiente de aprobación · ":"")+"Vence "+date(expires),expires,"#operations-panel","warning");
        } else if(status==="pending" && Number.isFinite(expiry) && expiry<=now) {
          addAlert("delegation:"+id,"expiry","Solicitud de acceso delegado vencida",institution+" · La ventana de aprobación expiró; requiere una nueva solicitud",expires,"#operations-panel","critical");
        }
      }

      for (const row of (Array.isArray(planData.plans)?planData.plans:[]) as ApiRow[]) {
        const id=str(row.id), status=str(row.status), created=str(row.created_at);
        const plan = row.plan && typeof row.plan==="object" ? row.plan as ApiRow : {};
        const title=str(plan.summary)||str(row.instruction)||"Plan del Copiloto";
        const detail="Riesgo: "+(str(plan.risk)||"No especificado")+" · Proveedor: Groq";
        add(row,"copilot",title,detail,"#operations-panel");
        if(status==="pending") addAlert("copilot:"+id,"pending","Plan del Copiloto pendiente de aprobación",title+" · "+age(created),created,"#operations-panel","warning");
        if(status==="approved") addAlert("copilot:"+id,"action","Plan del Copiloto aprobado y sin ejecutar",title+" · "+age(str(row.approved_at)||created),str(row.approved_at)||created,"#operations-panel","warning");
        if(status==="failed") addAlert("copilot:"+id,"failed","Ejecución del Copiloto fallida",title+" · Revisar resultado y código de fallo en el módulo",str(row.executed_at)||created,"#operations-panel","critical");
      }

      for (const row of (Array.isArray(requestData.requests)?requestData.requests:[]) as ApiRow[]) {
        const id=str(row.request_id), status=str(row.status), created=str(row.created_at);
        const action = str(row.requested_action)==="grant"?"Alta de Superadministrador":"Revocación de privilegio";
        const target="Destino: "+(str(row.target_email)||str(row.target_user_id)||"Usuario no disponible");
        const detail=target+(str(row.failure_code)?" · Fallo: "+str(row.failure_code):"");
        add({...row,id:row.request_id},"superadmin",action,detail,"#superadmin-governance");
        if(status==="pending") addAlert("superadmin:"+id,"pending","Cambio de privilegio pendiente de aprobación",action+" · "+target+" · "+age(created),created,"#superadmin-governance","warning");
        if(status==="approved") addAlert("superadmin:"+id,"action","Cambio de privilegio aprobado y pendiente de ejecución",action+" · "+target+" · "+age(str(row.approved_at)||created),str(row.approved_at)||created,"#superadmin-governance","warning");
        if(status==="failed") addAlert("superadmin:"+id,"failed","Cambio de privilegio fallido",action+" · "+target+" · Código: "+(str(row.failure_code)||"No informado"),str(row.completed_at)||created,"#superadmin-governance","critical");
      }

      next.sort((a,b) => new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime());
      nextAlerts.sort((a,b) => {
        if(a.group==="pending" && b.group==="pending") return new Date(a.timestamp).getTime()-new Date(b.timestamp).getTime();
        const rank=(item:AlertItem)=>item.tone==="critical"?0:item.group==="expiry"?1:item.group==="action"?2:3;
        return rank(a)-rank(b) || new Date(a.timestamp).getTime()-new Date(b.timestamp).getTime();
      });
      setItems(next); setAlerts(nextAlerts); setAuditEvents(auditRows);
    } catch (cause) {
      setError(cause instanceof Error?cause.message:"No se pudo actualizar el seguimiento.");
      setItems([]); setAlerts([]); setAuditEvents([]);
    } finally { setLoading(false); }
  },[]);

  useEffect(() => { const timer=window.setTimeout(()=>{void refresh();},0); return ()=>window.clearTimeout(timer); },[refresh]);
  const counts = useMemo(() => ({
    pending: items.filter(item=>item.lane==="pending").length,
    running: items.filter(item=>item.lane==="running").length,
    attention: items.filter(item=>item.lane==="attention").length,
  }),[items]);
  const alertCounts = useMemo(()=>({
    expiry:alerts.filter(item=>item.group==="expiry").length,
    pending:alerts.filter(item=>item.group==="pending").length,
    failed:alerts.filter(item=>item.group==="failed").length,
    action:alerts.filter(item=>item.group==="action").length,
  }),[alerts]);
  const incidents = useMemo(() => {
    const failed = auditEvents.filter(event => event.outcome === "failed");
    return failed.map(event => {
      const related = auditEvents.filter(candidate => {
        if (candidate.target_type !== event.target_type) return false;
        if (event.target_id) return candidate.target_id === event.target_id
          && new Date(candidate.occurred_at).getTime() >= new Date(event.occurred_at).getTime();
        return candidate.request_id === event.request_id
          && new Date(candidate.occurred_at).getTime() >= new Date(event.occurred_at).getTime();
      }).sort((a,b) => new Date(a.occurred_at).getTime()-new Date(b.occurred_at).getTime());
      return { event, related };
    }).sort((a,b) => new Date(b.event.occurred_at).getTime()-new Date(a.event.occurred_at).getTime());
  },[auditEvents]);
  const openIncident = useCallback(async (eventId: string) => {
    setIncidentLoading(true); setIncidentError("");
    try {
      const response = await fetch("/api/platform/audit/"+encodeURIComponent(eventId),{cache:"no-store"});
      if (!response.ok) throw new Error("No se pudo recuperar el detalle de auditoría del incidente.");
      const payload = await response.json() as { event?: AuditEvent | AuditEvent[] | null };
      const detail = Array.isArray(payload.event) ? payload.event[0] : payload.event;
      if (!detail || detail.id !== eventId) throw new Error("El evento no está disponible en el detalle de auditoría.");
      setSelectedIncident(detail);
    } catch (cause) {
      setSelectedIncident(null);
      setIncidentError(cause instanceof Error?cause.message:"No se pudo abrir el incidente.");
    } finally { setIncidentLoading(false); }
  },[]);
  const visible = filter==="all"?items:items.filter(item=>item.lane===filter);
  const laneLabel = (lane: Item["lane"]) => lane==="pending"?"Pendiente":lane==="running"?"En curso":"Requiere acción";
  const kindLabel = (kind: Item["kind"]) => ({clone:"Clonación",delegation:"Acceso delegado",copilot:"Copiloto EDUNEXA",superadmin:"Privilegios globales"}[kind]);
  const laneClass = (lane: Item["lane"]) => lane==="attention"?"border-rose-300/20 bg-rose-300/10 text-rose-200":lane==="pending"?"border-amber-300/20 bg-amber-300/10 text-amber-100":"border-cyan-300/20 bg-cyan-300/10 text-cyan-100";
  const alertClass = (tone: AlertItem["tone"]) => tone==="critical"?"border-rose-300/20 bg-rose-300/10":tone==="warning"?"border-amber-300/20 bg-amber-300/10":"border-white/10 bg-white/[.025]";
  const alertIcon = (tone: AlertItem["tone"]) => tone==="critical"?<ShieldAlert size={17} className="text-rose-200"/>:tone==="warning"?<Clock3 size={17} className="text-amber-100"/>:<AlertTriangle size={17}/>;

  return <section id="global-operations-overview" className="scroll-mt-6 space-y-4 rounded-2xl border border-rose-200/15 bg-slate-950/40 p-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-[11px] font-bold tracking-[.16em] text-rose-200">CENTRO DE CONTROL OPERATIVO</p><h2 className="mt-1 text-xl font-bold text-white">Seguimiento global de operaciones</h2><p className="mt-1 text-sm text-slate-400">Alertas de vencimiento, antigüedad de solicitudes y fallos. Solo lectura; las acciones se realizan en sus módulos de origen.</p></div>
      <button type="button" onClick={()=>void refresh()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-50">{loading?<Loader2 size={14} className="animate-spin"/>:<RefreshCw size={14}/>}Actualizar</button>
    </header>
    {error&&<p role="alert" className="rounded-lg border border-rose-200/20 bg-rose-200/5 p-3 text-sm text-rose-100">{error}</p>}

    <section className="space-y-3 rounded-xl border border-rose-200/15 bg-rose-950/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h3 className="text-sm font-bold text-white">Historial de resolución de incidentes</h3>
          <p className="mt-1 text-xs text-slate-400">Cada incidente parte de un evento fallido y reúne los eventos posteriores del mismo objetivo en la bitácora global.</p></div>
        <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-slate-400">{incidents.length} incidente{incidents.length===1?"":"s"}</span>
      </div>
      {incidents.length===0
        ? <p className="rounded-lg border border-white/10 p-4 text-center text-xs text-slate-400">No hay eventos fallidos en los últimos 100 registros de auditoría consultados.</p>
        : <div className="space-y-3">{incidents.map(({event,related})=><article key={event.id} className="rounded-xl border border-white/10 bg-slate-950/50 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><p className="text-sm font-semibold text-rose-100">{event.action}</p>
              <p className="mt-1 break-all text-[10px] text-slate-500">{event.target_type} · {event.target_id||"Objetivo no identificado"}</p></div>
            <span className="rounded-full border border-rose-200/20 bg-rose-200/10 px-2 py-1 text-[10px] text-rose-100">Inicio fallido</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">{event.reason||"Sin motivo registrado"} · {date(event.occurred_at)}</p>
          <ol className="mt-3 space-y-2 border-l border-white/10 pl-3">
            {related.map((entry,index)=><li key={entry.id} className="relative">
              <p className={"text-xs font-semibold "+(entry.outcome==="failed"?"text-rose-200":entry.outcome==="success"?"text-emerald-200":"text-slate-200")}>{index===0?"Evento inicial":entry.outcome==="success"?"Resultado correcto":entry.outcome==="failed"?"Nuevo fallo":entry.outcome==="started"?"Operación iniciada":"Evento relacionado"} · {entry.action}</p>
              <p className="mt-0.5 text-[10px] text-slate-500">{date(entry.occurred_at)} · Actor {entry.actor_user_id}</p>
            </li>)}
          </ol>
          {related.length===1&&<p className="mt-2 text-[10px] text-amber-200/80">Sin eventos posteriores asociados en el tramo consultado de auditoría.</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={()=>void openIncident(event.id)} disabled={incidentLoading} className="rounded-lg border border-cyan-200/20 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-200/10 disabled:opacity-50">
              {incidentLoading&&selectedIncident?.id===event.id?"Cargando detalle…":"Ver detalle completo"}
            </button>
            {incidentError&&selectedIncident===null&&<p role="alert" className="text-xs text-rose-200">{incidentError}</p>}
          </div>
          {selectedIncident?.id===event.id&&<div className="mt-3 space-y-3 rounded-lg border border-cyan-200/15 bg-cyan-950/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-xs font-bold text-cyan-100">Detalle del incidente · evento {selectedIncident.id}</h4><button type="button" onClick={()=>setSelectedIncident(null)} className="text-xs text-slate-400 hover:text-white">Cerrar detalle</button></div>
            <dl className="grid gap-2 text-xs sm:grid-cols-2">
              <div><dt className="text-slate-500">Fecha</dt><dd className="mt-0.5 break-words text-slate-200">{date(selectedIncident.occurred_at)}</dd></div>
              <div><dt className="text-slate-500">Acción</dt><dd className="mt-0.5 break-words text-slate-200">{selectedIncident.action}</dd></div>
              <div><dt className="text-slate-500">Actor UUID</dt><dd className="mt-0.5 break-all text-slate-200">{selectedIncident.actor_user_id||"—"}</dd></div>
              <div><dt className="text-slate-500">Objetivo</dt><dd className="mt-0.5 break-all text-slate-200">{selectedIncident.target_type||"—"} · {selectedIncident.target_id||"—"}</dd></div>
              <div><dt className="text-slate-500">Institución UUID</dt><dd className="mt-0.5 break-all text-slate-200">{selectedIncident.institution_id||"—"}</dd></div>
              <div><dt className="text-slate-500">Resultado</dt><dd className="mt-0.5 text-slate-200">{selectedIncident.outcome}</dd></div>
              <div className="sm:col-span-2"><dt className="text-slate-500">Request ID</dt><dd className="mt-0.5 break-all font-mono text-slate-200">{selectedIncident.request_id||"—"}</dd></div>
              <div className="sm:col-span-2"><dt className="text-slate-500">Motivo</dt><dd className="mt-0.5 whitespace-pre-wrap break-words text-slate-200">{selectedIncident.reason||"Sin motivo registrado"}</dd></div>
            </dl>
            <div><h5 className="text-xs font-semibold text-slate-300">Metadata redactada</h5>
              <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-black/30 p-3 text-[10px] leading-5 text-slate-300">{JSON.stringify(selectedIncident.metadata_redacted??{},null,2)}</pre>
            </div>
          </div>}
        </article>)}</div>}
      <p className="text-[10px] leading-5 text-slate-600">Alcance: últimos 100 eventos globales disponibles. La relación se establece por tipo e identificador exactos del objetivo; no se presume que dos operaciones distintas estén vinculadas. La ausencia de eventos posteriores no demuestra que el incidente siga abierto.</p>
    </section>

    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-bold text-white">Alertas que requieren seguimiento</h3><p className="mt-1 text-xs text-slate-500">Las solicitudes pendientes se ordenan de la más antigua a la más reciente.</p></div><span className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-slate-400">{alerts.length} alerta{alerts.length===1?"":"s"}</span></div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-amber-200/15 bg-amber-200/[.04] p-3"><p className="text-xs text-amber-100">Accesos próximos a vencer</p><p className="mt-1 text-2xl font-bold text-white">{alertCounts.expiry}</p></div>
        <div className="rounded-xl border border-white/10 bg-white/[.025] p-3"><p className="text-xs text-slate-300">Solicitudes pendientes</p><p className="mt-1 text-2xl font-bold text-white">{alertCounts.pending}</p></div>
        <div className="rounded-xl border border-rose-200/15 bg-rose-200/[.04] p-3"><p className="text-xs text-rose-100">Ejecuciones fallidas</p><p className="mt-1 text-2xl font-bold text-white">{alertCounts.failed}</p></div>
        <div className="rounded-xl border border-amber-200/15 bg-amber-200/[.04] p-3"><p className="text-xs text-amber-100">Aprobadas sin ejecutar</p><p className="mt-1 text-2xl font-bold text-white">{alertCounts.action}</p></div>
      </div>
      {alerts.length===0?<div className="rounded-xl border border-white/10 p-5 text-center"><CheckCircle2 size={23} className="mx-auto text-emerald-300"/><p className="mt-2 text-sm font-semibold text-white">{error?"Alertas no disponibles":"No se identifican alertas con los registros consultados"}</p></div>:<div className="space-y-2">{alerts.map(item=><article key={item.key} className={"grid gap-2 rounded-xl border p-3 md:grid-cols-[1fr_auto] md:items-center "+alertClass(item.tone)}>
        <div className="flex min-w-0 gap-3">{alertIcon(item.tone)}<div className="min-w-0"><h4 className="text-sm font-semibold text-white">{item.title}</h4><p className="mt-1 break-words text-xs text-slate-300">{item.detail}</p><p className="mt-1 text-[10px] text-slate-500">{date(item.timestamp)}</p></div></div>
        <a href={item.href} className="inline-flex items-center justify-center rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-white/5">Revisar</a>
      </article>)}</div>}
      <p className="text-[10px] leading-5 text-slate-600">Criterio de vencimiento: se señalan accesos activos que vencen dentro de las próximas 24 horas; es una ventana informativa de interfaz, no un SLA. Para solicitudes pendientes no se inventa un plazo límite: se muestra su antigüedad y se prioriza la más antigua. Los fallos se detectan por el estado persistido.</p>
    </section>

    <div className="grid gap-3 sm:grid-cols-3">
      <button type="button" onClick={()=>setFilter("pending")} className={"rounded-xl border p-4 text-left "+(filter==="pending"?"border-amber-200/40 bg-amber-200/10":"border-white/10 bg-white/[.03]")}><div className="flex items-center justify-between text-amber-100"><span className="text-xs font-semibold">Pendientes</span><Clock3 size={17}/></div><p className="mt-2 text-3xl font-bold text-white">{counts.pending}</p><p className="mt-1 text-xs text-slate-500">Esperan aprobación</p></button>
      <button type="button" onClick={()=>setFilter("running")} className={"rounded-xl border p-4 text-left "+(filter==="running"?"border-cyan-200/40 bg-cyan-200/10":"border-white/10 bg-white/[.03]")}><div className="flex items-center justify-between text-cyan-100"><span className="text-xs font-semibold">En ejecución</span><Activity size={17}/></div><p className="mt-2 text-3xl font-bold text-white">{counts.running}</p><p className="mt-1 text-xs text-slate-500">Operaciones en curso</p></button>
      <button type="button" onClick={()=>setFilter("attention")} className={"rounded-xl border p-4 text-left "+(filter==="attention"?"border-rose-200/40 bg-rose-200/10":"border-white/10 bg-white/[.03]")}><div className="flex items-center justify-between text-rose-100"><span className="text-xs font-semibold">Requieren acción</span><ShieldAlert size={17}/></div><p className="mt-2 text-3xl font-bold text-white">{counts.attention}</p><p className="mt-1 text-xs text-slate-500">Aprobadas listas o fallidas</p></button>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-white">Operaciones abiertas · {visible.length}</h3><button type="button" onClick={()=>setFilter("all")} className="text-xs font-semibold text-cyan-200 hover:text-cyan-100">Ver todas</button></div>
    {visible.length===0?<div className="rounded-xl border border-white/10 p-7 text-center"><CheckCircle2 size={25} className="mx-auto text-emerald-300"/><p className="mt-2 text-sm font-semibold text-white">{error?"No hay información disponible":"No hay operaciones abiertas en esta categoría"}</p><p className="mt-1 text-xs text-slate-500">Las operaciones completadas, revocadas y rechazadas no se incluyen en esta bandeja.</p></div>:<div className="space-y-2">{visible.map(item=><article key={item.kind+":"+item.id} className="grid gap-3 rounded-xl border border-white/10 bg-white/[.025] p-3 md:grid-cols-[1fr_auto] md:items-center">
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{kindLabel(item.kind)}</span><span className={"rounded-full border px-2 py-1 text-[10px] font-semibold "+laneClass(item.lane)}>{laneLabel(item.lane)} · {statusText[item.status]||item.status}</span></div><h4 className="mt-1 text-sm font-semibold text-white">{item.title}</h4><p className="mt-1 text-xs text-slate-400">{item.detail}</p><p className="mt-1 text-[10px] text-slate-600">{date(item.createdAt)}</p></div>
      <a href={item.href} className="inline-flex items-center justify-center rounded-lg border border-cyan-200/20 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-200/10">Ir al módulo de gestión</a>
    </article>)}</div>}
    <p className="text-[10px] leading-5 text-slate-600">Fuente: listados globales auditados existentes. Solicitudes de privilegios: hasta 100 recientes; planes del Copiloto: hasta 30 recientes. Las operaciones cerradas permanecen en sus registros y en la auditoría.</p>
  </section>;
}
