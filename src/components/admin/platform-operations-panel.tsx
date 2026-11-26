"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Loader2, Play, RefreshCw, ShieldCheck } from "lucide-react";

type Institution = { id: string; display_name: string; legal_name: string; slug: string };
type CloneJob = {
  id: string; source_name: string; target_name: string; status: string;
  approved_by: string | null; copy_mode: string; reason: string; created_at: string;
  result_summary?: Record<string, unknown>;
};
type Delegation = {
  id: string; institution_name: string; institution_slug: string; status: string;
  module_scope: string[]; requested_by: string; approved_by: string | null;
  reason: string; expires_at: string; created_at: string;
};
type CopilotPlan = {
  id: string; provider: "groq"; instruction: string; status: string; created_at: string;
  plan: { summary?: string; category?: string; risk?: string; steps?: { system: string; action: string; description: string }[] };
};

const moduleOptions = [
  ["docentes", "Docentes"], ["preceptor", "Preceptor"], ["alumnos", "Alumnos"],
  ["tutor", "Tutor"], ["directivos", "Directivos"], ["administrativos", "Administrativos"],
  ["administrador", "Administrador"],
] as const;
const label = (status: string) => ({
  pending_approval: "Pendiente de segunda aprobación", queued: "Aprobado · en cola",
  running: "En ejecución", completed: "Completado", failed: "Fallido",
  active: "Activo", revoked: "Revocado", expired: "Vencido", pending: "Pendiente",
}[status] ?? status);

