import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Building2, ClipboardList, ShieldCheck, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../dashboard/actions";

type Institution = {
  id: string; display_name: string; legal_name: string; slug: string;
  status: string; city: string | null; province: string | null; created_at: string;
};
type AuditEvent = {
  id: string; occurred_at: string; actor_user_id: string; action: string;
  target_type: string; target_id: string | null; institution_id: string | null;
  reason: string; outcome: string;
};
type Superadmin = { user_id: string; email: string; created_at: string; last_sign_in_at: string | null };
type RpcClient = {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};
function rows<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}
function date(value: string | null | undefined) {
  if (!value) return "Sin registro";
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(value));
}
const statusLabel: Record<string, string> = {
  active: "Activa", pending: "Pendiente", suspended: "Suspendida", archived: "Archivada",
};

export const dynamic = "force-dynamic";

export default async function PlatformWorkspace() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");
  if (user.app_metadata?.platform_role !== "superadmin") redirect("/dashboard");

  // The database RPCs independently re-check app_metadata and write an audit event.
  const platform = supabase as unknown as RpcClient;
  const [institutionsResult, auditResult, adminsResult] = await Promise.all([
    platform.rpc("platform_list_institutions", { p_limit: 50, p_before: null, p_status: null, p_search: null }),
    platform.rpc("platform_list_audit_events", { p_limit: 20, p_before: null, p_institution_id: null }),
    platform.rpc("platform_list_superadmins"),
  ]);
  const denied = [institutionsResult, auditResult, adminsResult].some((result) => result.error);
  const institutions = rows<Institution>(institutionsResult.data);
  const events = rows<AuditEvent>(auditResult.data);
  const admins = rows<Superadmin>(adminsResult.data);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-950 text-white"><ShieldCheck size={23} /></div>
            <div><p className="text-xs font-bold tracking-[0.2em] text-violet-700">EDUNEXA</p><p className="font-semibold">Control global de plataforma</p></div>
          </div>
          <form action={signOut}><button className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Cerrar sesión</button></form>
        </div>
      </header>
      <div className="mx-auto max-w-7xl space-y-7 px-5 py-8">
        <section className="rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 p-7 text-white">
          <p className="text-xs font-bold tracking-[0.18em] text-violet-200">ÁREA RESTRINGIDA · ACCESO GLOBAL</p>
          <h1 className="mt-3 text-3xl font-bold">Superadministrador EDUNEXA</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Administración transversal de instituciones, operadores globales y trazabilidad. Este acceso es independiente de las membresías de cada colegio.</p>
          <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-emerald-200"><ShieldCheck size={15} /> Identidad autenticada y privilegio global verificado</div>
        </section>

        {denied ? <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">La base de datos rechazó una o más consultas privilegiadas. Por seguridad, no se muestran datos globales. Actualizá la sesión y volvé a ingresar.</div> : null}

        <section className="grid gap-4 sm:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between text-slate-500"><span className="text-sm">Instituciones</span><Building2 size={19}/></div><p className="mt-3 text-3xl font-bold tabular-nums">{denied ? "—" : institutions.length}</p><p className="mt-1 text-xs text-slate-500">Registros visibles en el inventario global</p></article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between text-slate-500"><span className="text-sm">Superadministradores</span><Users size={19}/></div><p className="mt-3 text-3xl font-bold tabular-nums">{denied ? "—" : admins.length}</p><p className="mt-1 text-xs text-slate-500">Cuentas con privilegio global activo</p></article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between text-slate-500"><span className="text-sm">Eventos recientes</span><ClipboardList size={19}/></div><p className="mt-3 text-3xl font-bold tabular-nums">{denied ? "—" : events.length}</p><p className="mt-1 text-xs text-slate-500">Últimos eventos de auditoría consultados</p></article>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="font-semibold">Instituciones registradas</h2><p className="text-xs text-slate-500">Inventario global · hasta 50 registros</p></div><Building2 className="text-slate-400" size={20}/></div>
          {institutions.length ? <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Institución</th><th className="px-5 py-3">Ubicación</th><th className="px-5 py-3">Estado</th><th className="px-5 py-3">Alta</th></tr></thead><tbody className="divide-y divide-slate-100">{institutions.map((item)=><tr key={item.id}><td className="px-5 py-4"><p className="font-semibold">{item.display_name}</p><p className="text-xs text-slate-500">{item.slug} · {item.legal_name}</p></td><td className="px-5 py-4 text-slate-600">{[item.city,item.province].filter(Boolean).join(", ") || "—"}</td><td className="px-5 py-4"><span className={item.status==="active"?"rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700":"rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800"}>{statusLabel[item.status] ?? item.status}</span></td><td className="px-5 py-4 text-slate-500">{date(item.created_at)}</td></tr>)}</tbody></table></div> : <p className="px-5 py-8 text-sm text-slate-500">{denied ? "Consulta no autorizada." : "Todavía no hay instituciones para mostrar."}</p>}
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold">Cuentas globales</h2><p className="text-xs text-slate-500">Listado de Superadministradores</p></div>
            <div className="divide-y divide-slate-100">{admins.map((admin)=><div key={admin.user_id} className="px-5 py-4"><p className="text-sm font-semibold">{admin.email}</p><p className="mt-1 text-xs text-slate-500">Último acceso: {date(admin.last_sign_in_at)}</p></div>)}{!admins.length?<p className="px-5 py-6 text-sm text-slate-500">Sin cuentas para mostrar.</p>:null}</div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="font-semibold">Auditoría reciente</h2><p className="text-xs text-slate-500">Bitácora global de solo lectura</p></div><ClipboardList size={19} className="text-slate-400"/></div>
            <div className="divide-y divide-slate-100">{events.slice(0,10).map((event)=><div key={event.id} className="px-5 py-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">{event.action}</p><span className="text-xs text-slate-500">{date(event.occurred_at)}</span></div><p className="mt-1 text-xs text-slate-600">{event.reason}</p><p className="mt-1 text-[11px] text-slate-400">{event.target_type} · {event.outcome}</p></div>)}{!events.length?<p className="px-5 py-6 text-sm text-slate-500">Sin eventos para mostrar.</p>:null}</div>
          </section>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5 text-xs text-slate-500"><span>Las operaciones sensibles requieren motivo, aprobación independiente e idempotencia.</span><Link href="/dashboard" className="inline-flex items-center gap-1 font-semibold text-violet-700 hover:text-violet-900">Ir al acceso institucional <ArrowUpRight size={14}/></Link></footer>
      </div>
    </main>
  );
}
