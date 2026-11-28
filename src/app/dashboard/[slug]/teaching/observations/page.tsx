import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpenText, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";
import { saveStudentPeriodObservation } from "./actions";

export default async function TeacherObservationsPage({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<{division?:string;period?:string;saved?:string;error?:string}>}) {
 const {slug}=await params; const q=await searchParams; const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect("/login");
 const {data:institution}=await supabase.from("institutions").select("id,display_name").eq("slug",slug).eq("status","active").maybeSingle(); if(!institution) redirect("/dashboard");
 const {data:membership}=await supabase.from("memberships").select("id").eq("institution_id",institution.id).eq("user_id",user.id).eq("status","active").maybeSingle(); if(!membership) redirect("/dashboard");
 const [permissions,roles,assignments]=await Promise.all([
  getMembershipPermissions(supabase,membership.id),
  supabase.from("membership_roles").select("roles(key)").eq("membership_id",membership.id).eq("institution_id",institution.id),
  supabase.from("staff_assignments").select("division_id,course_subject_id,starts_on,ends_on,assignment_type").eq("institution_id",institution.id).eq("membership_id",membership.id)
 ]);
 if(!permissions.has("grades.read")||!permissions.has("grades.manage")||!(roles.data??[]).some(x=>x.roles?.key==="teacher")) redirect("/dashboard/"+slug);
 const today=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Argentina/Buenos_Aires"}).format(new Date());
 const active=(assignments.data??[]).filter(x=>x.assignment_type==="teacher"&&(!x.starts_on||x.starts_on<=today)&&(!x.ends_on||x.ends_on>=today));
 const direct=active.map(x=>x.division_id).filter((x):x is string=>Boolean(x));
 const subjectIds=active.map(x=>x.course_subject_id).filter((x):x is string=>Boolean(x));
 const [{data:d1},{data:s1}]=await Promise.all([
  direct.length?supabase.from("divisions").select("id,name,course_id,academic_year_id").eq("institution_id",institution.id).in("id",direct):Promise.resolve({data:[] as any[]}),
  subjectIds.length?supabase.from("course_subjects").select("course_id").eq("institution_id",institution.id).in("id",subjectIds):Promise.resolve({data:[] as any[]})
 ]);
 const courseIds=[...new Set((s1??[]).map(x=>x.course_id))];
 const {data:d2}=courseIds.length?await supabase.from("divisions").select("id,name,course_id,academic_year_id").eq("institution_id",institution.id).in("course_id",courseIds):{data:[] as any[]};
 const divisions=[...new Map([...(d1??[]),...(d2??[])].map(x=>[x.id,x])).values()].sort((a,b)=>a.name.localeCompare(b.name,"es"));
 const division=divisions.find(x=>x.id===q.division)??divisions[0]??null;
 const {data:periods}=division?await supabase.from("grading_periods").select("id,name,starts_on,ends_on,status").eq("institution_id",institution.id).eq("academic_year_id",division.academic_year_id).order("sort_order"):{data:[] as any[]};
 const period=(periods??[]).find(x=>x.id===q.period)??(periods??[]).find(x=>x.status==="open")??(periods??[])[0]??null;
 let students:any[]=[]; let observations:any[]=[];
 if(division&&period){
  const {data:enrollments}=await supabase.from("enrollments").select("student_id").eq("institution_id",institution.id).eq("division_id",division.id).eq("status","active");
  const ids=[...new Set((enrollments??[]).map(x=>x.student_id))];
  const [st,ob]=await Promise.all([
   ids.length?supabase.from("students").select("id,first_name,last_name,student_number").eq("institution_id",institution.id).in("id",ids).order("last_name").order("first_name"):Promise.resolve({data:[] as any[]}),
   ids.length?supabase.from("student_period_observations").select("id,student_id,author_membership_id,observation,updated_at").eq("institution_id",institution.id).eq("grading_period_id",period.id).in("student_id",ids):Promise.resolve({data:[] as any[]})
  ]);
  students=st.data??[]; observations=ob.data??[];
 }
 const byStudent=new Map(observations.map(x=>[x.student_id,x]));
 return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8"><div className="mx-auto max-w-5xl space-y-6">
  <Link href={"/dashboard/"+slug+"/teaching"} className="inline-flex items-center gap-2 text-sm text-slate-500"><ArrowLeft size={16}/> Volver a mi sección docente</Link>
  <header className="rounded-2xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white"><div className="flex items-center gap-3"><BookOpenText size={26}/><div><p className="text-xs font-bold uppercase text-indigo-200">Registro pedagógico</p><h1 className="text-2xl font-bold">Observaciones trimestrales</h1></div></div><p className="mt-3 text-sm text-indigo-100">{institution.display_name} · Una observación integral por alumno y período.</p></header>
  {q.saved==="1"?<p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">La observación se guardó correctamente.</p>:null}
  {q.error==="owned"?<p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">La observación pertenece a otro docente. Podés consultarla, pero no sobrescribirla.</p>:null}
  {q.error==="save"?<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">No se pudo guardar. Verificá matrícula, período y permisos.</p>:null}
  <form method="get" className="grid gap-3 rounded-2xl border bg-white p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
   <label className="text-sm font-semibold">División<select name="division" defaultValue={division?.id??""} className="mt-1.5 w-full rounded-lg border px-3 py-2.5">{divisions.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
   <label className="text-sm font-semibold">Período<select name="period" defaultValue={period?.id??""} className="mt-1.5 w-full rounded-lg border px-3 py-2.5">{(periods??[]).map(x=><option key={x.id} value={x.id}>{x.name} · {x.status==="open"?"Abierto":"Cerrado"}</option>)}</select></label>
   <button className="rounded-lg bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white">Consultar</button>
  </form>
  {division&&period?<section className="space-y-3"><div><h2 className="text-lg font-bold">{division.name} · {period.name}</h2><p className="text-sm text-slate-500">{students.length} alumnos con matrícula activa · {period.starts_on} al {period.ends_on}</p></div>
   {students.map(student=>{const existing=byStudent.get(student.id);const editable=period.status==="open"&&(!existing||existing.author_membership_id===membership.id);return <article key={student.id} className="rounded-xl border bg-white p-4 shadow-sm"><div className="flex flex-wrap justify-between gap-2"><div><h3 className="font-semibold">{student.last_name}, {student.first_name}</h3><p className="text-xs text-slate-500">Legajo {student.student_number??"—"}</p></div><span className="text-xs text-slate-500">{existing?(existing.author_membership_id===membership.id?"Tu observación":"Registrada por otro docente"):"Sin observación"}</span></div>
    {editable?<form action={saveStudentPeriodObservation} className="mt-3 space-y-2"><input type="hidden" name="slug" value={slug}/><input type="hidden" name="division_id" value={division.id}/><input type="hidden" name="period_id" value={period.id}/><input type="hidden" name="student_id" value={student.id}/><textarea name="observation" required maxLength={2000} rows={3} defaultValue={existing?.observation??""} placeholder="Avances, fortalezas, aspectos a acompañar y orientaciones pedagógicas..." className="w-full rounded-lg border px-3 py-2.5 text-sm"/><div className="flex justify-end"><button className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white"><Save size={15}/>{existing?"Actualizar observación":"Guardar observación"}</button></div></form>:<p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-6">{existing?.observation??"El período está cerrado; no se puede registrar una observación."}</p>}
   </article>})}
   {!students.length?<p className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-slate-500">No hay alumnos con matrícula activa en esta división.</p>:null}
  </section>:<p className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-slate-500">No hay divisiones o períodos habilitados para tus asignaciones.</p>}
 </div></main>;
}
