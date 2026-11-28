"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, CheckCircle2, Clock3, Loader2, RefreshCw, ShieldAlert } from "lucide-react";

type Item = {
  id: string; kind: "clone" | "delegation" | "copilot" | "superadmin";
  title: string; detail: string; status: string; createdAt: string; href: string;
  lane: "pending" | "running" | "attention";
};
type ApiRow = Record<string, unknown>;
const str = (value: unknown) => typeof value === "string" ? value : "";
const date = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Fecha no disponible" : new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
};
const statusText: Record<string,string> = {
  pending_approval: "Pendiente de segunda aprobación", pending: "Pendiente de aprobación",
  approved: "Aprobada · pendiente de ejecución", queued: "Aprobado · en cola de ejecución",
  running: "En ejecución", executing: "En ejecución", failed: "Fallida · requiere intervención",
};

export default function PlatformOperationsOverview() {
  const [items,setItems] = useState<Item[]>([]);
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
      const add = (row: ApiRow, kind: Item["kind"], title: string, detail: string, href: string) => {
        const status = str(row.status);
        let lane: Item["lane"] | null = null;
        if (["pending","pending_approval"].includes(status)) lane = "pending";
        else if (["running","executing"].includes(status)) lane = "running";
        else if (["approved","queued","failed"].includes(status)) lane = "attention";
        if (!lane) return;
        next.push({ id: str(row.id ?? row.request_id), kind, title, detail, status, createdAt: str(row.created_at), href, lane });
      };
      for (const row of (Array.isArray(cloneData.clones)?cloneData.clones:[]) as ApiRow[]) {
        add(row,"clone",str(row.target_name)||"Clonación institucional","Origen: "+(str(row.source_name)||"No disponible")+" · Intentos: "+(typeof row.attempt_count==="number"?row.attempt_count:"—"),"#operations-panel");
      }
      for (const row of (Array.isArray(delegationData.delegations)?delegationData.delegations:[]) as ApiRow[]) {
        add(row,"delegation",str(row.institution_name)||"Acceso delegado","Institución: "+(str(row.institution_slug)||"—")+" · Vence: "+(str(row.expires_at)?date(str(row.expires_at)):"—"),"#operations-panel");
      }
      for (const row of (Array.isArray(planData.plans)?planData.plans:[]) as ApiRow[]) {
        const plan = row.plan && typeof row.plan==="object" ? row.plan as ApiRow : {};
        add(row,"copilot",str(plan.summary)||str(row.instruction)||"Plan del Copiloto","Riesgo: "+(str(plan.risk)||"No especificado")+" · Proveedor: Groq","#operations-panel");
      }
      for (const row of (Array.isArray(requestData.requests)?requestData.requests:[]) as ApiRow[]) {
        const action = str(row.requested_action)==="grant"?"Alta de Superadministrador":"Revocación de privilegio";
        add({...row,id:row.request_id},"superadmin",action,"Destino: "+(str(row.target_email)||str(row.target_user_id)||"Usuario no disponible")+(str(row.failure_code)?" · Fallo: "+str(row.failure_code):""),"#superadmin-governance");
      }
      next.sort((a,b) => new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime());
      setItems(next);
    } catch (cause) {
      setError(cause instanceof Error?cause.message:"No se pudo actualizar el seguimiento.");
      setItems([]);
    } finally { setLoading(false); }
  },[]);

  useEffect(() => { const timer=window.setTimeout(()=>{void refresh();},0); return ()=>window.clearTimeout(timer); },[refresh]);
  const counts = useMemo(() => ({
    pending: items.filter(item=>item.lane==="pending").length,
    running: items.filter(item=>item.lane==="running").length,
    attention: items.filter(item=>item.lane==="attention").length,
  }),[items]);
  const visible = filter==="all"?items:items.filter(item=>item.lane===filter);
  const laneLabel = (lane: Item["lane"]) => lane==="pending"?"Pendiente":lane==="running"?"En curso":"Requiere acción";
  const kindLabel = (kind: Item["kind"]) => ({clone:"Clonación",delegation:"Acceso delegado",copilot:"Copiloto EDUNEXA",superadmin:"Privilegios globales"}[kind]);
  const laneClass = (lane: Item["lane"]) => lane==="attention"?"border-rose-300/20 bg-rose-300/10 text-rose-200":lane==="pending"?"border-amber-300/20 bg-amber-300/10 text-amber-100":"border-cyan-300/20 bg-cyan-300/10 text-cyan-100";

  return <section id="global-operations-overview" className="scroll-mt-6 space-y-4 rounded-2xl border border-rose-200/15 bg-slate-950/40 p-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-[11px] font-bold tracking-[.16em] text-rose-200">CENTRO DE CONTROL OPERATIVO</p><h2 className="mt-1 text-xl font-bold text-white">Seguimiento global de operaciones</h2><p className="mt-1 text-sm text-slate-400">Consolidación de colas, aprobaciones y ejecuciones desde los registros existentes. Solo lectura; las acciones se realizan en sus módulos de origen.</p></div>
      <button type="button" onClick={()=>void refresh()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-50">{loading?<Loader2 size={14} className="animate-spin"/>:<RefreshCw size={14}/>}Actualizar</button>
    </header>
    {error&&<p role="alert" className="rounded-lg border border-rose-200/20 bg-rose-200/5 p-3 text-sm text-rose-100">{error}</p>}
    <div className="grid gap-3 sm:grid-cols-3">
      <button type="button" onClick={()=>setFilter("pending")} className={"rounded-xl border p-4 text-left "+(filter==="pending"?"border-amber-200/40 bg-amber-200/10":"border-white/10 bg-white/[.03]")}><div className="flex items-center justify-between text-amber-100"><span className="text-xs font-semibold">Pendientes</span><Clock3 size={17}/></div><p className="mt-2 text-3xl font-bold text-white">{counts.pending}</p><p className="mt-1 text-xs text-slate-500">Esperan segunda aprobación</p></button>
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
