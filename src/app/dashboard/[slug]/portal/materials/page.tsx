import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpen, FileText, Link2, Paperclip, PlayCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

type PortalStudent = { student_id: string; is_self: boolean; division_id: string | null };
type Classroom = { id: string; division_id: string; title: string; course_name: string; division_name: string; subject_name: string | null };
type Overview = {
  title: string; course_name: string; division_name: string; subject_name: string | null;
  materials: { id: string; title: string; body: string | null; published_at: string | null; created_at: string }[];
  assignments: { id: string; title: string; published_at: string | null }[];
};
type ClassroomFile = {
  file_id: string; purpose: string; material_id: string | null; original_filename: string;
  mime_type: string; byte_size: number; object_path: string; created_at: string;
};
type Resource = {
  resource_id: string; assignment_id: string; kind: "file" | "link"; title: string;
  url: string | null; object_path: string | null; original_filename: string | null;
  mime_type: string | null; byte_size: number | null; created_at: string;
};
type LibraryItem = {
  id: string; title: string; classroomId: string; classroomLabel: string;
  kind: "material" | "file" | "link"; description: string | null;
  publishedAt: string | null; href: string | null; filename: string | null;
};

function dateLabel(value: string | null) {
  if (!value) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium" }).format(new Date(value));
}

