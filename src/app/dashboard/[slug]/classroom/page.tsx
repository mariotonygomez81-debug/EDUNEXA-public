import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft, ArrowRight, BookOpen, Plus,
  GraduationCap, Layers3, LockKeyhole, ShieldCheck, Users, Settings2, UserPlus,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";

const covers = [
  "from-blue-700 via-indigo-700 to-violet-800",
  "from-emerald-700 via-teal-700 to-cyan-800",
  "from-orange-600 via-rose-600 to-pink-700",
  "from-sky-700 via-cyan-700 to-teal-800",
  "from-violet-700 via-purple-700 to-fuchsia-800",
  "from-amber-600 via-orange-600 to-red-700",
];

export default async function ClassroomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: institution } = await supabase
    .from("institutions").select("id,display_name,slug").eq("slug", slug).maybeSingle();
  if (!institution) redirect("/dashboard");

  const { data: membership } = await supabase
    .from("memberships").select("id")
    .eq("institution_id", institution.id).eq("user_id", user.id)
    .eq("status", "active").maybeSingle();
  if (!membership) redirect("/dashboard");

  const permissions = await getMembershipPermissions(supabase, membership.id);
  if (!permissions.has("classroom.read")) redirect(`/dashboard/${slug}`);

  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    supabase.from("profiles").select("display_name,first_name,last_name").eq("id", user.id).maybeSingle(),
    supabase.from("membership_roles").select("roles(key,name)").eq("membership_id", membership.id),
  ]);
  const roles = (roleRows ?? []).map((row) => row.roles?.key).filter(Boolean);
  const displayName = profile?.display_name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Usuario";
  const isStudent = roles.includes("student");
  const isTeacher = roles.includes("teacher");
  const isFamily = roles.includes("tutor") || roles.includes("guardian");
  if (isFamily && !isStudent && !isTeacher) redirect(`/dashboard/${slug}/portal`);

  const { data: classrooms, error: classroomsError } = await supabase.rpc(
    "list_accessible_classrooms", { p_institution_id: institution.id },
  );

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-800">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-7 lg:px-10">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Link href={`/dashboard/${slug}`} className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-blue-700">
            <ArrowLeft size={16} /> Espacio institucional
          </Link>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
            <ShieldCheck size={14} /> Acceso institucional verificado
          </div>
        </div>

        <header className="relative isolate overflow-hidden rounded-[28px] bg-gradient-to-br from-[#10264b] via-[#174b86] to-[#2467a9] px-6 py-8 text-white shadow-xl shadow-blue-950/10 sm:px-9 sm:py-10">
          <div className="pointer-events-none absolute -right-16 -top-28 -z-10 h-80 w-80 rounded-full border-[42px] border-white/5" />
          <div className="pointer-events-none absolute bottom-[-105px] right-[23%] -z-10 h-56 w-56 rounded-full bg-cyan-300/10 blur-2xl" />
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-bold tracking-[.16em] text-blue-100">
                <GraduationCap size={15} /> EDUNEXA · APRENDIZAJE DIGITAL
              </span>
              <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">Aula Virtual</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-blue-100 sm:text-base">
                Hola, {displayName}. Tus materias, recursos, actividades y entregas, organizados en un solo lugar.
              </p>
            </div>
            <div className="hidden rounded-2xl border border-white/15 bg-white/10 p-4 shadow-inner sm:block">
              <Layers3 size={38} strokeWidth={1.5} />
            </div>
          </div>
          <div className="mt-8 flex flex-wrap gap-2">
            <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-blue-50">{institution.display_name}</span>
            {roles.map((role) => <span key={role} className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-blue-100">{role}</span>)}
          </div>
        </header>

        <section className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.16em] text-blue-700">Tu espacio de aprendizaje</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{isTeacher ? "Mis aulas a cargo" : isStudent ? "Mis clases" : "Aulas disponibles"}</h2>
              <p className="mt-1 text-sm text-slate-500">{isTeacher ? "Tus espacios de enseñanza y gestión de actividades." : isStudent ? "Aulas habilitadas por tus docentes. Ingresá con el código, enlace o QR que te compartieron." : "Aulas visibles según tus permisos institucionales."}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isStudent && !isTeacher ? <Link href={`/join/classroom?school=${encodeURIComponent(slug)}`} className="inline-flex items-center gap-2 rounded-xl border border-cyan-200 bg-white px-4 py-2.5 text-sm font-semibold text-cyan-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-cyan-50"><UserPlus size={16}/> Ingresar con código o QR</Link> : null}
              {isTeacher ? <Link href={`/dashboard/${slug}/classroom/create`} className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-800"><Plus size={16}/> Crear nueva aula</Link> : null}
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm">
                {classrooms?.length ?? 0} {(classrooms?.length ?? 0) === 1 ? "aula" : "aulas"}
              </div>
              {permissions.has("institution.manage") ? (
                <Link href={`/dashboard/${slug}/settings/classrooms`} className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-800">
                  <Settings2 size={16}/> Administrar aulas
                </Link>
              ) : null}
            </div>
          </div>

          {classroomsError ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900" role="alert">
              <div className="flex items-center gap-2 font-semibold"><LockKeyhole size={18} /> No se pudo cargar el listado seguro</div>
              <p className="mt-1">El acceso directo a las tablas continúa bloqueado. No mostraremos información si no puede verificarse tu autorización.</p>
            </div>
          ) : classrooms && classrooms.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {classrooms.map((classroom, index) => (
                <Link key={classroom.id} href={`/dashboard/${slug}/classroom/${classroom.id}`}
                  className="group overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm transition duration-200 hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-950/10 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
                  <div className={`relative flex min-h-36 flex-col justify-between overflow-hidden bg-gradient-to-br ${covers[index % covers.length]} p-5 text-white`}>
                    <div className="pointer-events-none absolute -right-7 -top-10 h-36 w-36 rounded-full border-[22px] border-white/10" />
                    <div className="relative flex items-start justify-between gap-3">
                      <span className="rounded-full border border-white/20 bg-black/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.13em] text-white/90">
                        {classroom.course_name}
                      </span>
                      <BookOpen size={22} className="shrink-0 text-white/90" />
                    </div>
                    <div className="relative mt-5">
                      <h3 className="text-xl font-bold leading-tight tracking-tight">{classroom.title}</h3>
                      <p className="mt-1 text-sm text-white/80">{classroom.subject_name ?? "Espacio general"}</p>
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Users size={15} className="text-slate-400" />
                      <span>{classroom.division_name}</span>
                    </div>
                    {classroom.description ? <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-slate-500">{classroom.description}</p> : <p className="mt-3 min-h-10 text-sm text-slate-400">Espacio de aprendizaje y materiales de la materia.</p>}
                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
                      <span className="text-xs font-semibold text-blue-700">Ingresar al aula</span>
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-blue-50 text-blue-700 transition group-hover:bg-blue-700 group-hover:text-white">
                        <ArrowRight size={16} />
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center shadow-sm">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-blue-50 text-blue-700"><BookOpen size={30} /></div>
              <h3 className="mt-5 text-lg font-bold text-slate-900">{isStudent && !isTeacher ? "Todavía no ingresaste a un aula" : isTeacher ? "Todavía no tenés aulas asignadas" : "No hay aulas disponibles"}</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                {isStudent && !isTeacher ? "Tu docente te compartirá un código, enlace o QR para incorporarte al aula y acceder a sus actividades." : isTeacher ? "Las aulas vinculadas a tus asignaciones aparecerán aquí para que publiques materiales, crees tareas y revises entregas." : "Las aulas aparecerán aquí cuando tengas permisos de acceso."}
              </p>
              {isStudent ? <Link href={`/join/classroom?school=${encodeURIComponent(slug)}`} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-800"><UserPlus size={16}/> Ingresar al aula</Link> : null}
            </div>
          )}
        </section>

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 py-5 text-xs text-slate-400">
          <span>EDUNEXA · Aprender. Gestionar. Conectar.</span>
          <span className="inline-flex items-center gap-1.5"><ShieldCheck size={14} /> Acceso protegido por permisos institucionales</span>
        </footer>
      </div>
    </main>
  );
}
