import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ClipboardList, PlusCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";
import { createPrefectNovelty, updatePrefectNovelty } from "../actions";
import PrefectNoveltiesPdf from "./novelties-pdf";

type Assignment = { division_id: string; starts_on: string | null; ends_on: string | null };
type Division = { id: string; name: string; course_id: string };
type Course = { id: string; name: string };
type Student = { id: string; first_name: string; last_name: string; student_number: string | null };
type Novelty = {
  id: string; division_id: string; student_id: string | null; category: string;
  title: string; description: string; event_date: string; status: string; follow_up: string | null;
  created_at: string;
};

const categoryLabels: Record<string,string> = {
  convivencia:"Convivencia", asistencia:"Asistencia", academica:"Académica",
  familia:"Familia", salud:"Salud", otra:"Otra",
};
const statusLabels: Record<string,string> = { open:"Pendiente", in_progress:"En seguimiento", resolved:"Resuelta" };

export default async function PrefectNoveltiesPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; saved?: string; updated?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: institution } = await supabase.from("institutions")
    .select("id,display_name").eq("slug",slug).eq("status","active").maybeSingle();
  if (!institution) redirect("/dashboard");
  const { data: membership } = await supabase.from("memberships")
    .select("id").eq("institution_id",institution.id).eq("user_id",user.id)
    .eq("status","active").maybeSingle();
  if (!membership) redirect("/dashboard");
  const permissions = await getMembershipPermissions(supabase,membership.id);
  if (!permissions.has("prefect_notes.manage")) redirect(`/dashboard/${slug}`);

  const today = new Intl.DateTimeFormat("en-CA",{timeZone:"America/Argentina/Buenos_Aires"}).format(new Date());
  const { data: assignments, error: assignmentError } = await supabase.from("staff_assignments")
    .select("division_id,starts_on,ends_on").eq("institution_id",institution.id)
    .eq("membership_id",membership.id).eq("assignment_type","prefect").not("division_id","is",null);
  if (assignmentError) throw new Error("No se pudieron cargar tus asignaciones.");
  const divisionIds = [...new Set(((assignments ?? []) as Assignment[])
    .filter(a => (!a.starts_on || a.starts_on <= today) && (!a.ends_on || a.ends_on >= today))
    .map(a => a.division_id))];
  const { data: divisions, error: divisionError } = divisionIds.length
    ? await supabase.from("divisions").select("id,name,course_id").eq("institution_id",institution.id).in("id",divisionIds).order("name")
    : { data: [] as Division[], error: null };
  if (divisionError) throw new Error("No se pudieron cargar las divisiones.");
  const courseIds = [...new Set((divisions ?? []).map(d => d.course_id))];
  const { data: courses } = courseIds.length
    ? await supabase.from("courses").select("id,name").eq("institution_id",institution.id).in("id",courseIds)
    : { data: [] as Course[] };
  const courseNames = new Map(((courses ?? []) as Course[]).map(c => [c.id,c.name]));
  const { data: students, error: studentError } = divisionIds.length
    ? await supabase.from("enrollments").select("division_id,students(id,first_name,last_name,student_number)")
      .eq("institution_id",institution.id).in("division_id",divisionIds).eq("status","active")
    : { data: [], error: null };
  if (studentError) throw new Error("No se pudieron cargar las nóminas.");
  const studentsByDivision = new Map<string,Student[]>();
  for (const row of students ?? []) {
    const student = row.students as unknown as Student | null;
    if (!student) continue;
    studentsByDivision.set(row.division_id,[...(studentsByDivision.get(row.division_id) ?? []),student]);
  }
  const { data: novelties, error: noveltyError } = divisionIds.length
    ? await supabase.from("prefect_novelties").select("*").eq("institution_id",institution.id)
      .in("division_id",divisionIds).order("event_date",{ascending:false}).order("created_at",{ascending:false}).limit(200)
    : { data: [] as Novelty[], error: null };
  if (noveltyError) throw new Error("No se pudieron cargar las novedades.");
  const studentNames = new Map<string,string>();
  for (const list of studentsByDivision.values()) for (const student of list) {
    studentNames.set(student.id,`${student.last_name}, ${student.first_name}`);
  }
  const divisionNames = new Map((divisions ?? []).map(d => [d.id,`${courseNames.get(d.course_id) ?? "Curso"} · ${d.name}`]));

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <Link href={`/dashboard/${slug}/prefect`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700">
          <ArrowLeft size={16}/> Volver a preceptoría
        </Link>
        <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white shadow-sm">
          <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-wide text-indigo-100"><ClipboardList size={15}/> SEGUIMIENTO ESCOLAR</span>
          <h1 className="mt-4 text-3xl font-bold">Novedades de preceptoría</h1>
          <p className="mt-2 text-sm text-indigo-100">{institution.display_name} · Registro y seguimiento de situaciones de las divisiones asignadas.</p>
        </header>
        {query.error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{query.error === "forbidden" ? "No tenés permisos para esa operación." : query.error === "invalid" ? "Revisá los datos ingresados." : "No se pudo guardar. Verificá la división y el alumno seleccionado."}</p>}
        {query.saved && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">La novedad se registró correctamente.</p>}
        {query.updated && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">El seguimiento se actualizó correctamente.</p>}

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-bold"><PlusCircle size={19} className="text-violet-700"/> Registrar una novedad</h2>
          {divisions?.length ? (
            <form action={createPrefectNovelty} className="mt-5 grid gap-4 md:grid-cols-2">
              <input type="hidden" name="slug" value={slug}/>
              <label className="grid gap-1 text-sm font-medium">División
                <select required name="division_id" className="rounded-lg border border-slate-300 px-3 py-2">
                  <option value="">Seleccionar división</option>
                  {divisions.map(d => <option key={d.id} value={d.id}>{courseNames.get(d.course_id) ?? "Curso"} · {d.name}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium">Alumno (opcional)
                <select name="student_id" className="rounded-lg border border-slate-300 px-3 py-2">
                  <option value="">Novedad general de la división</option>
                  {divisions.map(d => <optgroup key={d.id} label={`${courseNames.get(d.course_id) ?? "Curso"} · ${d.name}`}>
                    {(studentsByDivision.get(d.id) ?? []).map(s => <option key={s.id} value={`${d.id}|${s.id}`}>{s.last_name}, {s.first_name}{s.student_number ? ` · ${s.student_number}` : ""}</option>)}
                  </optgroup>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium">Categoría
                <select required name="category" className="rounded-lg border border-slate-300 px-3 py-2">
                  {Object.entries(categoryLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium">Fecha
                <input required type="date" name="event_date" defaultValue={today} className="rounded-lg border border-slate-300 px-3 py-2"/>
              </label>
              <label className="grid gap-1 text-sm font-medium md:col-span-2">Título
                <input required minLength={3} maxLength={120} name="title" placeholder="Ej.: Entrevista con familia" className="rounded-lg border border-slate-300 px-3 py-2"/>
              </label>
              <label className="grid gap-1 text-sm font-medium md:col-span-2">Descripción
                <textarea required maxLength={5000} rows={4} name="description" placeholder="Describí la situación de forma objetiva y breve." className="rounded-lg border border-slate-300 px-3 py-2"/>
              </label>
              <div className="md:col-span-2"><button className="rounded-lg bg-violet-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">Guardar novedad</button></div>
            </form>
          ) : <p className="mt-3 text-sm text-slate-500">No tenés divisiones vigentes asignadas para registrar novedades.</p>}
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Novedades registradas</h2><span className="text-sm text-slate-500">{novelties?.length ?? 0} registros recientes · máximo 200</span></div><PrefectNoveltiesPdf institution={institution.display_name} rows={(novelties ?? []).map(n => ({ date: n.event_date, division: divisionNames.get(n.division_id) ?? "División", student: n.student_id ? studentNames.get(n.student_id) ?? "Alumno" : "División completa", category: categoryLabels[n.category] ?? n.category, title: n.title, description: n.description, status: statusLabels[n.status] ?? n.status, followUp: n.follow_up ?? "" }))} /></div>
          {novelties?.length ? novelties.map(n => (
            <article key={n.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">{categoryLabels[n.category] ?? n.category} · {n.event_date}</p>
                  <h3 className="mt-1 text-lg font-bold text-slate-900">{n.title}</h3>
                  <p className="mt-1 text-sm text-slate-500">{divisionNames.get(n.division_id)}{n.student_id ? ` · ${studentNames.get(n.student_id) ?? "Alumno"}` : " · División completa"}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{statusLabels[n.status] ?? n.status}</span>
              </div>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{n.description}</p>
              <form action={updatePrefectNovelty} className="mt-5 grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-[1fr_2fr_auto] md:items-end">
                <input type="hidden" name="slug" value={slug}/><input type="hidden" name="novelty_id" value={n.id}/>
                <label className="grid gap-1 text-xs font-semibold text-slate-600">Estado
                  <select name="status" defaultValue={n.status} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal">
                    <option value="open">Pendiente</option><option value="in_progress">En seguimiento</option><option value="resolved">Resuelta</option>
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-semibold text-slate-600">Seguimiento / próxima acción
                  <input name="follow_up" maxLength={3000} defaultValue={n.follow_up ?? ""} placeholder="Acuerdos, contacto o acción pendiente" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"/>
                </label>
                <button className="rounded-lg border border-violet-200 px-4 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-50">Actualizar</button>
              </form>
            </article>
          )) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">Todavía no hay novedades registradas para tus divisiones.</div>}
        </section>
      </div>
    </main>
  );
}
