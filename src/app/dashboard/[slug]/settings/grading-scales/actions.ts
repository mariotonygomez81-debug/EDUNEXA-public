"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";
import type { Json } from "@/types/database.types";

function field(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function back(slug: string, query: string): never {
  redirect(`/dashboard/${encodeURIComponent(slug)}/settings/grading-scales?${query}`);
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

export async function createGradingScale(formData: FormData) {
  const slug = field(formData, "slug");
  const name = field(formData, "name");
  const description = field(formData, "description");
  const displayMode = field(formData, "display_mode");
  const minimumValue = Number(field(formData, "minimum_value"));
  const maximumValue = Number(field(formData, "maximum_value"));
  const passingRaw = field(formData, "passing_value");
  const passingValue = passingRaw === "" ? null : Number(passingRaw);
  const levelCount = Number(field(formData, "level_count"));

  if (!slug || name.length < 2 || name.length > 80 ||
      description.length > 500 ||
      !["numeric", "descriptive", "both"].includes(displayMode) ||
      !Number.isFinite(minimumValue) || !Number.isFinite(maximumValue) || maximumValue <= minimumValue ||
      (passingValue !== null && (!Number.isFinite(passingValue) || passingValue < minimumValue || passingValue > maximumValue)) ||
      !Number.isInteger(levelCount) || levelCount < 2 || levelCount > 20) {
    back(slug, "error=scale_invalid");
  }

  const minima = formData.getAll("level_minimum_percentage");
  const maxima = formData.getAll("level_maximum_percentage");
  const labels = formData.getAll("level_label");
  const grades = formData.getAll("level_grade_value");
  if ([minima, maxima, labels, grades].some((values) => values.length !== levelCount)) {
    back(slug, "error=level_invalid");
  }

  const levels: {
    minimum_percentage: number;
    maximum_percentage: number;
    label: string;
    grade_value: number | null;
    is_passing: boolean;
  }[] = [];

  for (let index = 0; index < levelCount; index += 1) {
    const minimum = Number(minima[index]);
    const maximum = Number(maxima[index]);
    const label = String(labels[index] ?? "").trim();
    const gradeRaw = String(grades[index] ?? "").trim();
    const gradeValue = gradeRaw === "" ? null : Number(gradeRaw);
    const isPassing = field(formData, `level_is_passing_${index}`) === "true";

    if (!Number.isFinite(minimum) || !Number.isFinite(maximum) ||
        minimum < 0 || maximum > 100 || maximum < minimum ||
        label.length < 1 || label.length > 80 ||
        (gradeValue !== null && !Number.isFinite(gradeValue)) ||
        (displayMode !== "descriptive" && gradeValue === null)) {
      back(slug, "error=level_invalid");
    }
    levels.push({
      minimum_percentage: minimum,
      maximum_percentage: maximum,
      label,
      grade_value: gradeValue,
      is_passing: isPassing,
    });
  }

  const { supabase, institution } = await adminContext(slug);
  const { data: scaleId, error } = await supabase.rpc("create_grading_scale", {
    p_institution_id: institution.id,
    p_name: name,
    p_description: description || null,
    p_display_mode: displayMode,
    p_minimum_value: minimumValue,
    p_maximum_value: maximumValue,
    p_passing_value: passingValue,
    p_levels: levels as unknown as Json,
  });

  if (error) back(slug, error.code === "23505" ? "error=scale_duplicate" : error.code === "23514" || error.code === "22023" ? "error=level_invalid" : "error=scale_save");
  revalidatePath(`/dashboard/${slug}/settings/grading-scales`);
  revalidatePath(`/dashboard/${slug}/report-cards`);
  back(slug, `created=scale&scale=${scaleId}`);
}

export async function assignGradingScale(formData: FormData) {
  const slug = field(formData, "slug");
  const academicYearId = field(formData, "academic_year_id");
  const scaleId = field(formData, "grading_scale_id");

  if (!slug || !/^[0-9a-f-]{36}$/i.test(academicYearId) ||
      !/^[0-9a-f-]{36}$/i.test(scaleId)) {
    back(slug, "error=assignment_invalid");
  }

  const { supabase, institution } = await adminContext(slug);
  const [{ data: year }, { data: scale }] = await Promise.all([
    supabase.from("academic_years").select("id").eq("id", academicYearId)
      .eq("institution_id", institution.id).maybeSingle(),
    supabase.from("grading_scales").select("id").eq("id", scaleId)
      .eq("institution_id", institution.id).maybeSingle(),
  ]);
  if (!year || !scale) back(slug, "error=assignment_invalid");
  const { error } = await supabase.rpc("assign_grading_scale_to_year", {
    p_academic_year_id: academicYearId,
    p_grading_scale_id: scaleId,
  });

  if (error) back(slug, "error=assignment_save");
  revalidatePath(`/dashboard/${slug}/settings/grading-scales`);
  revalidatePath(`/dashboard/${slug}/grades`);
  revalidatePath(`/dashboard/${slug}/report-cards`);
  back(slug, "saved=assignment");
}
