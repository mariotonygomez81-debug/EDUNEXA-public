"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";

function field(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function authorizedContext(slug: string, permission: "admin_documents.read" | "admin_documents.manage") {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: institution } = await supabase.from("institutions")
    .select("id").eq("slug", slug).eq("status", "active").maybeSingle();
  if (!institution) redirect("/dashboard");
  const { data: membership } = await supabase.from("memberships")
    .select("id").eq("institution_id", institution.id)
    .eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership) redirect("/dashboard");
  const permissions = await getMembershipPermissions(supabase, membership.id);
  if (!permissions.has(permission)) redirect(`/dashboard/${slug}`);
  return { supabase, institution, membership };
}

export async function createAdminDocument(formData: FormData) {
  const slug = field(formData, "slug");
  const title = field(formData, "title");
  const category = field(formData, "category");
  const description = field(formData, "description");
  const referenceCode = field(formData, "reference_code");
  const documentDate = field(formData, "document_date");
  const categories = ["institutional", "personnel", "finance", "maintenance", "purchases", "other"];
  if (!/^[a-z0-9-]{1,80}$/i.test(slug) || title.length < 3 || title.length > 180 ||
      !categories.includes(category) || description.length > 5000 ||
      referenceCode.length > 80 || !/^\d{4}-\d{2}-\d{2}$/.test(documentDate)) {
    redirect(`/dashboard/${encodeURIComponent(slug)}/admin-documents?error=invalid`);
  }
  const { supabase, institution } = await authorizedContext(slug, "admin_documents.manage");
  const { data, error } = await supabase.rpc("create_admin_document", {
    p_institution_id: institution.id,
    p_title: title,
    p_category: category,
    p_description: description,
    p_reference_code: referenceCode || null,
    p_document_date: documentDate,
  });
  if (error || !data) redirect(`/dashboard/${slug}/admin-documents?error=save`);
  revalidatePath(`/dashboard/${slug}/admin-documents`);
  redirect(`/dashboard/${slug}/admin-documents?created=1`);
}

const allowedMimeTypes = [
  "application/pdf", "image/jpeg", "image/png", "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export async function createAdminDocumentFileIntent(
  slug: string, documentId: string, originalFilename: string, mimeType: string, byteSize: number,
) {
  if (!/^[a-z0-9-]{1,80}$/i.test(slug) || !/^[0-9a-f-]{36}$/i.test(documentId) ||
      !originalFilename || originalFilename.length > 180 ||
      /[\\/]/.test(originalFilename) || [...originalFilename].some((c) => c.charCodeAt(0) < 32) ||
      !allowedMimeTypes.includes(mimeType as (typeof allowedMimeTypes)[number]) ||
      !Number.isInteger(byteSize) || byteSize < 1 || byteSize > 10 * 1024 * 1024) {
    return { ok: false as const, message: "El archivo no cumple los requisitos permitidos." };
  }
  const { supabase } = await authorizedContext(slug, "admin_documents.manage");
  const { data, error } = await supabase.rpc("create_admin_document_file_intent", {
    p_document_id: documentId, p_original_filename: originalFilename, p_mime_type: mimeType, p_byte_size: byteSize,
  });
  const intent = data?.[0];
  if (error || !intent) return { ok: false as const, message: "No se pudo preparar la carga del archivo." };
  return { ok: true as const, fileId: intent.file_id, bucket: intent.bucket_id, path: intent.object_path };
}

export async function finalizeAdminDocumentFile(slug: string, documentId: string, fileId: string) {
  if (!/^[a-z0-9-]{1,80}$/i.test(slug) || !/^[0-9a-f-]{36}$/i.test(documentId) ||
      !/^[0-9a-f-]{36}$/i.test(fileId)) {
    return { ok: false as const, message: "La solicitud de archivo no es válida." };
  }
  const { supabase } = await authorizedContext(slug, "admin_documents.manage");
  const { data, error } = await supabase.rpc("finalize_admin_document_file", { p_file_id: fileId, p_document_id: documentId });
  if (error || !data) return { ok: false as const, message: "No se pudo verificar el archivo subido." };
  revalidatePath(`/dashboard/${slug}/admin-documents`);
  return { ok: true as const };
}
