"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";

function field(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function periodContext(slug: string, permission: "grades.close_period" | "grades.reopen_period") {
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
  if (!permissions.has(permission)) redirect(`/dashboard/${encodeURIComponent(slug)}/report-cards?period_error=forbidden`);
  return { supabase, institution };
}

function back(slug: string, query: string): never {
  redirect(`/dashboard/${encodeURIComponent(slug)}/report-cards?${query}`);
}

export async function closeGradingPeriod(formData: FormData) {
  const slug = field(formData, "slug");
  const periodId = field(formData, "grading_period_id");
  const studentId = field(formData, "student_id");
  const reason = field(formData, "reason");
  const returnParams = `student=${encodeURIComponent(studentId)}&period=${encodeURIComponent(periodId)}&`;
  if (!slug || !/^[0-9a-f-]{36}$/i.test(periodId) || reason.length < 10 || reason.length > 500) {
    back(slug, `${returnParams}period_error=invalid`);
  }

  const { supabase, institution } = await periodContext(slug, "grades.close_period");
  const { data: period } = await supabase.from("grading_periods").select("id")
    .eq("id", periodId).eq("institution_id", institution.id).maybeSingle();
  if (!period) back(slug, `${returnParams}period_error=forbidden`);
  const { error } = await supabase.rpc("close_grading_period", {
    p_grading_period_id: periodId,
    p_reason: reason,
  });
  if (error) {
    if (error.code === "42501") back(slug, `${returnParams}period_error=forbidden`);
    if (error.code === "23514") back(slug, `${returnParams}period_error=not_ready`);
    if (error.code === "22023") back(slug, `${returnParams}period_error=reason`);
    back(slug, `${returnParams}period_error=save`);
  }

  revalidatePath(`/dashboard/${slug}/report-cards`);
  revalidatePath(`/dashboard/${slug}/grades`);
  revalidatePath(`/dashboard/${slug}/settings/academic-calendar`);
  back(slug, `${returnParams}period_action=closed`);
}

export async function reopenGradingPeriod(formData: FormData) {
  const slug = field(formData, "slug");
  const periodId = field(formData, "grading_period_id");
  const studentId = field(formData, "student_id");
  const reason = field(formData, "reason");
  const returnParams = `student=${encodeURIComponent(studentId)}&period=${encodeURIComponent(periodId)}&`;
  if (!slug || !/^[0-9a-f-]{36}$/i.test(periodId) || reason.length < 10 || reason.length > 500) {
    back(slug, `${returnParams}period_error=invalid`);
  }

  const { supabase, institution } = await periodContext(slug, "grades.reopen_period");
  const { data: period } = await supabase.from("grading_periods").select("id")
    .eq("id", periodId).eq("institution_id", institution.id).maybeSingle();
  if (!period) back(slug, `${returnParams}period_error=forbidden`);
  const { error } = await supabase.rpc("reopen_grading_period", {
    p_grading_period_id: periodId,
    p_reason: reason,
  });
  if (error) {
    if (error.code === "42501") back(slug, `${returnParams}period_error=forbidden`);
    if (error.code === "23514") back(slug, `${returnParams}period_error=reopen_blocked`);
    if (error.code === "22023") back(slug, `${returnParams}period_error=reason`);
    back(slug, `${returnParams}period_error=save`);
  }

  revalidatePath(`/dashboard/${slug}/report-cards`);
  revalidatePath(`/dashboard/${slug}/grades`);
  revalidatePath(`/dashboard/${slug}/settings/academic-calendar`);
  back(slug, `${returnParams}period_action=reopened`);
}
