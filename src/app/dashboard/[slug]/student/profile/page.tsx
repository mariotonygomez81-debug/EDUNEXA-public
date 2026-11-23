import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpen, Camera, GraduationCap, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { saveStudentProfile } from "./actions";

type PreviousSubject = {
  id: string;
  subject_name: string;
  school_year: string | null;
  final_grade: number | null;
  status: "pending" | "in_progress" | "approved" | "equivalency" | "not_approved";
  observations: string | null;
};

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

export default async function StudentProfilePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { slug } = await params;
  const query = await searchParams;
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
  let avatarUrl: string | null = null;
  if (profile?.avatar_path) {
    const { data } = await supabase.storage.from("student-profile-photos").createSignedUrl(profile.avatar_path, 600);
    avatarUrl = data?.signedUrl ?? null;
  }
  const avatarStyle = profile?.avatar_style ?? "neutral";
  const { data: observationRows, error: observationsError } = student
    ? await supabase.from("student_period_observations")
      .select("id,observation,grading_period_id,created_at")
      .eq("institution_id", institution.id)
      .eq("student_id", student.student_id)
      .order("created_at", { ascending: false })
      .limit(20)
    : { data: [], error: null };
  const observations = observationRows ?? [];
  const periodIds = [...new Set(observations.map((item) => item.grading_period_id).filter(Boolean))];
  const { data: periodRows } = periodIds.length
    ? await supabase.from("grading_periods").select("id,name").in("id", periodIds)
    : { data: [] };
  const periodNames = new Map((periodRows ?? []).map((period) => [period.id, period.name]));
  const { data: previousSubjectRows, error: previousSubjectsError } = student
    ? await supabase.from("student_previous_subjects")
      .select("id,subject_name,school_year,final_grade,status,observations")
      .eq("institution_id", institution.id)
      .eq("student_id", student.student_id)
      .order("school_year", { ascending: false })
    : { data: [], error: null };
  const previousSubjects = (previousSubjectRows ?? []) as PreviousSubject[];
  const previousSubjectStatus: Record<PreviousSubject["status"], string> = {
    pending: "Pendiente", in_progress: "En curso", approved: "Aprobada",
    equivalency: "Por equivalencia", not_approved: "No aprobada",
  };

  return <main className="min-h-screen bg-[#f5f7fb] px-4 py-6 pb-12 text-slate-800 sm:px-7 sm:py-8">
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href={`/dashboard/${slug}/student`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-violet-800"><ArrowLeft size={16}/> Volver a mi espacio</Link>
      <header className="rounded-3xl bg-gradient-to-br from-[#17345b] via-[#285a83] to-[#3b668c] p-6 text-white shadow-lg sm:p-8">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-bold tracking-[.16em] text-sky-100"><GraduationCap size={14}/> PERFIL DEL ALUMNO</span>
        <div className="mt-5 flex items-center gap-4">
          {avatarUrl ? <Image src={avatarUrl} alt="Foto de perfil del alumno" width={96} height={96} unoptimized className="h-20 w-20 shrink-0 rounded-3xl border border-white/25 object-cover shadow-sm"/> : <div aria-label={`Avatar ${avatarStyle}`} className="grid h-20 w-20 shrink-0 place-items-center rounded-3xl border border-white/25 bg-white/15 text-2xl font-extrabold">{avatarStyle === "masculino" ? "👨🏻‍🎓" : avatarStyle === "femenino" ? "👩🏻‍🎓" : initials}</div>}
          <div className="min-w-0"><h1 className="text-2xl font-extrabold">{name}</h1><p className="mt-1 text-sm text-sky-100">{institution.display_name}</p></div>
        </div>
      </header>
      {query.saved ? <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Perfil actualizado correctamente.</div> : null}
      {query.error ? <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{query.error === "photo" ? "La foto debe ser JPG, PNG o WEBP y pesar hasta 5 MB." : query.error === "upload" ? "No se pudo cargar la fotografía. Intentá nuevamente." : "No se pudo guardar el perfil."}</div> : null}
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
      <form action={saveStudentProfile} encType="multipart/form-data" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <input type="hidden" name="slug" value={slug}/>
        <h2 className="flex items-center gap-2 font-bold text-slate-900"><Camera size={18} className="text-violet-700"/> Fotografía y avatar</h2>
        <label className="block text-sm font-semibold text-slate-700">Subir fotografía
          <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" className="mt-2 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-violet-100 file:px-3 file:py-2 file:font-semibold file:text-violet-900"/>
          <span className="mt-1 block text-xs font-normal text-slate-500">JPG, PNG o WEBP · Máximo 5 MB. La imagen se guarda en un espacio privado.</span>
        </label>
        <label className="block text-sm font-semibold text-slate-700">Avatar si todavía no tenés una foto
          <select name="avatar_style" defaultValue={avatarStyle} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal">
            <option value="neutral">Neutro</option><option value="masculino">Masculino</option><option value="femenino">Femenino</option>
          </select>
        </label>
        <div className="flex justify-end"><button type="submit" className="rounded-xl border border-violet-200 bg-violet-100 px-5 py-2.5 text-sm font-semibold text-violet-950 hover:bg-violet-200">Guardar perfil</button></div>
      </form>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 font-bold text-slate-900"><GraduationCap size={18} className="text-emerald-700"/> Orientaciones de tus docentes</h2>
        <p className="mt-2 text-sm text-slate-600">Consejos y observaciones para acompañar tu aprendizaje.</p>
        {observationsError ? <p role="status" className="mt-3 text-sm text-amber-800">No fue posible consultar las orientaciones en este momento.</p> :
          observations.length ? <ul className="mt-4 space-y-3">{observations.map((item) => <li key={item.id} className="rounded-xl bg-emerald-50/70 p-4">
            <p className="text-xs font-semibold text-emerald-900">{periodNames.get(item.grading_period_id) ?? "Seguimiento académico"} · {new Intl.DateTimeFormat("es-AR", { dateStyle: "medium" }).format(new Date(item.created_at))}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.observation}</p>
          </li>)}</ul> : <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Todavía no hay orientaciones publicadas por tus docentes.</p>}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 font-bold text-slate-900"><BookOpen size={18} className="text-violet-700"/> Materias previas</h2>
        <p className="mt-2 text-sm text-slate-600">Consultá el estado de las materias que tenés pendientes de años anteriores.</p>
        {previousSubjectsError ? <p role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">El registro de materias previas estará disponible cuando la institución habilite su nueva estructura académica.</p> :
          previousSubjects.length ? <ul className="mt-4 divide-y divide-slate-100">{previousSubjects.map((subject) => <li key={subject.id} className="py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold text-slate-900">{subject.subject_name}</p><p className="mt-1 text-xs text-slate-500">{subject.school_year ? `Ciclo ${subject.school_year} · ` : ""}{previousSubjectStatus[subject.status]}</p></div>
              {subject.final_grade !== null ? <span className="rounded-lg bg-slate-100 px-3 py-1 text-sm font-bold text-slate-800">Nota: {subject.final_grade}</span> : null}</div>
            {subject.observations ? <p className="mt-2 text-sm leading-5 text-slate-600">{subject.observations}</p> : null}
          </li>)}</ul> : <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">No tenés materias previas registradas.</p>}
      </section>
    </div>
  </main>;
}
