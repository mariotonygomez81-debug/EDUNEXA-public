import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpen, GraduationCap, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import CreateClassroomForm from "./create-classroom-form";

type ClassroomOption = {
  division_id: string;
  division_label: string;
  course_subject_id: string | null;
  subject_label: string;
  academic_year_name: string;
};

export default async function CreateTeacherClassroomPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
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

  const { data: roleRows } = await supabase.from("membership_roles")
    .select("roles(key)").eq("membership_id", membership.id);
  const roles = (roleRows ?? []).map(row => row.roles?.key);
  if (!roles.includes("teacher")) redirect(`/dashboard/${slug}/classroom`);

  const { data, error } = await supabase.rpc("list_teacher_classroom_options", {
    p_institution_id: institution.id,
  });
  const options = (data ?? []) as ClassroomOption[];
  const message = query.error === "invalid" ? "Revisá los datos: el nombre debe tener entre 3 y 160 caracteres."
    : query.error === "scope" ? "La división o materia ya no está dentro de tus asignaciones vigentes."
    : query.error === "reference" ? "La materia seleccionada no corresponde a esa división."
    : query.error ? "No se pudo crear el aula. Volvé a intentarlo."
    : null;

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-7 text-slate-800 sm:px-7 lg:px-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <Link href={`/dashboard/${slug}/classroom`} className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-indigo-700">
          <ArrowLeft size={16}/> Volver a mis aulas
        </Link>

        <header className="relative isolate overflow-hidden rounded-[28px] bg-gradient-to-br from-[#10264b] via-[#174b86] to-[#315fbd] px-6 py-8 text-white shadow-xl sm:px-9 sm:py-9">
          <div className="pointer-events-none absolute -right-12 -top-20 -z-10 h-64 w-64 rounded-full border-[34px] border-white/10"/>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold tracking-wider text-cyan-100">
            <GraduationCap size={15}/> ESPACIO DOCENTE
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Crear un aula virtual</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100">
            {institution.display_name} · Elegí una división y una materia de tus asignaciones vigentes. Vas a quedar como docente titular del aula.
          </p>
        </header>

        {message ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{message}</div> : null}

        {error ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
            No se pudieron consultar tus asignaciones. No habilitamos opciones generales ni accesos alternativos. Actualizá la página o consultá con la administración académica.
          </section>
        ) : options.length ? (
          <CreateClassroomForm slug={slug}>
            <input type="hidden" name="slug" value={slug}/>
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-indigo-100 p-3 text-indigo-700"><BookOpen size={22}/></span>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Datos del aula</h2>
                <p className="mt-1 text-sm text-slate-500">Los datos académicos se validan nuevamente en el servidor antes de guardar.</p>
              </div>
            </div>

            <label className="block text-sm font-semibold text-slate-700">
              Materia y división
              <select name="assignment" required defaultValue="" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 font-normal">
                <option value="" disabled>Seleccionar asignación docente</option>
                {options.map((option, index) => (
                  <option key={`${option.division_id}-${option.course_subject_id ?? "general"}-${index}`}
                    value={`${option.division_id}:${option.course_subject_id ?? ""}`}>
                    {option.subject_label} · {option.division_label} · {option.academic_year_name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-semibold text-slate-700">
              Nombre del aula
              <input name="title" required minLength={3} maxLength={160} placeholder="Ej.: Matemática · 3.er año A" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 font-normal outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"/>
            </label>

            <label className="block text-sm font-semibold text-slate-700">
              Descripción
              <textarea name="description" maxLength={2000} rows={4} placeholder="Propósito, contenidos, metodología o indicaciones generales..." className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 font-normal outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"/>
            </label>

            <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900">
              <ShieldCheck size={19} className="mt-0.5 shrink-0"/>
              <p>El aula quedará vinculada exclusivamente a tu institución, división y asignación. Serás su titular y podrás gestionar sus materiales y actividades según tus permisos.</p>
            </div>

          </CreateClassroomForm>
        ) : (
          <section className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center shadow-sm">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-indigo-50 text-indigo-700"><BookOpen size={30}/></div>
            <h2 className="mt-5 text-xl font-bold text-slate-900">No hay asignaciones docentes disponibles</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">Para crear un aula necesitás una asignación docente vigente en una división. Solicitá a la administración académica que revise tus materias y divisiones asignadas.</p>
            <Link href={`/dashboard/${slug}/classroom`} className="mt-5 inline-flex rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Volver a mis aulas</Link>
          </section>
        )}
      </div>
    </main>
  );
}
