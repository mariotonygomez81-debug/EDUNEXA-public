"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function field(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function back(slug: string, query: string): never {
  redirect(`/dashboard/${encodeURIComponent(slug)}/notifications?${query}`);
}

async function getInstitutionContext(slug: string) {
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

  return { supabase, institution };
}

export async function markNotificationRead(formData: FormData) {
  const slug = field(formData, "slug");
  const notificationId = field(formData, "notification_id");
  if (!/^[a-z0-9-]{2,80}$/i.test(slug) || !/^[0-9a-f-]{36}$/i.test(notificationId)) {
    back(slug, "error=invalid");
  }

  const { supabase, institution } = await getInstitutionContext(slug);
  const { data, error } = await supabase.rpc("mark_notification_read", {
    p_notification_id: notificationId,
    p_institution_id: institution.id,
  });
  if (error || !data) back(slug, "error=not_found");

  revalidatePath(`/dashboard/${slug}/notifications`);
  back(slug, "read=1");
}

export async function setNotificationPreference(formData: FormData) {
  const slug = field(formData, "slug");
  const notificationType = field(formData, "notification_type");
  const enabled = formData.getAll("enabled").some((value) => value === "true");

  if (!/^[a-z0-9-]{2,80}$/i.test(slug) ||
      !["announcement", "message", "grade", "attendance", "support", "assignment_due"].includes(notificationType)) {
    back(slug, "error=invalid");
  }

  const { supabase, institution } = await getInstitutionContext(slug);
  const { error } = await supabase.rpc("set_notification_preference", {
    p_institution_id: institution.id,
    p_notification_type: notificationType,
    p_in_app_enabled: enabled,
  });
  if (error) back(slug, "error=preference");

  revalidatePath(`/dashboard/${slug}/notifications`);
  back(slug, "preference=saved");
}
