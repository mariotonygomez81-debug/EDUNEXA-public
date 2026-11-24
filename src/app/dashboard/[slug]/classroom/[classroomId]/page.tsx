import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, BookOpen, FileText, ShieldCheck, Users, UserRound, Settings2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createClassroomMaterial, createClassroomAssignment } from "./actions";
import ClassroomFileUpload from "./file-upload";
import StudentAssignmentEditor from "./student-assignment-editor";
import ClassroomAttendanceCalendar from "./attendance-calendar";
import ClassroomTermGradebook from "./term-gradebook";
import ClassroomAssignmentRoster, { type ClassroomAssignmentRosterRow } from "./submission-roster";
import ClassroomTeacherAccessManager from "./teacher-access-manager";
import ClassroomInvitePanel from "./invite-panel";
import ClassroomMaterialEditor from "./material-editor";
import ClassroomAssignmentEditor from "./assignment-editor";
import ClassroomAssignmentResources, { type AssignmentResource } from "./assignment-resources";
import AjaxForm from "./ajax-form";

type ClassroomFile = {
  file_id: string;
  purpose: string;
  material_id: string | null;
  submission_id: string | null;
  original_filename: string;
  mime_type: string;
  byte_size: number;
  object_path: string;
  created_at: string;
  signedUrl: string | null;
};

type ClassroomSubmission = {
  assignment_id: string;
  submission_id: string;
  student_id: string;
  student_first_name: string;
  student_last_name: string;
  student_number: string | null;
  body: string | null;
  submitted_at: string | null;
  review_status: "visto" | "aprobado" | "desaprobado" | "corregir" | null;
  score: number | null;
  feedback: string | null;
  graded_by: string | null;
  can_grade: boolean;
};

type ClassroomOverview = {
  id: string;
  institution_id: string;
  division_id: string;
  course_subject_id: string | null;
  title: string;
  description: string | null;
  created_at: string;
  division_name: string;
  course_name: string;
  subject_name: string | null;
  materials: {
    id: string;
    title: string;
    body: string | null;
    published_at: string | null;
    created_at: string;
  }[];
  assignments: {
    id: string;
    title: string;
    instructions: string | null;
    due_at: string | null;
    max_score: number | null;
    published_at: string | null;
    created_at: string;
  }[];
};

const classroomThemes = {
  indigo: { header: "from-slate-950 via-indigo-950 to-violet-900", activeTab: "border-indigo-600 text-indigo-700", button: "border border-violet-200 bg-violet-100 text-violet-950 hover:bg-violet-200", glow: "bg-indigo-500/30" },
  ocean: { header: "from-slate-950 via-blue-950 to-cyan-900", activeTab: "border-cyan-600 text-cyan-700", button: "border border-teal-200 bg-teal-100 text-teal-950 hover:bg-teal-200", glow: "bg-cyan-400/25" },
  emerald: { header: "from-slate-950 via-emerald-950 to-teal-900", activeTab: "border-emerald-600 text-emerald-700", button: "border border-emerald-200 bg-emerald-100 text-emerald-950 hover:bg-emerald-200", glow: "bg-emerald-400/25" },
  sunset: { header: "from-slate-950 via-orange-950 to-rose-900", activeTab: "border-orange-600 text-orange-700", button: "border border-orange-200 bg-orange-100 text-orange-950 hover:bg-orange-200", glow: "bg-orange-400/25" },
  violet: { header: "from-slate-950 via-violet-950 to-fuchsia-900", activeTab: "border-violet-600 text-violet-700", button: "border border-violet-200 bg-violet-100 text-violet-950 hover:bg-violet-200", glow: "bg-violet-400/25" },
} as const;

