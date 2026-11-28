import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpen, GraduationCap, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

type PortalStudent = { student_id: string; is_self: boolean; division_id: string | null };
type Classroom = { id: string; division_id: string; title: string; course_name: string; division_name: string; subject_name: string | null };
type ClassroomPeople = { teachers?: { id: string; name: string; assignment: string | null }[] };

export default async function StudentTeachersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: institution } = await supabase.from("institutions").select("id,display_name").eq("slug", slug).maybeSingle();
  if (!institution) redirect("/dashboard");
  const { data: membership } = await supabase.from("memberships").select("id")
    .eq("institution_id", institution.id).eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership) redirect("/dashboard");

  const { data: portalRows, error: portalError } = await supabase.rpc("list_my_portal_students", { p_institution_id: institution.id });
  const student = ((portalRows ?? []) as PortalStudent[]).find((row) => row.is_self);
  if (portalError || !student) redirect(`/dashboard/${slug}`);
  if (!student.division_id) {
    return <main className="min-h-screen bg-slate-50 px-4 py-8"><div className="mx-auto max-w-4xl rounded-2xl bg-white p-6">
      <Link href={`/dashboard/${slug}/portal`} className="text-sm text-violet-700">← Volver a Mi portal</Link>
      <h1 className="mt-4 text-2xl font-bold text-slate-900">Mis docentes</h1>
      <p className="mt-2 text-sm text-slate-500">No tenés una división activa vinculada para consultar tus docentes.</p>
    </div></main>;
  }

  const { data: classroomRows, error: classroomError } = await supabase.rpc("list_accessible_classrooms", { p_institution_id: institution.id });
  const classrooms = ((classroomRows ?? []) as Classroom[]).filter((item) => item.division_id === student.division_id);
  const results = !classroomError ? await Promise.all(classrooms.map(async (classroom) => {
    const { data, error } = await supabase.rpc("list_classroom_people", { p_classroom_id: classroom.id });
    const people = (data ?? {}) as ClassroomPeople;
    return { classroom, teachers: error ? [] : people.teachers ?? [] };
  })) : [];
  const entries = results.filter((item) => item.teachers.length);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href={`/dashboard/${slug}/portal`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700"><ArrowLeft size={16}/> Volver a Mi portal</Link>
        <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white shadow-sm sm:p-9">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-indigo-100"><GraduationCap size={15}/> MI ESPACIO EDUCATIVO</span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight">Mis docentes</h1>
          <p className="mt-2 text-sm leading-6 text-indigo-100">{institution.display_name} · Docentes de tus aulas y espacios curriculares</p>
        </header>
        {classroomError ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">No fue posible consultar tus aulas en este momento.</div>
          : entries.length ? <section className="grid gap-4 md:grid-cols-2">
            {entries.map(({ classroom, teachers }) => <article key={classroom.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-xs font-semibold uppercase tracking-wide text-violet-700">{classroom.subject_name ?? "Espacio curricular"}</p>
                  <h2 className="mt-1 text-lg font-semibold text-slate-900">{classroom.title}</h2>
                  <p className="mt-1 text-xs text-slate-500">{classroom.course_name} · {classroom.division_name}</p>
                </div>
                <span className="rounded-xl bg-violet-50 p-3 text-violet-700"><BookOpen size={20}/></span>
              </div>
              <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                {teachers.map((teacher) => <div key={teacher.id} className="flex items-center gap-3">
                  <span className="rounded-full bg-slate-100 p-2 text-slate-600"><UserRound size={17}/></span>
                  <div><p className="text-sm font-semibold text-slate-800">{teacher.name}</p>
                    {teacher.assignment ? <p className="text-xs text-slate-500">{teacher.assignment}</p> : <p className="text-xs text-slate-400">Docente del aula</p>}
                  </div>
                </div>)}
              </div>
              <Link href={`/dashboard/${slug}/classroom/${classroom.id}`} className="mt-5 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Abrir aula <BookOpen size={14}/></Link>
            </article>)}
          </section> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Todavía no hay docentes vinculados a tus aulas disponibles.</div>}
      </div>
    </main>
  );
}
