"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";

function field(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function adminContext(slug: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: institution } = await supabase.from("institutions").select("id")
    .eq("slug", slug).maybeSingle();
  if (!institution) redirect("/dashboard");
  const { data: membership } = await supabase.from("memberships").select("id")
    .eq("institution_id", institution.id).eq("user_id", user.id)
    .eq("status", "active").maybeSingle();
  if (!membership) redirect("/dashboard");
  const permissions = await getMembershipPermissions(supabase, membership.id);
  if (!permissions.has("institution.manage")) redirect(`/dashboard/${encodeURIComponent(slug)}`);
  return { supabase, institution };
}

function fail(slug: string, code?: string): never {
  const error = code === "23505" ? "duplicate"
    : code === "23503" ? "reference"
      : code === "42501" ? "forbidden"
        : code === "22023" ? "invalid" : "save";
  redirect(`/dashboard/${encodeURIComponent(slug)}/settings/classrooms?error=${error}`);
}

export async function createVirtualClassroom(formData: FormData) {
  const slug = field(formData, "slug");
  const divisionId = field(formData, "division_id");
  const courseSubjectId = field(formData, "course_subject_id");
  const ownerMembershipId = field(formData, "owner_membership_id");
  const title = field(formData, "title");
  const description = field(formData, "description");
  if (!slug || !/^[0-9a-f-]{36}$/i.test(divisionId) ||
      (courseSubjectId && !/^[0-9a-f-]{36}$/i.test(courseSubjectId)) ||
      !/^[0-9a-f-]{36}$/i.test(ownerMembershipId) ||
      title.length < 3 || title.length > 160 || description.length > 2000) fail(slug, "22023");

  const { supabase, institution } = await adminContext(slug);
  const { error } = await supabase.rpc("create_virtual_classroom", {
    p_institution_id: institution.id,
    p_division_id: divisionId,
    p_course_subject_id: courseSubjectId || null,
    p_title: title,
    p_description: description || null,
    p_owner_membership_id: ownerMembershipId,
  });
  if (error) fail(slug, error.code);
  revalidatePath(`/dashboard/${slug}/classroom`);
  revalidatePath(`/dashboard/${slug}/settings/classrooms`);
  redirect(`/dashboard/${slug}/settings/classrooms?created=classroom`);
}

export async function updateVirtualClassroom(formData: FormData) {
  const slug = field(formData, "slug");
  const classroomId = field(formData, "classroom_id");
  const ownerMembershipId = field(formData, "owner_membership_id");
  const title = field(formData, "title");
  const description = field(formData, "description");
  if (!slug || !/^[0-9a-f-]{36}$/i.test(classroomId) ||
      !/^[0-9a-f-]{36}$/i.test(ownerMembershipId) ||
      title.length < 3 || title.length > 160 || description.length > 2000) fail(slug, "22023");

  const { supabase, institution } = await adminContext(slug);
  const { error } = await supabase.rpc("update_virtual_classroom", {
    p_institution_id: institution.id,
    p_classroom_id: classroomId,
    p_title: title,
    p_description: description || null,
    p_owner_membership_id: ownerMembershipId,
  });
  if (error) fail(slug, error.code);
  revalidatePath(`/dashboard/${slug}/classroom`);
  revalidatePath(`/dashboard/${slug}/classroom/${classroomId}`);
  revalidatePath(`/dashboard/${slug}/settings/classrooms`);
  redirect(`/dashboard/${slug}/settings/classrooms?saved=classroom`);
}
