"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function read(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function joinClassroomByInvite(formData: FormData) {
  const slug = read(formData, "school");
  const code = read(formData, "code").toUpperCase();
  const token = read(formData, "token");
  const returnParams = new URLSearchParams({ school: slug });
  if (token) returnParams.set("token", token);
  if (code) returnParams.set("code", code);
  const next = `/join/classroom?${returnParams.toString()}`;
  if (!slug || (!code && !/^[0-9a-f-]{36}$/i.test(token))) {
    redirect(`/join/classroom?error=invalid&school=${encodeURIComponent(slug)}`);
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  const { data: classroomId, error } = await supabase.rpc("join_classroom_by_invite", {
    p_code: code || null,
    p_token: token || null,
  });
  if (error || !classroomId) {
    redirect(`/join/classroom?error=invalid&school=${encodeURIComponent(slug)}`);
  }
  revalidatePath(`/dashboard/${slug}/classroom`);
  redirect(`/dashboard/${slug}/classroom/${classroomId}`);
}
