import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpen, CalendarCheck, ClipboardList, FileText, GraduationCap, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";

type Division = {id:string;name:string;course_id:string};
type Course = {id:string;name:string};
type Session = {id:string;division_id:string;held_on:string;period_label:string|null;status:string};

function Metric({label,value,detail,icon:Icon}:{label:string;value:number|string;detail:string;icon:typeof Users}) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-slate-500">{label}</p><span className="rounded-xl bg-violet-50 p-2 text-violet-700"><Icon size={19}/></span></div>
    <p className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{value}</p>
    <p className="mt-1 text-xs text-slate-500">{detail}</p>
  </div>;
}

export default async function DirectorDashboard({params}:{params:Promise<{slug:string}>}) {
  const {slug}=await params;
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect("/login");
  const {data:institution}=await supabase.from("institutions")
    .select("id,display_name").eq("slug",slug).eq("status","active").maybeSingle();
  if(!institution) redirect("/dashboard");
  const {data:membership}=await supabase.from("memberships")
    .select("id").eq("institution_id",institution.id).eq("user_id",user.id)
    .eq("status","active").maybeSingle();
  if(!membership) redirect("/dashboard");
  const {data:roleRows,error:roleError}=await supabase.from("membership_roles")
    .select("roles(key)").eq("membership_id",membership.id).eq("institution_id",institution.id);
  if(roleError) redirect(`/dashboard/${slug}`);
  const roleKeys=(roleRows ?? []).map(row=>row.roles?.key);
  if(!roleKeys.some(role=>role==="director" || role==="institution_admin")) redirect(`/dashboard/${slug}`);
  const permissions=await getMembershipPermissions(supabase,membership.id);
  if(!permissions.has("reports.read") || !permissions.has("students.read") ||
     !permissions.has("attendance.read") || !permissions.has("grades.read")) redirect(`/dashboard/${slug}`);

  const since=new Date();
  since.setDate(since.getDate()-30);
  const sinceDate=since.toISOString().slice(0,10);

  const [
    students,enrollments,courses,divisions,sessions,absences,assessments,gradeRecords,recentSessions,
  ]=await Promise.all([
    supabase.from("students").select("id",{count:"exact",head:true}).eq("institution_id",institution.id).eq("status","active"),
    supabase.from("enrollments").select("id",{count:"exact",head:true}).eq("institution_id",institution.id).eq("status","active"),
    supabase.from("courses").select("id",{count:"exact",head:true}).eq("institution_id",institution.id),
    supabase.from("divisions").select("id",{count:"exact",head:true}).eq("institution_id",institution.id),
    supabase.from("attendance_sessions").select("id",{count:"exact",head:true}).eq("institution_id",institution.id).gte("held_on",sinceDate),
    supabase.from("attendance_records").select("id",{count:"exact",head:true}).eq("institution_id",institution.id).eq("status","absent"),
    supabase.from("assessments").select("id",{count:"exact",head:true}).eq("institution_id",institution.id),
    supabase.from("grade_records").select("id",{count:"exact",head:true}).eq("institution_id",institution.id),
    supabase.from("attendance_sessions").select("id,division_id,held_on,period_label,status")
      .eq("institution_id",institution.id).order("held_on",{ascending:false}).limit(8),
  ]);
  const failures=[students,enrollments,courses,divisions,sessions,absences,assessments,gradeRecords,recentSessions].filter(result=>result.error);
  if(failures.length) throw new Error("No se pudieron cargar todos los indicadores institucionales. Revisá los permisos de lectura del perfil directivo.");

  const recentRows=(recentSessions.data ?? []) as Session[];
  const divisionIds=[...new Set(recentRows.map(row=>row.division_id))];
  const {data:divisionRows}=divisionIds.length
    ? await supabase.from("divisions").select("id,name,course_id").eq("institution_id",institution.id).in("id",divisionIds)
    : {data:[] as Division[]};
  const courseIds=[...new Set((divisionRows ?? []).map(row=>row.course_id))];
  const {data:courseRows}=courseIds.length
    ? await supabase.from("courses").select("id,name").eq("institution_id",institution.id).in("id",courseIds)
    : {data:[] as Course[]};
  const divisionNames=new Map((divisionRows ?? []).map(row=>[row.id,row.name]));
  const courseNames=new Map((courseRows ?? []).map(row=>[row.id,row.name]));
  const sessionStatus:Record<string,string>={open:"Abierta",submitted:"Presentada",locked:"Cerrada"};

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
    <div className="mx-auto max-w-7xl space-y-6">
      <Link href={`/dashboard/${slug}`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700"><ArrowLeft size={16}/> Volver al espacio institucional</Link>
      <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white shadow-sm">
        <span className="text-xs font-semibold tracking-widest text-indigo-100">SEGUIMIENTO Y SUPERVISIÓN</span>
        <h1 className="mt-3 text-3xl font-bold">Panel directivo</h1>
        <p className="mt-2 text-sm text-indigo-100">{institution.display_name} · Indicadores generales de actividad académica e institucional.</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Alumnos activos" value={students.count ?? 0} detail="Legajos activos en la institución" icon={GraduationCap}/>
        <Metric label="Matrículas activas" value={enrollments.count ?? 0} detail="Inscripciones vigentes" icon={Users}/>
        <Metric label="Cursos y divisiones" value={`${courses.count ?? 0} / ${divisions.count ?? 0}`} detail="Estructura académica" icon={BookOpen}/>
        <Metric label="Sesiones de asistencia" value={sessions.count ?? 0} detail="Últimos 30 días" icon={CalendarCheck}/>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Ausencias registradas</p>
          <p className="mt-2 text-3xl font-bold">{absences.count ?? 0}</p>
          <p className="mt-1 text-xs text-slate-500">Total histórico de registros de inasistencia disponibles para supervisión.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Actividad de evaluación</p>
          <p className="mt-2 text-3xl font-bold">{assessments.count ?? 0}</p>
          <p className="mt-1 text-xs text-slate-500">{gradeRecords.count ?? 0} calificaciones registradas en evaluaciones.</p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold">Últimas sesiones de asistencia</h2><p className="mt-1 text-xs text-slate-500">Actividad reciente registrada por curso y división.</p></div>
        {recentRows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Fecha</th><th className="px-5 py-3">Curso / división</th><th className="px-5 py-3">Turno</th><th className="px-5 py-3">Estado</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{recentRows.map(row=><tr key={row.id}>
            <td className="px-5 py-3">{new Date(`${row.held_on}T12:00:00`).toLocaleDateString("es-AR")}</td>
            <td className="px-5 py-3 font-medium">{courseNames.get(divisionRows?.find(d=>d.id===row.division_id)?.course_id ?? "") ?? "Curso"} · {divisionNames.get(row.division_id) ?? "División"}</td>
            <td className="px-5 py-3 text-slate-600">{row.period_label || "—"}</td>
            <td className="px-5 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold">{sessionStatus[row.status] ?? row.status}</span></td>
          </tr>)}</tbody>
        </table></div> : <p className="p-8 text-center text-sm text-slate-500">Todavía no hay sesiones de asistencia registradas.</p>}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link href={`/dashboard/${slug}/students`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 font-semibold text-slate-700 hover:border-violet-300"><GraduationCap className="text-violet-700"/> Alumnos</Link>
        <Link href={`/dashboard/${slug}/attendance`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 font-semibold text-slate-700 hover:border-violet-300"><CalendarCheck className="text-violet-700"/> Asistencia</Link>
        <Link href={`/dashboard/${slug}/grades`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 font-semibold text-slate-700 hover:border-violet-300"><ClipboardList className="text-violet-700"/> Calificaciones</Link>
        <Link href={`/dashboard/${slug}/report-cards`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 font-semibold text-slate-700 hover:border-violet-300"><FileText className="text-violet-700"/> Boletines</Link>
      </section>
      <p className="text-xs leading-relaxed text-slate-500">Los indicadores se calculan con los registros disponibles y los permisos efectivos de tu perfil. Este panel es de consulta: no modifica asistencia ni calificaciones.</p>
    </div>
  </main>;
}
