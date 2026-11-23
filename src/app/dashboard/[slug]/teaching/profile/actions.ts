"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function saveTeacherProfile(formData: FormData) {
  const slug = String(formData.get("slug") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const professionalTitles = String(formData.get("professional_titles") ?? "").trim();
  const avatarStyle = String(formData.get("avatar_style") ?? "neutral");
  const file = formData.get("photo");
  if (!/^[a-z0-9-]{2,80}$/i.test(slug) || phone.length > 40 || address.length > 240 || professionalTitles.length > 2000 || !["neutral","masculino","femenino"].includes(avatarStyle)) {
    redirect(`/dashboard/${encodeURIComponent(slug)}/teaching/profile?error=invalid`);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: institution } = await supabase.from("institutions").select("id").eq("slug", slug).maybeSingle();
  if (!institution) redirect("/dashboard");
  const { data: membership } = await supabase.from("memberships").select("id")
    .eq("institution_id", institution.id).eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership) redirect("/dashboard");
  const { count } = await supabase.from("staff_assignments").select("id", { count: "exact", head: true })
    .eq("institution_id", institution.id).eq("membership_id", membership.id).eq("assignment_type", "teacher");
  if (!count) redirect(`/dashboard/${slug}`);

  let avatarPath: string | undefined;
  if (file instanceof File && file.size > 0) {
    const allowed = new Map([["image/jpeg","jpg"],["image/png","png"],["image/webp","webp"]]);
    const ext = allowed.get(file.type);
    if (!ext || file.size > 5 * 1024 * 1024) {
      redirect(`/dashboard/${slug}/teaching/profile?error=photo`);
    }
    avatarPath = `${user.id}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("teacher-profile-photos")
      .upload(avatarPath, file, { contentType: file.type, upsert: false });
    if (uploadError) redirect(`/dashboard/${slug}/teaching/profile?error=upload`);
  }

  const update: { phone: string | null; address: string | null; professional_titles: string | null; avatar_style: string; avatar_path?: string } = {
    phone: phone || null, address: address || null, professional_titles: professionalTitles || null, avatar_style: avatarStyle,
  };
  if (avatarPath) update.avatar_path = avatarPath;
  const { error } = await supabase.from("profiles").update(update).eq("id", user.id);
  if (error) redirect(`/dashboard/${slug}/teaching/profile?error=save`);
  revalidatePath(`/dashboard/${slug}/teaching/profile`);
  revalidatePath(`/dashboard/${slug}`);
  redirect(`/dashboard/${slug}/teaching/profile?saved=1`);
}
