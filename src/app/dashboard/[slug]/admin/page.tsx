import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft, ArrowUpRight, BookOpen, CalendarDays, ClipboardList,
  FileSpreadsheet, FileText, GraduationCap, Layers3, MailPlus,
  School, Settings2, ShieldCheck, Users, UserRoundCog, Megaphone,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";

type CountResult = { count: number | null; error: { message: string } | null };

function Metric({ label, value, detail, icon: Icon, href }: {
  label: string; value: number; detail: string; icon: typeof Users; href?: string;
}) {
  const content = <div className="flex h-full items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-200 hover:shadow-md">
    <div><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{value.toLocaleString("es-AR")}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>
    <span className="rounded-xl bg-indigo-50 p-3 text-indigo-700"><Icon size={21}/></span>
  </div>;
  return href ? <Link href={href} className="block">{content}</Link> : content;
}

const groups = [
  { title: "Personas y permisos", description: "Altas, bajas, invitaciones y control de perfiles.", items: [
    { title: "Usuarios y accesos", detail: "Invitar, asignar perfiles, habilitar, suspender o reactivar cuentas.", href: "users", icon: UserRoundCog },
    { title: "Legajos de alumnos", detail: "Consultar y administrar la matrícula y los datos académicos.", href: "students", icon: GraduationCap },
    { title: "Gestión administrativa", detail: "Documentación, trámites y registros internos.", href: "administrative", icon: FileText },
  ]},
  { title: "Organización académica", description: "Configurá la estructura que utilizan los módulos de toda la institución.", items: [
    { title: "Estructura académica", detail: "Niveles, ciclos, sedes, cursos, divisiones, materias y asignaciones.", href: "settings/academic-structure", icon: Layers3 },
    { title: "Aulas virtuales", detail: "Crear aulas, vincular materias y docentes y administrar espacios.", href: "settings/classrooms", icon: BookOpen },
    { title: "Escalas de calificación", detail: "Definir criterios numéricos y conceptuales.", href: "settings/grading-scales", icon: ClipboardList },
    { title: "Calificaciones y boletines", detail: "Acceder a notas, períodos y circuitos de boletines.", href: "grades", icon: FileSpreadsheet },
    { title: "Calendario académico", detail: "Ciclos lectivos, períodos y fechas institucionales.", href: "settings/academic-calendar", icon: CalendarDays },
  ]},
  { title: "Comunidad y comunicación", description: "Herramientas institucionales para informar y acompañar.", items: [
    { title: "Comunicados", detail: "Publicar novedades para los públicos habilitados.", href: "announcements", icon: Megaphone },
    { title: "Mensajes", detail: "Consultar comunicaciones institucionales.", href: "messages", icon: MailPlus },
    { title: "Documentación institucional", detail: "Administrar archivos y documentos del colegio.", href: "admin-documents", icon: FileText },
  ]},
];

