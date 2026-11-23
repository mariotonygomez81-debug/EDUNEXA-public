"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { randomUUID } from "node:crypto";

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
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
  const [{ data: roleRows }, { count }] = await Promise.all([
    supabase.from("membership_roles").select("roles(key)").eq("membership_id", membership.id).eq("institution_id", institution.id),
    supabase.from("staff_assignments").select("id", { count: "exact", head: true })
      .eq("institution_id", institution.id).eq("membership_id", membership.id).eq("assignment_type", "teacher")
      .or(`starts_on.is.null,starts_on.lte.${today}`).or(`ends_on.is.null,ends_on.gte.${today}`),
  ]);
  if (!(roleRows ?? []).some((row) => row.roles?.key === "teacher") || !count) redirect(`/dashboard/${slug}`);
  const { data: existingProfile } = await supabase.from("profiles").select("avatar_path").eq("id", user.id).maybeSingle();

  let avatarPath: string | undefined;
  if (file instanceof File && file.size > 0) {
    const allowed = new Map([["image/jpeg","jpg"],["image/png","png"],["image/webp","webp"]]);
    const ext = allowed.get(file.type);
    if (!ext || file.size > 5 * 1024 * 1024) {
      redirect(`/dashboard/${slug}/teaching/profile?error=photo`);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const isJpeg = ext === "jpg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isPng = ext === "png" && bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
    const isWebp = ext === "webp" && bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP";
    if (!(isJpeg || isPng || isWebp)) redirect(`/dashboard/${slug}/teaching/profile?error=photo`);
    avatarPath = `${user.id}/${randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("teacher-profile-photos")
      .upload(avatarPath, file, { contentType: file.type, upsert: false });
    if (uploadError) redirect(`/dashboard/${slug}/teaching/profile?error=upload`);
  }

  const update: { phone: string | null; address: string | null; professional_titles: string | null; avatar_style: string; avatar_path?: string } = {
    phone: phone || null, address: address || null, professional_titles: professionalTitles || null, avatar_style: avatarStyle,
  };
  if (avatarPath) update.avatar_path = avatarPath;
  const { error } = await supabase.from("profiles").update(update).eq("id", user.id);
  if (error) {
    if (avatarPath) await supabase.storage.from("teacher-profile-photos").remove([avatarPath]);
    redirect(`/dashboard/${slug}/teaching/profile?error=save`);
  }
  if (avatarPath && existingProfile?.avatar_path && existingProfile.avatar_path !== avatarPath
      && existingProfile.avatar_path.startsWith(`${user.id}/`)) {
    await supabase.storage.from("teacher-profile-photos").remove([existingProfile.avatar_path]);
  }
  revalidatePath(`/dashboard/${slug}/teaching/profile`);
  revalidatePath(`/dashboard/${slug}`);
  redirect(`/dashboard/${slug}/teaching/profile?saved=1`);
}
