"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";

export async function savePeriodObservation(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const studentId = String(formData.get("student_id") ?? "");
  const periodId = String(formData.get("grading_period_id") ?? "");
  const observation = String(formData.get("observation") ?? "").trim();
  const destination = `/dashboard/${encodeURIComponent(slug)}/report-cards?student=${encodeURIComponent(studentId)}&period=${encodeURIComponent(periodId)}`;

  if (!/^[a-z0-9-]{2,80}$/i.test(slug) ||
      !/^[0-9a-f-]{36}$/i.test(studentId) ||
      !/^[0-9a-f-]{36}$/i.test(periodId) ||
      observation.length < 1 || observation.length > 2000) {
    redirect(`${destination}&error=observation`);
  }

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
  if (!permissions.has("grades.manage")) redirect(`${destination}&error=forbidden`);

  const [{ data: studentRows }, { data: period }] = await Promise.all([
    supabase.rpc("list_students_for_grades", { p_institution_id: institution.id }),
    supabase.from("grading_periods").select("id")
      .eq("institution_id", institution.id).eq("id", periodId).maybeSingle(),
  ]);
  if (!(studentRows ?? []).some((student) => student.id === studentId) || !period) {
    redirect(`${destination}&error=notfound`);
  }

  const { error } = await supabase.from("student_period_observations").upsert({
    institution_id: institution.id,
    student_id: studentId,
    grading_period_id: periodId,
    author_membership_id: membership.id,
    observation,
    updated_at: new Date().toISOString(),
  }, { onConflict: "institution_id,student_id,grading_period_id" });

  if (error) redirect(`${destination}&error=observation`);
  redirect(`${destination}&saved=1`);
}
