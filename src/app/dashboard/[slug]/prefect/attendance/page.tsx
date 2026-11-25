import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";
import { createPrefectAttendanceSession, savePrefectAttendance } from "./actions";
import PrefectAttendanceCalendar, { type PrefectAttendanceSession } from "./prefect-attendance-calendar";
import CourseDivisionSelect from "./course-division-select";
import PrefectAttendanceSheet from "./prefect-attendance-sheet";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Assignment = { division_id: string; starts_on: string | null; ends_on: string | null };
type Division = { id: string; name: string; course_id: string };
type Course = { id: string; name: string };
type Student = { id: string; first_name: string; last_name: string; student_number: string | null };

export default async function PrefectAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ saved?: string; error?: string; courseId?: string; divisionId?: string; date?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
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
  if (!permissions.has("attendance.manage")) redirect(`/dashboard/${slug}`);
  const { data: roles } = await supabase.from("membership_roles")
    .select("roles(key)").eq("membership_id", membership.id).eq("institution_id", institution.id);
  if (!(roles ?? []).some((row) => row.roles?.key === "prefect")) redirect(`/dashboard/${slug}`);

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
  const { data: assignments } = await supabase.from("staff_assignments")
    .select("division_id,starts_on,ends_on").eq("institution_id", institution.id)
    .eq("membership_id", membership.id).eq("assignment_type", "prefect").not("division_id", "is", null);
  const assignedIds = [...new Set(((assignments ?? []) as Assignment[])
    .filter((item) => (!item.starts_on || item.starts_on <= today) && (!item.ends_on || item.ends_on >= today))
    .map((item) => item.division_id))];
  const { data: divisions } = assignedIds.length
    ? await supabase.from("divisions").select("id,name,course_id").eq("institution_id", institution.id).in("id", assignedIds).order("name")
    : { data: [] as Division[] };
  const courseIds = [...new Set(((divisions ?? []) as Division[]).map((item) => item.course_id))];
  const { data: courses } = courseIds.length
    ? await supabase.from("courses").select("id,name").eq("institution_id", institution.id).in("id", courseIds).order("name")
    : { data: [] as Course[] };

  const courseList = (courses ?? []) as Course[];
  const divisionList = (divisions ?? []) as Division[];
  const selectedCourse = courseList.find((course) => course.id === query.courseId) ?? null;
  const selectedDivision = divisionList.find((division) =>
    division.id === query.divisionId && division.course_id === selectedCourse?.id) ?? null;

  const db = supabase as unknown as { from: (table: string) => any };
  const selectedDate = query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date) ? query.date : null;
  let sessions: PrefectAttendanceSession[] = [];
  let selectedSession: any = null;
  let students: Student[] = [];
  let records: { student_id: string; status: string; note: string | null }[] = [];

  if (selectedDivision) {
    const { data, error } = await db.from("prefect_attendance_sessions")
      .select("id,division_id,held_on,period_label,status")
      .eq("institution_id", institution.id).eq("division_id", selectedDivision.id)
      .eq("created_by", user.id).order("held_on", { ascending: false }).limit(300);
    if (error) throw new Error("No se pudieron cargar tus planillas de asistencia.");
    sessions = (data ?? []) as PrefectAttendanceSession[];

    if (selectedDate) {
      const { data: session } = await db.from("prefect_attendance_sessions")
        .select("id,division_id,held_on,period_label,status,created_by")
        .eq("institution_id", institution.id).eq("division_id", selectedDivision.id)
        .eq("held_on", selectedDate).eq("created_by", user.id).maybeSingle();
      selectedSession = session;
      if (selectedSession) {
        const { data: enrollments } = await supabase.from("enrollments")
          .select("students(id,first_name,last_name,student_number)")
          .eq("institution_id", institution.id).eq("division_id", selectedDivision.id)
          .eq("status", "active").lte("enrolled_on", selectedDate)
          .or(`ended_on.is.null,ended_on.gte.${selectedDate}`);
        students = (enrollments ?? []).map((item) => item.students as unknown as Student | null)
          .filter((student): student is Student => Boolean(student))
          .sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name));
        const { data: recordRows } = await db.from("prefect_attendance_records")
          .select("student_id,status,note").eq("institution_id", institution.id).eq("session_id", selectedSession.id);
        records = (recordRows ?? []) as typeof records;
      }
    }
  }

  const divisionLabels = selectedDivision ? { [selectedDivision.id]: `${selectedCourse?.name ?? "Curso"} · ${selectedDivision.name}` } : {};
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <Link href={`/dashboard/${slug}/prefect`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700">← Volver a preceptoría</Link>
        <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white shadow-sm sm:p-9">
          <div className="flex items-center gap-3"><div className="rounded-xl bg-white/10 p-3 text-indigo-100"><CalendarCheck size={24}/></div>
            <div><p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-100">Gestión académica · Preceptoría</p><h1 className="text-3xl font-bold sm:text-4xl">Asistencia</h1></div>
          </div>
          <p className="mt-3 text-sm text-indigo-100">{institution.display_name} · Registro individual por preceptor.</p>
        </header>

        {query.saved && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">La asistencia se guardó correctamente.</div>}
        {query.error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {query.error === "scope" ? "La división no está entre tus asignaciones vigentes." : "No se pudo completar la operación. Revisá los datos e intentá nuevamente."}
        </div>}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4"><h2 className="text-lg font-bold text-slate-900">Seleccioná el curso</h2><p className="text-sm text-slate-500">Primero elegí el curso y luego la división para habilitar el calendario.</p></div>
          {courseList.length ? <CourseDivisionSelect slug={slug} courses={courseList} divisions={divisionList}
            selectedCourseId={selectedCourse?.id ?? ""} selectedDivisionId={selectedDivision?.id ?? ""}/> :
            <p className="text-sm text-slate-500">No hay cursos asignados a tu usuario para tomar asistencia.</p>}
        </section>

        {selectedDivision ? <>
          <PrefectAttendanceCalendar slug={slug} courseId={selectedCourse!.id} divisionId={selectedDivision.id}
            sessions={sessions} divisionLabels={divisionLabels} selectedDate={selectedDate}/>
          {selectedDate && !selectedSession && <section className="rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm">
            <h2 className="font-bold text-slate-900">Iniciar asistencia</h2>
            <p className="mt-1 text-sm text-slate-500">Se creará tu planilla personal para {selectedCourse?.name} · {selectedDivision.name} del {selectedDate}.</p>
            <form action={createPrefectAttendanceSession} className="mt-4">
              <input type="hidden" name="slug" value={slug}/><input type="hidden" name="course_id" value={selectedCourse!.id}/>
              <input type="hidden" name="division_id" value={selectedDivision.id}/><input type="hidden" name="held_on" value={selectedDate}/>
              <button className="rounded-lg bg-indigo-700 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-800">Comenzar a tomar asistencia</button>
            </form>
          </section>}
          {selectedSession && <PrefectAttendanceSheet slug={slug} sessionId={selectedSession.id} students={students}
            records={records} status={selectedSession.status} saveAction={savePrefectAttendance}/>}
        </> : <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          Elegí un curso y una división para habilitar el calendario y la toma de asistencia.
        </section>}
      </div>
    </main>
  );
}
