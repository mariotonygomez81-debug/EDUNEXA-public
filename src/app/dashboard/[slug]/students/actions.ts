"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";

function value(formData: FormData, key: string) {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim() : "";
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function createStudent(formData: FormData) {
  const slug = value(formData, "slug");
  const firstName = value(formData, "first_name");
  const lastName = value(formData, "last_name");
  const studentNumber = value(formData, "student_number");
  const birthDate = value(formData, "birth_date");
  const email = value(formData, "email");

  if (!slug || firstName.length < 2 || firstName.length > 100 ||
      lastName.length < 2 || lastName.length > 100 ||
      studentNumber.length > 40 || email.length > 254 ||
      (birthDate && !isValidDate(birthDate))) {
    redirect(`/dashboard/${encodeURIComponent(slug)}/students?error=invalid`);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: institution } = await supabase
    .from("institutions").select("id").eq("slug", slug).maybeSingle();
  if (!institution) redirect("/dashboard");

  const { data: membership } = await supabase
    .from("memberships").select("id")
    .eq("institution_id", institution.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) redirect("/dashboard");

  const permissions = await getMembershipPermissions(supabase, membership.id);
  const canManageStudents = permissions.has("students.manage");
  if (!canManageStudents) redirect(`/dashboard/${slug}/students?error=forbidden`);

  const { error } = await supabase.from("students").insert({
    institution_id: institution.id,
    first_name: firstName,
    last_name: lastName,
    student_number: studentNumber || null,
    birth_date: birthDate || null,
    email: email || null,
  });

  if (error) {
    redirect(`/dashboard/${slug}/students?error=save`);
  }

  revalidatePath(`/dashboard/${slug}/students`);
  redirect(`/dashboard/${slug}/students?created=1`);
}

export async function updateStudent(formData: FormData) {
  const slug = value(formData, "slug");
  const studentId = value(formData, "student_id");
  const firstName = value(formData, "first_name");
  const lastName = value(formData, "last_name");
  const studentNumber = value(formData, "student_number");
  const birthDate = value(formData, "birth_date");
  const email = value(formData, "email");
  const status = value(formData, "status");
  const allowedStatuses = ["active", "inactive", "graduated", "withdrawn"] as const;

  if (!slug || !studentId || firstName.length < 2 || firstName.length > 100 ||
      lastName.length < 2 || lastName.length > 100 ||
      studentNumber.length > 40 || email.length > 254 ||
      (birthDate && !isValidDate(birthDate)) ||
      !allowedStatuses.includes(status as (typeof allowedStatuses)[number])) {
    redirect(`/dashboard/${encodeURIComponent(slug)}/students/${encodeURIComponent(studentId)}?error=invalid`);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: institution } = await supabase
    .from("institutions").select("id").eq("slug", slug).maybeSingle();
  if (!institution) redirect("/dashboard");

  const { data: membership } = await supabase
    .from("memberships").select("id")
    .eq("institution_id", institution.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) redirect("/dashboard");

  const permissions = await getMembershipPermissions(supabase, membership.id);
  const canManageStudents = permissions.has("students.manage");
  if (!canManageStudents) redirect(`/dashboard/${slug}/students/${studentId}?error=forbidden`);

  const { error } = await supabase.from("students").update({
    first_name: firstName,
    last_name: lastName,
    student_number: studentNumber || null,
    birth_date: birthDate || null,
    email: email || null,
    status: status as (typeof allowedStatuses)[number],
    updated_at: new Date().toISOString(),
  }).eq("id", studentId).eq("institution_id", institution.id);

  if (error) redirect(`/dashboard/${slug}/students/${studentId}?error=save`);

  revalidatePath(`/dashboard/${slug}/students`);
  revalidatePath(`/dashboard/${slug}/students/${studentId}`);
  redirect(`/dashboard/${slug}/students/${studentId}?updated=1`);
}

export async function createEnrollment(formData: FormData) {
  const slug = value(formData, "slug");
  const studentId = value(formData, "student_id");
  const divisionId = value(formData, "division_id");
  const enrolledOn = value(formData, "enrolled_on");

  if (!slug || !studentId || !divisionId ||
      (enrolledOn && !isValidDate(enrolledOn))) {
    redirect(`/dashboard/${encodeURIComponent(slug)}/students/${encodeURIComponent(studentId)}?error=enrollment_invalid`);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: institution } = await supabase
    .from("institutions").select("id").eq("slug", slug).maybeSingle();
  if (!institution) redirect("/dashboard");

  const { data: membership } = await supabase
    .from("memberships").select("id")
    .eq("institution_id", institution.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) redirect("/dashboard");

  const permissions = await getMembershipPermissions(supabase, membership.id);
  const canManageStudents = permissions.has("students.manage");
  if (!canManageStudents) redirect(`/dashboard/${slug}/students/${studentId}?error=forbidden`);

  const { data: division } = await supabase
    .from("divisions").select("id")
    .eq("id", divisionId)
    .eq("institution_id", institution.id)
    .maybeSingle();
  if (!division) redirect(`/dashboard/${slug}/students/${studentId}?error=enrollment_invalid`);

  const { error } = await supabase.rpc("create_student_enrollment", {
    p_institution_id: institution.id,
    p_student_id: studentId,
    p_division_id: division.id,
    ...(enrolledOn ? { p_enrolled_on: enrolledOn } : {}),
  });

  if (error) redirect(`/dashboard/${slug}/students/${studentId}?error=enrollment_save`);

  revalidatePath(`/dashboard/${slug}/students/${studentId}`);
  redirect(`/dashboard/${slug}/students/${studentId}?enrolled=1`);
}


export async function linkStudentGuardian(formData: FormData) {
  const slug = value(formData, "slug");
  const studentId = value(formData, "student_id");
  const guardianId = value(formData, "guardian_id");
  const canViewGrades = value(formData, "can_view_grades") === "on";
  const canViewAttendance = value(formData, "can_view_attendance") === "on";
  if (!slug || !/^[0-9a-f-]{36}$/i.test(studentId) || !/^[0-9a-f-]{36}$/i.test(guardianId)) {
    redirect(`/dashboard/${encodeURIComponent(slug)}/students/${encodeURIComponent(studentId)}?error=guardian_invalid`);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase.functions.invoke("manage-institution-users", {
    body: {
      action: "link_guardian",
      slug,
      student_id: studentId,
      guardian_id: guardianId,
      can_view_grades: canViewGrades,
      can_view_attendance: canViewAttendance,
    },
  });
  if (error || !data?.ok) {
    redirect(`/dashboard/${encodeURIComponent(slug)}/students/${encodeURIComponent(studentId)}?error=guardian_save`);
  }
  revalidatePath(`/dashboard/${slug}/students/${studentId}`);
  redirect(`/dashboard/${slug}/students/${studentId}?guardian_linked=1`);
}

export async function unlinkStudentGuardian(formData: FormData) {
  const slug = value(formData, "slug");
  const studentId = value(formData, "student_id");
  const guardianId = value(formData, "guardian_id");
  if (!slug || !/^[0-9a-f-]{36}$/i.test(studentId) || !/^[0-9a-f-]{36}$/i.test(guardianId)) {
    redirect(`/dashboard/${encodeURIComponent(slug)}/students/${encodeURIComponent(studentId)}?error=guardian_invalid`);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase.functions.invoke("manage-institution-users", {
    body: {
      action: "unlink_guardian",
      slug,
      student_id: studentId,
      guardian_id: guardianId,
    },
  });
  if (error || !data?.ok) {
    redirect(`/dashboard/${encodeURIComponent(slug)}/students/${encodeURIComponent(studentId)}?error=guardian_save`);
  }
  revalidatePath(`/dashboard/${slug}/students/${studentId}`);
  redirect(`/dashboard/${slug}/students/${studentId}?guardian_unlinked=1`);
}

export async function transferStudentEnrollment(formData: FormData) {
  const slug = value(formData, "slug");
  const studentId = value(formData, "student_id");
  const divisionId = value(formData, "division_id");
  const effectiveOn = value(formData, "effective_on");
  const reason = value(formData, "reason");

  if (!slug || !/^[0-9a-f-]{36}$/i.test(studentId) ||
      !/^[0-9a-f-]{36}$/i.test(divisionId) ||
      !isValidDate(effectiveOn) || reason.length > 500) {
    redirect(`/dashboard/${encodeURIComponent(slug)}/students/${encodeURIComponent(studentId)}?error=transfer_invalid`);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: institution } = await supabase
    .from("institutions").select("id").eq("slug", slug).maybeSingle();
  if (!institution) redirect("/dashboard");

  const { data: membership } = await supabase
    .from("memberships").select("id")
    .eq("institution_id", institution.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) redirect("/dashboard");

  const permissions = await getMembershipPermissions(supabase, membership.id);
  if (!permissions.has("students.manage")) {
    redirect(`/dashboard/${slug}/students/${studentId}?error=forbidden`);
  }

  const { error } = await supabase.rpc("transfer_student_enrollment", {
    p_institution_id: institution.id,
    p_student_id: studentId,
    p_new_division_id: divisionId,
    p_effective_on: effectiveOn,
    ...(reason ? { p_reason: reason } : {}),
  });
  if (error) redirect(`/dashboard/${slug}/students/${studentId}?error=transfer_save`);

  revalidatePath(`/dashboard/${slug}/students/${studentId}`);
  revalidatePath(`/dashboard/${slug}/students`);
  redirect(`/dashboard/${slug}/students/${studentId}?transferred=1`);
}

export async function closeStudentEnrollment(formData: FormData) {
  const slug = value(formData, "slug");
  const studentId = value(formData, "student_id");
  const enrollmentId = value(formData, "enrollment_id");
  const finalStatus = value(formData, "final_status");
  const effectiveOn = value(formData, "effective_on");
  const reason = value(formData, "reason");

  if (!slug || !/^[0-9a-f-]{36}$/i.test(studentId) ||
      !/^[0-9a-f-]{36}$/i.test(enrollmentId) ||
      !["withdrawn", "completed"].includes(finalStatus) ||
      !isValidDate(effectiveOn) || reason.length > 500) {
    redirect(`/dashboard/${encodeURIComponent(slug)}/students/${encodeURIComponent(studentId)}?error=close_invalid`);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: institution } = await supabase
    .from("institutions").select("id").eq("slug", slug).maybeSingle();
  if (!institution) redirect("/dashboard");

  const { data: membership } = await supabase
    .from("memberships").select("id")
    .eq("institution_id", institution.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) redirect("/dashboard");

  const permissions = await getMembershipPermissions(supabase, membership.id);
  if (!permissions.has("students.manage")) {
    redirect(`/dashboard/${slug}/students/${studentId}?error=forbidden`);
  }

  const { data: enrollment } = await supabase.from("enrollments")
    .select("id,student_id")
    .eq("id", enrollmentId)
    .eq("institution_id", institution.id)
    .maybeSingle();
  if (!enrollment || enrollment.student_id !== studentId) {
    redirect(`/dashboard/${slug}/students/${studentId}?error=close_invalid`);
  }

  const { error } = await supabase.rpc("close_student_enrollment", {
    p_institution_id: institution.id,
    p_enrollment_id: enrollmentId,
    p_final_status: finalStatus,
    p_effective_on: effectiveOn,
    ...(reason ? { p_reason: reason } : {}),
  });
  if (error) redirect(`/dashboard/${slug}/students/${studentId}?error=close_save`);

  revalidatePath(`/dashboard/${slug}/students/${studentId}`);
  revalidatePath(`/dashboard/${slug}/students`);
  redirect(`/dashboard/${slug}/students/${studentId}?closed=1`);
}

