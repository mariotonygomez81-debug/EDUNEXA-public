import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";
import AcademicEventForm from "./academic-event-form";

type EventRow = { id:string; title:string; description:string; category:string; starts_at:string; ends_at:string|null; audience:string; location:string|null };

const labels: Record<string,string> = { jornada:"Jornada", feria:"Feria", examen:"Examen", previa:"Mesa de previas", acto:"Acto escolar", reunion:"Reunión", feriado:"Feriado / asueto", otro:"Otro" };
const audiences: Record<string,string> = { all:"Toda la comunidad", staff:"Personal", teachers:"Docentes", students:"Alumnos", families:"Tutores", prefects:"Preceptores" };

function formatDate(value:string) {
  return new Intl.DateTimeFormat("es-AR",{dateStyle:"full",timeStyle:"short",timeZone:"America/Argentina/Buenos_Aires"}).format(new Date(value));
}

export default async function InstitutionCalendar({params}:{params:Promise<{slug:string}>}) {
  const {slug}=await params;
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect("/login");
  const {data:institution}=await supabase.from("institutions").select("id,display_name").eq("slug",slug).eq("status","active").maybeSingle();
  if(!institution) redirect("/dashboard");
  const {data:membership}=await supabase.from("memberships").select("id").eq("institution_id",institution.id).eq("user_id",user.id).eq("status","active").maybeSingle();
  if(!membership) redirect("/dashboard");
  const permissions=await getMembershipPermissions(supabase,membership.id);
  const {data:events,error}=await supabase.from("academic_calendar_events").select("id,title,description,category,starts_at,ends_at,audience,location")
    .eq("institution_id",institution.id).order("starts_at",{ascending:true}).limit(250);
  if(error) throw new Error("No se pudo cargar el calendario académico.");
  const rows=(events??[]) as EventRow[];
  const canManage=permissions.has("academic_calendar.manage");
  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href={`/dashboard/${slug}`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700"><ArrowLeft size={16}/> Volver al espacio institucional</Link>
      <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white shadow-lg sm:p-9">
        <span className="inline-flex items-center gap-2 text-xs font-bold tracking-[.18em] text-indigo-100"><CalendarDays size={15}/> AGENDA INSTITUCIONAL</span>
        <h1 className="mt-4 text-3xl font-bold">Calendario académico</h1>
        <p className="mt-2 text-sm text-indigo-100">{institution.display_name} · Jornadas, ferias, exámenes, previas, actos y reuniones.</p>
      </header>
      {canManage && <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5"><h2 className="text-lg font-bold">Programar un evento</h2><p className="mt-1 text-sm text-slate-500">Los eventos se publican para los destinatarios seleccionados.</p></div>
        <AcademicEventForm slug={slug}/>
      </section>}
      <section className="space-y-3">
        <div className="flex items-end justify-between"><div><h2 className="text-xl font-bold">Próximas actividades</h2><p className="text-sm text-slate-500">{rows.length} eventos visibles</p></div></div>
        {rows.length ? rows.map(event=><article key={event.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-800">{labels[event.category]??event.category}</span><h3 className="mt-3 text-lg font-bold text-slate-900">{event.title}</h3></div><span className="text-xs font-semibold text-slate-500">{audiences[event.audience]??event.audience}</span></div>
          <p className="mt-2 text-sm font-medium text-indigo-800">{formatDate(event.starts_at)}{event.ends_at?" — "+formatDate(event.ends_at):""}</p>
          {event.location&&<p className="mt-2 flex items-center gap-2 text-sm text-slate-500"><MapPin size={15}/>{event.location}</p>}
          {event.description&&<p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{event.description}</p>}
        </article>) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">Todavía no hay eventos publicados en el calendario.</div>}
      </section>
    </div>
  </main>;
}
