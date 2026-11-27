"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";

function field(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function back(slug: string, query: string): never {
  redirect(`/dashboard/${encodeURIComponent(slug)}/announcements?${query}`);
}

export async function createAnnouncement(formData: FormData) {
  const slug = field(formData, "slug");
  const title = field(formData, "title");
  const body = field(formData, "body");
  const audience = field(formData, "audience");
  const divisionId = field(formData, "division_id");

  if (!/^[a-z0-9-]{2,80}$/i.test(slug) ||
      title.length < 3 || title.length > 160 ||
      body.length < 1 || body.length > 10000 ||
      !["institution", "staff", "families", "students", "course"].includes(audience) ||
      (audience === "course" && !/^[0-9a-f-]{36}$/i.test(divisionId))) {
    back(slug, "error=invalid");
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: institution } = await supabase.from("institutions")
    .select("id").eq("slug", slug).maybeSingle();
  if (!institution) redirect("/dashboard");

  const { data: membership } = await supabase.from("memberships")
    .select("id").eq("institution_id", institution.id)
    .eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership) redirect("/dashboard");

  const permissions = await getMembershipPermissions(supabase, membership.id);
  if (!permissions.has("communications.manage")) back(slug, "error=forbidden");

  const args = {
    p_institution_id: institution.id,
    p_title: title,
    p_body: body,
    p_audience: audience,
    ...(audience === "course" ? { p_division_id: divisionId } : {}),
  };
  const { error } = await supabase.rpc("create_announcement", args);

  if (error) {
    back(slug, error.code === "42501" ? "error=scope" : "error=save");
  }

  revalidatePath(`/dashboard/${slug}/announcements`);
  back(slug, "created=1");
}
