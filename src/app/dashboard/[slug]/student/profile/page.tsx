import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpen, Camera, GraduationCap, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

type StudentSummary = {
  student_id: string;
  first_name: string;
  last_name: string;
  student_number: string | null;
  is_self: boolean;
  division_name: string | null;
  course_name: string | null;
  academic_year_name: string | null;
  enrollment_status: string;
};

export default async function StudentProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: institution } = await supabase.from("institutions").select("id,display_name").eq("slug", slug).maybeSingle();
  if (!institution) redirect("/dashboard");
  const { data: membership } = await supabase.from("memberships").select("id")
    .eq("institution_id", institution.id).eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership) redirect("/dashboard");
  const [{ data: roleRows }, { data: profile }, { data: studentRows, error }] = await Promise.all([
    supabase.from("membership_roles").select("roles(key)").eq("membership_id", membership.id),
    supabase.from("profiles").select("first_name,last_name,display_name,avatar_path,avatar_style").eq("id", user.id).maybeSingle(),
    supabase.rpc("list_my_portal_students", { p_institution_id: institution.id }),
  ]);
  if (!(roleRows ?? []).some((row) => row.roles?.key === "student")) redirect(`/dashboard/${slug}`);
  const student = ((studentRows ?? []) as StudentSummary[]).find((item) => item.is_self);
  const name = student ? `${student.first_name} ${student.last_name}` : profile?.display_name ?? "Perfil del alumno";
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "A";

  return <main className="min-h-screen bg-[#f5f7fb] px-4 py-6 pb-12 text-slate-800 sm:px-7 sm:py-8">
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href={`/dashboard/${slug}/student`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-violet-800"><ArrowLeft size={16}/> Volver a mi espacio</Link>
      <header className="rounded-3xl bg-gradient-to-br from-[#17345b] via-[#285a83] to-[#3b668c] p-6 text-white shadow-lg sm:p-8">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-bold tracking-[.16em] text-sky-100"><GraduationCap size={14}/> PERFIL DEL ALUMNO</span>
        <div className="mt-5 flex items-center gap-4">
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-3xl border border-white/25 bg-white/15 text-2xl font-extrabold">{initials}</div>
          <div className="min-w-0"><h1 className="text-2xl font-extrabold">{name}</h1><p className="mt-1 text-sm text-sky-100">{institution.display_name}</p></div>
        </div>
      </header>
      {error ? <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">No fue posible cargar los datos académicos. Intentá nuevamente más tarde.</div> : null}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="flex items-center gap-2 font-bold text-slate-900"><UserRound size={18} className="text-violet-700"/> Datos personales</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><dt className="text-xs font-semibold text-slate-500">Nombre y apellido</dt><dd className="mt-1 font-semibold text-slate-900">{name}</dd></div>
          <div><dt className="text-xs font-semibold text-slate-500">Legajo</dt><dd className="mt-1 font-semibold text-slate-900">{student?.student_number ?? "No asignado"}</dd></div>
        </dl>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="flex items-center gap-2 font-bold text-slate-900"><BookOpen size={18} className="text-violet-700"/> Trayectoria escolar</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><dt className="text-xs font-semibold text-slate-500">Año de cursado</dt><dd className="mt-1 font-semibold text-slate-900">{student?.course_name ?? "Pendiente de asignación"}</dd></div>
          <div><dt className="text-xs font-semibold text-slate-500">División</dt><dd className="mt-1 font-semibold text-slate-900">{student?.division_name ?? "Pendiente de asignación"}</dd></div>
          <div><dt className="text-xs font-semibold text-slate-500">Ciclo lectivo</dt><dd className="mt-1 font-semibold text-slate-900">{student?.academic_year_name ?? "No informado"}</dd></div>
          <div><dt className="text-xs font-semibold text-slate-500">Estado de matrícula</dt><dd className="mt-1 font-semibold text-slate-900">{student?.enrollment_status === "active" ? "Activa" : "Pendiente de confirmar"}</dd></div>
        </dl>
      </section>
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <h2 className="flex items-center gap-2 font-bold text-amber-950"><Camera size={18}/> Fotografía y materias previas</h2>
        <p className="mt-2 text-sm leading-6 text-amber-900">La carga segura de la foto personal y el registro de materias previas forman parte de la siguiente etapa del perfil. No se habilitó todavía la edición de estos datos para evitar modificar información institucional sin controles.</p>
      </section>
    </div>
  </main>;
}
