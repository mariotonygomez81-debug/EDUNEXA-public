import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, History, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";
type AuditEvent={id:number;actor_user_id:string|null;action:string;entity_type:string;entity_id:string|null;metadata:Record<string,unknown>;created_at:string};
const labels:Record<string,string>={"institution.profile.updated":"Actualización de datos institucionales","education.level.created":"Alta de nivel educativo","education.level.updated":"Edición de nivel educativo","education.level.deleted":"Eliminación de nivel educativo","education.orientation.created":"Alta de orientación","education.orientation.updated":"Edición de orientación","education.orientation.deleted":"Eliminación de orientación","students.bulk_imported":"Importación y matriculación masiva","academic_year.backup.created":"Creación de respaldo anual","academic_year.backup.restored":"Restauración de respaldo anual"};
export default async function AdministratorAuditPage({params}:{params:Promise<{slug:string}>}){
 const {slug}=await params,supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");
 const {data:institution}=await supabase.from("institutions").select("id,display_name").eq("slug",slug).maybeSingle();if(!institution)redirect("/dashboard");
 const {data:membership}=await supabase.from("memberships").select("id").eq("institution_id",institution.id).eq("user_id",user.id).eq("status","active").maybeSingle();if(!membership)redirect("/dashboard");
 const permissions=await getMembershipPermissions(supabase,membership.id);if(!permissions.has("institution.manage"))redirect("/dashboard/"+slug);
 const {data,error}=await supabase.rpc("list_institution_admin_audit_events",{p_institution_id:institution.id,p_limit:100});
 const events=(data??[]) as AuditEvent[];
 const date=(value:string)=>new Intl.DateTimeFormat("es-AR",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value));
 return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8"><div className="mx-auto max-w-5xl space-y-6">
 <Link href={"/dashboard/"+slug+"/admin"} className="inline-flex items-center gap-2 text-sm text-slate-500"><ArrowLeft size={16}/> Centro de administración</Link>
 <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white"><span className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest text-indigo-100"><History size={15}/> TRAZABILIDAD INSTITUCIONAL</span><h1 className="mt-3 text-3xl font-bold">Historial de operaciones</h1><p className="mt-2 text-sm text-indigo-100">{institution.display_name} · Últimos 100 cambios administrativos registrados.</p></header>
 {error&&<p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">No se pudo cargar el historial.</p>}
 <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center gap-2"><ShieldCheck size={18} className="text-indigo-700"/><h2 className="font-bold">Bitácora administrativa</h2></div>
 {events.length===0?<p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">Todavía no hay operaciones administrativas registradas.</p>:<div className="space-y-3">{events.map(e=><article key={e.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-sm font-semibold text-slate-900">{labels[e.action]??e.action}</h3><p className="mt-1 text-xs text-slate-500">{e.entity_type}{e.entity_id?" · "+e.entity_id:""}</p></div><time className="text-xs text-slate-500">{date(e.created_at)}</time></div><p className="mt-2 text-xs text-slate-500">Operador: {e.actor_user_id??"Sistema"}</p>{Object.keys(e.metadata??{}).length>0&&<pre className="mt-3 overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{JSON.stringify(e.metadata,null,2)}</pre>}</article>)}</div>}
 </section></div></main>;
}
