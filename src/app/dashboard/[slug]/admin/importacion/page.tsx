import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";
import StudentImporter from "./student-importer";
type Year={id:string;name:string;status:string};
type Division={id:string;academic_year_id:string;name:string;course_name:string;year_name:string};
export default async function StudentImportPage({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<Record<string,string|undefined>>}){
 const {slug}=await params,q=await searchParams,supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");
 const {data:institution}=await supabase.from("institutions").select("id,display_name").eq("slug",slug).maybeSingle();if(!institution)redirect("/dashboard");
 const {data:membership}=await supabase.from("memberships").select("id").eq("institution_id",institution.id).eq("user_id",user.id).eq("status","active").maybeSingle();if(!membership)redirect("/dashboard");
 const permissions=await getMembershipPermissions(supabase,membership.id);if(!permissions.has("students.manage"))redirect(`/dashboard/${slug}`);
 const [yr,dr]=await Promise.all([supabase.from("academic_years").select("id,name,status").eq("institution_id",institution.id).neq("status","closed").order("starts_on",{ascending:false}),supabase.from("divisions").select("id,academic_year_id,name,courses(name),academic_years(name)").eq("institution_id",institution.id).order("name")]);
 const years=(yr.data??[]) as Year[];const divisions=(dr.data??[]).map((d:any)=>({id:d.id,academic_year_id:d.academic_year_id,name:d.name,course_name:d.courses?.name??"Curso",year_name:d.academic_years?.name??""})) as Division[];
 return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8"><div className="mx-auto max-w-6xl space-y-6">
 <Link href={`/dashboard/${slug}/admin`} className="inline-flex items-center gap-2 text-sm text-slate-500"><ArrowLeft size={16}/> Centro de administración</Link>
 <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white"><span className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest text-indigo-100"><FileSpreadsheet size={15}/> MATRÍCULA MASIVA</span><h1 className="mt-3 text-3xl font-bold">Importar alumnos desde Excel</h1><p className="mt-2 text-sm text-indigo-100">{institution.display_name} · Vista previa, validación y matriculación por división.</p></header>
 {q.imported&&<p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">Se matricularon {q.imported} alumnos correctamente.</p>}
 {q.error&&<p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{q.error==="duplicates"?"El archivo contiene legajos repetidos.":q.error==="invalid"?"Hay datos inválidos o falta seleccionar el ciclo y la división.":"No se pudo completar la importación. Revisá que los legajos no existan y que la división tenga capacidad disponible."}</p>}
 {years.length&&divisions.length?<StudentImporter slug={slug} years={years} divisions={divisions}/>:<p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Primero configurá un ciclo lectivo abierto y al menos una división en Estructura académica.</p>}
 </div></main>;
}
