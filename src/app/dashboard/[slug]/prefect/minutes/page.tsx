import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, FileText, Save } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";
import { createPrefectMinute } from "../actions";
import PrefectMinutePdf from "./minute-pdf";

type Assignment = { division_id: string; starts_on: string | null; ends_on: string | null };
type Division = { id: string; name: string; course_id: string };
type Course = { id: string; name: string };
type Student = { id: string; first_name: string; last_name: string; student_number: string | null };
type Novelty = { id: string; division_id: string; student_id: string | null; category: string; title: string; description: string; event_date: string; status: string; follow_up: string | null; follow_up_due_on: string | null };
type Minute = { id: string; folio: number; division_id: string; student_id: string | null; meeting_date: string; act_type: string; subject: string; participants: string; development: string; agreements: string; source_novelty_snapshot: Record<string,unknown>; created_at: string };
const typeLabels: Record<string,string> = {
  seguimiento:"Seguimiento", convivencia:"Convivencia", reunion_familiar:"Reunión con familia",
  acuerdo:"Acuerdos", intervencion:"Intervención institucional",
};
const statusLabels: Record<string,string> = { open:"Pendiente",in_progress:"En seguimiento",resolved:"Resuelta" };

export default async function PrefectMinutesPage({params,searchParams}:{
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
  if(!permissions.has("prefect_minutes.manage")) redirect(`/dashboard/${slug}`);

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
  const studentNames=new Map<string,string>();
  for(const row of enrollmentRows??[]) {
    const student=row.students as unknown as Student|null;
    if(!student) continue;
    studentsByDivision.set(row.division_id,[...(studentsByDivision.get(row.division_id)??[]),student]);
    studentNames.set(student.id,`${student.last_name}, ${student.first_name}`);
  }
  const {data:novelties,error:noveltyError}=divisionIds.length
    ? await supabase.from("prefect_novelties").select("id,division_id,student_id,category,title,description,event_date,status,follow_up,follow_up_due_on")
      .eq("institution_id",institution.id).in("division_id",divisionIds)
      .order("event_date",{ascending:false}).limit(200)
    : {data:[] as Novelty[],error:null};
  if(noveltyError) throw new Error("No se pudieron cargar las novedades para vincular.");
  const {data:minutes,error:minutesError}=divisionIds.length
    ? await supabase.from("prefect_minutes").select("*").eq("institution_id",institution.id)
      .in("division_id",divisionIds).order("folio",{ascending:false}).limit(100)
    : {data:[] as Minute[],error:null};
  if(minutesError) throw new Error("No se pudieron cargar las actas.");
  const divisionNames=new Map((divisions??[]).map(d=>[d.id,`${courseNames.get(d.course_id)??"Curso"} · ${d.name}`]));

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href={`/dashboard/${slug}/prefect`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700"><ArrowLeft size={16}/> Volver a preceptoría</Link>
      <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white shadow-sm">
        <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-wide text-indigo-100"><FileText size={15}/> DOCUMENTACIÓN INSTITUCIONAL</span>
        <h1 className="mt-4 text-3xl font-bold">Actas de Preceptoría</h1>
        <p className="mt-2 text-sm text-indigo-100">{institution.display_name} · Actas numeradas, persistentes y exportables a PDF.</p>
      </header>
      {query.error&&<p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{query.error==="invalid"?"Revisá los campos obligatorios y sus límites.":query.error==="source"?"La novedad vinculada no pertenece a la división o al alumno seleccionado.":"No se pudo guardar el acta. Revisá la división, el alumno y los permisos vigentes."}</p>}
      {query.saved&&<p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Acta guardada. El folio quedó asignado y el documento está disponible para descargar.</p>}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold">Crear nueva acta</h2>
        {divisions?.length?<form action={createPrefectMinute} className="mt-5 grid gap-4 md:grid-cols-2">
          <input type="hidden" name="slug" value={slug}/>
          <label className="grid gap-1 text-sm font-medium">División
            <select required name="division_id" className="rounded-lg border border-slate-300 px-3 py-2">
              <option value="">Seleccionar división</option>
              {divisions.map(d=><option key={d.id} value={d.id}>{divisionNames.get(d.id)}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">Fecha del acta
            <input required type="date" name="meeting_date" defaultValue={today} className="rounded-lg border border-slate-300 px-3 py-2"/>
          </label>
          <label className="grid gap-1 text-sm font-medium">Alumno (opcional)
            <select name="student_id" className="rounded-lg border border-slate-300 px-3 py-2">
              <option value="">Acta general de la división</option>
              {divisions.map(d=><optgroup key={d.id} label={divisionNames.get(d.id)}>
                {(studentsByDivision.get(d.id)??[]).map(s=><option key={s.id} value={s.id}>{s.last_name}, {s.first_name}{s.student_number?` · ${s.student_number}`:""}</option>)}
              </optgroup>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">Tipo de acta
            <select required name="act_type" className="rounded-lg border border-slate-300 px-3 py-2">
              {Object.entries(typeLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium md:col-span-2">Novedad relacionada (opcional)
            <select name="related_novelty_id" className="rounded-lg border border-slate-300 px-3 py-2">
              <option value="">Sin vincular una novedad</option>
              {(novelties??[]).map(n=><option key={n.id} value={n.id}>{n.event_date} · {divisionNames.get(n.division_id)} · {n.title}</option>)}
            </select>
            <span className="text-xs font-normal text-slate-500">Al vincularla, el acta conserva una copia del registro y de su seguimiento al momento de crearla.</span>
          </label>
          <label className="grid gap-1 text-sm font-medium md:col-span-2">Asunto
            <input required minLength={3} maxLength={180} name="subject" placeholder="Motivo o tema principal del acta" className="rounded-lg border border-slate-300 px-3 py-2"/>
          </label>
          <label className="grid gap-1 text-sm font-medium md:col-span-2">Participantes (opcional)
            <textarea maxLength={2000} rows={2} name="participants" placeholder="Nombres y roles de quienes participaron" className="rounded-lg border border-slate-300 px-3 py-2"/>
          </label>
          <label className="grid gap-1 text-sm font-medium md:col-span-2">Desarrollo / constancia
            <textarea required minLength={1} maxLength={6000} rows={5} name="development" placeholder="Dejá constancia objetiva de lo tratado, los antecedentes relevantes y las intervenciones realizadas." className="rounded-lg border border-slate-300 px-3 py-2"/>
          </label>
          <label className="grid gap-1 text-sm font-medium md:col-span-2">Acuerdos y compromisos (opcional)
            <textarea maxLength={4000} rows={3} name="agreements" placeholder="Compromisos asumidos, responsables y plazos acordados." className="rounded-lg border border-slate-300 px-3 py-2"/>
          </label>
          <div className="md:col-span-2"><button className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-800"><Save size={16}/> Guardar acta</button></div>
        </form>:<p className="mt-3 text-sm text-slate-500">No tenés divisiones vigentes asignadas.</p>}
      </section>

      <section className="space-y-4">
        <div><h2 className="text-lg font-bold">Actas registradas</h2><p className="text-sm text-slate-500">Últimas {minutes?.length??0} actas · máximo 100</p></div>
        {minutes?.length?minutes.map(m=><article key={m.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Acta N.º {String(m.folio).padStart(6,"0")} · {new Date(m.meeting_date+"T12:00:00").toLocaleDateString("es-AR")}</p>
              <h3 className="mt-1 text-lg font-bold text-slate-900">{m.subject}</h3>
              <p className="mt-1 text-sm text-slate-500">{divisionNames.get(m.division_id)}{m.student_id? ` · ${studentNames.get(m.student_id)??"Alumno"}`:" · División completa"} · {typeLabels[m.act_type]??m.act_type}</p>
            </div>
            <PrefectMinutePdf institution={institution.display_name} division={divisionNames.get(m.division_id)??"División"} student={m.student_id?studentNames.get(m.student_id)??"Alumno":""} minute={{folio:m.folio,date:m.meeting_date,type:typeLabels[m.act_type]??m.act_type,subject:m.subject,participants:m.participants,development:m.development,agreements:m.agreements,source:m.source_novelty_snapshot}}/>
          </div>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{m.development}</p>
          {m.agreements&&<p className="mt-3 text-sm text-slate-600"><strong>Acuerdos:</strong> {m.agreements}</p>}
        </article>):<div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">Todavía no hay actas registradas para tus divisiones.</div>}
      </section>
    </div>
  </main>;
}
