"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function field(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
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
  const { data: roles } = await supabase.from("membership_roles")
    .select("roles(key)").eq("membership_id", membership.id);
  if (!(roles ?? []).some((row) => row.roles?.key === "institution_admin")) {
    redirect(`/dashboard/${slug}`);
  }
  return { supabase, institution };
}

export async function createAcademicYear(formData: FormData) {
  const slug = field(formData, "slug");
  const name = field(formData, "name");
  const startsOn = field(formData, "starts_on");
  const endsOn = field(formData, "ends_on");
  const status = field(formData, "status");
  if (!slug || name.length < 2 || name.length > 80 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(startsOn) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(endsOn) ||
      endsOn <= startsOn || !["planned", "active", "closed"].includes(status)) {
    redirect(`/dashboard/${encodeURIComponent(slug)}/settings/academic-calendar?error=year_invalid`);
  }
  const { supabase, institution } = await adminContext(slug);
  const { data: overlaps } = await supabase.from("academic_years").select("id")
    .eq("institution_id", institution.id).lte("starts_on", endsOn).gte("ends_on", startsOn);
  if (overlaps?.length) redirect(`/dashboard/${slug}/settings/academic-calendar?error=year_overlap`);
  if (status === "active") {
    const { data: activeYears } = await supabase.from("academic_years").select("id")
      .eq("institution_id", institution.id).eq("status", "active");
    if (activeYears?.length) redirect(`/dashboard/${slug}/settings/academic-calendar?error=active_year_exists`);
  }
  const { error } = await supabase.from("academic_years").insert({
    institution_id: institution.id, name, starts_on: startsOn, ends_on: endsOn, status,
  });
  if (error) redirect(`/dashboard/${slug}/settings/academic-calendar?error=year_save`);
  revalidatePath(`/dashboard/${slug}/settings/academic-calendar`);
  redirect(`/dashboard/${slug}/settings/academic-calendar?created=year`);
}

export async function createGradingPeriod(formData: FormData) {
  const slug = field(formData, "slug");
  const academicYearId = field(formData, "academic_year_id");
  const name = field(formData, "name");
  const startsOn = field(formData, "starts_on");
  const endsOn = field(formData, "ends_on");
  const sortOrder = Number(field(formData, "sort_order") || "0");
  if (!slug || !academicYearId || name.length < 2 || name.length > 80 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(startsOn) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(endsOn) ||
      endsOn < startsOn || !Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 100) {
    redirect(`/dashboard/${encodeURIComponent(slug)}/settings/academic-calendar?error=period_invalid`);
  }
  const { supabase, institution } = await adminContext(slug);
  const { data: year } = await supabase.from("academic_years")
    .select("id,starts_on,ends_on").eq("id", academicYearId)
    .eq("institution_id", institution.id).maybeSingle();
  if (!year || startsOn < year.starts_on || endsOn > year.ends_on) {
    redirect(`/dashboard/${slug}/settings/academic-calendar?error=period_range`);
  }
  const { data: overlaps } = await supabase.from("grading_periods").select("id")
    .eq("institution_id", institution.id).eq("academic_year_id", academicYearId)
    .lte("starts_on", endsOn).gte("ends_on", startsOn);
  if (overlaps?.length) redirect(`/dashboard/${slug}/settings/academic-calendar?error=period_overlap`);
  const { error } = await supabase.from("grading_periods").insert({
    institution_id: institution.id, academic_year_id: academicYearId,
    name, starts_on: startsOn, ends_on: endsOn, sort_order: sortOrder,
  });
  if (error) redirect(`/dashboard/${slug}/settings/academic-calendar?error=period_save`);
  revalidatePath(`/dashboard/${slug}/settings/academic-calendar`);
  revalidatePath(`/dashboard/${slug}/grades`);
  redirect(`/dashboard/${slug}/settings/academic-calendar?created=period`);
}
