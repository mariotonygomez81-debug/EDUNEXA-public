"use client";

import { useMemo, useState } from "react";
import {
  Activity, AlertTriangle, ArrowUpRight, Bot, Building2, CheckCircle2, CircleHelp,
  ClipboardCheck, Cloud, Copy, Database, Download, GitBranch, Globe2, KeyRound,
  Layers3, LockKeyhole, Network, Plus, RefreshCw, Search, Server, Settings2,
  ShieldAlert, ShieldCheck, Users, Workflow, type LucideIcon,
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

function ToolCard({ title, description, icon: Icon, status = "Preparado para siguiente etapa", tone = "cyan" }: {
  title: string; description: string; icon: LucideIcon; status?: string; tone?: "cyan" | "violet" | "amber";
}) {
  const tones = {
    cyan: "border-cyan-300/20 bg-cyan-300/10 text-cyan-200",
    violet: "border-violet-300/20 bg-violet-300/10 text-violet-200",
    amber: "border-amber-300/20 bg-amber-300/10 text-amber-200",
  };
  return <article className="flex min-h-[170px] flex-col rounded-2xl border border-white/10 bg-white/[0.04] p-5">
    <div className="flex items-start justify-between gap-3">
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl border ${tones[tone]}`}><Icon size={19}/></span>
      <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold text-slate-400">{status}</span>
    </div>
    <h3 className="mt-4 font-bold text-white">{title}</h3>
    <p className="mt-1 text-sm leading-6 text-slate-400">{description}</p>
  </article>;
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

    <section className="space-y-4">
      <div><p className="text-[11px] font-bold tracking-[0.18em] text-violet-200">CENTRO DE HERRAMIENTAS</p><h2 className="mt-1 text-xl font-bold text-white">Administración avanzada</h2><p className="mt-1 text-sm text-slate-400">Áreas previstas para el control integral de EDUNEXA.</p></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <ToolCard title="ABM de plataformas" description="Crear, editar, activar, suspender y archivar instituciones, con historial de cambios." icon={Building2} tone="cyan"/>
        <ToolCard title="Administradores de colegios" description="Invitar responsables, asignar administradores, revocar accesos y revisar sus permisos." icon={Users} tone="violet"/>
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
        <p className="mt-3 text-sm leading-6 text-slate-300">La integración debe usar Groq como proveedor de IA, generar un plan de cambios y solicitar aprobación antes de ejecutar operaciones en repositorios o infraestructura. En esta entrega no se conecta una API ni se ejecutan cambios desde este panel.</p>
        <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-300"><span className="rounded-lg border border-white/10 px-3 py-2">GitHub · PR y CI</span><span className="rounded-lg border border-white/10 px-3 py-2">Supabase · migraciones y RLS</span><span className="rounded-lg border border-white/10 px-3 py-2">Render · servicios y deploys</span></div>
      </article>
      <article className="rounded-2xl border border-amber-200/15 bg-amber-200/[0.045] p-6">
        <div className="flex items-center gap-3"><ShieldAlert className="text-amber-200" size={22}/><h2 className="font-bold text-white">Protecciones obligatorias</h2></div>
        <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-300"><li>• Autorización global solo desde <code className="text-amber-100">app_metadata.platform_role</code>.</li><li>• Motivo obligatorio y doble aprobación para acciones críticas.</li><li>• Auditoría transaccional antes de habilitar mutaciones globales.</li><li>• Sin claves secretas en navegador ni elevación por <code className="text-amber-100">user_metadata</code>.</li><li>• Clonación sin copiar datos personales reales.</li></ul>
      </article>
    </section>

    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5 text-xs text-slate-500"><span>EDUNEXA GLOBAL · Gobierno central de plataformas</span><span className="inline-flex items-center gap-2"><CircleHelp size={14}/> Las operaciones privilegiadas permanecen bloqueadas hasta completar el backend auditado.</span></footer>

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
