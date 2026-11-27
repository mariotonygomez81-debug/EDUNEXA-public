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
  created_at: string; follow_up_due_on: string | null;
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
  searchParams: Promise<{ error?: string; saved?: string; updated?: string; status?: string; category?: string; division?: string; due?: string; q?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const selectedStatus = ["open", "in_progress", "resolved"].includes(query.status ?? "") ? query.status! : "";
  const selectedCategory = ["convivencia", "asistencia", "academica", "familia", "salud", "otra"].includes(query.category ?? "") ? query.category! : "";
  const selectedDivision = query.division ?? "";
  const selectedDue = ["overdue", "today", "upcoming", "without_date"].includes(query.due ?? "") ? query.due! : "";
  const search = (query.q ?? "").replace(/[^a-zA-Z0-9À-ÿ\\s_-]/g, "").trim().slice(0, 80);
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
  const allNovelties = novelties ?? [];
  const matchesDue = (novelty: Novelty) => {
    if (!selectedDue) return true;
    if (selectedDue === "without_date") return !novelty.follow_up_due_on && novelty.status !== "resolved";
    if (!novelty.follow_up_due_on || novelty.status === "resolved") return false;
    if (selectedDue === "overdue") return novelty.follow_up_due_on < today;
    if (selectedDue === "today") return novelty.follow_up_due_on === today;
    return novelty.follow_up_due_on > today;
  };
  const filteredNovelties = allNovelties.filter((novelty) => {
    if (selectedStatus && novelty.status !== selectedStatus) return false;
    if (selectedCategory && novelty.category !== selectedCategory) return false;
    if (selectedDivision && novelty.division_id !== selectedDivision) return false;
    if (!matchesDue(novelty)) return false;
    if (search) {
      const haystack = [novelty.title, novelty.description, novelty.follow_up ?? "",
        novelty.student_id ? studentNames.get(novelty.student_id) ?? "" : "",
        divisionNames.get(novelty.division_id) ?? ""].join(" ").toLocaleLowerCase("es");
      if (!haystack.includes(search.toLocaleLowerCase("es"))) return false;
    }
    return true;
  }).sort((a, b) => {
    const aOpen = a.status !== "resolved";
    const bOpen = b.status !== "resolved";
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    if (a.follow_up_due_on && b.follow_up_due_on) return a.follow_up_due_on.localeCompare(b.follow_up_due_on);
    if (a.follow_up_due_on) return -1;
    if (b.follow_up_due_on) return 1;
    return b.event_date.localeCompare(a.event_date);
  });
  const overdueCount = allNovelties.filter(n => n.status !== "resolved" && n.follow_up_due_on && n.follow_up_due_on < today).length;
  const dueTodayCount = allNovelties.filter(n => n.status !== "resolved" && n.follow_up_due_on === today).length;
  const upcomingCount = allNovelties.filter(n => n.status !== "resolved" && n.follow_up_due_on && n.follow_up_due_on > today).length;
  const withoutDateCount = allNovelties.filter(n => n.status !== "resolved" && !n.follow_up_due_on).length;


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

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Link href={`/dashboard/${slug}/prefect/novelties?due=overdue`} className="rounded-xl border border-rose-200 bg-white p-4 hover:bg-rose-50">
            <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Acciones vencidas</p><p className="mt-1 text-2xl font-bold text-slate-900">{overdueCount}</p>
          </Link>
          <Link href={`/dashboard/${slug}/prefect/novelties?due=today`} className="rounded-xl border border-amber-200 bg-white p-4 hover:bg-amber-50">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Vencen hoy</p><p className="mt-1 text-2xl font-bold text-slate-900">{dueTodayCount}</p>
          </Link>
          <Link href={`/dashboard/${slug}/prefect/novelties?due=upcoming`} className="rounded-xl border border-sky-200 bg-white p-4 hover:bg-sky-50">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Próximas acciones</p><p className="mt-1 text-2xl font-bold text-slate-900">{upcomingCount}</p>
          </Link>
          <Link href={`/dashboard/${slug}/prefect/novelties?due=without_date`} className="rounded-xl border border-slate-200 bg-white p-4 hover:bg-slate-50">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Sin fecha asignada</p><p className="mt-1 text-2xl font-bold text-slate-900">{withoutDateCount}</p>
          </Link>
        </section>

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Agenda de seguimiento</h2><span className="text-sm text-slate-500">{filteredNovelties.length} de {allNovelties.length} novedades recientes · máximo 200</span></div><PrefectNoveltiesPdf institution={institution.display_name} rows={filteredNovelties.map(n => ({ date: n.event_date, division: divisionNames.get(n.division_id) ?? "División", student: n.student_id ? studentNames.get(n.student_id) ?? "Alumno" : "División completa", category: categoryLabels[n.category] ?? n.category, title: n.title, description: n.description, status: statusLabels[n.status] ?? n.status, followUp: n.follow_up ?? "", followUpDueOn: n.follow_up_due_on ?? "" }))} /></div>
          <form method="get" className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
            <label className="grid gap-1 text-xs font-semibold text-slate-600">Buscar
              <input name="q" defaultValue={search} placeholder="Alumno, novedad o acción" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"/>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">División
              <select name="division" defaultValue={selectedDivision} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal">
                <option value="">Todas mis divisiones</option>{(divisions ?? []).map(d=><option key={d.id} value={d.id}>{divisionNames.get(d.id)}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">Estado
              <select name="status" defaultValue={selectedStatus} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal">
                <option value="">Todos</option><option value="open">Pendiente</option><option value="in_progress">En seguimiento</option><option value="resolved">Resuelta</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">Categoría
              <select name="category" defaultValue={selectedCategory} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal">
                <option value="">Todas</option>{Object.entries(categoryLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">Fecha de acción
              <select name="due" defaultValue={selectedDue} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal">
                <option value="">Todas</option><option value="overdue">Vencidas</option><option value="today">Vencen hoy</option><option value="upcoming">Próximas</option><option value="without_date">Sin fecha</option>
              </select>
            </label>
            <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-5">
              <button className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white">Aplicar filtros</button>
              <Link href={`/dashboard/${slug}/prefect/novelties`} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600">Limpiar</Link>
            </div>
          </form>
          {filteredNovelties.length ? filteredNovelties.map(n => (
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
              {n.follow_up_due_on && (
                <p className={`mt-3 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${n.status !== "resolved" && n.follow_up_due_on < today ? "bg-rose-50 text-rose-700" : "bg-sky-50 text-sky-800"}`}>
                  {n.status !== "resolved" && n.follow_up_due_on < today ? "Acción vencida" : "Próxima acción"} · {new Date(n.follow_up_due_on + "T12:00:00").toLocaleDateString("es-AR")}
                </p>
              )}
              <form action={updatePrefectNovelty} className="mt-5 grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-[1fr_2fr_1fr_auto] md:items-end">
                <input type="hidden" name="slug" value={slug}/><input type="hidden" name="novelty_id" value={n.id}/>
                <label className="grid gap-1 text-xs font-semibold text-slate-600">Estado
                  <select name="status" defaultValue={n.status} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal">
                    <option value="open">Pendiente</option><option value="in_progress">En seguimiento</option><option value="resolved">Resuelta</option>
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-semibold text-slate-600">Seguimiento / próxima acción
                  <input name="follow_up" maxLength={3000} defaultValue={n.follow_up ?? ""} placeholder="Acuerdos, contacto o acción pendiente" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"/>
                </label>
                <label className="grid gap-1 text-xs font-semibold text-slate-600">Fecha de próxima acción
                  <input type="date" name="follow_up_due_on" defaultValue={n.follow_up_due_on ?? ""} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"/>
                </label>
                <button className="rounded-lg border border-violet-200 px-4 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-50">Actualizar</button>
              </form>
            </article>
          )) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">{allNovelties.length ? "No hay novedades que coincidan con los filtros seleccionados." : "Todavía no hay novedades registradas para tus divisiones."}</div>}
        </section>
      </div>
    </main>
  );
}
