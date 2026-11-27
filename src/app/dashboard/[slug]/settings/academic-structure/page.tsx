import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpen, Building2, CalendarDays, GraduationCap, Plus, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";
import {
  assignStaffToStructure,
  assignSubjectToCourse,
  createCampus,
  createCourse,
  createDivision,
  createEducationLevel,
  createSubject,
  endStaffAssignment,
} from "./actions";

type NamedRow = { id: string; name: string };
type Course = { id: string; level_id: string; name: string; grade_number: number | null; shift: string | null };
type Division = { id: string; course_id: string; academic_year_id: string; campus_id: string | null; name: string; capacity: number | null };
type Subject = { id: string; name: string; code: string | null };
type CourseSubject = { id: string; course_id: string; subject_id: string; weekly_hours: number | null };
type Staff = { membership_id: string; display_name: string; role_keys: string[] };
type StaffAssignment = { id: string; membership_id: string; assignment_type: string; division_id: string | null; course_subject_id: string | null; starts_on: string | null; ends_on: string | null };

const roleLabels: Record<string, string> = {
  teacher: "Docente",
  prefect: "Preceptor",
  director: "Directivo",
  administrative: "Administrativo",
};

const shiftLabels: Record<string, string> = {
  morning: "Mañana",
  afternoon: "Tarde",
  evening: "Vespertino",
  full_day: "Jornada completa",
  other: "Otro",
};

function dateLabel(value: string | null, fallback = "Sin fecha") {
  if (!value) return fallback;
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}

