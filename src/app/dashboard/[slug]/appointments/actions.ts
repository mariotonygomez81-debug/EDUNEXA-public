"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function value(formData: FormData, key: string) {
  const item = formData.get(key);
  return typeof item === "string" ? item.trim() : "";
}

export async function respondToAppointment(formData: FormData) {
  const slug = value(formData, "slug");
  const appointmentId = value(formData, "appointment_id");
  const response = value(formData, "response");
  const responseNote = value(formData, "response_note");
  const proposedAtInput = value(formData, "proposed_at");
  const path = `/dashboard/${encodeURIComponent(slug)}/appointments`;
  if (!/^[a-z0-9-]{2,80}$/i.test(slug) ||
      !/^[0-9a-f-]{36}$/i.test(appointmentId) ||
      !["confirmed", "rejected"].includes(response) ||
      responseNote.length > 500 ||
      (proposedAtInput && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(proposedAtInput))) {
    redirect(`${path}?error=invalid`);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const proposedAt = proposedAtInput ? new Date(`${proposedAtInput}:00-03:00`) : null;
  if (response === "confirmed" && proposedAt) redirect(`${path}?error=invalid`);
  if (proposedAt && (!Number.isFinite(proposedAt.getTime()) || proposedAt.getTime() <= Date.now())) redirect(`${path}?error=date`);
  const { data, error } = await supabase.rpc("respond_teacher_guardian_appointment_with_details", {
    p_appointment_id: appointmentId,
    p_response: response,
    p_note: responseNote || null,
    p_proposed_at: proposedAt?.toISOString() ?? null,
  });
  if (error || !data) redirect(`${path}?error=response`);
  revalidatePath(path);
  revalidatePath(`/dashboard/${slug}/portal`);
  redirect(`${path}?updated=1`);
}


export async function acceptAppointmentProposal(formData: FormData) {
  const slug = value(formData, "slug");
  const appointmentId = value(formData, "appointment_id");
  const path = `/dashboard/${encodeURIComponent(slug)}/appointments`;
  if (!/^[a-z0-9-]{2,80}$/i.test(slug) || !/^[0-9a-f-]{36}$/i.test(appointmentId)) {
    redirect(`${path}?error=invalid`);
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data, error } = await supabase.rpc("accept_teacher_guardian_appointment_proposal", {
    p_appointment_id: appointmentId,
  });
  if (error || !data) redirect(`${path}?error=reschedule`);
  revalidatePath(path);
  revalidatePath(`/dashboard/${slug}/portal`);
  redirect(`${path}?updated=1`);
}

export async function updateAppointmentStatus(formData: FormData) {
  const slug = value(formData, "slug");
  const appointmentId = value(formData, "appointment_id");
  const status = value(formData, "status");
  const path = `/dashboard/${encodeURIComponent(slug)}/appointments`;
  if (!/^[a-z0-9-]{2,80}$/i.test(slug) ||
      !/^[0-9a-f-]{36}$/i.test(appointmentId) ||
      !["completed", "cancelled"].includes(status)) {
    redirect(`${path}?error=invalid`);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data, error } = await supabase.rpc("update_teacher_guardian_appointment", {
    p_appointment_id: appointmentId,
    p_status: status,
  });
  if (error || !data) redirect(`${path}?error=status`);
  revalidatePath(path);
  redirect(`${path}?updated=1`);
}

export async function createAppointment(formData: FormData) {
  const slug = String(formData.get("slug") ?? "").trim();
  const contact = String(formData.get("contact") ?? "").trim();
  const scheduledAt = String(formData.get("scheduled_at") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const path = `/dashboard/${encodeURIComponent(slug)}/appointments`;
  const match = /^([0-9a-f-]{36}):([0-9a-f-]{36})$/i.exec(contact);
  if (!/^[a-z0-9-]{2,80}$/i.test(slug) || !match ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(scheduledAt) ||
      reason.length < 3 || reason.length > 1000) {
    redirect(`/dashboard/${encodeURIComponent(slug)}/appointments/new?error=invalid`);
  }

  // Colegio Demo uses Argentina local time (UTC-03:00).
  const scheduledDate = new Date(`${scheduledAt}:00-03:00`);
  if (!Number.isFinite(scheduledDate.getTime()) || scheduledDate.getTime() <= Date.now()) {
    redirect(`/dashboard/${encodeURIComponent(slug)}/appointments/new?error=date`);
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
  const { data: roles } = await supabase.from("membership_roles")
    .select("roles(key)").eq("membership_id", membership.id).eq("institution_id", institution.id);
  if (!(roles ?? []).some((row) => row.roles?.key === "teacher")) redirect(`/dashboard/${slug}`);

  const { error } = await supabase.rpc("create_teacher_guardian_appointment", {
    p_student_id: match[1],
    p_guardian_membership_id: match[2],
    p_scheduled_at: scheduledDate.toISOString(),
    p_reason: reason,
  });
  if (error) redirect(`/dashboard/${slug}/appointments/new?error=save`);
  revalidatePath(path);
  redirect(`${path}?created=1`);
}