export default async function StudentMaterialsLibrary({ params }: { params: Promise<{ slug: string }> }) {
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
  if (portalError || !student) redirect(`/dashboard/${slug}/portal`);
  if (!student.division_id) {
    return <main className="min-h-screen bg-slate-50 px-4 py-8"><div className="mx-auto max-w-4xl rounded-2xl bg-white p-6"><Link href={`/dashboard/${slug}/portal`} className="text-sm text-violet-700">← Volver a Mi portal</Link><h1 className="mt-4 text-2xl font-bold text-slate-900">Biblioteca de estudio</h1><p className="mt-2 text-sm text-slate-500">No tenés una división activa vinculada para consultar sus materiales.</p></div></main>;
  }

  const { data: classroomRows, error: classroomError } = await supabase.rpc("list_accessible_classrooms", { p_institution_id: institution.id });
  const classrooms = ((classroomRows ?? []) as Classroom[]).filter((item) => item.division_id === student.division_id);
  const libraryItems: LibraryItem[] = [];
  if (!classroomError && classrooms.length) {
    const results = await Promise.all(classrooms.map(async (classroom) => {
      const [{ data: overviewData }, { data: fileData }, { data: resourceData }] = await Promise.all([
        supabase.rpc("get_classroom_overview", { p_classroom_id: classroom.id }),
        supabase.rpc("list_classroom_files", { p_classroom_id: classroom.id }),
        supabase.rpc("list_classroom_assignment_resources", { p_classroom_id: classroom.id }),
      ]);
      const overview = overviewData as Overview | null;
      const files = (fileData ?? []) as ClassroomFile[];
      const resources = (resourceData ?? []) as Resource[];
      const signedFiles = await Promise.all(files.filter((file) => file.purpose === "material" && file.material_id).map(async (file) => {
        const { data } = await supabase.storage.from("classroom-files").createSignedUrl(file.object_path, 300, { download: true });
        return { file, url: data?.signedUrl ?? null };
      }));
      const signedResources = await Promise.all(resources.map(async (resource) => {
        if (resource.kind !== "file" || !resource.object_path) return { resource, url: resource.url };
        const { data } = await supabase.storage.from("classroom-files").createSignedUrl(resource.object_path, 300, { download: true });
        return { resource, url: data?.signedUrl ?? null };
      }));
      return { classroom, overview, signedFiles, signedResources };
    }));
    for (const result of results) {
      const { classroom, overview } = result;
      if (!overview) continue;
      const classroomLabel = [classroom.course_name, classroom.division_name, classroom.subject_name].filter(Boolean).join(" · ");
      for (const material of overview.materials ?? []) {
        libraryItems.push({
          id: `material-${classroom.id}-${material.id}`, title: material.title, classroomId: classroom.id,
          classroomLabel, kind: "material", description: material.body,
          publishedAt: material.published_at ?? material.created_at, href: null, filename: null,
        });
        for (const item of result.signedFiles.filter((entry) => entry.file.material_id === material.id)) {
          libraryItems.push({
            id: `file-${item.file.file_id}`, title: item.file.original_filename, classroomId: classroom.id,
            classroomLabel, kind: "file", description: null, publishedAt: item.file.created_at,
            href: item.url, filename: item.file.original_filename,
          });
        }
      }
      const assignmentIds = new Set((overview.assignments ?? []).map((assignment) => assignment.id));
      for (const item of result.signedResources.filter((entry) => assignmentIds.has(entry.resource.assignment_id))) {
        libraryItems.push({
          id: `resource-${item.resource.resource_id}`, title: item.resource.title, classroomId: classroom.id,
          classroomLabel, kind: item.resource.kind, description: item.resource.kind === "link" ? item.resource.url : null,
          publishedAt: item.resource.created_at, href: item.url, filename: item.resource.original_filename,
        });
      }
    }
  }
  libraryItems.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  const grouped = classrooms.map((classroom) => ({
    classroom,
    items: libraryItems.filter((item) => item.classroomId === classroom.id),
  })).filter((group) => group.items.length);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href={`/dashboard/${slug}/portal`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700"><ArrowLeft size={16}/> Volver a Mi portal</Link>
        <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white shadow-sm sm:p-9">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-indigo-100"><BookOpen size={14}/> RECURSOS DE TUS AULAS</span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight">Biblioteca de estudio</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-indigo-100">Materiales, archivos y enlaces compartidos por tus docentes, reunidos en un solo lugar. Los recursos se mantienen organizados por materia y aula.</p>
        </header>
        {classroomError ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">No fue posible consultar las aulas habilitadas para tu cuenta.</div>
        : grouped.length ? grouped.map(({ classroom, items }) => (
          <section key={classroom.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 p-5">
              <div><h2 className="font-semibold text-slate-900">{classroom.title}</h2><p className="mt-1 text-xs text-slate-500">{[classroom.course_name, classroom.division_name, classroom.subject_name].filter(Boolean).join(" · ")}</p></div>
              <Link href={`/dashboard/${slug}/classroom/${classroom.id}`} className="text-sm font-semibold text-violet-700 hover:text-violet-900">Abrir aula →</Link>
            </div>
            <div className="divide-y divide-slate-100">
              {items.map((item) => (
                <article key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
                  <div className="flex min-w-0 gap-3">
                    <span className="mt-0.5 rounded-lg bg-violet-50 p-2 text-violet-700">{item.kind === "material" ? <BookOpen size={18}/> : item.kind === "link" ? <Link2 size={18}/> : <FileText size={18}/>}</span>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-900">{item.title}</h3>
                      {item.description ? <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{item.description}</p> : null}
                      <p className="mt-2 text-xs text-slate-400">Compartido: {dateLabel(item.publishedAt)}</p>
                    </div>
                  </div>
                  {item.kind === "material" ? <Link href={`/dashboard/${slug}/classroom/${item.classroomId}`} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-violet-200 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50"><BookOpen size={14}/> Ver en el aula</Link>
                  : item.href ? <a href={item.href} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-violet-200 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50">{item.kind === "link" ? <PlayCircle size={14}/> : <Paperclip size={14}/>} {item.kind === "link" ? "Abrir recurso" : "Descargar archivo"}</a>
                  : <span className="text-xs text-rose-600">Recurso temporalmente no disponible</span>}
                </article>
              ))}
            </div>
          </section>
        )) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><BookOpen className="mx-auto text-slate-300" size={30}/><h2 className="mt-3 font-semibold text-slate-900">Todavía no hay materiales disponibles</h2><p className="mt-1 text-sm text-slate-500">Cuando tus docentes compartan materiales o recursos en las aulas, aparecerán aquí.</p></div>}
      </div>
    </main>
  );
}
