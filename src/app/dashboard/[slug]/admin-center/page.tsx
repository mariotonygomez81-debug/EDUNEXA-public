import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, BookOpen, Building2, CalendarDays, ClipboardList, FileText, GraduationCap, ShieldCheck, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";

const cards = [
  { title: "Usuarios y permisos", detail: "Altas, bajas, modificaciones y roles institucionales.", href: "users", icon: Users, tone: "violet" },
  { title: "Estructura académica", detail: "Niveles, sedes, cursos, divisiones, materias y personal.", href: "settings/academic-structure", icon: BookOpen, tone: "blue" },
  { title: "Ciclos y períodos", detail: "Años lectivos y períodos de calificación.", href: "settings/academic-calendar", icon: CalendarDays, tone: "amber" },
  { title: "Alumnos y matrículas", detail: "Legajos, inscripciones y trayectorias.", href: "students", icon: GraduationCap, tone: "green" },
  { title: "Calificaciones", detail: "Evaluaciones, notas y seguimiento académico.", href: "grades", icon: ClipboardList, tone: "orange" },
  { title: "Boletines", detail: "Revisión, aprobación y publicación.", href: "report-cards", icon: FileText, tone: "cyan" },
  { title: "Aulas virtuales", detail: "Supervisión de espacios de aprendizaje.", href: "classroom", icon: BookOpen, tone: "indigo" },
  { title: "Comunicaciones", detail: "Anuncios y mensajes institucionales.", href: "announcements", icon: FileText, tone: "rose" },
  { title: "Documentación", detail: "Circulares, resoluciones y archivos.", href: "admin-documents", icon: FileText, tone: "slate" },
] as const;

export default async function InstitutionAdminCenter({ params }: { params: Promise<{ slug: string }> }) {
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
  const { data: roleRows } = await supabase.from("membership_roles").select("roles(key)")
    .eq("membership_id", membership.id).eq("institution_id", institution.id);
  const isAdmin = (roleRows ?? []).some((row) => row.roles?.key === "institution_admin");
  if (!isAdmin || !permissions.has("institution.manage")) redirect(`/dashboard/${slug}`);

  const [students, staff, courses, divisions, years, announcements] = await Promise.all([
    supabase.from("students").select("id", { count: "exact", head: true }).eq("institution_id", institution.id),
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("institution_id", institution.id),
    supabase.from("courses").select("id", { count: "exact", head: true }).eq("institution_id", institution.id),
    supabase.from("divisions").select("id", { count: "exact", head: true }).eq("institution_id", institution.id),
    supabase.from("academic_years").select("id", { count: "exact", head: true }).eq("institution_id", institution.id),
    supabase.from("announcements").select("id", { count: "exact", head: true }).eq("institution_id", institution.id),
  ]);
  const metrics = [
    ["Alumnos", students.count ?? 0, GraduationCap],
    ["Cuentas institucionales", staff.count ?? 0, Users],
    ["Cursos", courses.count ?? 0, BookOpen],
    ["Divisiones", divisions.count ?? 0, Building2],
    ["Ciclos lectivos", years.count ?? 0, CalendarDays],
    ["Comunicados", announcements.count ?? 0, FileText],
  ] as const;
  const visibleCards = cards.filter((card) => {
    if (card.href === "users") return permissions.has("memberships.manage");
    if (card.href === "settings/academic-structure" || card.href === "settings/academic-calendar") return permissions.has("institution.manage");
    if (card.href === "students") return permissions.has("students.read");
    if (card.href === "grades" || card.href === "report-cards") return permissions.has("grades.read");
    if (card.href === "classroom") return permissions.has("classroom.read");
    if (card.href === "announcements") return permissions.has("announcements.manage") || permissions.has("institution.read");
    return permissions.has("admin_documents.read");
  });

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
    <div className="mx-auto max-w-7xl space-y-7">
      <Link href={`/dashboard/${slug}`} className="text-sm font-medium text-slate-500 hover:text-violet-700">← Volver al espacio institucional</Link>
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white shadow-xl sm:p-10">
        <div className="absolute -right-16 -top-24 h-72 w-72 rounded-full border border-white/10 shadow-[0_0_0_35px_rgba(255,255,255,.035),0_0_0_75px_rgba(255,255,255,.025)]"/>
        <div className="relative max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold tracking-wider text-indigo-100"><ShieldCheck size={14}/> ADMINISTRACIÓN GENERAL</span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">Centro de control institucional</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-indigo-100">{institution.display_name} · Gestioná la estructura, los accesos y la operación académica desde un único lugar.</p>
        </div>
      </header>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {metrics.map(([label, value, Icon]) => <article key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500"><span className="text-xs font-semibold">{label}</span><Icon size={18}/></div>
          <p className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{value}</p>
        </article>)}
      </section>
      <section>
        <div className="mb-4"><p className="text-xs font-bold tracking-widest text-violet-700">HERRAMIENTAS DE GESTIÓN</p><h2 className="mt-1 text-xl font-bold text-slate-950">Administración de EDUNEXA</h2><p className="mt-1 text-sm text-slate-500">Cada acceso respeta los permisos efectivos de tu cuenta.</p></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleCards.map(({title,detail,href,icon:Icon,tone}) => <Link key={href} href={`/dashboard/${slug}/${href}`} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-violet-200 hover:shadow-lg">
            <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-${tone}-50 text-${tone}-700`}><Icon size={21}/></div>
            <div className="mt-4 flex items-center justify-between gap-3"><h3 className="font-bold text-slate-900">{title}</h3><ArrowUpRight size={17} className="text-slate-400 transition group-hover:text-violet-700"/></div>
            <p className="mt-2 text-sm leading-6 text-slate-500">{detail}</p>
          </Link>)}
        </div>
      </section>
    </div>
  </main>;
}
