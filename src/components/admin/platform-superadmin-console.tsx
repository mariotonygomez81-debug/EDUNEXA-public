"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PlatformOperationsPanel from "@/components/admin/platform-operations-panel";
import PlatformInstitutionAdminsPanel from "@/components/admin/platform-institution-admins-panel";
import {
  Activity, AlertTriangle, ArrowUpRight, Bot, Building2, CheckCircle2, CircleHelp,
  ClipboardCheck, Cloud, Copy, Database, GitBranch, Globe2, KeyRound, Layers3,
  LockKeyhole, Network, Search, Settings2, ShieldAlert, ShieldCheck, Users, type LucideIcon,
} from "lucide-react";

export type PlatformInstitution = {
  id: string;
  display_name: string;
  legal_name: string;
  slug: string;
  status: string;
  locale: string;
  timezone: string;
  created_at: string;
  updated_at: string;
};

type Props = { institutions: PlatformInstitution[]; loadError: string | null };

const statusLabel: Record<string, string> = {
  active: "Activa", suspended: "Suspendida", inactive: "Inactiva", pending: "Pendiente",
};

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("es-AR", { dateStyle: "medium" }).format(date);
};

function Metric({ label, value, detail, icon: Icon }: { label: string; value: string | number; detail: string; icon: LucideIcon }) {
  return <article className="rounded-2xl border border-white/10 bg-white/[0.045] p-5 shadow-lg shadow-black/10">
    <div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</span><Icon size={18} className="text-cyan-200"/></div>
    <p className="mt-4 text-3xl font-bold tracking-tight text-white">{value}</p>
    <p className="mt-1 text-xs text-slate-500">{detail}</p>
  </article>;
}

