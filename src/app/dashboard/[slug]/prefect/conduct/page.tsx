import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpenCheck, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";
import { savePrefectConductConcept } from "../actions";

type Assignment = { division_id: string; starts_on: string | null; ends_on: string | null };
type Division = { id: string; name: string; course_id: string };
type Course = { id: string; name: string };
type Student = { id: string; first_name: string; last_name: string; student_number: string | null };
type Period = { id: string; name: string; starts_on: string; ends_on: string; status: string };
type Conduct = { id: string; division_id: string; student_id: string; grading_period_id: string; concept: string; observation: string | null; updated_at: string };
const conceptLabels: Record<string,string> = {
  muy_satisfactorio:"Muy satisfactorio", satisfactorio:"Satisfactorio",
  en_proceso:"En proceso", requiere_acompanamiento:"Requiere acompañamiento",
};

export default async function PrefectConductPage({params,searchParams}:{
  params:Promise<{slug:string}>;
  searchParams:Promise<{error?:string;saved?:string}>;
}) {
  const {slug}=await params; const query=await searchParams;
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect("/login");
  const {data:institution}=await supabase.from("institutions").select("id,display_name")
    .eq("slug",slug).eq("status","active").maybeSingle();
  if(!institution) redirect("/dashboard");
  const {data:membership}=await supabase.from("memberships").select("id")
    .eq("institution_id",institution.id).eq("user_id",user.id).eq("status","active").maybeSingle();
  if(!membership) redirect("/dashboard");
  const permissions=await getMembershipPermissions(supabase,membership.id);
  if(!permissions.has("prefect_conduct.manage")) redirect(`/dashboard/${slug}`);

  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Argentina/Buenos_Aires"}).format(new Date());
  const {data:assignments,error:assignmentError}=await supabase.from("staff_assignments")
    .select("division_id,starts_on,ends_on").eq("institution_id",institution.id)
    .eq("membership_id",membership.id).eq("assignment_type","prefect").not("division_id","is",null);
  if(assignmentError) throw new Error("No se pudieron cargar tus divisiones asignadas.");
  const divisionIds=[...new Set(((assignments??[]) as Assignment[])
    .filter(a=>(!a.starts_on||a.starts_on<=today)&&(!a.ends_on||a.ends_on>=today)).map(a=>a.division_id))];
  const {data:divisions,error:divisionError}=divisionIds.length
    ? await supabase.from("divisions").select("id,name,course_id").eq("institution_id",institution.id).in("id",divisionIds).order("name")
    : {data:[] as Division[],error:null};
  if(divisionError) throw new Error("No se pudieron cargar las divisiones.");
  const courseIds=[...new Set((divisions??[]).map(d=>d.course_id))];
  const {data:courses}=courseIds.length
    ? await supabase.from("courses").select("id,name").eq("institution_id",institution.id).in("id",courseIds)
    : {data:[] as Course[]};
  const courseNames=new Map(((courses??[]) as Course[]).map(c=>[c.id,c.name]));
  const {data:enrollmentRows,error:studentError}=divisionIds.length
    ? await supabase.from("enrollments").select("division_id,students(id,first_name,last_name,student_number)")
      .eq("institution_id",institution.id).in("division_id",divisionIds).eq("status","active")
    : {data:[],error:null};
  if(studentError) throw new Error("No se pudieron cargar las nóminas.");
  const studentsByDivision=new Map<string,Student[]>();
  for(const row of enrollmentRows??[]) {
    const student=row.students as unknown as Student|null;
    if(student) studentsByDivision.set(row.division_id,[...(studentsByDivision.get(row.division_id)??[]),student]);
  }
  const {data:periods,error:periodError}=await supabase.from("grading_periods")
    .select("id,name,starts_on,ends_on,status").eq("institution_id",institution.id).order("starts_on",{ascending:false});
  if(periodError) throw new Error("No se pudieron cargar los períodos lectivos.");
  const periodRows=(periods??[]) as Period[];
  const openPeriods=periodRows.filter(p=>p.status==="open");
  const {data:conductRows,error:conductError}=divisionIds.length
    ? await supabase.from("prefect_conduct_concepts").select("*").eq("institution_id",institution.id)
      .in("division_id",divisionIds).order("updated_at",{ascending:false}).limit(200)
    : {data:[] as Conduct[],error:null};
  if(conductError) throw new Error("No se pudieron cargar los conceptos conductuales.");
  const studentNames=new Map<string,string>();
  for(const list of studentsByDivision.values()) for(const student of list)
    studentNames.set(student.id,`${student.last_name}, ${student.first_name}`);
  const divisionNames=new Map((divisions??[]).map(d=>[d.id,`${courseNames.get(d.course_id)??"Curso"} · ${d.name}`]));
  const periodNames=new Map(periodRows.map(p=>[p.id,p.name]));

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href={`/dashboard/${slug}/prefect`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700"><ArrowLeft size={16}/> Volver a preceptoría</Link>
      <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white shadow-sm">
        <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-wide text-indigo-100"><BookOpenCheck size={15}/> SEGUIMIENTO ESCOLAR</span>
        <h1 className="mt-4 text-3xl font-bold">Conceptos conductuales</h1>
        <p className="mt-2 text-sm text-indigo-100">{institution.display_name} · Valoración individual por alumno y período lectivo.</p>
      </header>
      {query.error&&<p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{query.error==="invalid"?"Revisá los datos ingresados.":"No se pudo guardar. Verificá que el alumno pertenezca a la división y que el período esté abierto."}</p>}
      {query.saved&&<p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">El concepto quedó guardado. Si ya existía para ese alumno y período, se actualizó el registro vigente.</p>}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold">Registrar o actualizar concepto</h2>
        {divisions?.length&&openPeriods.length?<form action={savePrefectConductConcept} className="mt-5 grid gap-4 md:grid-cols-2">
          <input type="hidden" name="slug" value={slug}/>
          <label className="grid gap-1 text-sm font-medium">Alumno y división asignada
            <select required name="student_id" className="rounded-lg border border-slate-300 px-3 py-2">
              <option value="">Seleccionar alumno</option>
              {divisions.map(d=><optgroup key={d.id} label={`${courseNames.get(d.course_id)??"Curso"} · ${d.name}`}>
                {(studentsByDivision.get(d.id)??[]).map(s=><option key={s.id} value={`${d.id}|${s.id}`}>{s.last_name}, {s.first_name}{s.student_number?` · ${s.student_number}`:""}</option>)}
              </optgroup>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">Período lectivo
            <select required name="grading_period_id" className="rounded-lg border border-slate-300 px-3 py-2">
              <option value="">Seleccionar período abierto</option>
              {openPeriods.map(p=><option key={p.id} value={p.id}>{p.name} · {p.starts_on} a {p.ends_on}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">Concepto
            <select required name="concept" className="rounded-lg border border-slate-300 px-3 py-2">
              {Object.entries(conceptLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium md:col-span-2">Observación (opcional)
            <textarea name="observation" maxLength={1200} rows={3} placeholder="Describí conductas observables, avances y aspectos a acompañar, con lenguaje respetuoso y objetivo." className="rounded-lg border border-slate-300 px-3 py-2"/>
          </label>
          <div className="md:col-span-2"><button className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-800"><Save size={16}/> Guardar concepto</button></div>
        </form>:<p className="mt-3 text-sm text-slate-500">{!divisions?.length?"No tenés divisiones vigentes asignadas.":"No hay períodos de calificación abiertos para registrar conceptos."}</p>}
      </section>
      <section className="space-y-4">
        <div><h2 className="text-lg font-bold">Conceptos registrados</h2><p className="text-sm text-slate-500">Últimos {conductRows?.length??0} registros · máximo 200</p></div>
        {conductRows?.length?conductRows.map(row=><article key={row.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs font-semibold uppercase tracking-wide text-violet-700">{periodNames.get(row.grading_period_id)??"Período"} · {divisionNames.get(row.division_id)??"División"}</p>
              <h3 className="mt-1 text-lg font-bold text-slate-900">{studentNames.get(row.student_id)??"Alumno"}</h3>
              <p className="mt-1 text-sm font-semibold text-slate-700">{conceptLabels[row.concept]??row.concept}</p>
            </div>
            <span className="text-xs text-slate-500">Actualizado: {new Intl.DateTimeFormat("es-AR",{dateStyle:"medium"}).format(new Date(row.updated_at))}</span>
          </div>
          {row.observation&&<p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{row.observation}</p>}
        </article>):<div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">Todavía no hay conceptos conductuales registrados para tus divisiones.</div>}
      </section>
    </div>
  </main>;
}
