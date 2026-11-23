import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpen, Plus, Save, ShieldCheck, Users, GraduationCap } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";
import { createVirtualClassroom, updateVirtualClassroom } from "./actions";

type Division = { id: string; course_id: string; academic_year_id: string; name: string };
type Course = { id: string; name: string; grade_number: number | null };
type AcademicYear = { id: string; name: string };
type Subject = { id: string; name: string };
type CourseSubject = { id: string; course_id: string; subject_id: string };
type Staff = { membership_id: string; display_name: string; role_keys: string[] };
type StaffAssignment = { membership_id: string; assignment_type: string; division_id: string | null; course_subject_id: string | null; starts_on: string | null; ends_on: string | null };
type Classroom = { classroom_id: string; division_id: string; course_subject_id: string | null; title: string; description: string | null; created_at: string; course_name: string; division_name: string; subject_name: string | null; academic_year_name: string; teacher_membership_id: string | null; teacher_name: string | null };

export default async function ClassroomAdministrationPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ created?: string; saved?: string; error?: string }>;
}) {
  const { slug } = await params;
  const query = searchParams ? await searchParams : {};
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: institution } = await supabase.from("institutions")
    .select("id,display_name").eq("slug", slug).maybeSingle();
  if (!institution) redirect("/dashboard");
  const { data: membership } = await supabase.from("memberships")
    .select("id").eq("institution_id", institution.id).eq("user_id", user.id)
    .eq("status", "active").maybeSingle();
  if (!membership) redirect("/dashboard");
  const permissions = await getMembershipPermissions(supabase, membership.id);
  if (!permissions.has("institution.manage")) redirect(`/dashboard/${slug}`);

  const [divisionsResult, coursesResult, yearsResult, subjectsResult, courseSubjectsResult, staffResult, assignmentsResult, classroomsResult] = await Promise.all([
    supabase.from("divisions").select("id,course_id,academic_year_id,name").eq("institution_id", institution.id).order("name"),
    supabase.from("courses").select("id,name,grade_number").eq("institution_id", institution.id).order("grade_number"),
    supabase.from("academic_years").select("id,name").eq("institution_id", institution.id).order("starts_on", { ascending: false }),
    supabase.from("subjects").select("id,name").eq("institution_id", institution.id).order("name"),
    supabase.from("course_subjects").select("id,course_id,subject_id").eq("institution_id", institution.id),
    supabase.rpc("list_assignable_staff_members", { p_institution_id: institution.id }),
    supabase.from("staff_assignments").select("membership_id,assignment_type,division_id,course_subject_id,starts_on,ends_on").eq("institution_id", institution.id).eq("assignment_type", "teacher"),
    supabase.rpc("list_institution_classrooms", { p_institution_id: institution.id }),
  ]);

  const divisions = (divisionsResult.data ?? []) as Division[];
  const courses = (coursesResult.data ?? []) as Course[];
  const years = (yearsResult.data ?? []) as AcademicYear[];
  const subjects = (subjectsResult.data ?? []) as Subject[];
  const courseSubjects = (courseSubjectsResult.data ?? []) as CourseSubject[];
  const staff = ((staffResult.data ?? []) as Staff[]).filter(item => item.role_keys?.includes("teacher"));
  const staffAssignments = (assignmentsResult.data ?? []) as StaffAssignment[];
  const classrooms = (classroomsResult.data ?? []) as Classroom[];
  const courseMap = new Map(courses.map(item => [item.id, item]));
  const yearMap = new Map(years.map(item => [item.id, item.name]));
  const subjectMap = new Map(subjects.map(item => [item.id, item.name]));
  const divisionLabel = (division: Division) => {
    const course = courseMap.get(division.course_id);
    return [course?.name ?? "Curso", division.name, yearMap.get(division.academic_year_id)].filter(Boolean).join(" · ");
  };
  const availableTeachers = (divisionId: string, courseSubjectId: string | null) => {
    const ids = new Set(staffAssignments.filter(item =>
      item.division_id === divisionId &&
      (!item.starts_on || item.starts_on <= new Date().toISOString().slice(0, 10)) &&
      (!item.ends_on || item.ends_on >= new Date().toISOString().slice(0, 10)) &&
      (courseSubjectId ? (!item.course_subject_id || item.course_subject_id === courseSubjectId) : !item.course_subject_id)
    ).map(item => item.membership_id));
    return staff.filter(item => ids.has(item.membership_id));
  };
  const success = query.created === "classroom" ? "El aula virtual se creó y quedó guardada."
    : query.saved === "classroom" ? "La configuración del aula se actualizó correctamente." : null;
  const error = query.error === "duplicate" ? "Ya existe un aula con esos datos."
    : query.error === "reference" ? "La división, materia o docente no corresponde a esta institución."
      : query.error === "forbidden" ? "El docente seleccionado no tiene una asignación vigente para esa división y materia."
        : query.error === "invalid" ? "Revisá los campos: el título debe tener entre 3 y 160 caracteres y la descripción no superar 2.000."
          : query.error ? "No se pudo guardar el aula. Verificá los datos y volvé a intentar." : null;

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-7 text-slate-800 sm:px-7 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <Link href={`/dashboard/${slug}/settings/academic-structure`} className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-indigo-700"><ArrowLeft size={16}/> Volver a estructura académica</Link>
        <header className="overflow-hidden rounded-[28px] bg-gradient-to-br from-[#10264b] via-[#174b86] to-[#315fbd] px-6 py-8 text-white shadow-xl shadow-blue-950/10 sm:px-9 sm:py-9">
          <div className="flex flex-wrap items-start justify-between gap-5"><div><span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold tracking-wider text-cyan-100"><BookOpen size={14}/> ADMINISTRACIÓN ACADÉMICA</span><h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Configuración de Aulas Virtuales</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100">{institution.display_name} · Creá aulas reales, vinculalas con divisiones y materias y asigná docentes titulares.</p></div><div className="rounded-2xl border border-white/15 bg-white/10 p-4"><ShieldCheck size={28} className="text-cyan-100"/></div></div>
        </header>
        {success ? <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div> : null}
        {error ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error}</div> : null}
        <section className="grid gap-3 sm:grid-cols-3">
          {[{label:"Aulas configuradas",value:classrooms.length},{label:"Divisiones disponibles",value:divisions.length},{label:"Docentes asignables",value:staff.length}].map(item => <article key={item.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">{item.label}</p><p className="mt-2 text-3xl font-bold text-slate-900">{item.value}</p></article>)}
        </section>
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex items-center gap-3"><span className="rounded-xl bg-indigo-100 p-3 text-indigo-700"><Plus size={21}/></span><div><h2 className="text-xl font-bold text-slate-900">Crear nueva aula</h2><p className="text-sm text-slate-500">El aula se guardará en EDUNEXA y quedará vinculada a la estructura académica.</p></div></div>
          <form action={createVirtualClassroom} className="grid gap-4 md:grid-cols-2">
            <input type="hidden" name="slug" value={slug}/>
            <label className="text-sm font-semibold text-slate-700">División
              <select name="division_id" required defaultValue="" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal"><option value="" disabled>Seleccionar división</option>{divisions.map(item=><option key={item.id} value={item.id}>{divisionLabel(item)}</option>)}</select>
            </label>
            <label className="text-sm font-semibold text-slate-700">Materia
              <select name="course_subject_id" defaultValue="" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal"><option value="">Aula general (sin materia)</option>{courseSubjects.map(item=><option key={item.id} value={item.id}>{courseMap.get(item.course_id)?.name ?? "Curso"} · {subjectMap.get(item.subject_id) ?? "Materia"}</option>)}</select>
            </label>
            <label className="text-sm font-semibold text-slate-700">Nombre del aula
              <input name="title" required minLength={3} maxLength={160} placeholder="Ej.: Matemática · 3.er año A" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"/>
            </label>
            <label className="text-sm font-semibold text-slate-700">Docente titular
              <select name="owner_membership_id" required defaultValue="" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal"><option value="" disabled>Seleccionar docente</option>{staff.map(item=><option key={item.membership_id} value={item.membership_id}>{item.display_name}</option>)}</select>
            </label>
            <label className="text-sm font-semibold text-slate-700 md:col-span-2">Descripción (opcional)
              <textarea name="description" maxLength={2000} rows={3} placeholder="Propósito, contenidos o indicaciones generales del aula..." className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"/>
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3 md:col-span-2"><p className="text-xs leading-5 text-slate-500">Solo se aceptan docentes con una asignación vigente en la división y materia elegidas. La validación también se realiza en la base de datos.</p><button disabled={!divisions.length || !staff.length} className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50"><Plus size={17}/> Crear aula virtual</button></div>
          </form>
        </section>
        <section className="space-y-4">
          <div><p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-700">Administración y mantenimiento</p><h2 className="mt-1 text-2xl font-bold text-slate-900">Aulas existentes</h2><p className="mt-1 text-sm text-slate-500">Editá el nombre, la descripción y el docente titular sin eliminar materiales, actividades ni entregas.</p></div>
          {classrooms.length ? <div className="grid gap-4 lg:grid-cols-2">{classrooms.map(row => {
            const teachers = availableTeachers(row.division_id,row.course_subject_id);
            return <article key={row.classroom_id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 p-5 text-white"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-blue-200">{row.academic_year_name} · {row.course_name} · División {row.division_name}</p><h3 className="mt-1 text-lg font-bold">{row.title}</h3><p className="mt-1 text-sm text-blue-100">{row.subject_name ?? "Aula general"}</p></div><BookOpen size={22}/></div></div>
              <form action={updateVirtualClassroom} className="grid gap-3 p-5">
                <input type="hidden" name="slug" value={slug}/><input type="hidden" name="classroom_id" value={row.classroom_id}/>
                <label className="text-sm font-semibold text-slate-700">Nombre<input name="title" required minLength={3} maxLength={160} defaultValue={row.title} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"/></label>
                <label className="text-sm font-semibold text-slate-700">Descripción<textarea name="description" maxLength={2000} rows={2} defaultValue={row.description ?? ""} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal"/></label>
                <label className="text-sm font-semibold text-slate-700">Docente titular<select name="owner_membership_id" required defaultValue={row.teacher_membership_id ?? ""} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal"><option value="" disabled>Seleccionar docente</option>{teachers.map(item=><option key={item.membership_id} value={item.membership_id}>{item.display_name}</option>)}</select></label>
                <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3"><span className="inline-flex items-center gap-1.5 text-xs text-slate-500"><Users size={14}/>{row.teacher_name ?? "Sin titular asignado"}</span><button disabled={!teachers.length} className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-50"><Save size={16}/> Guardar cambios</button></div>
              </form>
            </article>;
          })}</div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><GraduationCap className="mx-auto text-slate-400" size={30}/><h3 className="mt-3 font-semibold text-slate-800">Todavía no hay aulas configuradas</h3><p className="mt-1 text-sm text-slate-500">Creá la primera aula desde el formulario superior.</p></div>}
        </section>
        <p className="text-center text-xs text-slate-400">EDUNEXA · Los cambios se guardan en la base de datos y se validan por institución y permisos.</p>
      </div>
    </main>
  );
}