export default async function AdministratorConsole({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: institution } = await supabase.from("institutions")
    .select("id,display_name,legal_name,slug,status,timezone,locale,contact_email,contact_phone,city,province")
    .eq("slug", slug).maybeSingle();
  if (!institution) redirect("/dashboard");

  const { data: membership } = await supabase.from("memberships")
    .select("id").eq("institution_id", institution.id)
    .eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership) redirect("/dashboard");

  const permissions = await getMembershipPermissions(supabase, membership.id);
  if (!permissions.has("institution.manage")) redirect(`/dashboard/${slug}`);
  const { data: roleRows } = await supabase.from("membership_roles")
    .select("roles(key)").eq("membership_id", membership.id);
  const roleKeys = (roleRows ?? []).map((row) => row.roles?.key).filter(Boolean);
  if (!roleKeys.includes("institution_admin")) redirect(`/dashboard/${slug}`);

  const [members, invitations, students, activeStudents, courses, divisions, subjects, classrooms, grades, years] = await Promise.all([
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("institution_id", institution.id),
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("institution_id", institution.id).eq("status", "invited"),
    supabase.from("students").select("id", { count: "exact", head: true }).eq("institution_id", institution.id),
    supabase.from("students").select("id", { count: "exact", head: true }).eq("institution_id", institution.id).eq("status", "active"),
    supabase.from("courses").select("id", { count: "exact", head: true }).eq("institution_id", institution.id),
    supabase.from("divisions").select("id", { count: "exact", head: true }).eq("institution_id", institution.id),
    supabase.from("subjects").select("id", { count: "exact", head: true }).eq("institution_id", institution.id),
    supabase.from("virtual_classrooms").select("id", { count: "exact", head: true }).eq("institution_id", institution.id),
    supabase.from("grade_records").select("id", { count: "exact", head: true }).eq("institution_id", institution.id),
    supabase.from("academic_years").select("id", { count: "exact", head: true }).eq("institution_id", institution.id).eq("status", "active"),
  ]) as CountResult[];

  const count = (result: CountResult) => result.count ?? 0;
  const metrics = [
    { label: "Cuentas institucionales", value: count(members), detail: "Incluye invitadas y activas", icon: Users, href: `/dashboard/${slug}/users` },
    { label: "Invitaciones pendientes", value: count(invitations), detail: "Requieren seguimiento o habilitación", icon: MailPlus, href: `/dashboard/${slug}/users` },
    { label: "Alumnos activos", value: count(activeStudents), detail: `De ${count(students)} legajos registrados`, icon: GraduationCap, href: `/dashboard/${slug}/students` },
    { label: "Cursos y divisiones", value: count(courses) + count(divisions), detail: `${count(courses)} cursos · ${count(divisions)} divisiones`, icon: Layers3, href: `/dashboard/${slug}/settings/academic-structure` },
    { label: "Materias", value: count(subjects), detail: "Catálogo institucional", icon: ClipboardList, href: `/dashboard/${slug}/settings/academic-structure` },
    { label: "Aulas virtuales", value: count(classrooms), detail: "Espacios de enseñanza configurados", icon: BookOpen, href: `/dashboard/${slug}/settings/classrooms` },
    { label: "Registros de calificaciones", value: count(grades), detail: "Notas guardadas en la institución", icon: FileSpreadsheet, href: `/dashboard/${slug}/grades` },
    { label: "Ciclos lectivos activos", value: count(years), detail: "Años académicos en curso", icon: CalendarDays, href: `/dashboard/${slug}/settings/academic-calendar` },
  ];

  const tasks = [
    ...(count(invitations) > 0 ? [{ title: "Revisar invitaciones", detail: `${count(invitations)} cuenta(s) esperan confirmación o habilitación.`, href: "users" }] : []),
    ...(count(years) === 0 ? [{ title: "Configurar el ciclo lectivo", detail: "Definí el año académico para habilitar la organización por períodos.", href: "settings/academic-calendar" }] : []),
    ...(count(courses) === 0 || count(divisions) === 0 ? [{ title: "Completar la estructura académica", detail: "Creá niveles, cursos y divisiones antes de asignar materias y personal.", href: "settings/academic-structure" }] : []),
    ...(count(subjects) === 0 ? [{ title: "Cargar el catálogo de materias", detail: "Registrá las materias y vinculalas a los cursos correspondientes.", href: "settings/academic-structure" }] : []),
  ];

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
    <div className="mx-auto max-w-7xl space-y-7">
      <Link href={`/dashboard/${slug}`} className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-indigo-700"><ArrowLeft size={16}/> Volver al espacio institucional</Link>
      <header className="overflow-hidden rounded-[28px] bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white shadow-lg sm:p-9">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl"><span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wider text-indigo-100"><ShieldCheck size={14}/> ADMINISTRACIÓN GENERAL</span>
            <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Centro de administración</h1>
            <p className="mt-3 text-sm leading-6 text-indigo-100">{institution.display_name} · Un centro de control para gestionar personas, estructura académica, aulas y operación institucional.</p>
          </div><div className="rounded-2xl border border-white/15 bg-white/10 p-4"><School size={30}/></div>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-indigo-100"><span className="rounded-full bg-white/10 px-3 py-1.5">Estado: {institution.status === "active" ? "Activa" : institution.status}</span><span className="rounded-full bg-white/10 px-3 py-1.5">Zona horaria: {institution.timezone}</span><span className="rounded-full bg-white/10 px-3 py-1.5">Idioma: {institution.locale}</span></div>
      </header>

      <section><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-700">Vista institucional</p><h2 className="mt-1 text-2xl font-bold text-slate-950">Indicadores operativos</h2><p className="mt-1 text-sm text-slate-500">Datos de la institución actual, sin mezclar información de otros colegios.</p></div><Link href={`/dashboard/${slug}/users`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-indigo-300">Administrar cuentas <ArrowUpRight size={16}/></Link></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(item => <Metric key={item.label} {...item}/>)}</div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-3"><span className="rounded-xl bg-amber-50 p-3 text-amber-700"><Settings2 size={20}/></span><div><h2 className="text-lg font-bold text-slate-950">Prioridades de configuración</h2><p className="text-sm text-slate-500">Accesos directos a tareas que pueden requerir atención.</p></div></div>
        {tasks.length ? <div className="mt-4 grid gap-3 md:grid-cols-2">{tasks.map(task => <Link key={task.title} href={`/dashboard/${slug}/${task.href}`} className="flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 hover:bg-amber-50"><span><strong className="text-sm text-slate-900">{task.title}</strong><span className="mt-1 block text-xs leading-5 text-slate-600">{task.detail}</span></span><ArrowUpRight size={16} className="shrink-0 text-amber-700"/></Link>)}</div> : <p className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">No se detectan tareas iniciales pendientes en la estructura y las invitaciones.</p>}
      </section>

      {groups.map(group => <section key={group.title} className="space-y-3">
        <div><h2 className="text-xl font-bold text-slate-950">{group.title}</h2><p className="mt-1 text-sm text-slate-500">{group.description}</p></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{group.items.map(item => <Link key={item.href} href={`/dashboard/${slug}/${item.href}`} className="group flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"><span className="rounded-xl bg-slate-100 p-3 text-slate-700 group-hover:bg-indigo-50 group-hover:text-indigo-700"><item.icon size={21}/></span><span className="min-w-0 flex-1"><strong className="block text-sm font-bold text-slate-900">{item.title}</strong><span className="mt-1 block text-xs leading-5 text-slate-500">{item.detail}</span></span><ArrowUpRight size={17} className="shrink-0 text-slate-400 group-hover:text-indigo-700"/></Link>)}</div>
      </section>)}

      <section className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5 sm:p-6">
        <div className="flex items-start gap-3"><span className="rounded-xl bg-white p-3 text-indigo-700"><ShieldCheck size={20}/></span><div><h2 className="font-bold text-slate-900">Administración segura y trazable</h2><p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">Las altas, permisos y cambios se realizan dentro de esta institución y mediante las operaciones autorizadas de cada módulo. El panel centraliza el acceso, pero no suplanta silenciosamente la identidad de otros usuarios ni permite operar fuera del colegio.</p></div></div>
      </section>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-5 text-xs text-slate-500"><span>EDUNEXA · Centro de administración</span><span>{institution.display_name} · Entorno institucional protegido</span></footer>
    </div>
  </main>;
}
