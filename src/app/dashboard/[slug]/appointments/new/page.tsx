import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarPlus, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAppointment } from "../actions";

type Contact = { student_id:string; student_name:string; guardian_membership_id:string; guardian_name:string };
function localDateTimeMinimum(){
  return new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Argentina/Buenos_Aires",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date()).replace(" ","T");
}

export default async function NewAppointmentPage({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<{error?:string}>}){
 const {slug}=await params; const query=await searchParams; const supabase=await createClient();
 const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect("/login");
 const {data:institution}=await supabase.from("institutions").select("id,display_name").eq("slug",slug).eq("status","active").maybeSingle(); if(!institution) redirect("/dashboard");
 const {data:membership}=await supabase.from("memberships").select("id").eq("institution_id",institution.id).eq("user_id",user.id).eq("status","active").maybeSingle(); if(!membership) redirect("/dashboard");
 const {data:roles}=await supabase.from("membership_roles").select("roles(key)").eq("membership_id",membership.id).eq("institution_id",institution.id);
 const isTeacher=(roles??[]).some(row=>row.roles?.key==="teacher"); const isPrefect=(roles??[]).some(row=>row.roles?.key==="prefect"); if(!isTeacher&&!isPrefect) redirect(`/dashboard/${slug}`);
 const {data:assignments,error:assignmentError}=await supabase.from("staff_assignments").select("division_id,course_subject_id,starts_on,ends_on")
   .eq("institution_id",institution.id).eq("membership_id",membership.id).eq("assignment_type",isPrefect&&!isTeacher?"prefect":"teacher");
 if(assignmentError) throw new Error("No se pudieron consultar tus divisiones asignadas.");
 const today=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Argentina/Buenos_Aires"}).format(new Date());
 const activeAssignments=(assignments??[]).filter(a=>(!a.starts_on||a.starts_on<=today)&&(!a.ends_on||a.ends_on>=today));
 const directDivisionIds=activeAssignments.map(a=>a.division_id).filter((id):id is string=>Boolean(id));
 const subjectAssignmentIds=isPrefect&&!isTeacher?[]:[...new Set(activeAssignments.map(a=>a.course_subject_id).filter((id):id is string=>Boolean(id)))];
 const {data:subjectRows,error:subjectError}=subjectAssignmentIds.length
   ? await supabase.from("course_subjects").select("id,course_id").eq("institution_id",institution.id).in("id",subjectAssignmentIds)
   : {data:[],error:null};
 if(subjectError) throw new Error("No se pudieron consultar tus materias asignadas.");
 const subjectCourseIds=[...new Set((subjectRows??[]).map(row=>row.course_id))];
 const {data:subjectDivisions,error:divisionError}=subjectCourseIds.length
   ? await supabase.from("divisions").select("id").eq("institution_id",institution.id).in("course_id",subjectCourseIds)
   : {data:[],error:null};
 if(divisionError) throw new Error("No se pudieron consultar las divisiones de tus materias.");
 const divisionIds=[...new Set([...directDivisionIds,...(subjectDivisions??[]).map(row=>row.id)])];
 const results=await Promise.all(divisionIds.map(division_id=>supabase.rpc("list_teacher_guardian_contacts",{p_division_id:division_id})));
 if(results.some(r=>r.error)) throw new Error("No se pudieron cargar los tutores vinculados a tus divisiones.");
 const contactMap=new Map<string,Contact>();
 for(const result of results) for(const row of (result.data??[]) as Contact[]) contactMap.set(`${row.student_id}:${row.guardian_membership_id}`,row);
 const contacts=[...contactMap.values()].sort((a,b)=>a.student_name.localeCompare(b.student_name,"es"));
 return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8"><div className="mx-auto max-w-3xl space-y-6">
  <Link href={isPrefect&&!isTeacher?`/dashboard/${slug}/prefect`:`/dashboard/${slug}/teaching`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700"><ArrowLeft size={16}/> Volver al espacio de trabajo</Link>
  <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white"><span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold"><CalendarPlus size={15}/> ENTREVISTA CON FAMILIAS</span><h1 className="mt-4 text-3xl font-bold">Nueva citación</h1><p className="mt-2 text-sm text-indigo-100">{institution.display_name} · Seleccioná un alumno y su tutor autorizado para solicitar una entrevista.</p></header>
  {query.error?<p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{query.error==="date"?"La fecha y hora deben ser futuras.":query.error==="invalid"?"Revisá los datos ingresados.":"No se pudo guardar la citación. Verificá el vínculo del tutor y volvé a intentarlo."}</p>:null}
  <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
   {contacts.length?<form action={createAppointment} className="space-y-5"><input type="hidden" name="slug" value={slug}/>
    <label className="block text-sm font-semibold text-slate-800">Alumno y tutor destinatario
     <select name="contact" required defaultValue="" className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 font-normal">
      <option value="" disabled>Seleccioná un alumno y tutor</option>
      {contacts.map(c=><option key={`${c.student_id}:${c.guardian_membership_id}`} value={`${c.student_id}:${c.guardian_membership_id}`}>{c.student_name} · Tutor: {c.guardian_name}</option>)}
     </select>
    </label>
    <label className="block text-sm font-semibold text-slate-800">Fecha y hora de la entrevista
     <input type="datetime-local" name="scheduled_at" min={localDateTimeMinimum()} required className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal"/>
     <span className="mt-1 block text-xs font-normal text-slate-500">Horario local de Argentina (UTC−03:00).</span>
    </label>
    <label className="block text-sm font-semibold text-slate-800">Motivo de la citación
     <textarea name="reason" required minLength={3} maxLength={1000} rows={4} placeholder="Describí brevemente el motivo de la entrevista..." className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal"/>
    </label>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4"><p className="text-xs text-slate-500">Solo se ofrecen tutores vinculados a alumnos de tus divisiones vigentes.</p><button className="rounded-xl bg-violet-700 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-800">Enviar citación</button></div>
   </form>:<div className="py-8 text-center"><Users className="mx-auto text-slate-300" size={34}/><h2 className="mt-3 font-semibold text-slate-900">No hay tutores disponibles</h2><p className="mt-1 text-sm text-slate-500">No encontramos alumnos con tutores activos en tus divisiones asignadas.</p></div>}
  </section>
 </div></main>;
}