function formatDate(value: string | null) {
  if (!value) return "Sin fecha límite";
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function ClassroomDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; classroomId: string }>;
  searchParams: Promise<{ section?: string; error?: string; material?: string; assignment?: string }>;
}) {
  const { slug, classroomId } = await params;
  const { section: requestedSection, error: queryError, material: materialStatus, assignment: assignmentStatus } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: institution } = await supabase
    .from("institutions")
    .select("id,display_name,slug")
    .eq("slug", slug)
    .maybeSingle();
  if (!institution) redirect("/dashboard");

  const { data: membership } = await supabase
    .from("memberships")
    .select("id")
    .eq("institution_id", institution.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) redirect("/dashboard");

  const { data: roleRows } = await supabase
    .from("membership_roles")
    .select("roles(key)")
    .eq("membership_id", membership.id);
  const roles = (roleRows ?? []).map((row) => row.roles?.key);
  const { data: capabilityData } = await supabase.rpc("get_classroom_capabilities", {
    p_classroom_id: classroomId,
  });
  const capabilities = (capabilityData ?? {}) as {
    can_read?: boolean;
    can_manage?: boolean;
    can_grade?: boolean;
    can_attendance?: boolean;
    can_view_attendance?: boolean;
    can_edit_materials?: boolean;
    can_edit_assignments?: boolean;
    can_manage_members?: boolean;
  };
  const canManageByRole = capabilities.can_manage === true;
  const canGrade = capabilities.can_grade === true;
  const canManageAttendance = capabilities.can_attendance === true;
  const canViewAttendance = capabilities.can_view_attendance === true || canManageAttendance;
  const canEditMaterials = capabilities.can_edit_materials === true;
  const canEditAssignments = capabilities.can_edit_assignments === true;
  const canManageMembers = capabilities.can_manage_members === true;
  const isStudent = roles.includes("student");
  const { data: preferenceData } = roles.includes("teacher")
    ? await supabase.rpc("get_teacher_classroom_preferences", { p_classroom_id: classroomId })
    : { data: null };
  const preferences = (preferenceData ?? {
    accent_theme: "indigo", layout_density: "comfortable", default_section: "news", show_header_stats: true,
  }) as { accent_theme: keyof typeof classroomThemes; layout_density: "comfortable" | "compact"; default_section: string; show_header_stats: boolean };
  const requested = ["news", "work", "people", "attendance", "grades"].includes(requestedSection ?? "")
    ? requestedSection
    : preferences.default_section;
  const currentSection = requested === "attendance" && !canViewAttendance
    ? "news"
    : requested === "grades" && !canGrade
      ? "news"
      : requested;
  const theme = classroomThemes[preferences.accent_theme] ?? classroomThemes.indigo;
  const density = preferences.layout_density === "compact" ? "space-y-5" : "space-y-8";

  const { data, error } = await supabase.rpc("get_classroom_overview", {
    p_classroom_id: classroomId,
  });
  if (error) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
        <div className="mx-auto max-w-4xl space-y-5">
          <Link href={`/dashboard/${slug}/classroom`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700">
            <ArrowLeft size={16} /> Volver a mis aulas
          </Link>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900" role="alert">
            No fue posible cargar el aula. No se habilitó acceso alternativo a las tablas.
          </div>
        </div>
      </main>
    );
  }
  if (!data) notFound();

  const classroom = data as unknown as ClassroomOverview;
  const { data: peopleData } = await supabase.rpc("list_classroom_people", { p_classroom_id: classroomId });
  const classroomPeople = (peopleData ?? { teachers: [], students: [] }) as {
    teachers: { id: string; name: string; assignment: string | null }[];
    students: { id: string; name: string; student_number: string | null }[];
  };
  const { data: inviteRows } = canManageMembers
    ? await supabase.rpc("get_classroom_invite", { p_classroom_id: classroomId })
    : { data: [] };
  const classroomInvite = inviteRows?.[0] ?? null;
  const { data: submissionsData, error: submissionsError } = await supabase.rpc(
    "list_classroom_submissions",
    { p_classroom_id: classroomId },
  );
  const submissions = (submissionsData ?? []) as ClassroomSubmission[];
  const submissionHistories = canGrade
    ? await Promise.all(submissions.map(async (submission) => {
        const { data, error: historyError } = await supabase.rpc("get_classroom_submission_history", {
          p_submission_id: submission.submission_id,
        });
        return [submission.submission_id, historyError ? null : data] as const;
      }))
    : [];
  const historyBySubmission = Object.fromEntries(submissionHistories) as unknown as Record<string, {
    revisions?: { revision_number: number; body: string | null; file_path: string | null; submitted_at: string | null; changed_at: string }[];
    grades?: { previous_score: number | null; new_score: number | null; previous_feedback: string | null; new_feedback: string | null; changed_at: string }[];
    files?: { file_id: string; original_filename: string; mime_type: string; byte_size: number; changed_at: string }[];
  } | null>;
  const { data: assignmentRosterData, error: assignmentRosterError } = canGrade
    ? await supabase.rpc("list_classroom_assignment_roster", { p_classroom_id: classroomId })
    : { data: [], error: null };
  const assignmentRoster = (assignmentRosterData ?? []) as ClassroomAssignmentRosterRow[];
  const { data: fileData, error: filesError } = await supabase.rpc(
    "list_classroom_files",
    { p_classroom_id: classroomId },
  );
  const fileRows = fileData ?? [];
  const files: ClassroomFile[] = await Promise.all(
    fileRows.map(async (file) => {
      const { data: signedData, error: signedError } = await supabase.storage
        .from("classroom-files")
        .createSignedUrl(file.object_path, 300, { download: true });
      return {
        ...file,
        signedUrl: signedError ? null : signedData.signedUrl,
      };
    }),
  );

  const { data: assignmentResourceData } = await supabase.rpc(
    "list_classroom_assignment_resources",
    { p_classroom_id: classroomId },
  );
  const assignmentResourceRows = (assignmentResourceData ?? []) as unknown as Omit<AssignmentResource, "signedUrl">[];
  const assignmentResources: AssignmentResource[] = await Promise.all(
    assignmentResourceRows.map(async (resource) => {
      const { data: signedData, error: signedError } = resource.object_path
        ? await supabase.storage.from("classroom-files").createSignedUrl(resource.object_path, 300, { download: true })
        : { data: null, error: null };
      return { ...resource, signedUrl: signedError || !signedData ? null : signedData.signedUrl };
    }),
  );

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Link href={`/dashboard/${slug}/classroom`} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-indigo-700"><ArrowLeft size={16}/> Mis aulas</Link>
        <header className={`relative overflow-hidden rounded-[2rem] bg-gradient-to-br ${theme.header} p-7 text-white shadow-xl sm:p-10`}>
          <div className={`pointer-events-none absolute -right-20 -top-24 h-80 w-80 rounded-full ${theme.glow} blur-3xl`}/>
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div><span className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-bold tracking-widest text-indigo-100"><BookOpen size={14} className="mr-2"/> ESPACIO CURRICULAR</span><h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-5xl">{classroom.title}</h1><p className="mt-3 text-indigo-100">{classroom.course_name} · {classroom.division_name} · {classroom.subject_name ?? "Espacio general"}</p>{classroom.description?<p className="mt-3 max-w-2xl text-sm leading-6 text-indigo-100/80">{classroom.description}</p>:null}</div>
            <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3"><p className="text-xs text-indigo-200">Institución</p><p className="font-semibold">{institution.display_name}</p></div>
          </div>
          {canManageMembers ? <div className="relative mt-6"><Link href={`/dashboard/${slug}/classroom/${classroomId}/settings`} className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"><Settings2 size={16}/> Configurar aula</Link></div> : null}
          {preferences.show_header_stats ? <div className="relative mt-8 grid grid-cols-3 gap-4 border-t border-white/15 pt-5"><div><p className="text-2xl font-bold">{classroom.materials.length}</p><p className="text-xs text-indigo-200">Mensajes</p></div><div><p className="text-2xl font-bold">{classroom.assignments.length}</p><p className="text-xs text-indigo-200">Actividades</p></div><div><p className="text-2xl font-bold">{submissions.length}</p><p className="text-xs text-indigo-200">Entregas visibles</p></div></div> : null}
        </header>

        {!canManageByRole && roles.some(role => ["prefect","director","institution_admin","administrative"].includes(role ?? "")) ? <div className="mt-4 flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900"><ShieldCheck size={19} className="mt-0.5 shrink-0"/><div><p className="font-bold">Acceso institucional · Solo lectura</p><p className="mt-0.5 text-sky-800">Podés consultar los contenidos y el seguimiento de esta aula. La edición y administración corresponden al docente titular y a los auxiliares con permisos específicos.</p></div></div> : null}
        {queryError ? <div role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{queryError === "material-edit" ? "No se pudo guardar el material. Verificá los datos y tus permisos." : queryError === "assignment-edit" ? "No se pudo guardar la actividad. Puede haber calificaciones que impidan ese cambio." : "No se pudo completar la operación solicitada."}</div> : null}
        {materialStatus === "updated" || assignmentStatus === "updated" ? <div role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Los cambios se guardaron correctamente.</div> : null}
        <nav className="sticky top-0 z-20 mt-5 flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white/95 px-2 pt-2 shadow-sm backdrop-blur" aria-label="Secciones del aula">
          <Link href={`/dashboard/${slug}/classroom/${classroomId}?section=news`} scroll={false} aria-current={currentSection === "news" ? "page" : undefined} className={`min-w-fit whitespace-nowrap border-b-[3px] px-5 py-3 text-sm font-semibold transition ${currentSection === "news" ? theme.activeTab : "border-transparent text-slate-500 hover:border-slate-200 hover:text-slate-800"}`}>Novedades</Link>
          <Link href={`/dashboard/${slug}/classroom/${classroomId}?section=work`} scroll={false} aria-current={currentSection === "work" ? "page" : undefined} className={`min-w-fit whitespace-nowrap border-b-[3px] px-5 py-3 text-sm font-semibold transition ${currentSection === "work" ? theme.activeTab : "border-transparent text-slate-500 hover:border-slate-200 hover:text-slate-800"}`}>Actividades</Link>
          <Link href={`/dashboard/${slug}/classroom/${classroomId}?section=people`} scroll={false} aria-current={currentSection === "people" ? "page" : undefined} className={`min-w-fit whitespace-nowrap border-b-[3px] px-5 py-3 text-sm font-semibold transition ${currentSection === "people" ? theme.activeTab : "border-transparent text-slate-500 hover:border-slate-200 hover:text-slate-800"}`}>Personas</Link>
          {canViewAttendance?<Link href={`/dashboard/${slug}/classroom/${classroomId}?section=attendance`} scroll={false} aria-current={currentSection === "attendance" ? "page" : undefined} className={`min-w-fit whitespace-nowrap border-b-[3px] px-5 py-3 text-sm font-semibold transition ${currentSection === "attendance" ? theme.activeTab : "border-transparent text-slate-500 hover:border-slate-200 hover:text-slate-800"}`}>Asistencia del aula</Link>:null}
          {canGrade?<Link href={`/dashboard/${slug}/classroom/${classroomId}?section=grades`} scroll={false} aria-current={currentSection === "grades" ? "page" : undefined} className={`min-w-fit whitespace-nowrap border-b-[3px] px-5 py-3 text-sm font-semibold transition ${currentSection === "grades" ? theme.activeTab : "border-transparent text-slate-500 hover:border-slate-200 hover:text-slate-800"}`}>Seguimiento</Link>:null}
        </nav>
        <div className="mt-6">
          <div className={`min-w-0 ${density}`}>
            <section id="novedades" hidden={currentSection !== "news"} className="scroll-mt-28 space-y-4"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Comunicación del aula</p><h2 className="mt-1 text-2xl font-bold text-slate-900">Novedades</h2><p className="text-sm text-slate-500">Mensajes, avisos y recordatorios visibles para todos los alumnos del aula.</p></div>
              {canEditMaterials?<AjaxForm action={createClassroomMaterial} className="space-y-3 rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm"><input type="hidden" name="slug" value={slug}/><input type="hidden" name="classroom_id" value={classroomId}/><div className="flex items-center gap-2"><span className="rounded-lg bg-indigo-50 p-2 text-indigo-700"><FileText size={18}/></span><h3 className="font-bold text-slate-900">Crear mensaje</h3></div><label className="block text-sm font-medium">Título del mensaje<input name="title" required minLength={3} maxLength={160} placeholder="Ej. Recordatorio para la próxima clase" className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"/></label><label className="block text-sm font-medium">Mensaje<textarea name="body" required maxLength={20000} rows={4} placeholder="Escribí el aviso o la información que querés compartir con todos los alumnos…" className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"/></label><input type="hidden" name="publish" value="on"/><button className={`rounded-xl px-4 py-2.5 text-sm font-bold ${theme.button}`}>Publicar en Novedades</button><p className="text-xs text-slate-500">El mensaje aparecerá en Novedades y quedará visible para los participantes del aula.</p></AjaxForm>:null}
              {classroom.materials.length?classroom.materials.map(material=><article key={material.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex gap-3"><div className="rounded-xl bg-violet-50 p-3 text-violet-700"><FileText size={20}/></div><div className="min-w-0 flex-1"><h3 className="font-bold text-slate-900">{material.title}</h3>{material.body?<p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{material.body}</p>:null}<p className="mt-3 text-xs text-slate-400">Publicado: {formatDate(material.published_at)}</p>{files.filter(file=>file.material_id===material.id).map(file=><div key={file.file_id} className="mt-3 text-sm">{file.signedUrl?<a href={file.signedUrl} className="font-semibold text-indigo-700 underline" rel="noreferrer">Descargar {file.original_filename}</a>:<span>Archivo no disponible: {file.original_filename}</span>}</div>)}{canEditMaterials?<ClassroomMaterialEditor slug={slug} classroomId={classroomId} material={material}/>:null}</div></div></article>):<div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Todavía no hay materiales publicados.</div>}
            </section>
            <section id="trabajo" hidden={currentSection !== "work"} className="scroll-mt-28 space-y-4"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Aprendizaje</p><h2 className="mt-1 text-2xl font-bold text-slate-900">Actividades</h2><p className="text-sm text-slate-500">Actividades, entregas y devoluciones.</p></div>
              {canEditAssignments?<AjaxForm id="crear-clase" action={createClassroomAssignment} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><input type="hidden" name="slug" value={slug}/><input type="hidden" name="classroom_id" value={classroomId}/><h3 className="font-bold">Crear actividad</h3><label className="block text-sm">Título<input name="title" required minLength={3} maxLength={160} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"/></label><label className="block text-sm">Consigna<textarea name="instructions" maxLength={20000} rows={3} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"/></label><div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm">Fecha límite<input name="due_at" type="datetime-local" className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"/></label><label className="block text-sm">Evaluación<select name="grading_mode" defaultValue="graded" className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"><option value="graded">Con calificación · 100%</option><option value="ungraded">Sin puntaje · devolución cualitativa</option></select></label></div><p className="text-xs text-slate-500">Elegí si la actividad tendrá calificación sobre 100% o solamente una devolución cualitativa.</p><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="publish" defaultChecked/> Publicar inmediatamente</label><button className={`rounded-xl px-4 py-2.5 text-sm font-bold text-white ${theme.button}`}>Crear actividad</button></AjaxForm>:null}
              {classroom.assignments.length?<div id="lista-clases" className="space-y-4">{classroom.assignments.map(assignment=><article key={assignment.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-bold text-slate-900">{assignment.title}</h3>{isStudent&&!submissions.some(item=>item.assignment_id===assignment.id)?<span className="mt-2 inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">Pendiente de entrega</span>:null}</div>{assignment.max_score!==null?<span className="rounded-full bg-slate-100 px-3 py-1 text-xs">Calificación sobre 100%</span>:null}</div>{assignment.instructions?<p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{assignment.instructions}</p>:null}<p className="mt-3 text-xs text-slate-500">Fecha límite: {formatDate(assignment.due_at)}</p>
                {isStudent?<StudentAssignmentEditor slug={slug} classroomId={classroomId} assignmentId={assignment.id} assignmentTitle={assignment.title} existingSubmissionId={submissions.find(item=>item.assignment_id===assignment.id)?.submission_id} initialBody={submissions.find(item=>item.assignment_id===assignment.id)?.body} locked={submissions.some(item=>item.assignment_id===assignment.id&&item.score!==null)}/>:null}
                {!canGrade ? (<div className="mt-4 border-t pt-4"><h4 className="text-sm font-bold">{canGrade?"Entregas de estudiantes":isStudent?"Tu entrega y devolución":"Entregas de la actividad"}</h4>{submissions.filter(item=>item.assignment_id===assignment.id).map(submission=><div key={submission.submission_id} className="mt-3 rounded-xl bg-slate-50 p-4"><p className="font-semibold text-sm"> {canGrade||roles.includes("director")?`${submission.student_last_name}, ${submission.student_first_name}`:"Respuesta enviada"}</p>{isStudent?<div className="mt-2"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${submission.review_status==="aprobado"?"bg-emerald-100 text-emerald-800":submission.review_status==="corregir"||submission.review_status==="desaprobado"?"bg-amber-100 text-amber-900":submission.score!==null?"bg-emerald-100 text-emerald-800":submission.review_status==="visto"?"bg-sky-100 text-sky-800":"bg-slate-100 text-slate-700"}`}>{submission.review_status==="aprobado"?"Aprobada":submission.review_status==="desaprobado"?"No aprobada":submission.review_status==="corregir"?"Requiere corrección":submission.score!==null?"Corregida":submission.review_status==="visto"?"Vista por el docente":"Entregada · En revisión"}</span>{submission.submitted_at?<p className="mt-1 text-xs text-slate-500">Enviada el {formatDate(submission.submitted_at)}</p>:null}</div>:null}{submission.body?<p className="mt-2 whitespace-pre-wrap text-sm">{submission.body}</p>:null}{submission.score!==null?<p className="mt-2 text-sm font-bold text-emerald-700">Calificación: {submission.score}</p>:null}{submission.feedback?<p className="mt-2 text-sm">{submission.feedback}</p>:null}{files.filter(file=>file.submission_id===submission.submission_id).map(file=><div key={file.file_id} className="mt-2 text-sm">{file.signedUrl?<a href={file.signedUrl} className="text-indigo-700 underline" rel="noreferrer">Descargar {file.original_filename}</a>:null}</div>)}{isStudent&&submission.score===null?<ClassroomFileUpload submissionId={submission.submission_id}/>:null}</div>)}</div>) : null}
                {canEditAssignments ? <ClassroomAssignmentEditor slug={slug} classroomId={classroomId} assignment={assignment}/> : null}
                <ClassroomAssignmentResources assignmentId={assignment.id} resources={assignmentResources} canManage={canEditAssignments}/>
                {canGrade ? <ClassroomAssignmentRoster rows={assignmentRoster} files={files.filter((file) => file.submission_id !== null)} historyBySubmission={historyBySubmission} slug={slug} classroomId={classroomId} assignmentId={assignment.id} maxScore={assignment.max_score} dueAt={assignment.due_at} asOf={new Date().toISOString()}/> : null}
                {canGrade && assignmentRosterError ? <p role="alert" className="mt-3 text-sm text-amber-800">No se pudo cargar la nómina de entregas.</p> : null}
              </article>)}</div>:<div id="lista-clases" className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Todavía no hay actividades.</div>}
            </section>
            <section id="personas" hidden={currentSection !== "people"} className="scroll-mt-28 space-y-5"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Comunidad del aula</p><h2 className="mt-1 text-2xl font-bold text-slate-900">Personas</h2><p className="mt-1 text-sm text-slate-500">Administrá participantes, invitaciones y docentes auxiliares desde un único lugar.</p></div><div id="administracion-aula" className="scroll-mt-28">{canManageMembers ? <ClassroomInvitePanel slug={slug} classroomId={classroomId} invite={classroomInvite} institutionName={institution.display_name} classroomTitle={classroom.title} courseName={classroom.course_name} divisionName={classroom.division_name} subjectName={classroom.subject_name ?? "Espacio general"} teacherNames={classroomPeople.teachers.map((teacher) => teacher.name)}/> : null}</div>
              <div className="grid gap-5 lg:grid-cols-2">
                <section className="overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-indigo-100 bg-indigo-50/70 px-5 py-4"><div className="flex items-center gap-3"><span className="rounded-xl bg-white p-2 text-indigo-700"><Users size={20}/></span><div><h3 className="font-bold text-slate-900">Docentes</h3><p className="text-xs text-slate-500">Equipo a cargo del aula</p></div></div><span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-indigo-700">{classroomPeople.teachers.length}</span></div>
                  <div className="divide-y divide-slate-100">{classroomPeople.teachers.length ? classroomPeople.teachers.map(person=><div key={person.id} className="flex items-center gap-3 px-5 py-4"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">{person.name.split(" ").map(part=>part[0]).slice(0,2).join("").toUpperCase()}</span><div className="min-w-0"><p className="font-semibold text-slate-800">{person.name}</p><p className="text-xs text-slate-500">{person.assignment === "assistant" ? "Docente auxiliar" : "Docente"}</p></div></div>):<p className="px-5 py-8 text-center text-sm text-slate-500">No hay docentes asignados a esta aula.</p>}</div>
                </section>
                <section className="overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-emerald-100 bg-emerald-50/70 px-5 py-4"><div className="flex items-center gap-3"><span className="rounded-xl bg-white p-2 text-emerald-700"><UserRound size={20}/></span><div><h3 className="font-bold text-slate-900">Alumnos</h3><p className="text-xs text-slate-500">Matrícula activa de la división</p></div></div><span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-emerald-700">{classroomPeople.students.length}</span></div>
                  <div className="divide-y divide-slate-100">{classroomPeople.students.length ? classroomPeople.students.map(person=><div key={person.id} className="flex items-center gap-3 px-5 py-4"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">{person.name.split(" ").map(part=>part[0]).slice(0,2).join("").toUpperCase()}</span><div className="min-w-0"><p className="font-semibold text-slate-800">{person.name}</p><p className="text-xs text-slate-500">{person.student_number ? "Legajo " + person.student_number : "Alumno matriculado"}</p></div></div>):<p className="px-5 py-8 text-center text-sm text-slate-500">No hay alumnos con matrícula activa en esta división.</p>}</div>
                </section>
              </div>
              {canManageMembers?<ClassroomTeacherAccessManager classroomId={classroomId}/>:null}
            </section>
            {canViewAttendance?<section id="asistencia" hidden={currentSection !== "attendance"} className="scroll-mt-28 space-y-5"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Asistencia áulica</p><h2 className="mt-1 text-2xl font-bold text-slate-900">Asistencia de esta materia</h2><p className="mt-1 text-sm text-slate-500">Registro propio de esta aula y división; no reemplaza la asistencia institucional de preceptoría.</p></div><ClassroomAttendanceCalendar classroomId={classroomId} editable={canManageAttendance}/></section>:null}
            {canGrade?<section id="calificaciones" hidden={currentSection !== "grades"} className="scroll-mt-28 space-y-5"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Evaluación y seguimiento</p><h2 className="mt-1 text-2xl font-bold text-slate-900">Seguimiento trimestral</h2><p className="mt-1 text-sm text-slate-500">Notas orientadoras, recuperación, conceptos y observaciones por alumno. Las evaluaciones de actividades se gestionan en la sección Actividades.</p></div><ClassroomTermGradebook classroomId={classroomId}/></section>:null}
          </div>

        </div>
        {submissionsError?<div role="alert" className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">No fue posible consultar las entregas.</div>:null}
        {filesError?<div role="alert" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">No fue posible consultar archivos. El almacenamiento continúa privado.</div>:null}
        <p className="mt-6 text-center text-xs text-slate-400">EDUNEXA · Aula Virtual · Accesos y archivos validados en el servidor.</p>
      </div>
    </main>
  );
}
