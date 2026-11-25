import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, BellRing, CalendarCheck, FileText, MessageSquareText, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";

export default async function AdministrativeOffice({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: institution } = await supabase.from("institutions").select("id,display_name")
    .eq("slug", slug).eq("status", "active").maybeSingle();
  if (!institution) redirect("/dashboard");
  const { data: membership } = await supabase.from("memberships").select("id")
    .eq("institution_id", institution.id).eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership) redirect("/dashboard");
  const permissions = await getMembershipPermissions(supabase, membership.id);
  const { data: roles } = await supabase.from("membership_roles").select("roles(key)")
    .eq("membership_id", membership.id).eq("institution_id", institution.id);
  const allowedRole = (roles ?? []).some((row) => ["administrative", "director"].includes(row.roles?.key ?? ""));
  if (!allowedRole) redirect(`/dashboard/${slug}`);

  const [announcements, workflows, staff] = await Promise.all([
    supabase.from("announcements").select("id", { count: "exact", head: true }).eq("institution_id", institution.id),
    supabase.from("report_card_workflows").select("id", { count: "exact", head: true }).eq("institution_id", institution.id),
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("institution_id", institution.id),
  ]);
  const items = [
    { title: "Comunicados institucionales", detail: "Publicaciones para familias y personal.", href: "announcements", icon: BellRing, enabled: permissions.has("institution.read") },
    { title: "Mensajes internos", detail: "Conversaciones con el personal y equipos de trabajo.", href: "messages", icon: MessageSquareText, enabled: permissions.has("institution.read") },
    { title: "Habilitación de boletines", detail: "Acceso al circuito de revisión y publicación de boletines.", href: "report-cards", icon: FileText, enabled: permissions.has("grades.read") },
    { title: "Personal institucional", detail: "Consulta de usuarios y perfiles habilitados.", href: "users", icon: Users, enabled: permissions.has("memberships.manage") },
    { title: "Gestión administrativa", detail: "Trámites, documentación y registros internos.", href: "administrative", icon: FileText, enabled: permissions.has("administrative_records.read") },
    { title: "Calendario académico", detail: "Consulta de fechas y períodos institucionales.", href: "settings/academic-calendar", icon: CalendarCheck, enabled: permissions.has("institution.manage") },
  ].filter((item) => item.enabled);
  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
    <div className="mx-auto max-w-6xl space-y-7">
      <Link href={`/dashboard/${slug}`} className="text-sm font-medium text-slate-500 hover:text-violet-700">← Volver al espacio institucional</Link>
      <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-blue-950 to-cyan-900 p-7 text-white shadow-lg sm:p-9">
        <span className="text-xs font-bold tracking-[.18em] text-cyan-100">DIRECTIVOS · ADMINISTRACIÓN</span>
        <h1 className="mt-4 text-3xl font-bold">Panel administrativo</h1>
        <p className="mt-2 text-sm text-blue-100">{institution.display_name} · Comunicaciones, atención institucional y gestión de boletines.</p>
      </header>
      <section className="grid gap-3 sm:grid-cols-3">
        {[["Comunicados",announcements.count ?? 0],["Boletines en circuito",workflows.count ?? 0],["Cuentas institucionales",staff.count ?? 0]].map(([label,value])=><article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold text-slate-950">{value}</p></article>)}
      </section>
      <section className="grid gap-4 sm:grid-cols-2">
        {items.map(({title,detail,href,icon:Icon})=><Link key={href} href={`/dashboard/${slug}/${href}`} className="group flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-cyan-200 hover:shadow-lg">
          <span className="rounded-xl bg-cyan-50 p-3 text-cyan-800"><Icon size={22}/></span><span className="min-w-0 flex-1"><strong className="text-slate-900">{title}</strong><span className="mt-1 block text-sm leading-6 text-slate-500">{detail}</span></span><ArrowUpRight size={18} className="text-slate-400 group-hover:text-cyan-700"/>
        </Link>)}
      </section>
      <p className="rounded-xl border border-cyan-100 bg-cyan-50 p-4 text-sm leading-6 text-cyan-950">La publicación y habilitación de boletines depende del flujo de permisos configurado para cada período. No se modifican calificaciones desde este panel.</p>
    </div>
  </main>;
}
