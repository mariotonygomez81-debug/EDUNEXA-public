"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";

function field(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function getContext(slug: string, requiredPermission = "prefect_notes.manage") {
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
  if (!permissions.has(requiredPermission)) redirect(`/dashboard/${slug}`);
  return { supabase, user, institution, membership };
}

export async function createPrefectNovelty(formData: FormData) {
  const slug = field(formData, "slug");
  const divisionId = field(formData, "division_id");
  const studentSelection = field(formData, "student_id");
  const [selectedDivisionId, studentId] = studentSelection ? studentSelection.split("|") : ["", ""];
  const category = field(formData, "category");
  const title = field(formData, "title");
  const description = field(formData, "description");
  const eventDate = field(formData, "event_date");
  const categories = ["convivencia","asistencia","academica","familia","salud","otra"];
  if (!slug || !divisionId || (studentId && selectedDivisionId !== divisionId) || !categories.includes(category) ||
      title.length < 3 || title.length > 120 ||
      !description || description.length > 5000 ||
      (eventDate && !/^\d{4}-\d{2}-\d{2}$/.test(eventDate))) {
    redirect(`/dashboard/${encodeURIComponent(slug)}/prefect/novelties?error=invalid`);
  }
  const { supabase, user, institution } = await getContext(slug);
  const { error } = await supabase.from("prefect_novelties").insert({
    institution_id: institution.id,
    division_id: divisionId,
    student_id: studentId || null,
    category,
    title,
    description,
    event_date: eventDate || new Date().toISOString().slice(0,10),
    created_by: user.id,
  });
  if (error) redirect(`/dashboard/${slug}/prefect/novelties?error=save`);
  revalidatePath(`/dashboard/${slug}/prefect/novelties`);
  redirect(`/dashboard/${slug}/prefect/novelties?saved=1`);
}

export async function updatePrefectNovelty(formData: FormData) {
  const slug = field(formData, "slug");
  const id = field(formData, "novelty_id");
  const status = field(formData, "status");
  const followUp = field(formData, "follow_up");
  const followUpDueOn = field(formData, "follow_up_due_on");
  const validDueDate = !followUpDueOn || (/^\d{4}-\d{2}-\d{2}$/.test(followUpDueOn) && !Number.isNaN(new Date(followUpDueOn + "T12:00:00Z").getTime()) && new Date(followUpDueOn + "T12:00:00Z").toISOString().slice(0, 10) === followUpDueOn);
  if (!slug || !id || !["open","in_progress","resolved"].includes(status) || followUp.length > 3000 || !validDueDate) {
    redirect(`/dashboard/${encodeURIComponent(slug)}/prefect/novelties?error=invalid`);
  }
  const { supabase, institution } = await getContext(slug);
  const { error } = await supabase.from("prefect_novelties")
    .update({ status, follow_up: followUp || null, follow_up_due_on: followUpDueOn || null })
    .eq("id", id).eq("institution_id", institution.id);
  if (error) redirect(`/dashboard/${slug}/prefect/novelties?error=save`);
  revalidatePath(`/dashboard/${slug}/prefect/novelties`);
  redirect(`/dashboard/${slug}/prefect/novelties?updated=1`);
}

export async function savePrefectConductConcept(formData: FormData) {
  const slug = field(formData, "slug");
  const studentSelection = field(formData, "student_id");
  const [divisionId, studentId] = studentSelection ? studentSelection.split("|") : ["", ""];
  const gradingPeriodId = field(formData, "grading_period_id");
  const concept = field(formData, "concept");
  const observation = field(formData, "observation");
  const concepts = ["muy_satisfactorio","satisfactorio","en_proceso","requiere_acompanamiento"];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!slug || !uuid.test(divisionId) || !uuid.test(studentId) ||
      !uuid.test(gradingPeriodId) || !concepts.includes(concept) || observation.length > 1200) {
    redirect(`/dashboard/${encodeURIComponent(slug)}/prefect/conduct?error=invalid`);
  }
  const { supabase, institution, membership } = await getContext(slug, "prefect_conduct.manage");
  const { error } = await supabase.from("prefect_conduct_concepts").upsert({
    institution_id: institution.id, division_id: divisionId, student_id: studentId,
    grading_period_id: gradingPeriodId, concept, observation: observation || null,
    recorded_by_membership_id: membership.id,
  }, { onConflict: "institution_id,student_id,grading_period_id" });
  if (error) redirect(`/dashboard/${slug}/prefect/conduct?error=save`);
  revalidatePath(`/dashboard/${slug}/prefect/conduct`);
  redirect(`/dashboard/${slug}/prefect/conduct?saved=1`);
}

export async function createPrefectMinute(formData: FormData) {
  const slug = field(formData, "slug");
  const divisionId = field(formData, "division_id");
  const studentSelection = field(formData, "student_id");
  const [selectedDivisionId, studentId] = studentSelection ? studentSelection.split("|") : ["", ""];
  const meetingDate = field(formData, "meeting_date");
  const actType = field(formData, "act_type");
  const subject = field(formData, "subject");
  const participants = field(formData, "participants");
  const development = field(formData, "development");
  const agreements = field(formData, "agreements");
  const noveltyId = field(formData, "related_novelty_id");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(meetingDate) &&
    !Number.isNaN(new Date(meetingDate + "T12:00:00Z").getTime()) &&
    new Date(meetingDate + "T12:00:00Z").toISOString().slice(0,10) === meetingDate;
  const types = ["seguimiento","convivencia","reunion_familiar","acuerdo","intervencion"];
  if (!slug || !uuid.test(divisionId) || (studentId && (!uuid.test(studentId) || selectedDivisionId !== divisionId)) ||
      (noveltyId && !uuid.test(noveltyId)) || !validDate || !types.includes(actType) ||
      subject.length < 3 || subject.length > 180 || !development || development.length > 6000 ||
      participants.length > 2000 || agreements.length > 4000) {
    redirect(`/dashboard/${encodeURIComponent(slug)}/prefect/minutes?error=invalid`);
  }

  const { supabase, institution, membership } = await getContext(slug, "prefect_minutes.manage");
  let sourceSnapshot: Record<string, unknown> = {};
  if (noveltyId) {
    const { data: novelty, error: noveltyError } = await supabase.from("prefect_novelties")
      .select("id,division_id,student_id,category,title,description,event_date,status,follow_up,follow_up_due_on")
      .eq("id", noveltyId).eq("institution_id", institution.id)
      .eq("division_id", divisionId).maybeSingle();
    if (noveltyError || !novelty || (novelty.student_id && studentId && novelty.student_id !== studentId)) {
      redirect(`/dashboard/${slug}/prefect/minutes?error=source`);
    }
    sourceSnapshot = {
      category: novelty.category, title: novelty.title, description: novelty.description,
      event_date: novelty.event_date, status: novelty.status,
      follow_up: novelty.follow_up, follow_up_due_on: novelty.follow_up_due_on,
    };
  }

  const { error } = await supabase.from("prefect_minutes").insert({
    institution_id: institution.id,
    division_id: divisionId,
    student_id: studentId || null,
    meeting_date: meetingDate,
    act_type: actType,
    subject,
    participants,
    development,
    agreements,
    related_novelty_id: noveltyId || null,
    source_novelty_snapshot: sourceSnapshot,
    created_by_membership_id: membership.id,
  });
  if (error) redirect(`/dashboard/${slug}/prefect/minutes?error=save`);
  revalidatePath(`/dashboard/${slug}/prefect/minutes`);
  redirect(`/dashboard/${slug}/prefect/minutes?saved=1`);
}
