"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createTeacherGuardianAppointment(formData: FormData) {
  const slug=String(formData.get("slug")??"").trim();
  const divisionId=String(formData.get("division_id")??"").trim();
  const studentId=String(formData.get("student_id")??"").trim();
  const guardianMembershipId=String(formData.get("guardian_membership_id")??"").trim();
  const scheduledRaw=String(formData.get("scheduled_at")??"").trim();
  const reason=String(formData.get("reason")??"").trim();
  const scheduledAt=new Date(`${scheduledRaw}:00-03:00`);
  const back=`/dashboard/${encodeURIComponent(slug)}/teaching/${divisionId}`;
  if(!/^[a-z0-9-]{2,80}$/i.test(slug)||!/^[0-9a-f-]{36}$/i.test(divisionId)||!/^[0-9a-f-]{36}$/i.test(studentId)||!/^[0-9a-f-]{36}$/i.test(guardianMembershipId)||!scheduledRaw||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(scheduledRaw)||Number.isNaN(scheduledAt.getTime())||scheduledAt.getTime()<=Date.now()||reason.length<3||reason.length>1000){
    redirect(`${back}?error=appointment-invalid`);
  }
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect("/login");
  const {data:institution}=await supabase.from("institutions").select("id").eq("slug",slug).maybeSingle();
  if(!institution) redirect("/dashboard");
  const {data,error}=await supabase.rpc("create_teacher_guardian_appointment",{
    p_student_id:studentId,p_guardian_membership_id:guardianMembershipId,
    p_scheduled_at:scheduledAt.toISOString(),p_reason:reason,
  });
  if(error||!data) redirect(`${back}?error=appointment-scope`);
  revalidatePath(back);
  redirect(`${back}?appointment=created`);
}
