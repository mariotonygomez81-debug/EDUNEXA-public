"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";

type WorkflowAction = "submit" | "approve" | "publish";

export async function updateReportCardWorkflow(formData: FormData) {
  const slug = String(formData.get("slug") ?? "").trim();
  const studentId = String(formData.get("student_id") ?? "").trim();
  const periodId = String(formData.get("grading_period_id") ?? "").trim();
  const action = String(formData.get("workflow_action") ?? "") as WorkflowAction;
  const reason = String(formData.get("rectification_reason") ?? "").trim();
  const audience = String(formData.get("publication_audience") ?? "both");
  const destination = `/dashboard/${encodeURIComponent(slug)}/report-cards?student=${encodeURIComponent(studentId)}&period=${encodeURIComponent(periodId)}`;

  if (!/^[a-z0-9-]{2,80}$/i.test(slug) ||
      !/^[0-9a-f-]{36}$/i.test(studentId) ||
      !/^[0-9a-f-]{36}$/i.test(periodId) ||
      !["submit", "approve", "publish"].includes(action) ||
      reason.length > 1000 ||
      (action === "publish" && !["student", "guardian", "both"].includes(audience))) {
    redirect(`${destination}&error=workflow_invalid`);
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
  if (action === "submit" && !permissions.has("grades.manage")) {
    redirect(`${destination}&error=workflow_forbidden`);
  }
  if (action === "approve" && !permissions.has("report_cards.approve")) {
    redirect(`${destination}&error=workflow_forbidden`);
  }
  if (action === "publish" && !permissions.has("report_cards.publish")) {
    redirect(`${destination}&error=workflow_forbidden`);
  }

  const [{ data: students }, { data: period }] = await Promise.all([
    supabase.rpc("list_students_for_grades", { p_institution_id: institution.id }),
    supabase.from("grading_periods").select("id")
      .eq("institution_id", institution.id).eq("id", periodId).maybeSingle(),
  ]);
  if (!(students ?? []).some((student) => student.id === studentId) || !period) {
    redirect(`${destination}&error=workflow_notfound`);
  }

  let error: { message: string } | null = null;
  if (action === "submit") {
    if (reason && reason.length < 10) {
      redirect(`${destination}&error=workflow_reason`);
    }
    const result = await supabase.rpc("submit_report_card", {
      p_student_id: studentId,
      p_grading_period_id: periodId,
      p_rectification_reason: reason || null,
    });
    error = result.error;
  } else {
    const { data: current } = await supabase.from("report_card_workflows")
      .select("id,status")
      .eq("institution_id", institution.id)
      .eq("student_id", studentId)
      .eq("grading_period_id", periodId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!current ||
        (action === "approve" && current.status !== "submitted") ||
        (action === "publish" && current.status !== "approved")) {
      redirect(`${destination}&error=workflow_state`);
    }

    if (action === "approve") {
      const result = await supabase.rpc("approve_report_card", { p_workflow_id: current.id });
      error = result.error;
    } else {
      const result = await supabase.rpc("publish_report_card_with_audience", {
        p_workflow_id: current.id,
        p_audience: audience,
      });
      error = result.error;
    }
  }

  if (error) redirect(`${destination}&error=workflow_save`);
  revalidatePath(`/dashboard/${slug}/report-cards`);
  redirect(`${destination}&workflow_saved=1`);
}