function ToolCard({ title, description, icon: Icon, status, tone = "cyan", href }: {
  title: string; description: string; icon: LucideIcon; status?: string; tone?: "cyan" | "violet" | "amber"; href?: string;
}) {
  const tones = {
    cyan: "border-cyan-300/20 bg-cyan-300/10 text-cyan-200",
    violet: "border-violet-300/20 bg-violet-300/10 text-violet-200",
    amber: "border-amber-300/20 bg-amber-300/10 text-amber-200",
  };
  const content = <>
    <div className="flex items-start justify-between gap-3">
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl border ${tones[tone]}`}><Icon size={19}/></span>
      <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold text-slate-400">{status ?? (href ? "Ir a sección" : "Preparado para siguiente etapa")}</span>
    </div>
    <h3 className="mt-4 font-bold text-white">{title}</h3>
    <p className="mt-1 text-sm leading-6 text-slate-400">{description}</p>
    {href && <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-cyan-200">Abrir sección <ArrowUpRight size={13}/></span>}
  </>;
  return href
    ? <a href={href} className="flex min-h-[170px] flex-col rounded-2xl border border-cyan-200/25 bg-white/[0.04] p-5 transition hover:border-cyan-200/50 hover:bg-cyan-200/[0.07] focus:outline-none focus:ring-2 focus:ring-cyan-300">{content}</a>
    : <article className="flex min-h-[170px] flex-col rounded-2xl border border-white/10 bg-white/[0.04] p-5">{content}</article>;
}


export function InstitutionLifecyclePanel({ institutions }: { institutions: PlatformInstitution[] }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [slug, setSlug] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  async function createInstitution(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("create"); setMessage("");
    try {
      const response = await fetch("/api/platform/institutions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ displayName, legalName, slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, "-"), reason }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "No se pudo crear la institución.");
      setDisplayName(""); setLegalName(""); setSlug(""); setReason("");
      setMessage("Solicitud de alta registrada. La institución queda pendiente según la política del backend.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error al crear la institución.");
    } finally { setBusy(""); }
  }

  async function editInstitution(institution: PlatformInstitution) {
    const nextName = window.prompt("Nombre institucional:", institution.display_name);
    if (nextName === null) return;
    const nextLegal = window.prompt("Razón social:", institution.legal_name);
    if (nextLegal === null) return;
    const locale = window.prompt("Idioma / locale:", institution.locale);
    if (locale === null) return;
    const timezone = window.prompt("Zona horaria:", institution.timezone);
    if (timezone === null) return;
    const reasonText = window.prompt("Motivo del cambio (mínimo 12 caracteres):");
    if (!reasonText || reasonText.trim().length < 12) {
      setMessage("La edición requiere un motivo de al menos 12 caracteres.");
      return;
    }
    setBusy(institution.id); setMessage("");
    try {
      const response = await fetch(`/api/platform/institutions/${institution.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          displayName: nextName.trim(), legalName: nextLegal.trim(), locale: locale.trim(),
          timezone: timezone.trim(), expectedUpdatedAt: institution.updated_at, reason: reasonText.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "No se pudo editar la institución.");
      setMessage("Datos institucionales actualizados.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error al editar la institución.");
    } finally { setBusy(""); }
  }

  async function changeStatus(institution: PlatformInstitution, nextStatus: "active" | "suspended") {
    const reasonText = window.prompt(nextStatus === "suspended" ? "Motivo de suspensión (mínimo 12 caracteres):" : "Motivo de activación (mínimo 12 caracteres):");
    if (!reasonText || reasonText.trim().length < 12) {
      setMessage("La operación requiere un motivo de al menos 12 caracteres.");
      return;
    }
    setBusy(institution.id); setMessage("");
    try {
      const response = await fetch(`/api/platform/institutions/${institution.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ status: nextStatus, expectedUpdatedAt: institution.updated_at, reason: reasonText.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "No se pudo cambiar el estado.");
      setMessage(nextStatus === "active" ? "Institución activada." : "Institución suspendida.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error al cambiar el estado.");
    } finally { setBusy(""); }
  }

  return (
    <section id="institution-lifecycle" className="scroll-mt-6 space-y-4 rounded-2xl border border-cyan-200/15 bg-cyan-950/20 p-5">
      <div>
        <p className="text-[11px] font-bold tracking-[0.16em] text-cyan-200">ABM DE PLATAFORMAS · PRIMERA ETAPA</p>
        <h3 className="mt-1 text-lg font-bold text-white">Altas, activación y suspensión</h3>
        <p className="mt-1 text-xs leading-5 text-slate-400">Cada cambio requiere motivo, control de versión e idempotencia. Las altas quedan pendientes; no se habilita borrado físico.</p>
      </div>
      {message && <p role="status" className="rounded-lg border border-cyan-200/20 bg-cyan-200/[0.06] px-3 py-2 text-sm text-cyan-100">{message}</p>}
      <form onSubmit={createInstitution} className="grid gap-2 md:grid-cols-2">
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} minLength={2} maxLength={160} required placeholder="Nombre institucional" aria-label="Nombre institucional" className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white"/>
        <input value={legalName} onChange={(e) => setLegalName(e.target.value)} minLength={2} maxLength={200} required placeholder="Razón social" aria-label="Razón social" className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white"/>
        <input value={slug} onChange={(e) => setSlug(e.target.value)} minLength={2} maxLength={80} required placeholder="identificador-institucion" aria-label="Identificador de institución" className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white"/>
        <input value={reason} onChange={(e) => setReason(e.target.value)} minLength={12} maxLength={1000} required placeholder="Motivo del alta (mínimo 12 caracteres)" aria-label="Motivo del alta" className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white"/>
        <div className="md:col-span-2"><button disabled={!!busy} className="rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-50">{busy === "create" ? "Registrando…" : "Registrar institución"}</button></div>
      </form>
      <div className="space-y-2">
        {institutions.map((institution) => <div key={institution.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/50 p-3">
          <div><p className="text-sm font-semibold text-white">{institution.display_name}</p><p className="text-xs text-slate-500">{institution.slug} · {statusLabel[institution.status] ?? institution.status}</p></div>
          <div className="flex gap-2">
            <button type="button" disabled={!!busy} onClick={() => void editInstitution(institution)} className="rounded-lg border border-cyan-300/20 px-3 py-2 text-xs font-semibold text-cyan-200 disabled:opacity-50">Editar</button>
            {institution.status === "active" ? <button type="button" disabled={!!busy} onClick={() => void changeStatus(institution, "suspended")} className="rounded-lg border border-rose-300/20 px-3 py-2 text-xs font-semibold text-rose-200 disabled:opacity-50">Suspender</button> : institution.status === "suspended" ? <button type="button" disabled={!!busy} onClick={() => void changeStatus(institution, "active")} className="rounded-lg border border-emerald-300/20 px-3 py-2 text-xs font-semibold text-emerald-200 disabled:opacity-50">Activar</button> : <span className="text-xs text-slate-500">Pendiente de activación</span>}
          </div>
        </div>)}
      </div>
    </section>
  );
}

export default function PlatformSuperadminConsole({ institutions, loadError }: Props) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<PlatformInstitution | null>(null);
  const [copied, setCopied] = useState("");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es");
    return institutions.filter((institution) => {
      const matchesQuery = !normalized || [
        institution.display_name, institution.legal_name, institution.slug, institution.id,
      ].some((value) => value?.toLocaleLowerCase("es").includes(normalized));
      return matchesQuery && (status === "all" || institution.status === status);
    });
  }, [institutions, query, status]);

  const active = institutions.filter((item) => item.status === "active").length;
  const suspended = institutions.filter((item) => item.status === "suspended").length;
  const other = institutions.length - active - suspended;

  async function copyId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(id);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      setCopied("");
    }
  }

  return <div className="mx-auto max-w-[1500px] space-y-8 px-5 py-8 lg:px-8 lg:py-10">
    <section className="relative overflow-hidden rounded-[28px] border border-cyan-200/15 bg-gradient-to-br from-indigo-950 via-slate-900 to-cyan-950 p-7 shadow-2xl shadow-black/20 lg:p-10">
      <div className="pointer-events-none absolute -right-24 -top-32 h-96 w-96 rounded-full border border-cyan-100/10 shadow-[0_0_0_35px_rgba(103,232,249,.025),0_0_0_80px_rgba(103,232,249,.02)]"/>
      <div className="relative grid gap-8 xl:grid-cols-[1fr_auto] xl:items-end">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-100/10 px-3 py-1.5 text-[11px] font-bold tracking-[0.16em] text-cyan-100"><ShieldCheck size={14}/> IDENTIDAD GLOBAL VERIFICADA</span>
          <h1 className="mt-5 text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl">Superadministración</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 lg:text-base">Un único centro de gobierno para supervisar las plataformas educativas, administrar responsables, proteger los datos y coordinar la evolución técnica de EDUNEXA.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs font-semibold text-emerald-200"><LockKeyhole size={14}/> Acceso restringido</span>
          <span className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300"><Globe2 size={14}/> Alcance multiplataforma</span>
        </div>
      </div>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Plataformas registradas" value={loadError ? "—" : institutions.length} detail="Instituciones visibles según RLS" icon={Building2}/>
      <Metric label="Plataformas activas" value={loadError ? "—" : active} detail="Estado activo en el registro" icon={CheckCircle2}/>
      <Metric label="Plataformas suspendidas" value={loadError ? "—" : suspended} detail="Requieren seguimiento" icon={ShieldAlert}/>
      <Metric label="Otros estados" value={loadError ? "—" : other} detail="Pendientes o inactivas" icon={Activity}/>
    </section>

    {loadError && <div role="alert" className="flex gap-3 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100"><AlertTriangle className="mt-0.5 shrink-0" size={18}/><div><strong className="block">Inventario global no disponible</strong><span className="mt-1 block text-amber-100/80">{loadError} Para habilitar la lectura multiplataforma se necesita una política/RPC auditada para el rol global.</span></div></div>}

    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-[11px] font-bold tracking-[0.18em] text-cyan-200">GOBIERNO DE PLATAFORMAS</p><h2 className="mt-1 text-xl font-bold text-white">Instituciones educativas</h2><p className="mt-1 text-sm text-slate-400">Inventario global de colegios y estado de cada entorno.</p></div>
        <span className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-400">{filtered.length} resultado{filtered.length === 1 ? "" : "s"}</span>
      </div>
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 md:flex-row">
        <label className="relative flex-1"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por institución, razón social, slug o ID..." className="w-full rounded-xl border border-white/10 bg-slate-950/70 py-3 pl-10 pr-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/40"/></label>
        <select aria-label="Filtrar por estado" value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-slate-200 outline-none focus:border-cyan-300/40"><option value="all">Todos los estados</option><option value="active">Activas</option><option value="suspended">Suspendidas</option><option value="inactive">Inactivas</option><option value="pending">Pendientes</option></select>
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
        {loadError ? <div className="p-10 text-center"><Database size={26} className="mx-auto text-slate-600"/><p className="mt-3 font-semibold text-slate-300">No se pudo cargar el inventario</p><p className="mt-1 text-sm text-slate-500">No se muestran datos parciales ni se intenta sortear los permisos del backend.</p></div> : filtered.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">No hay instituciones que coincidan con la búsqueda.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-white/[0.04] text-[10px] uppercase tracking-[0.15em] text-slate-500"><tr><th className="px-5 py-4">Institución</th><th className="px-5 py-4">Identificador</th><th className="px-5 py-4">Estado</th><th className="px-5 py-4">Alta</th><th className="px-5 py-4 text-right">Ficha</th></tr></thead><tbody className="divide-y divide-white/[0.07]">{filtered.map((item) => <tr key={item.id} className="transition hover:bg-white/[0.035]"><td className="px-5 py-4"><strong className="block text-white">{item.display_name}</strong><span className="mt-1 block text-xs text-slate-500">{item.legal_name}</span></td><td className="px-5 py-4"><span className="font-mono text-xs text-slate-300">{item.slug}</span></td><td className="px-5 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${item.status === "active" ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-200" : item.status === "suspended" ? "border-rose-300/20 bg-rose-300/10 text-rose-200" : "border-amber-300/20 bg-amber-300/10 text-amber-200"}`}>{statusLabel[item.status] ?? item.status}</span></td><td className="px-5 py-4 text-xs text-slate-400">{formatDate(item.created_at)}</td><td className="px-5 py-4 text-right"><button type="button" onClick={() => setSelected(item)} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-cyan-100 hover:border-cyan-200/30 hover:bg-cyan-200/10">Ver ficha <ArrowUpRight size={13} className="ml-1 inline"/></button></td></tr>)}</tbody></table></div>}
      </div>
    </section>

    <InstitutionLifecyclePanel institutions={institutions} />

    <PlatformInstitutionAdminsPanel institutions={institutions} />

    <PlatformOperationsPanel institutions={institutions} />

    <section className="space-y-4">
      <div><p className="text-[11px] font-bold tracking-[0.18em] text-violet-200">CENTRO DE HERRAMIENTAS</p><h2 className="mt-1 text-xl font-bold text-white">Administración avanzada</h2><p className="mt-1 text-sm text-slate-400">Áreas previstas para el control integral de EDUNEXA.</p></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <ToolCard title="ABM de plataformas" description="Crear, editar, activar y suspender instituciones, con historial de cambios." icon={Building2} tone="cyan" href="/dashboard/platform/institutions"/>
        <ToolCard title="Administradores de colegios" description="Asignar administradores existentes, revocar accesos y revisar responsables por institución." icon={Users} tone="violet" href="/dashboard/platform/administrators"/>
        <ToolCard title="Superadministradores" description="Alta, baja, modificación, recuperación de acceso y control de privilegios globales." icon={KeyRound} tone="amber"/>
        <ToolCard title="Acceso delegado a colegios" description="Entrar en modo de asistencia administrativa, con motivo obligatorio, alcance temporal y registro visible." icon={Network} tone="cyan"/>
        <ToolCard title="Clonación de plataformas" description="Crear una nueva institución desde una plantilla, con configuración aislada y datos de prueba opcionales." icon={Layers3} tone="violet"/>
        <ToolCard title="Auditoría global" description="Bitácora inmutable de acciones, actor, institución, motivo, resultado y correlación de solicitudes." icon={ClipboardCheck} tone="amber"/>
        <ToolCard title="Copiloto EDUNEXA (Groq)" description="Convertir instrucciones en planes revisables para GitHub, Supabase y Render; aplicar solo tras aprobación." icon={Bot} tone="violet"/>
        <ToolCard title="Infraestructura y despliegues" description="Estado de servicios, bases, builds, despliegues, errores, consumo y alertas operativas." icon={Cloud} tone="cyan"/>
        <ToolCard title="Seguridad y accesos" description="Sesiones, políticas, roles, accesos anómalos, MFA y revisiones periódicas de privilegios." icon={ShieldCheck} tone="amber"/>
        <ToolCard title="Backups y recuperación" description="Estado de respaldos, puntos de restauración y simulacros de recuperación por institución." icon={Database} tone="cyan"/>
        <ToolCard title="Versiones y cambios" description="Historial de releases, ramas, cambios pendientes, validaciones CI y rollback controlado." icon={GitBranch} tone="violet"/>
        <ToolCard title="Configuración global" description="Planes, límites, dominios, parámetros regionales, notificaciones y políticas comunes." icon={Settings2} tone="amber"/>
      </div>
    </section>

    <section className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
      <article className="rounded-2xl border border-cyan-200/15 bg-gradient-to-br from-cyan-950/60 to-slate-900 p-6">
        <div className="flex items-center gap-3"><Bot className="text-cyan-200" size={22}/><div><p className="text-[10px] font-bold tracking-[0.18em] text-cyan-200">ASISTENTE DE OPERACIONES</p><h2 className="mt-1 text-lg font-bold text-white">Copiloto EDUNEXA</h2></div></div>
        <p className="mt-3 text-sm leading-6 text-slate-300">El panel de operaciones permite generar planes con Groq, revisarlos, aprobarlos por un segundo Superadministrador y ejecutar únicamente las acciones allowlisted. Supabase y Render continúan en modo de solo lectura/planificación.</p>
        <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-300"><span className="rounded-lg border border-white/10 px-3 py-2">GitHub · PR y CI</span><span className="rounded-lg border border-white/10 px-3 py-2">Supabase · migraciones y RLS</span><span className="rounded-lg border border-white/10 px-3 py-2">Render · servicios y deploys</span></div>
      </article>
      <article className="rounded-2xl border border-amber-200/15 bg-amber-200/[0.045] p-6">
        <div className="flex items-center gap-3"><ShieldAlert className="text-amber-200" size={22}/><h2 className="font-bold text-white">Protecciones obligatorias</h2></div>
        <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-300"><li>• Autorización global solo desde <code className="text-amber-100">app_metadata.platform_role</code>.</li><li>• Motivo obligatorio y doble aprobación para acciones críticas.</li><li>• Auditoría transaccional antes de habilitar mutaciones globales.</li><li>• Sin claves secretas en navegador ni elevación por <code className="text-amber-100">user_metadata</code>.</li><li>• Clonación sin copiar datos personales reales.</li></ul>
      </article>
    </section>

    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5 text-xs text-slate-500"><span>EDUNEXA GLOBAL · Gobierno central de plataformas</span><span className="inline-flex items-center gap-2"><CircleHelp size={14}/> Las operaciones privilegiadas exigen motivo, doble aprobación, permisos acotados y auditoría.</span></footer>

    {selected && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="institution-detail-title" className="w-full max-w-xl rounded-t-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-4"><div><span className="text-[10px] font-bold tracking-[0.18em] text-cyan-200">FICHA DE INSTITUCIÓN</span><h2 id="institution-detail-title" className="mt-2 text-xl font-bold text-white">{selected.display_name}</h2><p className="mt-1 text-sm text-slate-400">{selected.legal_name}</p></div><button type="button" onClick={() => setSelected(null)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300">Cerrar</button></div>
        <dl className="mt-6 grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl bg-white/[0.04] p-3"><dt className="text-xs text-slate-500">Slug</dt><dd className="mt-1 font-mono text-slate-200">{selected.slug}</dd></div><div className="rounded-xl bg-white/[0.04] p-3"><dt className="text-xs text-slate-500">Estado</dt><dd className="mt-1 text-slate-200">{statusLabel[selected.status] ?? selected.status}</dd></div><div className="rounded-xl bg-white/[0.04] p-3"><dt className="text-xs text-slate-500">Idioma</dt><dd className="mt-1 text-slate-200">{selected.locale}</dd></div><div className="rounded-xl bg-white/[0.04] p-3"><dt className="text-xs text-slate-500">Zona horaria</dt><dd className="mt-1 text-slate-200">{selected.timezone}</dd></div><div className="rounded-xl bg-white/[0.04] p-3"><dt className="text-xs text-slate-500">Creada</dt><dd className="mt-1 text-slate-200">{formatDate(selected.created_at)}</dd></div><div className="rounded-xl bg-white/[0.04] p-3"><dt className="text-xs text-slate-500">Última actualización</dt><dd className="mt-1 text-slate-200">{formatDate(selected.updated_at)}</dd></div></dl>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-3"><span className="min-w-0 truncate font-mono text-[11px] text-slate-500">{selected.id}</span><button type="button" onClick={() => void copyId(selected.id)} className="shrink-0 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-white/5"><Copy size={13} className="mr-1 inline"/>{copied === selected.id ? "Copiado" : "Copiar ID"}</button></div>
        <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-amber-100/80"><LockKeyhole size={14} className="mt-0.5 shrink-0"/> La edición, suspensión, acceso delegado y clonación se habilitarán cuando el servicio global valide permisos y registre cada cambio de forma atómica.</p>
      </section>
    </div>}
  </div>;
}
