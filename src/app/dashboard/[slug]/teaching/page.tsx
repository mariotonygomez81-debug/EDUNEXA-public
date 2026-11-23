import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpen, CalendarCheck, ClipboardList, GraduationCap, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";

type Assignment = {
  id: string;
  assignment_type: string;
  division_id: string | null;
  course_subject_id: string | null;
  starts_on: string | null;
  ends_on: string | null;
};
type Division = { id: string; name: string; course_id: string };
type Course = { id: string; name: string };
type CourseSubject = { id: string; course_id: string; subject_id: string };
type Subject = { id: string; name: string };

const typeLabels: Record<string, string> = {
  teacher: "Docente",
  prefect: "Preceptor",
  director: "Directivo",
  administrative: "Administrativo",
};

function dateLabel(value: string | null) {
  if (!value) return "Sin fecha de finalización";
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}

export default async function MyTeachingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: institution } = await supabase.from("institutions")
    .select("id,display_name").eq("slug", slug).eq("status", "active").maybeSingle();
  if (!institution) redirect("/dashboard");

  const { data: membership } = await supabase.from("memberships")
    .select("id").eq("institution_id", institution.id)
    .eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership) redirect("/dashboard");

  const permissions = await getMembershipPermissions(supabase, membership.id);
  const { data: roleRows } = await supabase.from("membership_roles").select("roles(key)")
    .eq("membership_id", membership.id).eq("institution_id", institution.id);
  const isTeacher = (roleRows ?? []).some((row) => row.roles?.key === "teacher");
  const { data: rows, error } = await supabase.from("staff_assignments")
    .select("id,assignment_type,division_id,course_subject_id,starts_on,ends_on")
    .eq("institution_id", institution.id)
    .eq("membership_id", membership.id)
    .order("created_at", { ascending: false });
  if (error) throw new Error("No se pudieron cargar tus asignaciones académicas.");

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
  const assignments = ((rows ?? []) as Assignment[]).filter((item) =>
    (!item.starts_on || item.starts_on <= today) && (!item.ends_on || item.ends_on >= today)
  );
  const divisionIds = [...new Set(assignments.map((item) => item.division_id).filter((id): id is string => Boolean(id)))];
  const courseSubjectIds = [...new Set(assignments.map((item) => item.course_subject_id).filter((id): id is string => Boolean(id)))];

  const [divisionResult, courseSubjectResult] = await Promise.all([
    divisionIds.length
      ? supabase.from("divisions").select("id,name,course_id").eq("institution_id", institution.id).in("id", divisionIds)
      : Promise.resolve({ data: [] as Division[] }),
    courseSubjectIds.length
      ? supabase.from("course_subjects").select("id,course_id,subject_id").eq("institution_id", institution.id).in("id", courseSubjectIds)
      : Promise.resolve({ data: [] as CourseSubject[] }),
  ]);
  const directDivisions = (divisionResult.data ?? []) as Division[];
  const courseSubjects = (courseSubjectResult.data ?? []) as CourseSubject[];
  const subjectCourseIds = [...new Set(courseSubjects.map((item) => item.course_id))];
  const { data: subjectDivisionRows, error: subjectDivisionError } = subjectCourseIds.length
    ? await supabase.from("divisions").select("id,name,course_id")
      .eq("institution_id", institution.id).in("course_id", subjectCourseIds)
    : { data: [] as Division[], error: null };
  if (subjectDivisionError) throw new Error("No se pudieron cargar las divisiones de tus materias.");
  const divisionMapById = new Map([...directDivisions, ...((subjectDivisionRows ?? []) as Division[])]
    .map((item) => [item.id, item]));
  const divisions = [...divisionMapById.values()];
  const courseIds = [...new Set([
    ...divisions.map((item) => item.course_id),
    ...courseSubjects.map((item) => item.course_id),
  ])];
  const subjectIds = [...new Set(courseSubjects.map((item) => item.subject_id))];
  const [courseResult, subjectResult] = await Promise.all([
    courseIds.length
      ? supabase.from("courses").select("id,name").eq("institution_id", institution.id).in("id", courseIds)
      : Promise.resolve({ data: [] as Course[] }),
    subjectIds.length
      ? supabase.from("subjects").select("id,name").eq("institution_id", institution.id).in("id", subjectIds)
      : Promise.resolve({ data: [] as Subject[] }),
  ]);
  const divisionMap = new Map(divisions.map((item) => [item.id, item]));
  const courseMap = new Map(((courseResult.data ?? []) as Course[]).map((item) => [item.id, item.name]));
  const courseSubjectMap = new Map(courseSubjects.map((item) => [item.id, item]));
  const subjectMap = new Map(((subjectResult.data ?? []) as Subject[]).map((item) => [item.id, item.name]));

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <Link href={`/dashboard/${slug}`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700">
          <ArrowLeft size={16} /> Volver al espacio institucional
        </Link>
        <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white shadow-sm sm:p-9">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-indigo-100">
            <GraduationCap size={14} /> ESPACIO DE PERSONAL
          </span>
          <div className="flex flex-wrap items-center justify-between gap-4"><h1 className="mt-5 text-3xl font-bold tracking-tight">Mis asignaciones institucionales</h1>{isTeacher ? <Link href={`/dashboard/${slug}/teaching/profile`} className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-100 px-4 py-2.5 text-sm font-semibold text-violet-900 shadow-sm transition-colors hover:bg-violet-200">Mi perfil docente</Link> : null}</div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-indigo-100">{institution.display_name} · Tus responsabilidades vigentes dentro del colegio.</p>
        </header>

        {isTeacher ? (
          <section className="grid gap-4 sm:grid-cols-2">
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-slate-900">Mensajes a tutores</h2>
              <p className="mt-1 text-sm text-slate-500">Contactá a las familias de alumnos vinculados a tus divisiones. Solo se mostrarán destinatarios autorizados.</p>
              <Link href={`/dashboard/${slug}/messages`} className="mt-4 inline-flex rounded-xl border border-violet-200 bg-violet-100 px-4 py-2.5 text-sm font-semibold text-violet-900 hover:bg-violet-200">Enviar mensaje</Link>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-slate-900">Solicitar una citación</h2>
              <p className="mt-1 text-sm text-slate-500">Iniciá una conversación con el tutor y coordiná una entrevista sobre la trayectoria del alumno.</p>
              <Link href={`/dashboard/${slug}/appointments/new`} className="mt-4 inline-flex rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-semibold text-violet-800 hover:bg-violet-100">Crear citación</Link>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-slate-900">Seguimiento de citaciones</h2>
              <p className="mt-1 text-sm text-slate-500">Consultá respuestas de las familias, confirmá entrevistas y registrá su realización.</p>
              <Link href={`/dashboard/${slug}/appointments`} className="mt-4 inline-flex rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-semibold text-violet-900 hover:bg-violet-100">Abrir citaciones</Link>
            </article>
          </section>
        ) : null}

        
        {isTeacher ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <article className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-indigo-700">Centro de informes</p><h2 className="mt-2 font-semibold text-slate-900">Informes académicos y conductuales</h2><p className="mt-1 text-sm text-slate-600">Accedé a reportes de alumno, calificaciones, convivencia, asistencia y boletines desde un solo lugar.</p><Link href={`/dashboard/${slug}/teaching/reports`} className="mt-4 inline-flex rounded-xl border border-violet-200 bg-violet-100 px-4 py-2.5 text-sm font-semibold text-violet-900 hover:bg-violet-200">Abrir centro de informes</Link></article>
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-indigo-700">Informes docentes</p><h2 className="mt-2 font-semibold text-slate-900">Reportes de asistencia</h2><p className="mt-1 text-sm text-slate-500">Consultá porcentajes, ausencias, llegadas tarde y evolución por alumno o división.</p><Link href={`/dashboard/${slug}/attendance/reports`} className="mt-4 inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Abrir reportes</Link></article>
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-indigo-700">Trayectoria escolar</p><h2 className="mt-2 font-semibold text-slate-900">Boletines y resultados</h2><p className="mt-1 text-sm text-slate-500">Revisá calificaciones por período y los boletines oficiales publicados en PDF.</p><Link href={`/dashboard/${slug}/report-cards`} className="mt-4 inline-flex rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-semibold text-violet-900 hover:bg-violet-100">Consultar boletines</Link></article>
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-indigo-700">Planificación</p><h2 className="mt-2 font-semibold text-slate-900">Aulas y clases</h2><p className="mt-1 text-sm text-slate-500">Ingresá a tus aulas, organizá materiales, actividades y permisos de docentes auxiliares.</p><Link href={`/dashboard/${slug}/classroom`} className="mt-4 inline-flex rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Administrar mis aulas</Link></article>
          </section>
        ) : null}

        {assignments.length === 0 ? (
          <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <BookOpen className="mx-auto text-slate-400" size={32} />
            <h2 className="mt-3 font-semibold text-slate-900">Todavía no tenés asignaciones vigentes</h2>
            <p className="mt-1 text-sm text-slate-500">Cuando la institución te asigne funciones, cursos, divisiones o materias, aparecerán en este espacio.</p>
          </section>
        ) : (
          <section className="grid gap-4 md:grid-cols-2">
            {assignments.map((assignment) => {
              const division = assignment.division_id ? divisionMap.get(assignment.division_id) : null;
              const courseSubject = assignment.course_subject_id ? courseSubjectMap.get(assignment.course_subject_id) : null;
              const course = division
                ? courseMap.get(division.course_id)
                : courseSubject
                  ? courseMap.get(courseSubject.course_id)
                  : null;
              const subject = courseSubject ? subjectMap.get(courseSubject.subject_id) : null;
              const assignedDivisions = division
                ? [division]
                : courseSubject
                  ? divisions.filter((item) => item.course_id === courseSubject.course_id)
                  : [];
              return (
                <article key={assignment.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">{typeLabels[assignment.assignment_type] ?? "Asignación"}</p>
                      <h2 className="mt-2 text-xl font-bold text-slate-900">{course ?? "Responsabilidad institucional"}</h2>
                      <p className="mt-1 text-sm text-slate-600">{division ? `División ${division.name}` : "Sin división específica"}</p>
                      <p className="mt-1 text-sm text-slate-600">{subject ?? "Todas las materias / función general"}</p>
                    </div>
                    <div className="rounded-xl bg-violet-100 p-3 text-violet-700"><BookOpen size={22} /></div>
                  </div>
                  <p className="mt-4 text-xs text-slate-500">Vigencia: {dateLabel(assignment.starts_on)} – {dateLabel(assignment.ends_on)}</p>
                  {permissions.has("students.read") && assignedDivisions.length > 0 && (
                    <div className="mt-5 border-t border-slate-100 pt-4">
                      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700"><Users size={16} /> Nóminas de alumnos</p>
                      <div className="flex flex-wrap gap-2">
                        {assignedDivisions.map((item) => (
                          <Link key={item.id} href={`/dashboard/${slug}/teaching/${item.id}`}
                            className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-100">
                            {courseMap.get(item.course_id) ?? "Curso"} · {item.name}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                    {permissions.has("classroom.read") && <Link href={`/dashboard/${slug}/classroom`} className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-100 px-3 py-2 text-sm font-semibold text-violet-900 hover:bg-violet-200"><BookOpen size={15}/> Aula virtual</Link>}
                    {permissions.has("attendance.read") && <Link href={`/dashboard/${slug}/attendance`} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><CalendarCheck size={15}/> Asistencia</Link>}
                    {permissions.has("grades.read") && <Link href={`/dashboard/${slug}/grades`} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><ClipboardList size={15}/> Calificaciones</Link>}
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
