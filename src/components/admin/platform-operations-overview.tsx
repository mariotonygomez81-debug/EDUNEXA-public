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
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState("");
  const [filter,setFilter] = useState<"all"|"pending"|"running"|"attention">("all");

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const paths = ["/api/platform/clones","/api/platform/delegations","/api/platform/copilot/plans","/api/platform/superadmins/requests?limit=100"];
      const responses = await Promise.all(paths.map(path => fetch(path,{cache:"no-store"})));
      if (responses.some(response => !response.ok)) throw new Error("No se pudo recuperar el estado completo de las operaciones globales. No se muestran resultados parciales.");
      const [cloneData,delegationData,planData,requestData] = await Promise.all(responses.map(response => response.json()));
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
      setItems(next); setAlerts(nextAlerts);
    } catch (cause) {
      setError(cause instanceof Error?cause.message:"No se pudo actualizar el seguimiento.");
      setItems([]); setAlerts([]);
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