export default function PlatformOperationsPanel({ institutions }: { institutions: Institution[] }) {
  const [clones, setClones] = useState<CloneJob[]>([]);
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [plans, setPlans] = useState<CopilotPlan[]>([]);
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [cloneSource, setCloneSource] = useState(institutions[0]?.id ?? "");
  const [cloneName, setCloneName] = useState("");
  const [cloneLegal, setCloneLegal] = useState("");
  const [cloneSlug, setCloneSlug] = useState("");
  const [cloneReason, setCloneReason] = useState("");
  const [delegationInstitution, setDelegationInstitution] = useState(institutions[0]?.id ?? "");
  const [delegationReason, setDelegationReason] = useState("");
  const [duration, setDuration] = useState("15");
  const [scope, setScope] = useState<string[]>(["administrador"]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [cloneResponse, delegationResponse, planResponse] = await Promise.all([
        fetch("/api/platform/clones", { cache: "no-store" }),
        fetch("/api/platform/delegations", { cache: "no-store" }),
        fetch("/api/platform/copilot/plans", { cache: "no-store" }),
      ]);
      if (!cloneResponse.ok || !delegationResponse.ok || !planResponse.ok) throw new Error("No se pudo actualizar el registro de operaciones.");
      const [cloneData, delegationData, planData] = await Promise.all([cloneResponse.json(), delegationResponse.json(), planResponse.json()]);
      setClones(Array.isArray(cloneData.clones) ? cloneData.clones : []);
      setDelegations(Array.isArray(delegationData.delegations) ? delegationData.delegations : []);
      setPlans(Array.isArray(planData.plans) ? planData.plans : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error de consulta.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => { void refresh(); }, 0); return () => window.clearTimeout(timer); }, [refresh]);

  async function send(path: string, body: Record<string, unknown> = {}, idempotent = false) {
    setBusy(path); setMessage("");
    try {
      const response = await fetch(path, {
        method: "POST", headers: {
          "Content-Type": "application/json",
          ...(idempotent ? { "Idempotency-Key": crypto.randomUUID() } : {}),
        }, body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "La operación fue rechazada.");
      setMessage("Operación registrada. Se actualizó el estado del control.");
      await refresh();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo completar la operación.");
      return false;
    } finally { setBusy(""); }
  }

  async function requestClone(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cloneSource || cloneName.trim().length < 2 || cloneLegal.trim().length < 2 || cloneSlug.trim().length < 2 || cloneReason.trim().length < 12) return;
    const ok = await send("/api/platform/clones", {
      sourceInstitutionId: cloneSource, displayName: cloneName, legalName: cloneLegal,
      slug: cloneSlug.toLowerCase().replace(/[^a-z0-9-]/g, "-"), reason: cloneReason,
    }, true);
    if (ok) { setCloneName(""); setCloneLegal(""); setCloneSlug(""); setCloneReason(""); }
  }

  async function requestDelegation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!delegationInstitution || !scope.length || delegationReason.trim().length < 12) return;
    const expiresAt = new Date(Date.now() + Number(duration) * 60_000).toISOString();
    const ok = await send("/api/platform/delegations", {
      institutionId: delegationInstitution, reason: delegationReason, expiresAt, moduleScopes: scope,
    }, true);
    if (ok) setDelegationReason("");
  }

  async function createCopilotPlan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (instruction.trim().length < 12) return;
    const ok = await send("/api/platform/copilot/plans", { instruction });
    if (ok) setInstruction("");
  }

  function toggleScope(key: string) {
    setScope((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  return (
    <section id="operations-panel" className="space-y-5 scroll-mt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-[11px] font-bold tracking-[0.18em] text-cyan-200">OPERACIONES CON CONTROL</p>
          <h2 className="mt-1 text-xl font-bold text-white">Clonación y acceso delegado</h2>
          <p className="mt-1 text-sm text-slate-400">Toda solicitud queda auditada y requiere aprobación de otro Superadministrador.</p></div>
        <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/5 disabled:opacity-50">
          {loading ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>} Actualizar
        </button>
      </header>
      {message && <p role="status" className="rounded-xl border border-cyan-200/20 bg-cyan-200/[0.06] px-4 py-3 text-sm text-cyan-100">{message}</p>}

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <form onSubmit={createCopilotPlan} className="space-y-3 rounded-2xl border border-cyan-200/15 bg-cyan-950/30 p-5">
          <div className="flex items-center gap-2 text-white"><ShieldCheck size={18} className="text-cyan-200"/><h3 className="font-semibold">Copiloto EDUNEXA · Groq</h3></div>
          <p className="text-xs leading-5 text-slate-400">Genera planes revisables. No se envían claves ni datos personales. GitHub se limita a acciones allowlisted; Supabase y Render permanecen en lectura/planificación.</p>
          <textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} minLength={12} maxLength={4000} rows={3} required placeholder="Describí qué cambio querés planificar…" className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white"/>
          <button disabled={!!busy || instruction.trim().length < 12} className="rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-50">
            {busy === "/api/platform/copilot/plans" ? "Generando con Groq…" : "Generar plan revisable"}
          </button>
        </form>
        <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
          <h3 className="font-semibold text-white">Planes y aprobaciones del Copiloto</h3>
          <div className="mt-3 max-h-[360px] space-y-2 overflow-auto">
            {plans.length ? plans.map((item) => <div key={item.id} className="rounded-xl border border-white/10 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-wide text-cyan-200">{item.plan.category ?? "Plan"} · {item.status}</p><span className="font-mono text-[10px] text-slate-500">{item.id.slice(0, 8)}</span></div>
              <p className="mt-2 text-sm text-white">{item.plan.summary ?? item.instruction}</p>
              <p className="mt-1 text-xs text-slate-400">Proveedor: Groq · Riesgo: {item.plan.risk ?? "alto"} · Acciones: {item.plan.steps?.length ?? 0}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {item.status === "pending" && <button type="button" disabled={!!busy} onClick={() => void send(`/api/platform/copilot/plans/${item.id}/approve`)} className="rounded-lg border border-emerald-300/20 px-3 py-2 text-xs font-semibold text-emerald-200 disabled:opacity-50">Aprobar plan</button>}
                {item.status === "approved" && <button type="button" disabled={!!busy} onClick={() => void send(`/api/platform/copilot/plans/${item.id}/execute`)} className="rounded-lg border border-cyan-300/20 px-3 py-2 text-xs font-semibold text-cyan-100 disabled:opacity-50">Ejecutar plan aprobado</button>}
              </div>
            </div>) : <p className="text-sm text-slate-500">Todavía no hay planes de Groq.</p>}
          </div>
        </article>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <form onSubmit={requestClone} className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-center gap-2 text-white"><Copy size={18} className="text-violet-200"/><h3 className="font-semibold">Clonar configuración institucional</h3></div>
          <p className="text-xs leading-5 text-slate-400">Copia únicamente calendarios, escalas y estructura académica permitida. No copia matrículas, usuarios, alumnos, tutores ni expedientes.</p>
          <label className="block text-xs font-medium text-slate-300">Institución de origen
            <select value={cloneSource} onChange={(e) => setCloneSource(e.target.value)} required className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white">
              {institutions.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}
            </select>
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <input aria-label="Nombre de la nueva institución" value={cloneName} onChange={(e) => setCloneName(e.target.value)} required minLength={2} maxLength={160} placeholder="Nombre institucional" className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white"/>
            <input aria-label="Razón social de la nueva institución" value={cloneLegal} onChange={(e) => setCloneLegal(e.target.value)} required minLength={2} maxLength={200} placeholder="Razón social" className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white"/>
          </div>
          <input aria-label="Slug de la nueva institución" value={cloneSlug} onChange={(e) => setCloneSlug(e.target.value)} required minLength={2} maxLength={80} placeholder="identificador-nuevo-colegio" className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white"/>
          <textarea aria-label="Motivo de clonación" value={cloneReason} onChange={(e) => setCloneReason(e.target.value)} required minLength={12} maxLength={1000} rows={2} placeholder="Motivo (mínimo 12 caracteres)" className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white"/>
          <button disabled={!!busy || !institutions.length} className="inline-flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-400 disabled:opacity-50">
            {busy === "/api/platform/clones" ? <Loader2 size={15} className="animate-spin"/> : <Copy size={15}/>} Solicitar clonación
          </button>
        </form>

        <form onSubmit={requestDelegation} className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-center gap-2 text-white"><ShieldCheck size={18} className="text-amber-200"/><h3 className="font-semibold">Solicitar acceso delegado</h3></div>
          <p className="text-xs leading-5 text-slate-400">Acceso temporal de solo lectura. Solo devuelve configuración no personal de los módulos autorizados.</p>
          <label className="block text-xs font-medium text-slate-300">Institución
            <select value={delegationInstitution} onChange={(e) => setDelegationInstitution(e.target.value)} required className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white">
              {institutions.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {moduleOptions.map(([key, name]) => <label key={key} className="flex items-center gap-2 rounded-lg border border-white/10 px-2.5 py-2 text-xs text-slate-200">
              <input type="checkbox" checked={scope.includes(key)} onChange={() => toggleScope(key)} className="accent-cyan-400"/>{name}
            </label>)}
          </div>
          <label className="block text-xs font-medium text-slate-300">Duración
            <select value={duration} onChange={(e) => setDuration(e.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white">
              <option value="15">15 minutos</option><option value="30">30 minutos</option>
            </select>
          </label>
          <textarea aria-label="Motivo del acceso delegado" value={delegationReason} onChange={(e) => setDelegationReason(e.target.value)} required minLength={12} maxLength={1000} rows={2} placeholder="Motivo (mínimo 12 caracteres)" className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white"/>
          <button disabled={!!busy || !scope.length || !institutions.length} className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50">
            {busy === "/api/platform/delegations" ? <Loader2 size={15} className="animate-spin"/> : <ShieldCheck size={15}/>} Solicitar acceso
          </button>
        </form>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
          <h3 className="font-semibold text-white">Cola de clonación</h3>
          <div className="mt-3 space-y-2">
            {clones.length ? clones.map((job) => <div key={job.id} className="rounded-xl border border-white/10 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-semibold text-white">{job.source_name} → {job.target_name}</p><p className="mt-1 text-xs text-slate-400">{label(job.status)} · configuration-only</p></div>
                <span className="font-mono text-[10px] text-slate-500">{job.id.slice(0, 8)}</span></div>
              {job.status === "pending_approval" && <button type="button" disabled={!!busy} onClick={() => void send(`/api/platform/clones/${job.id}/approve`)} className="mt-3 rounded-lg border border-emerald-300/20 px-3 py-2 text-xs font-semibold text-emerald-200 disabled:opacity-50">Aprobar (segundo Superadministrador)</button>}
            </div>) : <p className="text-sm text-slate-500">No hay trabajos de clonación registrados.</p>}
          </div>
          {clones.some((job) => job.status === "queued") && <button type="button" disabled={!!busy} onClick={() => void send("/api/platform/clones/execute-next")} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-50">
            {busy === "/api/platform/clones/execute-next" ? <Loader2 size={15} className="animate-spin"/> : <Play size={15}/>} Ejecutar siguiente trabajo aprobado
          </button>}
        </article>
        <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
          <h3 className="font-semibold text-white">Accesos delegados</h3>
          <div className="mt-3 space-y-2">
            {delegations.length ? delegations.map((item) => <div key={item.id} className="rounded-xl border border-white/10 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-semibold text-white">{item.institution_name}</p><p className="mt-1 text-xs text-slate-400">{label(item.status)} · vence {new Date(item.expires_at).toLocaleString("es-AR")}</p></div><span className="font-mono text-[10px] text-slate-500">{item.id.slice(0, 8)}</span></div>
              <p className="mt-2 text-xs text-slate-400">Módulos: {item.module_scope.map((key) => moduleOptions.find(([k]) => k === key)?.[1] ?? key).join(", ")}</p>
              {item.status === "pending" && <button type="button" disabled={!!busy} onClick={() => void send(`/api/platform/delegations/${item.id}/approve`)} className="mt-3 rounded-lg border border-emerald-300/20 px-3 py-2 text-xs font-semibold text-emerald-200 disabled:opacity-50">Aprobar (segundo Superadministrador)</button>}
              {item.status === "active" && <button type="button" disabled={!!busy} onClick={() => void send(`/api/platform/delegations/${item.id}/revoke`, { reason: "Revocación preventiva desde consola global." })} className="mt-3 rounded-lg border border-rose-300/20 px-3 py-2 text-xs font-semibold text-rose-200 disabled:opacity-50">Revocar acceso</button>}
            </div>) : <p className="text-sm text-slate-500">No hay accesos delegados registrados.</p>}
          </div>
        </article>
      </div>
    </section>
  );
}
