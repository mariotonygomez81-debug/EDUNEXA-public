import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Activity, BookOpenCheck, CalendarCheck, FileSpreadsheet, FileText, GraduationCap, ShieldAlert, Sparkles, TrendingUp, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";

const reports = [
  { title: "Informe académico del alumno", detail: "Análisis asistido de calificaciones, asistencia, participación y observaciones, con PDF revisable.", icon: GraduationCap, tone: "blue", status: "Nuevo informe", href: "academic" },
  { title: "Informe de convivencia", detail: "Novedades, intervenciones, acuerdos y seguimiento de situaciones escolares.", icon: ShieldAlert, tone: "amber", status: "Diseño previsto", href: null },
  { title: "Informe de calificaciones", detail: "Evaluaciones, notas cargadas, promedios y nota final del período.", icon: TrendingUp, tone: "violet", status: "Módulo disponible", href: "grades" },
  { title: "Informe de asistencia", detail: "Presentes, ausentes, medias faltas y porcentajes de asistencia.", icon: CalendarCheck, tone: "emerald", status: "PDF disponible", href: "attendance" },
  { title: "Boletín / informe de período", detail: "Resumen de resultados académicos y estado de aprobación.", icon: FileText, tone: "sky", status: "Módulo disponible", href: "report-cards" },
  { title: "Importación de calificaciones", detail: "Preparación de planillas Excel y revisión de notas antes de incorporarlas.", icon: FileSpreadsheet, tone: "green", status: "Módulo disponible", href: "grades" },
];
export default async function TeacherReportsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: institution } = await supabase.from("institutions").select("id,display_name").eq("slug",slug).maybeSingle();
  if (!institution) redirect("/dashboard");
  const { data: membership } = await supabase.from("memberships").select("id").eq("institution_id",institution.id).eq("user_id",user.id).eq("status","active").maybeSingle();
  if (!membership) redirect("/dashboard");
  const [permissions,roleRows] = await Promise.all([
    getMembershipPermissions(supabase,membership.id),
    supabase.from("membership_roles").select("roles(key)").eq("membership_id",membership.id).eq("institution_id",institution.id),
  ]);
  const isTeacher = (roleRows.data??[]).some(row=>row.roles?.key==="teacher");
  if (!isTeacher || !permissions.has("grades.read")) redirect(`/dashboard/${slug}`);
  return <main className="min-h-screen bg-[#f5f7fb] px-4 py-7 text-slate-800 sm:px-7 lg:px-10"><div className="mx-auto max-w-7xl space-y-6">
    <Link href={`/dashboard/${slug}/teaching`} className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-indigo-700"><ArrowLeft size={16}/> Volver a mi sección docente</Link>
    <header className="rounded-[28px] bg-gradient-to-br from-[#10264b] via-[#174b86] to-[#315fbd] px-6 py-8 text-white shadow-xl shadow-blue-950/10 sm:px-9 sm:py-9"><span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold tracking-wider text-cyan-100"><Activity size={14}/> CENTRO DE INFORMES</span><h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Reportes del docente</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100">{institution.display_name} · Acceso organizado a informes académicos, conductuales, calificaciones y asistencia.</p></header>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{reports.map(item=><article key={item.title} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><span className="rounded-xl bg-slate-100 p-3 text-slate-700"><item.icon size={22}/></span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{item.status}</span></div><h2 className="mt-4 text-lg font-bold text-slate-900">{item.title}</h2><p className="mt-2 flex-1 text-sm leading-6 text-slate-500">{item.detail}</p>{item.href?<Link href={item.href==="novelties"?`/dashboard/${slug}/prefect/novelties`:item.href==="attendance"?`/dashboard/${slug}/attendance/reports`:item.href==="academic"?`/dashboard/${slug}/teaching/reports/academic`:`/dashboard/${slug}/${item.href}` } className="mt-5 inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-semibold text-violet-900 hover:bg-violet-100">Abrir módulo <FileText size={15}/></Link>:<span className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-500"><Sparkles size={15}/> Diseño pendiente de conexión</span>}</article>)}</section>
    <section className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]"><article className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-5"><div className="flex items-center gap-2 text-indigo-900"><BookOpenCheck size={19}/><h2 className="font-bold">Informe integral por alumno</h2></div><p className="mt-2 text-sm leading-6 text-slate-600">La propuesta reúne en un único documento la evolución académica, las inasistencias, las observaciones y las intervenciones registradas, con filtros por alumno y período.</p><div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-indigo-800"><span className="rounded-full bg-white px-3 py-1.5">Resumen académico</span><span className="rounded-full bg-white px-3 py-1.5">Asistencia</span><span className="rounded-full bg-white px-3 py-1.5">Convivencia</span><span className="rounded-full bg-white px-3 py-1.5">PDF imprimible</span></div></article><article className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2 text-slate-800"><Users size={19}/><h2 className="font-bold">Diseño de filtros</h2></div><p className="mt-2 text-sm leading-6 text-slate-500">La versión visual contempla selección de curso, división, alumno, materia, período y rango de fechas. La generación automática y la exportación individual se conectarán en una etapa posterior.</p></article></section>
    <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">Esta pantalla organiza módulos ya disponibles y anticipa el diseño del informe integral. No genera ni guarda nuevos informes desde esta vista.</p>
  </div></main>;
}
