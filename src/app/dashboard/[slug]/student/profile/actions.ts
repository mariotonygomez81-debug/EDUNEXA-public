"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function saveStudentProfile(formData: FormData) {
  const slug = String(formData.get("slug") ?? "").trim();
  const avatarStyle = String(formData.get("avatar_style") ?? "neutral");
  const file = formData.get("photo");
  if (!/^[a-z0-9-]{2,80}$/i.test(slug) || !["neutral", "masculino", "femenino"].includes(avatarStyle)) {
    redirect(`/dashboard/${encodeURIComponent(slug)}/student/profile?error=invalid`);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: institution } = await supabase.from("institutions").select("id").eq("slug", slug).maybeSingle();
  if (!institution) redirect("/dashboard");
  const { data: membership } = await supabase.from("memberships").select("id")
    .eq("institution_id", institution.id).eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership) redirect("/dashboard");

  const [{ data: roles }, { data: studentRows }] = await Promise.all([
    supabase.from("membership_roles").select("roles(key)").eq("membership_id", membership.id).eq("institution_id", institution.id),
    supabase.rpc("list_my_portal_students", { p_institution_id: institution.id }),
  ]);
  const isStudent = (roles ?? []).some((row) => row.roles?.key === "student");
  const ownsStudentRecord = (studentRows ?? []).some((row) => row.is_self === true);
  if (!isStudent || !ownsStudentRecord) redirect(`/dashboard/${slug}`);

  const { data: existingProfile } = await supabase.from("profiles").select("avatar_path").eq("id", user.id).maybeSingle();
  let avatarPath: string | undefined;
  if (file instanceof File && file.size > 0) {
    const allowed = new Map([["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]);
    const ext = allowed.get(file.type);
    if (!ext || file.size > 5 * 1024 * 1024) redirect(`/dashboard/${slug}/student/profile?error=photo`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const validJpeg = ext === "jpg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const validPng = ext === "png" && bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
    const validWebp = ext === "webp" && bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
    if (!(validJpeg || validPng || validWebp)) redirect(`/dashboard/${slug}/student/profile?error=photo`);
    avatarPath = `${user.id}/${randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("student-profile-photos").upload(avatarPath, file, { contentType: file.type, upsert: false });
    if (error) redirect(`/dashboard/${slug}/student/profile?error=upload`);
  }

  const update: { avatar_style: string; avatar_path?: string } = { avatar_style: avatarStyle };
  if (avatarPath) update.avatar_path = avatarPath;
  const { error } = await supabase.from("profiles").update(update).eq("id", user.id);
  if (error) {
    if (avatarPath) await supabase.storage.from("student-profile-photos").remove([avatarPath]);
    redirect(`/dashboard/${slug}/student/profile?error=save`);
  }
  if (avatarPath && existingProfile?.avatar_path && existingProfile.avatar_path !== avatarPath
      && existingProfile.avatar_path.startsWith(`${user.id}/`)) {
    await supabase.storage.from("student-profile-photos").remove([existingProfile.avatar_path]);
  }
  revalidatePath(`/dashboard/${slug}/student/profile`);
  revalidatePath(`/dashboard/${slug}/student`);
  redirect(`/dashboard/${slug}/student/profile?saved=1`);
}
