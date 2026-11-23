import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight, Bell, BookOpen, CalendarClock, CheckCircle2, ClipboardList,
  GraduationCap, MessageCircle, QrCode, Sparkles, UserRound, ChartNoAxesColumnIncreasing,
} from "lucide-react";
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
  can_view_grades: boolean;
  published_report_card_count: number;
};

type Classroom = {
  id: string;
  title: string;
  description: string | null;
  course_name: string;
  division_name: string;
  subject_name: string | null;
};

const shortcuts = [
  { title: "Mis tareas", description: "Revisá las actividades de tus aulas", href: "#mis-aulas", icon: ClipboardList, tone: "violet" },
  { title: "Novedades", description: "Leé los avisos de tus docentes", href: "#mis-aulas", icon: Bell, tone: "amber" },
  { title: "Mensajes", description: "Escribí a tus docentes", href: "messages", icon: MessageCircle, tone: "teal" },
  { title: "Mi rendimiento", description: "Consultá tus notas y boletines", href: "portal", icon: ChartNoAxesColumnIncreasing, tone: "sky" },
] as const;

export default async function StudentWorkspace({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
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

  const [{ data: roleRows }, { data: profile }, { data: studentRows, error: studentError }, { data: classroomRows, error: classroomError }] = await Promise.all([
    supabase.from("membership_roles").select("roles(key)").eq("membership_id", membership.id),
    supabase.from("profiles").select("first_name,last_name,display_name,avatar_path,avatar_style").eq("id", user.id).maybeSingle(),
    supabase.rpc("list_my_portal_students", { p_institution_id: institution.id }),
    supabase.rpc("list_accessible_classrooms", { p_institution_id: institution.id }),
  ]);

  const roles = (roleRows ?? []).map((row) => row.roles?.key).filter(Boolean);
  if (!roles.includes("student")) redirect(`/dashboard/${slug}`);

  const students = (studentRows ?? []) as StudentSummary[];
  const student = students.find((item) => item.is_self) ?? students[0] ?? null;
  const classrooms = (classroomRows ?? []) as Classroom[];
  const firstName = student?.first_name ?? profile?.first_name ?? "Estudiante";
  const fullName = student ? `${student.first_name} ${student.last_name}` : profile?.display_name ?? "Mi perfil";
  const initials = fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "A";
  const greeting = firstName.length > 18 ? firstName.slice(0, 18) : firstName;

  return (
    <main className="min-h-screen bg-[#f5f7fb] pb-24 text-slate-800">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-7 sm:py-8">
        <header className="mb-5 flex items-center justify-between gap-3">
          <Link href={`/dashboard/${slug}`} className="text-lg font-black tracking-[.18em] text-slate-900">EDUNEXA</Link>
          <Link href={`/dashboard/${slug}/student/profile`} aria-label="Mi perfil" className="grid h-11 w-11 place-items-center overflow-hidden rounded-full border-2 border-white bg-violet-100 text-sm font-bold text-violet-900 shadow-sm ring-1 ring-slate-200">
            {initials}
          </Link>
        </header>

        <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#17345b] via-[#285a83] to-[#3b668c] p-5 text-white shadow-lg shadow-slate-900/10 sm:p-8">
          <div className="pointer-events-none absolute -right-14 -top-20 h-64 w-64 rounded-full border-[36px] border-white/10"/>
          <div className="relative flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-bold tracking-[.16em] text-sky-100">
                <GraduationCap size={14}/> MI ESPACIO DE APRENDIZAJE
              </span>
              <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">¡Hola, {greeting}!</h1>
              <p className="mt-2 text-sm leading-6 text-sky-50 sm:text-base">Este es tu espacio para aprender, organizar tus tareas y comunicarte con tus docentes.</p>
              <p className="mt-4 text-xs font-medium text-white/80">{institution.display_name}</p>
            </div>
            <div className="hidden h-20 w-20 place-items-center rounded-3xl border border-white/20 bg-white/10 text-white sm:grid">
              <Sparkles size={38}/>
            </div>
          </div>
          <div className="relative mt-6 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold">{student?.course_name ?? "Curso sin asignar"}</span>
            <span className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold">{student?.division_name ?? "División pendiente"}</span>
            {student?.academic_year_name ? <span className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold">Ciclo {student.academic_year_name}</span> : null}
          </div>
        </section>

        <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-violet-700"><BookOpen size={17}/><span className="text-xs font-semibold text-slate-500">Mis aulas</span></div>
            <p className="mt-2 text-2xl font-extrabold tabular-nums text-slate-900">{classrooms.length}</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-amber-700"><ClipboardList size={17}/><span className="text-xs font-semibold text-slate-500">Mis materias</span></div>
            <p className="mt-2 text-2xl font-extrabold tabular-nums text-slate-900">{new Set(classrooms.map((item) => item.subject_name).filter(Boolean)).size}</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-emerald-700"><CheckCircle2 size={17}/><span className="text-xs font-semibold text-slate-500">Boletines</span></div>
            <p className="mt-2 text-2xl font-extrabold tabular-nums text-slate-900">{student?.can_view_grades ? student.published_report_card_count : "—"}</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sky-700"><CalendarClock size={17}/><span className="text-xs font-semibold text-slate-500">Ciclo lectivo</span></div>
            <p className="mt-2 truncate text-lg font-extrabold text-slate-900">{student?.academic_year_name ?? "—"}</p>
          </article>
        </section>

        <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {shortcuts.map((item) => {
            const Icon = item.icon;
            const href = item.href === "messages" || item.href === "portal" ? `/dashboard/${slug}/${item.href}` : item.href;
            return <Link key={item.title} href={href} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-violet-400">
              <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700"><Icon size={20}/></div>
              <h2 className="text-sm font-bold text-slate-900">{item.title}</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>
            </Link>;
          })}
        </section>

        <section id="mis-aulas" className="mt-7 scroll-mt-5">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[.16em] text-violet-700">Tus espacios de estudio</p>
              <h2 className="mt-1 text-xl font-extrabold text-slate-900">Mis aulas</h2>
              <p className="mt-1 text-sm text-slate-500">Ingresá a cada materia para ver novedades, materiales y tareas.</p>
            </div>
            <Link href={`/join/classroom?school=${encodeURIComponent(slug)}`} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-violet-200 bg-violet-100 px-3 py-2.5 text-xs font-bold text-violet-950 hover:bg-violet-200 sm:px-4 sm:text-sm">
              <QrCode size={16}/> Agregar aula
            </Link>
          </div>

          {studentError || classroomError ? <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">No se pudo verificar toda la información de tus aulas. Volvé a intentarlo en unos minutos.</div> :
            classrooms.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {classrooms.map((classroom) => <Link key={classroom.id} href={`/dashboard/${slug}/classroom/${classroom.id}`} className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-violet-100 text-violet-800"><BookOpen size={21}/></div>
                  <ArrowRight size={18} className="mt-1 text-slate-300 transition group-hover:translate-x-1 group-hover:text-violet-700"/>
                </div>
                <p className="mt-4 text-xs font-semibold text-slate-500">{classroom.course_name} · {classroom.division_name}</p>
                <h3 className="mt-1 text-base font-bold text-slate-900">{classroom.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{classroom.subject_name ?? "Aula general"}</p>
                {classroom.description ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{classroom.description}</p> : null}
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-violet-800">Entrar al aula <ArrowRight size={13}/></span>
              </Link>)}
            </div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-9 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-violet-50 text-violet-700"><BookOpen size={23}/></div>
              <h3 className="mt-3 font-bold text-slate-900">Todavía no agregaste aulas</h3>
              <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-slate-500">Pedile a tu docente el código o el QR de la materia y agregala desde aquí.</p>
              <Link href={`/join/classroom?school=${encodeURIComponent(slug)}`} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-100 px-4 py-2.5 text-sm font-bold text-violet-950 hover:bg-violet-200"><QrCode size={16}/> Ingresar código</Link>
            </div>}
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700"><UserRound size={20}/></div>
            <div className="min-w-0 flex-1">
              <h2 className="font-bold text-slate-900">Mi perfil académico</h2>
              <p className="mt-1 text-sm text-slate-500">{fullName}{student?.student_number ? ` · Legajo ${student.student_number}` : ""}</p>
              <p className="mt-1 text-xs text-slate-500">{student?.enrollment_status === "active" ? "Matrícula activa" : "Matrícula pendiente de confirmar"} · Las materias previas y la fotografía se administrarán desde tu perfil personal.</p>
            </div>
            <Link href={`/dashboard/${slug}/student/profile`} className="shrink-0 text-xs font-bold text-violet-800 hover:text-violet-950">Ver perfil</Link>
          </div>
        </section>
      </div>

      <nav aria-label="Navegación principal" className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 shadow-[0_-8px_24px_rgba(15,23,42,.08)] backdrop-blur sm:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-4 gap-1">
          <Link href={`/dashboard/${slug}/student`} className="flex flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[10px] font-bold text-violet-800"><GraduationCap size={19}/>Inicio</Link>
          <Link href="#mis-aulas" className="flex flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[10px] font-semibold text-slate-600"><BookOpen size={19}/>Aulas</Link>
          <Link href={`/dashboard/${slug}/messages`} className="flex flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[10px] font-semibold text-slate-600"><MessageCircle size={19}/>Mensajes</Link>
          <Link href={`/dashboard/${slug}/portal`} className="flex flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[10px] font-semibold text-slate-600"><ChartNoAxesColumnIncreasing size={19}/>Notas</Link>
        </div>
      </nav>
    </main>
  );
}