export default async function AcademicStructurePage({
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
    .select("id").eq("institution_id", institution.id)
    .eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership) redirect("/dashboard");

  const permissions = await getMembershipPermissions(supabase, membership.id);
  if (!permissions.has("institution.manage")) redirect(`/dashboard/${slug}`);

  const [
    levelsResult,
    yearsResult,
    campusesResult,
    coursesResult,
    divisionsResult,
    subjectsResult,
    courseSubjectsResult,
    assignmentsResult,
    staffResult,
  ] = await Promise.all([
    supabase.from("education_levels").select("id,name").eq("institution_id", institution.id).order("name"),
    supabase.from("academic_years").select("id,name,status,starts_on,ends_on").eq("institution_id", institution.id).order("starts_on", { ascending: false }),
    supabase.from("campuses").select("id,name").eq("institution_id", institution.id).order("name"),
    supabase.from("courses").select("id,level_id,name,grade_number,shift").eq("institution_id", institution.id).order("grade_number"),
    supabase.from("divisions").select("id,course_id,academic_year_id,campus_id,name,capacity").eq("institution_id", institution.id).order("name"),
    supabase.from("subjects").select("id,name,code").eq("institution_id", institution.id).order("name"),
    supabase.from("course_subjects").select("id,course_id,subject_id,weekly_hours").eq("institution_id", institution.id),
    supabase.from("staff_assignments").select("id,membership_id,assignment_type,division_id,course_subject_id,starts_on,ends_on").eq("institution_id", institution.id).order("created_at", { ascending: false }),
    supabase.rpc("list_assignable_staff_members", { p_institution_id: institution.id }),
  ]);

  const levels = (levelsResult.data ?? []) as NamedRow[];
  const years = (yearsResult.data ?? []) as (NamedRow & { status: string; starts_on: string; ends_on: string })[];
  const campuses = (campusesResult.data ?? []) as NamedRow[];
  const courses = (coursesResult.data ?? []) as Course[];
  const divisions = (divisionsResult.data ?? []) as Division[];
  const subjects = (subjectsResult.data ?? []) as Subject[];
  const courseSubjects = (courseSubjectsResult.data ?? []) as CourseSubject[];
  const assignments = (assignmentsResult.data ?? []) as StaffAssignment[];
  const staff = (staffResult.data ?? []) as Staff[];

  const levelMap = new Map(levels.map((item) => [item.id, item.name]));
  const yearMap = new Map(years.map((item) => [item.id, item.name]));
  const campusMap = new Map(campuses.map((item) => [item.id, item.name]));
  const courseMap = new Map(courses.map((item) => [item.id, item]));
  const subjectMap = new Map(subjects.map((item) => [item.id, item]));
  const divisionMap = new Map(divisions.map((item) => [item.id, item]));
  const courseSubjectMap = new Map(courseSubjects.map((item) => [item.id, item]));
  const staffMap = new Map(staff.map((item) => [item.membership_id, item]));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());

  const successMessage = query.created === "level" ? "El nivel educativo se creó correctamente."
    : query.created === "campus" ? "La sede se creó correctamente."
      : query.created === "course" ? "El curso se creó correctamente."
        : query.created === "division" ? "La división se creó correctamente."
      : query.created === "subject" ? "La materia se creó correctamente."
        : query.saved === "course-subject" ? "La materia quedó asignada al curso."
          : query.saved === "staff" ? "La asignación del personal se guardó."
            : query.saved === "ended" ? "La asignación se finalizó conservando su historial."
              : null;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <Link href={`/dashboard/${slug}`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700">
          <ArrowLeft size={16} /> Volver al espacio institucional
        </Link>

        <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white shadow-sm sm:p-9">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-indigo-100">
            <Building2 size={14} /> CONFIGURACIÓN INSTITUCIONAL
          </span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight">Estructura académica</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-indigo-100">
            Administrá cursos, divisiones, materias y asignaciones de personal de {institution.display_name}.
          </p>
          <Link href={`/dashboard/${slug}/settings/classrooms`} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20">
            Configurar Aulas Virtuales <BookOpen size={16}/>
          </Link>
        </header>

        {successMessage ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status">{successMessage}</div>
        ) : null}
        {query.error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
            {query.error === "duplicate" ? "Ya existe un registro con esos datos."
              : query.error === "reference" ? "La referencia seleccionada no pertenece a esta institución."
                : query.error === "forbidden" ? "No tenés permisos para realizar esta operación."
                  : query.error === "invalid" ? "Revisá los datos ingresados. Los docentes y preceptores necesitan una división asignada."
                    : "No se pudo guardar. Verificá los datos y volvé a intentar."}
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl bg-violet-100 p-3 text-violet-700"><GraduationCap size={21} /></div>
              <div>
                <h2 className="font-semibold text-slate-900">Niveles educativos</h2>
                <p className="text-sm text-slate-500">Configurá los niveles que ofrece la institución.</p>
              </div>
            </div>
            <form action={createEducationLevel} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="slug" value={slug} />
              <label className="text-sm font-medium text-slate-700">Nombre del nivel
                <input name="name" required minLength={2} maxLength={80} placeholder="Ej.: Nivel Primario" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
              </label>
              <label className="text-sm font-medium text-slate-700">Código (opcional)
                <input name="code" maxLength={20} placeholder="Ej.: PRI" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
              </label>
              <label className="text-sm font-medium text-slate-700">Orden
                <input name="sort_order" type="number" min={1} max={1000} defaultValue={levels.length + 1} required className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
              </label>
              <button className="self-end rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">
                Crear nivel
              </button>
            </form>
            <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              {levels.map((level) => <span key={level.id} className="rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-700">{level.name}</span>)}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl bg-sky-100 p-3 text-sky-700"><Building2 size={21} /></div>
              <div>
                <h2 className="font-semibold text-slate-900">Sedes</h2>
                <p className="text-sm text-slate-500">Administrá los edificios o sedes de la institución.</p>
              </div>
            </div>
            <form action={createCampus} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="slug" value={slug} />
              <label className="text-sm font-medium text-slate-700">Nombre de la sede
                <input name="name" required minLength={2} maxLength={100} placeholder="Ej.: Sede Norte" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
              </label>
              <label className="text-sm font-medium text-slate-700">Código (opcional)
                <input name="code" maxLength={20} placeholder="Ej.: NOR" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
              </label>
              <label className="text-sm font-medium text-slate-700">Dirección (opcional)
                <input name="address" maxLength={250} placeholder="Calle y número" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
              </label>
              <label className="text-sm font-medium text-slate-700">Teléfono (opcional)
                <input name="phone" maxLength={40} placeholder="Teléfono de contacto" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
                <input type="checkbox" name="is_main" defaultChecked={!campuses.length} className="rounded border-slate-300" />
                Establecer como sede principal
              </label>
              <button className="rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 sm:col-span-2">
                Crear sede
              </button>
            </form>
            <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              {campuses.map((campus) => <span key={campus.id} className="rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-700">{campus.name}</span>)}
            </div>
          </section>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl bg-violet-100 p-3 text-violet-700"><GraduationCap size={21} /></div>
              <div>
                <h2 className="font-semibold text-slate-900">Crear curso</h2>
                <p className="text-sm text-slate-500">Nivel, año y turno.</p>
              </div>
            </div>
            <form action={createCourse} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="slug" value={slug} />
              <label className="text-sm font-medium text-slate-700">Nivel educativo
                <select name="level_id" required defaultValue="" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
                  <option value="" disabled>Seleccionar nivel</option>
                  {levels.map((level) => <option key={level.id} value={level.id}>{level.name}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">Nombre del curso
                <input name="name" required minLength={2} maxLength={80} placeholder="Ej.: 4.º año" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
              </label>
              <label className="text-sm font-medium text-slate-700">Número de año
                <input name="grade_number" type="number" min={1} max={20} placeholder="Ej.: 4" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
              </label>
              <label className="text-sm font-medium text-slate-700">Turno
                <select name="shift" defaultValue="" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
                  <option value="">Sin especificar</option>
                  <option value="morning">Mañana</option>
                  <option value="afternoon">Tarde</option>
                  <option value="evening">Vespertino</option>
                  <option value="full_day">Jornada completa</option>
                  <option value="other">Otro</option>
                </select>
              </label>
              <button disabled={!levels.length} className="rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2">
                Crear curso
              </button>
            </form>
            <div className="mt-5 space-y-2 border-t border-slate-100 pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cursos existentes ({courses.length})</h3>
              {courses.map((course) => (
                <div key={course.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span className="font-medium text-slate-800">{course.name}</span>
                  <span className="text-xs text-slate-500">{levelMap.get(course.level_id) ?? "Nivel"} · {course.grade_number ?? "—"} · {course.shift ? shiftLabels[course.shift] : "Turno sin definir"}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl bg-sky-100 p-3 text-sky-700"><Building2 size={21} /></div>
              <div>
                <h2 className="font-semibold text-slate-900">Crear división</h2>
                <p className="text-sm text-slate-500">Asociá una comisión a un curso y ciclo lectivo.</p>
              </div>
            </div>
            <form action={createDivision} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="slug" value={slug} />
              <label className="text-sm font-medium text-slate-700">Curso
                <select name="course_id" required defaultValue="" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
                  <option value="" disabled>Seleccionar curso</option>
                  {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">Ciclo lectivo
                <select name="academic_year_id" required defaultValue="" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
                  <option value="" disabled>Seleccionar ciclo</option>
                  {years.filter((year) => year.status !== "closed").map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">Sede
                <select name="campus_id" defaultValue="" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
                  <option value="">Sin sede específica</option>
                  {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">División
                <input name="name" required maxLength={20} placeholder="Ej.: B" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
              </label>
              <label className="text-sm font-medium text-slate-700">Capacidad (opcional)
                <input name="capacity" type="number" min={1} max={2000} placeholder="Ej.: 30" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
              </label>
              <button disabled={!courses.length || !years.some((year) => year.status !== "closed")}
                className="rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50">
                Crear división
              </button>
            </form>
            <div className="mt-5 space-y-2 border-t border-slate-100 pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Divisiones existentes ({divisions.length})</h3>
              {divisions.map((division) => (
                <div key={division.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span className="font-medium text-slate-800">{courseMap.get(division.course_id)?.name ?? "Curso"} · {division.name}</span>
                  <span className="text-xs text-slate-500">{yearMap.get(division.academic_year_id) ?? "Ciclo"} · {division.campus_id ? campusMap.get(division.campus_id) : "Sin sede"} · {division.capacity ?? "Sin capacidad"}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl bg-emerald-100 p-3 text-emerald-700"><BookOpen size={21} /></div>
              <div>
                <h2 className="font-semibold text-slate-900">Materias</h2>
                <p className="text-sm text-slate-500">Creá el catálogo institucional de materias.</p>
              </div>
            </div>
            <form action={createSubject} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <input type="hidden" name="slug" value={slug} />
              <label className="text-sm font-medium text-slate-700">Nombre
                <input name="name" required minLength={2} maxLength={80} placeholder="Ej.: Historia" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
              </label>
              <label className="text-sm font-medium text-slate-700">Código (opcional)
                <input name="code" maxLength={20} placeholder="Ej.: HIS" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
              </label>
              <button className="rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">Crear materia</button>
            </form>
            <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              {subjects.map((subject) => (
                <span key={subject.id} className="rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-700">
                  {subject.name}{subject.code ? ` · ${subject.code}` : ""}
                </span>
              ))}
              {!subjects.length ? <p className="text-sm text-slate-400">Todavía no hay materias.</p> : null}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl bg-indigo-100 p-3 text-indigo-700"><Plus size={21} /></div>
              <div>
                <h2 className="font-semibold text-slate-900">Materias por curso</h2>
                <p className="text-sm text-slate-500">Definí qué materias corresponden a cada curso y sus horas semanales.</p>
              </div>
            </div>
            <form action={assignSubjectToCourse} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="slug" value={slug} />
              <label className="text-sm font-medium text-slate-700">Curso
                <select name="course_id" required defaultValue="" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
                  <option value="" disabled>Seleccionar curso</option>
                  {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">Materia
                <select name="subject_id" required defaultValue="" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
                  <option value="" disabled>Seleccionar materia</option>
                  {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">Horas semanales (opcional)
                <input name="weekly_hours" type="number" min="0.5" max="60" step="0.5" placeholder="Ej.: 4" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
              </label>
              <button disabled={!courses.length || !subjects.length}
                className="rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50">
                Asignar materia
              </button>
            </form>
            <div className="mt-5 space-y-2 border-t border-slate-100 pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Plan de materias ({courseSubjects.length})</h3>
              {courseSubjects.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span className="font-medium text-slate-800">{courseMap.get(item.course_id)?.name ?? "Curso"} · {subjectMap.get(item.subject_id)?.name ?? "Materia"}</span>
                  <span className="text-xs text-slate-500">{item.weekly_hours ? `${item.weekly_hours} h/semana` : "Horas sin definir"}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-xl bg-amber-100 p-3 text-amber-700"><Users size={21} /></div>
            <div>
              <h2 className="font-semibold text-slate-900">Asignaciones de personal</h2>
              <p className="text-sm text-slate-500">Vinculá docentes y preceptores con divisiones y materias. Las asignaciones finalizadas conservan su historial.</p>
            </div>
          </div>
          <form action={assignStaffToStructure} className="grid gap-3 md:grid-cols-3">
            <input type="hidden" name="slug" value={slug} />
            <label className="text-sm font-medium text-slate-700">Personal
              <select name="membership_id" required defaultValue="" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
                <option value="" disabled>Seleccionar persona</option>
                {staff.map((person) => (
                  <option key={person.membership_id} value={person.membership_id}>
                    {person.display_name} — {person.role_keys.map((key) => roleLabels[key] ?? key).join(", ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">Tipo de asignación
              <select name="assignment_type" required defaultValue="teacher" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
                <option value="teacher">Docente</option>
                <option value="prefect">Preceptor</option>
                <option value="director">Directivo</option>
                <option value="administrative">Administrativo</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">División (obligatoria para docentes y preceptores)
              <select name="division_id" defaultValue="" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
                <option value="">Sin división específica</option>
                {divisions.map((division) => (
                  <option key={division.id} value={division.id}>{courseMap.get(division.course_id)?.name} · {division.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">Materia del curso (opcional)
              <select name="course_subject_id" defaultValue="" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal">
                <option value="">Sin materia específica</option>
                {courseSubjects.map((item) => (
                  <option key={item.id} value={item.id}>{courseMap.get(item.course_id)?.name} · {subjectMap.get(item.subject_id)?.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">Desde
              <input name="starts_on" type="date" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
            </label>
            <label className="text-sm font-medium text-slate-700">Hasta (opcional)
              <input name="ends_on" type="date" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal" />
            </label>
            <button disabled={!staff.length} className="rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50 md:col-span-3">
              Guardar asignación
            </button>
          </form>

          <div className="mt-6 overflow-x-auto border-t border-slate-100 pt-5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Asignaciones registradas ({assignments.length})</h3>
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-400">
                <tr><th className="py-2 pr-3">Persona</th><th className="py-2 pr-3">Rol</th><th className="py-2 pr-3">Alcance</th><th className="py-2 pr-3">Vigencia</th><th className="py-2">Acción</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assignments.map((assignment) => {
                  const person = staffMap.get(assignment.membership_id);
                  const division = assignment.division_id ? divisionMap.get(assignment.division_id) : null;
                  const courseSubject = assignment.course_subject_id ? courseSubjectMap.get(assignment.course_subject_id) : null;
                  const scope = [
                    division ? `${courseMap.get(division.course_id)?.name ?? "Curso"} · ${division.name}` : null,
                    courseSubject ? subjectMap.get(courseSubject.subject_id)?.name : null,
                  ].filter(Boolean).join(" / ") || "Institucional";
                  const active = !assignment.ends_on || assignment.ends_on >= today;
                  return (
                    <tr key={assignment.id}>
                      <td className="py-3 pr-3 font-medium text-slate-800">{person?.display_name ?? "Miembro"}</td>
                      <td className="py-3 pr-3 text-slate-600">{roleLabels[assignment.assignment_type] ?? assignment.assignment_type}</td>
                      <td className="py-3 pr-3 text-slate-600">{scope}</td>
                      <td className="py-3 pr-3 text-xs text-slate-500">{dateLabel(assignment.starts_on, "Sin inicio")} — {dateLabel(assignment.ends_on, "Vigente")}</td>
                      <td className="py-3">
                        {active ? (
                          <form action={endStaffAssignment} className="flex items-center gap-2">
                            <input type="hidden" name="slug" value={slug} />
                            <input type="hidden" name="assignment_id" value={assignment.id} />
                            <input type="date" name="ends_on" required min={assignment.starts_on ?? undefined} defaultValue={today}
                              className="rounded-md border border-slate-200 px-2 py-1 text-xs" />
                            <button className="rounded-md border border-amber-200 px-2 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-50">Finalizar</button>
                          </form>
                        ) : <span className="text-xs text-slate-400">Finalizada</span>}
                      </td>
                    </tr>
                  );
                })}
                {!assignments.length ? <tr><td colSpan={5} className="py-6 text-center text-slate-400">No hay asignaciones registradas.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>

        <p className="flex items-start gap-2 text-xs leading-5 text-slate-400">
          <CalendarDays size={14} className="mt-0.5 shrink-0" />
          Las asignaciones vencidas se conservan para auditoría. No se eliminan cursos, divisiones ni materias que puedan estar referenciados por matrículas, calificaciones o boletines.
        </p>
      </div>
    </main>
  );
}
