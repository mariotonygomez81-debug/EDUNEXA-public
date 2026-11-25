import Link from "next/link";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarCheck, ClipboardList } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";
import { createPrefectAttendanceSession } from "./actions";

type Assignment = { division_id: string; starts_on: string | null; ends_on: string | null };
type Division = { id: string; name: string; course_id: string };
type Course = { id: string; name: string };

export default async function PrefectAttendancePage({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<{saved?:string;error?:string}>}) {
  const {slug}=await params; const query=await searchParams;
  const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect("/login");
  const {data:institution}=await supabase.from("institutions").select("id,display_name").eq("slug",slug).eq("status","active").maybeSingle();
  if(!institution) redirect("/dashboard");
  const {data:membership}=await supabase.from("memberships").select("id").eq("institution_id",institution.id).eq("user_id",user.id).eq("status","active").maybeSingle();
  if(!membership) redirect("/dashboard");
  const permissions=await getMembershipPermissions(supabase,membership.id);
  if(!permissions.has("attendance.manage")) redirect(`/dashboard/${slug}`);
  const {data:roles}=await supabase.from("membership_roles").select("roles(key)").eq("membership_id",membership.id).eq("institution_id",institution.id);
  if(!(roles??[]).some(row=>row.roles?.key==="prefect")) redirect(`/dashboard/${slug}`);
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Argentina/Buenos_Aires"}).format(new Date());
  const {data:assignments}=await supabase.from("staff_assignments").select("division_id,starts_on,ends_on").eq("institution_id",institution.id).eq("membership_id",membership.id).eq("assignment_type","prefect").not("division_id","is",null);
  const divisionIds=[...new Set(((assignments??[]) as Assignment[]).filter(a=>(!a.starts_on||a.starts_on<=today)&&(!a.ends_on||a.ends_on>=today)).map(a=>a.division_id))];
  const {data:divisions}=divisionIds.length?await supabase.from("divisions").select("id,name,course_id").eq("institution_id",institution.id).in("id",divisionIds).order("name"):{data:[] as Division[]};
  const courseIds=[...new Set((divisions??[]).map(d=>d.course_id))];
  const {data:courses}=courseIds.length?await supabase.from("courses").select("id,name").eq("institution_id",institution.id).in("id",courseIds):{data:[] as Course[]};
  const labels=new Map((courses??[]).map(c=>[c.id,c.name]));
  const db=supabase as unknown as {from:(table:string)=>any};
  const {data:sessions,error}=divisionIds.length?await db.from("prefect_attendance_sessions").select("id,division_id,held_on,period_label,status").eq("institution_id",institution.id).in("division_id",divisionIds).order("held_on",{ascending:false}).limit(100):{data:[],error:null};
  if(error) throw new Error("No se pudieron cargar las planillas de preceptoría.");
  const divisionLabels=new Map((divisions??[]).map(d=>[d.id,`${labels.get(d.course_id)??"Curso"} · ${d.name}`]));
  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8"><div className="mx-auto max-w-6xl space-y-6">
    <Link href={`/dashboard/${slug}/prefect`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700"><ArrowLeft size={16}/> Volver a preceptoría</Link>
    <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white"><span className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-100"><CalendarCheck size={15}/> REGISTRO INDEPENDIENTE</span><h1 className="mt-4 text-3xl font-bold">Asistencia de preceptoría</h1><p className="mt-2 text-sm text-indigo-100">{institution.display_name} · Planillas propias, separadas de la asistencia docente.</p></header>
    {query.saved&&<p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">La planilla independiente fue creada.</p>}
    {query.error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">No se pudo crear la planilla. Verificá la división, la fecha y si ya existe otra para ese turno.</p>}
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-bold">Nueva planilla</h2>
      <form action={createPrefectAttendanceSession} className="mt-4 grid gap-4 md:grid-cols-4"><input type="hidden" name="slug" value={slug}/>
      <label className="grid gap-1 text-sm font-medium md:col-span-2">División<select required name="division_id" className="rounded-lg border border-slate-300 px-3 py-2"><option value="">Seleccionar</option>{(divisions??[]).map(d=><option key={d.id} value={d.id}>{labels.get(d.course_id)??"Curso"} · {d.name}</option>)}</select></label>
      <label className="grid gap-1 text-sm font-medium">Fecha<input required type="date" name="held_on" defaultValue={today} className="rounded-lg border border-slate-300 px-3 py-2"/></label>
      <label className="grid gap-1 text-sm font-medium">Turno / período<input name="period_label" maxLength={80} placeholder="Ej.: Turno mañana" className="rounded-lg border border-slate-300 px-3 py-2"/></label>
      <div className="md:col-span-4"><button className="rounded-lg bg-violet-700 px-5 py-2.5 text-sm font-semibold text-white">Crear planilla</button></div></form>
    </section>
    <section className="space-y-3"><h2 className="text-lg font-bold">Planillas recientes</h2>{sessions?.length?sessions.map((s:any)=><article key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5"><div><p className="text-xs font-semibold uppercase text-violet-700">{s.held_on} · {s.period_label||"Sin turno indicado"}</p><h3 className="mt-1 font-bold">{divisionLabels.get(s.division_id)??"División"}</h3><p className="text-xs text-slate-500">{s.status==="open"?"Abierta":"Cerrada"}</p></div><Link href={`/dashboard/${slug}/prefect/attendance/${s.id}`} className="inline-flex items-center gap-2 rounded-lg border border-violet-200 px-4 py-2 text-sm font-semibold text-violet-800"><ClipboardList size={16}/> Abrir planilla</Link></article>):<p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Todavía no hay planillas independientes.</p>}</section>
  </div></main>;
}
