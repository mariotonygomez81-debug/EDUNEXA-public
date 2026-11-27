"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";

function field(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function back(slug: string, query: string): never {
  redirect(`/dashboard/${encodeURIComponent(slug)}/settings/academic-structure?${query}`);
}

async function adminContext(slug: string) {
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
  if (!permissions.has("institution.manage")) redirect(`/dashboard/${encodeURIComponent(slug)}`);
  return { supabase, institution };
}

function saveError(slug: string, code?: string) {
  if (code === "23505") back(slug, "error=duplicate");
  if (code === "23503") back(slug, "error=reference");
  if (code === "42501") back(slug, "error=forbidden");
  if (code === "22023") back(slug, "error=invalid");
  back(slug, "error=save");
}

export async function createCourse(formData: FormData) {
  const slug = field(formData, "slug");
  const levelId = field(formData, "level_id");
  const name = field(formData, "name");
  const gradeRaw = field(formData, "grade_number");
  const shift = field(formData, "shift");
  const orientationId = field(formData, "orientation_id");
  const gradeNumber = gradeRaw ? Number(gradeRaw) : null;

  if (!slug || !/^[0-9a-f-]{36}$/i.test(levelId) ||
      name.length < 2 || name.length > 80 ||
      (gradeNumber !== null && (!Number.isInteger(gradeNumber) || gradeNumber < 1 || gradeNumber > 20))) {
    back(slug, "error=invalid");
  }

  const { supabase, institution } = await adminContext(slug);
  const args = {
    p_institution_id: institution.id,
    p_level_id: levelId,
    p_name: name,
    p_grade_number: gradeNumber,
    p_shift: shift || null,
    p_orientation_id: orientationId || null,
  };
  const { error } = await supabase.rpc("create_course_with_orientation", args);
  if (error) saveError(slug, error.code);

  revalidatePath(`/dashboard/${slug}/settings/academic-structure`);
  back(slug, "created=course");
}

export async function createDivision(formData: FormData) {
  const slug = field(formData, "slug");
  const courseId = field(formData, "course_id");
  const academicYearId = field(formData, "academic_year_id");
  const campusId = field(formData, "campus_id");
  const name = field(formData, "name");
  const capacityRaw = field(formData, "capacity");
  const capacity = capacityRaw ? Number(capacityRaw) : null;

  if (!slug || !/^[0-9a-f-]{36}$/i.test(courseId) ||
      !/^[0-9a-f-]{36}$/i.test(academicYearId) ||
      (campusId && !/^[0-9a-f-]{36}$/i.test(campusId)) ||
      name.length < 1 || name.length > 20 ||
      (capacity !== null && (!Number.isInteger(capacity) || capacity < 1 || capacity > 2000))) {
    back(slug, "error=invalid");
  }

  const { supabase, institution } = await adminContext(slug);
  const { error } = await supabase.rpc("create_division", {
    p_institution_id: institution.id,
    p_course_id: courseId,
    p_academic_year_id: academicYearId,
    p_campus_id: campusId || null,
    p_name: name,
    p_capacity: capacity,
  });
  if (error) saveError(slug, error.code);

  revalidatePath(`/dashboard/${slug}/settings/academic-structure`);
  revalidatePath(`/dashboard/${slug}/students`);
  back(slug, "created=division");
}

export async function createSubject(formData: FormData) {
  const slug = field(formData, "slug");
  const name = field(formData, "name");
  const code = field(formData, "code");
  if (!slug || name.length < 2 || name.length > 80 || code.length > 20) {
    back(slug, "error=invalid");
  }

  const { supabase, institution } = await adminContext(slug);
  const { error } = await supabase.rpc("create_subject", {
    p_institution_id: institution.id,
    p_name: name,
    ...(code ? { p_code: code } : {}),
  });
  if (error) saveError(slug, error.code);

  revalidatePath(`/dashboard/${slug}/settings/academic-structure`);
  back(slug, "created=subject");
}

export async function assignSubjectToCourse(formData: FormData) {
  const slug = field(formData, "slug");
  const courseId = field(formData, "course_id");
  const subjectId = field(formData, "subject_id");
  const weeklyRaw = field(formData, "weekly_hours");
  const weeklyHours = weeklyRaw ? Number(weeklyRaw) : null;

  if (!slug || !/^[0-9a-f-]{36}$/i.test(courseId) ||
      !/^[0-9a-f-]{36}$/i.test(subjectId) ||
      (weeklyHours !== null && (!Number.isFinite(weeklyHours) || weeklyHours <= 0 || weeklyHours > 60))) {
    back(slug, "error=invalid");
  }

  const { supabase, institution } = await adminContext(slug);
  const { error } = await supabase.rpc("assign_subject_to_course", {
    p_institution_id: institution.id,
    p_course_id: courseId,
    p_subject_id: subjectId,
    ...(weeklyHours !== null ? { p_weekly_hours: weeklyHours } : {}),
  });
  if (error) saveError(slug, error.code);

  revalidatePath(`/dashboard/${slug}/settings/academic-structure`);
  revalidatePath(`/dashboard/${slug}/grades`);
  back(slug, "saved=course-subject");
}

export async function assignStaffToStructure(formData: FormData) {
  const slug = field(formData, "slug");
  const membershipId = field(formData, "membership_id");
  const assignmentType = field(formData, "assignment_type");
  const divisionId = field(formData, "division_id");
  const courseSubjectId = field(formData, "course_subject_id");
  const startsOn = field(formData, "starts_on");
  const endsOn = field(formData, "ends_on");

  if (!slug || !/^[0-9a-f-]{36}$/i.test(membershipId) ||
      !["teacher", "prefect", "director", "administrative"].includes(assignmentType) ||
      (divisionId && !/^[0-9a-f-]{36}$/i.test(divisionId)) ||
      (courseSubjectId && !/^[0-9a-f-]{36}$/i.test(courseSubjectId))) {
    back(slug, "error=invalid");
  }

  const { supabase, institution } = await adminContext(slug);
  const { error } = await supabase.rpc("assign_staff_to_structure", {
    p_institution_id: institution.id,
    p_membership_id: membershipId,
    p_assignment_type: assignmentType,
    ...(divisionId ? { p_division_id: divisionId } : {}),
    ...(courseSubjectId ? { p_course_subject_id: courseSubjectId } : {}),
    ...(startsOn ? { p_starts_on: startsOn } : {}),
    ...(endsOn ? { p_ends_on: endsOn } : {}),
  });
  if (error) saveError(slug, error.code);

  revalidatePath(`/dashboard/${slug}/settings/academic-structure`);
  revalidatePath(`/dashboard/${slug}/attendance`);
  revalidatePath(`/dashboard/${slug}/grades`);
  revalidatePath(`/dashboard/${slug}/messages`);
  back(slug, "saved=staff");
}

export async function endStaffAssignment(formData: FormData) {
  const slug = field(formData, "slug");
  const assignmentId = field(formData, "assignment_id");
  const endsOn = field(formData, "ends_on");

  if (!slug || !/^[0-9a-f-]{36}$/i.test(assignmentId) || !/^\d{4}-\d{2}-\d{2}$/.test(endsOn)) {
    back(slug, "error=invalid");
  }

  const { supabase, institution } = await adminContext(slug);
  const { error } = await supabase.rpc("end_staff_assignment", {
    p_institution_id: institution.id,
    p_assignment_id: assignmentId,
    p_ends_on: endsOn,
  });
  if (error) saveError(slug, error.code);

  revalidatePath(`/dashboard/${slug}/settings/academic-structure`);
  revalidatePath(`/dashboard/${slug}/attendance`);
  revalidatePath(`/dashboard/${slug}/grades`);
  revalidatePath(`/dashboard/${slug}/messages`);
  back(slug, "saved=ended");
}

export async function createEducationLevel(formData: FormData) {
  const slug = field(formData, "slug");
  const name = field(formData, "name");
  const code = field(formData, "code");
  const sortRaw = field(formData, "sort_order");
  const sortOrder = sortRaw ? Number(sortRaw) : 1;

  if (!slug || name.length < 2 || name.length > 80 || code.length > 20 ||
      !Number.isInteger(sortOrder) || sortOrder < 1 || sortOrder > 1000) {
    back(slug, "error=invalid");
  }

  const { supabase, institution } = await adminContext(slug);
  const { error } = await supabase.rpc("create_education_level", {
    p_institution_id: institution.id,
    p_name: name,
    ...(code ? { p_code: code } : {}),
    p_sort_order: sortOrder,
  });
  if (error) saveError(slug, error.code);

  revalidatePath(`/dashboard/${slug}/settings/academic-structure`);
  back(slug, "created=level");
}

export async function createCampus(formData: FormData) {
  const slug = field(formData, "slug");
  const name = field(formData, "name");
  const code = field(formData, "code");
  const address = field(formData, "address");
  const phone = field(formData, "phone");
  const isMain = field(formData, "is_main") === "on";

  if (!slug || name.length < 2 || name.length > 100 || code.length > 20 ||
      address.length > 250 || phone.length > 40) {
    back(slug, "error=invalid");
  }

  const { supabase, institution } = await adminContext(slug);
  const { error } = await supabase.rpc("create_campus", {
    p_institution_id: institution.id,
    p_name: name,
    ...(code ? { p_code: code } : {}),
    ...(address ? { p_address: address } : {}),
    ...(phone ? { p_phone: phone } : {}),
    p_is_main: isMain,
  });
  if (error) saveError(slug, error.code);

  revalidatePath(`/dashboard/${slug}/settings/academic-structure`);
  back(slug, "created=campus");
}
