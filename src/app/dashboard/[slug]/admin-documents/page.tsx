import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, FileArchive, FileText, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";
import { createAdminDocument } from "./actions";
import AdminDocumentUploader from "./admin-document-uploader";

const categoryLabels: Record<string, string> = {
  institutional: "Institucional", personnel: "Personal", finance: "Finanzas",
  maintenance: "Mantenimiento", purchases: "Compras", other: "Otros",
};

export default async function AdminDocumentsPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; created?: string }>;
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
    .select("id").eq("institution_id", institution.id).eq("user_id", user.id)
    .eq("status", "active").maybeSingle();
  if (!membership) redirect("/dashboard");
  const permissions = await getMembershipPermissions(supabase, membership.id);
  if (!permissions.has("admin_documents.read")) redirect(`/dashboard/${slug}`);
  const canManage = permissions.has("admin_documents.manage");

  const { data: documents, error } = await supabase.from("admin_documents")
    .select("id,title,category,description,reference_code,document_date,status,created_at")
    .eq("institution_id", institution.id).eq("status", "active")
    .order("document_date", { ascending: false }).limit(100);
  if (error) throw new Error("No se pudo cargar la documentación administrativa.");

  const documentIds = (documents ?? []).map((document) => document.id);
  const { data: files } = documentIds.length
    ? await supabase.from("admin_document_files")
      .select("id,document_id,object_path,original_filename,mime_type,byte_size,uploaded_at")
      .eq("institution_id", institution.id).in("document_id", documentIds)
      .eq("upload_status", "ready").order("created_at", { ascending: true })
    : { data: [] as { id: string; document_id: string; object_path: string; original_filename: string; mime_type: string; byte_size: number; uploaded_at: string | null }[] };

  const filesWithLinks = await Promise.all((files ?? []).map(async (file) => {
    const { data } = await supabase.storage.from("admin-documents-private")
      .createSignedUrl(file.object_path, 60);
    return { ...file, signedUrl: data?.signedUrl ?? null };
  }));

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <Link href={`/dashboard/${slug}`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700">
          <ArrowLeft size={16} /> Volver al panel
        </Link>
        <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white shadow-sm">
          <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-wide text-indigo-100">
            <ShieldCheck size={15} /> ARCHIVO INSTITUCIONAL PRIVADO
          </span>
          <h1 className="mt-4 text-3xl font-bold">Gestión documental administrativa</h1>
          <p className="mt-2 text-sm text-indigo-100">{institution.display_name} · Registros y archivos internos con acceso autorizado.</p>
        </header>
        {query.error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {query.error === "invalid" ? "Revisá los datos ingresados." : "No se pudo guardar el documento."}
        </p>}
        {query.created && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Documento creado correctamente.</p>}

        {canManage && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold">Registrar documento</h2>
            <form action={createAdminDocument} className="mt-4 grid gap-4 md:grid-cols-2">
              <input type="hidden" name="slug" value={slug} />
              <label className="grid gap-1 text-sm font-medium md:col-span-2">Título
                <input required minLength={3} maxLength={180} name="title" className="rounded-lg border border-slate-300 px-3 py-2" placeholder="Ej.: Acta de reunión institucional" />
              </label>
              <label className="grid gap-1 text-sm font-medium">Categoría
                <select name="category" className="rounded-lg border border-slate-300 px-3 py-2">
                  {Object.entries(categoryLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium">Fecha del documento
                <input required type="date" name="document_date" defaultValue={new Date().toISOString().slice(0, 10)} className="rounded-lg border border-slate-300 px-3 py-2" />
              </label>
              <label className="grid gap-1 text-sm font-medium">Número o referencia (opcional)
                <input maxLength={80} name="reference_code" className="rounded-lg border border-slate-300 px-3 py-2" />
              </label>
              <label className="grid gap-1 text-sm font-medium md:col-span-2">Descripción
                <textarea maxLength={5000} rows={3} name="description" className="rounded-lg border border-slate-300 px-3 py-2" />
              </label>
              <div className="md:col-span-2"><button className="rounded-lg bg-violet-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">Crear registro</button></div>
            </form>
          </section>
        )}

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Documentos registrados</h2>
            <span className="text-sm text-slate-500">{documents?.length ?? 0} registros</span>
          </div>
          {documents?.length ? documents.map((document) => {
            const documentFiles = filesWithLinks.filter((file) => file.document_id === document.id);
            return (
              <article key={document.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-xs font-semibold uppercase tracking-wide text-violet-700">{categoryLabels[document.category] ?? "Otros"}</span>
                    <h3 className="mt-1 text-lg font-bold">{document.title}</h3>
                    {document.description && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{document.description}</p>}
                    <p className="mt-2 text-xs text-slate-500">
                      {new Date(`${document.document_date}T12:00:00`).toLocaleDateString("es-AR")}
                      {document.reference_code ? ` · Ref. ${document.reference_code}` : ""}
                    </p>
                  </div>
                  <FileArchive size={22} className="shrink-0 text-violet-700" />
                </div>
                {documentFiles.length > 0 && (
                  <ul className="mt-4 space-y-2">
                    {documentFiles.map((file) => (
                      <li key={file.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                        <span className="flex min-w-0 items-center gap-2"><FileText size={15} className="shrink-0 text-slate-500" /><span className="truncate">{file.original_filename}</span></span>
                        {file.signedUrl ? <a href={file.signedUrl} target="_blank" rel="noreferrer" className="shrink-0 font-semibold text-violet-700 hover:underline">Abrir archivo</a> : <span className="text-xs text-slate-400">No disponible</span>}
                      </li>
                    ))}
                  </ul>
                )}
                {canManage && <AdminDocumentUploader slug={slug} documentId={document.id} />}
              </article>
            );
          }) : <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Todavía no hay documentos registrados.</p>}
        </section>
      </div>
    </main>
  );
}
