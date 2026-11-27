import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpenCheck, ClipboardCheck, FileText, Megaphone, MessagesSquare, PlusCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";
import { createAdministrativeRecord, updateAdministrativeRecord } from "./actions";

type RecordItem = {
  id:string; category:string; record_code:string|null; title:string; description:string;
  status:string; record_date:string; due_date:string|null; resolution_notes:string|null;
  created_at:string;
};

const categoryLabels:Record<string,string> = {
  documentacion:"Documentación", tramites:"Trámites internos", personal:"Gestión de personal",
  compras:"Compras", mantenimiento:"Mantenimiento", inventario:"Inventario", otro:"Otro",
};
const statusLabels:Record<string,string> = {open:"Pendiente",in_progress:"En proceso",closed:"Cerrado"};

export default async function AdministrativeWorkspace({
  params,searchParams,
}:{
  params:Promise<{slug:string}>;
  searchParams:Promise<{error?:string;created?:string;updated?:string;status?:string;q?:string}>;
}) {
  const {slug}=await params;
  const query=await searchParams;
  const filterStatus=["open","in_progress","closed"].includes(query.status ?? "") ? query.status! : "";
  const search=(query.q ?? "").replace(/[^a-zA-Z0-9À-ÿ\s_-]/g,"").trim().slice(0,80);
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
  const permissions=await getMembershipPermissions(supabase,membership.id);
  if(!permissions.has("administrative_records.read")) redirect(`/dashboard/${slug}`);
  const canManage=permissions.has("administrative_records.manage");

  let recordsQuery=supabase.from("administrative_records").select("*")
    .eq("institution_id",institution.id).order("record_date",{ascending:false}).limit(100);
  if(filterStatus) recordsQuery=recordsQuery.eq("status",filterStatus);
  if(search) recordsQuery=recordsQuery.or("title.ilike.%"+search+"%,record_code.ilike.%"+search+"%,description.ilike.%"+search+"%");
  const {data:records,error:recordsError}=await recordsQuery;
  if(recordsError) throw new Error("No se pudieron cargar los registros administrativos.");
  const rows=(records ?? []) as RecordItem[];
  const {count:openCount}=await supabase.from("administrative_records")
    .select("id",{count:"exact",head:true}).eq("institution_id",institution.id).eq("status","open");
  const {count:progressCount}=await supabase.from("administrative_records")
    .select("id",{count:"exact",head:true}).eq("institution_id",institution.id).eq("status","in_progress");

  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Argentina/Buenos_Aires"}).format(new Date());

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <Link href={`/dashboard/${slug}`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700"><ArrowLeft size={16}/> Volver al espacio institucional</Link>
        <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-900 p-7 text-white shadow-sm">
          <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-wide text-indigo-100"><ClipboardCheck size={15}/> GESTIÓN INSTITUCIONAL</span>
          <h1 className="mt-4 text-3xl font-bold">Gestión administrativa</h1>
          <p className="mt-2 text-sm text-indigo-100">{institution.display_name} · Documentación, trámites y registros internos.</p>
        </header>

        <section className="grid gap-3 md:grid-cols-3">
          {permissions.has("communications.manage") && <Link href={`/dashboard/${slug}/announcements`} className="group rounded-2xl border border-amber-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md">
            <div className="mb-3 inline-flex rounded-xl bg-amber-50 p-3 text-amber-700"><Megaphone size={21}/></div>
            <h2 className="font-semibold text-slate-900">Comunicados</h2>
            <p className="mt-1 text-sm leading-5 text-slate-600">Publicá novedades para estudiantes y familias: cuotas, matrículas, inscripciones y promociones</p>
            <span className="mt-3 inline-flex text-sm font-semibold text-amber-800">Abrir comunicaciones →</span>
          </Link>}
          <Link href={`/dashboard/${slug}/messages`} className="group rounded-2xl border border-violet-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md">
            <div className="mb-3 inline-flex rounded-xl bg-violet-50 p-3 text-violet-700"><MessagesSquare size={21}/></div>
            <h2 className="font-semibold text-slate-900">Mensajería</h2>
            <p className="mt-1 text-sm leading-5 text-slate-600">Contactá al personal institucional y a los tutores, sin iniciar conversaciones con alumnos</p>
            <span className="mt-3 inline-flex text-sm font-semibold text-violet-800">Abrir mensajes →</span>
          </Link>
          {permissions.has("grades.read") && <Link href={`/dashboard/${slug}/report-cards`} className="group rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md">
            <div className="mb-3 inline-flex rounded-xl bg-emerald-50 p-3 text-emerald-700"><BookOpenCheck size={21}/></div>
            <h2 className="font-semibold text-slate-900">Boletines trimestrales</h2>
            <p className="mt-1 text-sm leading-5 text-slate-600">Consultá los boletines aprobados y habilitá su publicación para los tutores</p>
            <span className="mt-3 inline-flex text-sm font-semibold text-emerald-800">Gestionar boletines →</span>
          </Link>}
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pendientes</p><p className="mt-2 text-3xl font-bold">{openCount ?? 0}</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">En proceso</p><p className="mt-2 text-3xl font-bold">{progressCount ?? 0}</p></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Registros visibles</p><p className="mt-2 text-3xl font-bold">{rows.length}</p></div>
        </section>

        {query.error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{query.error==="invalid"?"Revisá los datos ingresados.": "No se pudo guardar el registro. Verificá el código y los datos."}</p>}
        {query.created && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">El registro administrativo se creó correctamente.</p>}
        {query.updated && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">El seguimiento se actualizó correctamente.</p>}

        {canManage && <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-bold"><PlusCircle size={19} className="text-violet-700"/> Nuevo registro</h2>
          <form action={createAdministrativeRecord} className="mt-5 grid gap-4 md:grid-cols-2">
            <input type="hidden" name="slug" value={slug}/>
            <label className="grid gap-1 text-sm font-medium">Categoría
              <select name="category" required className="rounded-lg border border-slate-300 px-3 py-2">
                {Object.entries(categoryLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">Código o referencia (opcional)
              <input name="record_code" maxLength={50} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Ej.: ADM-2026-001"/>
            </label>
            <label className="grid gap-1 text-sm font-medium md:col-span-2">Título
              <input name="title" required minLength={3} maxLength={160} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Ej.: Renovación de documentación institucional"/>
            </label>
            <label className="grid gap-1 text-sm font-medium md:col-span-2">Descripción
              <textarea name="description" required maxLength={5000} rows={3} className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Detalle del trámite, documentación o tarea interna."/>
            </label>
            <label className="grid gap-1 text-sm font-medium">Fecha de registro
              <input type="date" name="record_date" required defaultValue={today} className="rounded-lg border border-slate-300 px-3 py-2"/>
            </label>
            <label className="grid gap-1 text-sm font-medium">Fecha límite (opcional)
              <input type="date" name="due_date" min={today} className="rounded-lg border border-slate-300 px-3 py-2"/>
            </label>
            <div className="md:col-span-2"><button className="rounded-lg bg-violet-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">Crear registro</button></div>
          </form>
        </section>}

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">Registros y trámites</h2><span className="text-sm text-slate-500">Hasta 100 resultados</span></div>
          <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <label className="min-w-[220px] flex-1 text-sm font-medium">Buscar
              <input name="q" defaultValue={search} maxLength={80} placeholder="Título, código o descripción" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"/>
            </label>
            <label className="min-w-[170px] text-sm font-medium">Estado
              <select name="status" defaultValue={filterStatus} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal">
                <option value="">Todos</option><option value="open">Pendiente</option><option value="in_progress">En proceso</option><option value="closed">Cerrado</option>
              </select>
            </label>
            <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Filtrar</button>
            <Link href={`/dashboard/${slug}/administrative`} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Limpiar</Link>
          </form>
          {rows.length ? rows.map(record=>(
            <article key={record.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="text-xs font-semibold uppercase tracking-wide text-violet-700">{categoryLabels[record.category] ?? record.category} · {record.record_date}{record.record_code ? ` · ${record.record_code}` : ""}</p>
                  <h3 className="mt-1 text-lg font-bold text-slate-900">{record.title}</h3></div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{statusLabels[record.status] ?? record.status}</span>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{record.description}</p>
              {record.due_date && <p className={`mt-2 text-xs font-medium ${record.due_date<today && record.status!=="closed"?"text-rose-700":"text-slate-500"}`}>Fecha límite: {record.due_date}</p>}
              {record.resolution_notes && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Seguimiento: {record.resolution_notes}</p>}
              {canManage && <form action={updateAdministrativeRecord} className="mt-4 grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-[1fr_2fr_auto] md:items-end">
                <input type="hidden" name="slug" value={slug}/><input type="hidden" name="record_id" value={record.id}/>
                <label className="grid gap-1 text-xs font-semibold text-slate-600">Estado
                  <select name="status" defaultValue={record.status} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"><option value="open">Pendiente</option><option value="in_progress">En proceso</option><option value="closed">Cerrado</option></select>
                </label>
                <label className="grid gap-1 text-xs font-semibold text-slate-600">Seguimiento / resolución
                  <input name="resolution_notes" maxLength={3000} defaultValue={record.resolution_notes ?? ""} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" placeholder="Anotá la gestión realizada o el resultado"/>
                </label>
                <button className="rounded-lg border border-violet-200 px-4 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-50">Actualizar</button>
              </form>}
            </article>
          )) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500"><FileText size={30} className="mx-auto mb-3 text-slate-300"/>No hay registros que coincidan con la búsqueda.</div>}
        </section>
      </div>
    </main>
  );
}
