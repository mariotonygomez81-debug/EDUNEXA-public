import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BrainCircuit, FileText, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";
import AcademicStudentReport from "./student-report";

type StudentOption = { id: string; first_name: string; last_name: string; student_number: string | null };

export default async function AcademicStudentReportsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: institution } = await supabase.from("institutions").select("id,display_name").eq("slug", slug).maybeSingle();
  if (!institution) redirect("/dashboard");
  const { data: membership } = await supabase.from("memberships").select("id").eq("institution_id", institution.id).eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership) redirect("/dashboard");
  const [permissions, roleRows] = await Promise.all([
    getMembershipPermissions(supabase, membership.id),
    supabase.from("membership_roles").select("roles(key)").eq("membership_id", membership.id).eq("institution_id", institution.id),
  ]);
  const isTeacher = (roleRows.data ?? []).some((row) => row.roles?.key === "teacher");
  if (!isTeacher || !permissions.has("grades.read")) redirect(`/dashboard/${slug}`);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
  const { data: assignments, error: assignmentsError } = await supabase.from("staff_assignments")
    .select("division_id").eq("institution_id", institution.id).eq("membership_id", membership.id)
    .eq("assignment_type", "teacher")
    .or(`starts_on.is.null,starts_on.lte.${today}`).or(`ends_on.is.null,ends_on.gte.${today}`);
  if (assignmentsError) throw new Error("No se pudieron verificar las divisiones asignadas.");
  const divisionIds = [...new Set((assignments ?? []).map((item) => item.division_id).filter((id): id is string => Boolean(id)))];
  const { data: enrollments, error: enrollmentsError } = divisionIds.length
    ? await supabase.from("enrollments").select("student_id").eq("institution_id", institution.id)
      .in("division_id", divisionIds).eq("status", "active").lte("enrolled_on", today)
      .or(`ended_on.is.null,ended_on.gte.${today}`)
    : { data: [] as { student_id: string }[], error: null };
  if (enrollmentsError) throw new Error("No se pudieron consultar las matrículas autorizadas.");
  const studentIds = [...new Set((enrollments ?? []).map((item) => item.student_id))];
  const { data: studentRows, error: studentError } = studentIds.length
    ? await supabase.from("students").select("id,first_name,last_name,student_number")
      .eq("institution_id", institution.id).eq("status", "active").in("id", studentIds)
      .order("last_name").order("first_name")
    : { data: [] as StudentOption[], error: null };
  if (studentError) throw new Error("No se pudo cargar la nómina autorizada para informes.");
  const students = (studentRows ?? []) as StudentOption[];
  return <main className="min-h-screen bg-slate-50 px-4 py-7 text-slate-800 sm:px-7 lg:px-10">
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href={`/dashboard/${slug}/teaching/reports`} className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-indigo-700"><ArrowLeft size={16}/> Volver a reportes</Link>
      <header className="rounded-[28px] bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-900 px-6 py-8 text-white shadow-xl sm:px-9">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold tracking-wider text-indigo-100"><BrainCircuit size={15}/> EDUNEXA · ANÁLISIS ASISTIDO</span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">Informe académico integral</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-indigo-100">{institution.display_name} · Analiza la información académica disponible para el docente y prepara un informe revisable y exportable a PDF.</p>
      </header>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><ShieldCheck className="text-emerald-600" size={21}/><h2 className="mt-2 font-semibold">Acceso controlado</h2><p className="mt-1 text-xs leading-5 text-slate-500">Solo se consultan registros que tu sesión docente puede leer.</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><BrainCircuit className="text-indigo-600" size={21}/><h2 className="mt-2 font-semibold">Análisis con evidencia</h2><p className="mt-1 text-xs leading-5 text-slate-500">La IA distingue datos registrados, tendencias e información faltante.</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4"><FileText className="text-sky-600" size={21}/><h2 className="mt-2 font-semibold">PDF revisable</h2><p className="mt-1 text-xs leading-5 text-slate-500">El docente revisa el contenido antes de emitir el documento.</p></div>
      </div>
      <AcademicStudentReport slug={slug} students={students}/>
      <p className="text-xs leading-5 text-slate-500">El informe es una herramienta de apoyo pedagógico. No reemplaza la evaluación profesional del docente, no diagnostica ni debe utilizarse por sí solo para sancionar, clasificar o tomar decisiones de alto impacto sobre un alumno.</p>
    </div>
  </main>;
}
