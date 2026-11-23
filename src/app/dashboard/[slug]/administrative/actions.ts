"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";

function value(formData: FormData, key: string) {
  const item = formData.get(key);
  return typeof item === "string" ? item.trim() : "";
}

async function context(slug: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: institution } = await supabase.from("institutions")
    .select("id").eq("slug",slug).eq("status","active").maybeSingle();
  if (!institution) redirect("/dashboard");
  const { data: membership } = await supabase.from("memberships")
    .select("id").eq("institution_id",institution.id).eq("user_id",user.id)
    .eq("status","active").maybeSingle();
  if (!membership) redirect("/dashboard");
  const permissions = await getMembershipPermissions(supabase,membership.id);
  if (!permissions.has("administrative_records.manage")) redirect(`/dashboard/${slug}`);
  return { supabase, institution, membership };
}

const categories = ["documentacion","tramites","personal","compras","mantenimiento","inventario","otro"];
const statuses = ["open","in_progress","closed"];

function isValidDate(value: string) {
  if (!(/^\d{4}-\d{2}-\d{2}$/).test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function createAdministrativeRecord(formData: FormData) {
  const slug=value(formData,"slug");
  const category=value(formData,"category");
  const recordCode=value(formData,"record_code");
  const title=value(formData,"title");
  const description=value(formData,"description");
  const recordDate=value(formData,"record_date");
  const dueDate=value(formData,"due_date");
  if (!slug || !categories.includes(category) || title.length<3 || title.length>160 ||
      !description || description.length>5000 || recordCode.length>50 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(recordDate) ||
      (dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || dueDate<recordDate))) {
    redirect(`/dashboard/${encodeURIComponent(slug)}/administrative?error=invalid`);
  }
  const {supabase,institution,membership}=await context(slug);
  const {error}=await supabase.from("administrative_records").insert({
    institution_id:institution.id,
    created_by_membership_id:membership.id,
    category,
    record_code:recordCode || null,
    title,
    description,
    record_date:recordDate,
    due_date:dueDate || null,
    status:"open",
  });
  if(error) redirect(`/dashboard/${slug}/administrative?error=save`);
  revalidatePath(`/dashboard/${slug}/administrative`);
  redirect(`/dashboard/${slug}/administrative?created=1`);
}

export async function updateAdministrativeRecord(formData: FormData) {
  const slug=value(formData,"slug");
  const id=value(formData,"record_id");
  const status=value(formData,"status");
  const resolutionNotes=value(formData,"resolution_notes");
  if(!slug || !id || !statuses.includes(status) || resolutionNotes.length>3000) {
    redirect(`/dashboard/${encodeURIComponent(slug)}/administrative?error=invalid`);
  }
  const {supabase,institution,membership}=await context(slug);
  const {error}=await supabase.from("administrative_records").update({
    status,
    resolution_notes:resolutionNotes || null,
    updated_by_membership_id:membership.id,
  }).eq("id",id).eq("institution_id",institution.id);
  if(error) redirect(`/dashboard/${slug}/administrative?error=update`);
  revalidatePath(`/dashboard/${slug}/administrative`);
  redirect(`/dashboard/${slug}/administrative?updated=1`);
}
