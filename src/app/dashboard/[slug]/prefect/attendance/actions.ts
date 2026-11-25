"use server";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";

function field(data:FormData,key:string){const v=data.get(key);return typeof v==="string"?v.trim():"";}
async function context(slug:string){
 const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");
 const {data:institution}=await supabase.from("institutions").select("id").eq("slug",slug).eq("status","active").maybeSingle();if(!institution)redirect("/dashboard");
 const {data:membership}=await supabase.from("memberships").select("id").eq("institution_id",institution.id).eq("user_id",user.id).eq("status","active").maybeSingle();if(!membership)redirect("/dashboard");
 const permissions=await getMembershipPermissions(supabase,membership.id);if(!permissions.has("attendance.manage"))redirect(`/dashboard/${slug}`);
 const {data:roles}=await supabase.from("membership_roles").select("roles(key)").eq("membership_id",membership.id).eq("institution_id",institution.id);
 if(!(roles??[]).some(r=>r.roles?.key==="prefect"))redirect(`/dashboard/${slug}`);
 return {supabase,user,institution,membership};
}
export async function createPrefectAttendanceSession(data:FormData){
 const slug=field(data,"slug"),courseId=field(data,"course_id"),divisionId=field(data,"division_id"),heldOn=field(data,"held_on"),period=field(data,"period_label");
 if(!slug||!/^[0-9a-f-]{36}$/i.test(courseId)||!/^[0-9a-f-]{36}$/i.test(divisionId)||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(heldOn)||period.length>80)redirect(`/dashboard/${encodeURIComponent(slug)}/prefect/attendance?error=invalid`);
 const {supabase,user,institution,membership}=await context(slug);
 const {data:division}=await supabase.from("divisions").select("id").eq("institution_id",institution.id).eq("id",divisionId).eq("course_id",courseId).maybeSingle();
 if(!division)redirect(`/dashboard/${slug}/prefect/attendance?error=invalid`);
 const {data:assignment}=await supabase.from("staff_assignments").select("id").eq("institution_id",institution.id).eq("membership_id",membership.id).eq("assignment_type","prefect").eq("division_id",divisionId).or(`starts_on.is.null,starts_on.lte.${heldOn}`).or(`ends_on.is.null,ends_on.gte.${heldOn}`).maybeSingle();
 if(!assignment)redirect(`/dashboard/${slug}/prefect/attendance?error=scope`);
 const db=supabase as unknown as {from:(table:string)=>any};
 const {error}=await db.from("prefect_attendance_sessions").insert({institution_id:institution.id,division_id:divisionId,held_on:heldOn,period_label:period||null,created_by:user.id});
 if(error)redirect(`/dashboard/${slug}/prefect/attendance?error=save`);
 revalidatePath(`/dashboard/${slug}/prefect/attendance`);redirect(`/dashboard/${slug}/prefect/attendance?saved=1`);
}
export async function savePrefectAttendance(data:FormData){
 const slug=field(data,"slug"),sessionId=field(data,"session_id");
 const ids=[...new Set(data.getAll("student_id").filter((v):v is string=>typeof v==="string"&&/^[0-9a-f-]{36}$/i.test(v)))];
 const allowed=["present","absent","late","justified","early_departure"];
 if(!slug||!/^[0-9a-f-]{36}$/i.test(sessionId)||!ids.length||ids.length>1000)redirect(`/dashboard/${encodeURIComponent(slug)}/prefect`);
 const {supabase,user,institution}=await context(slug);const db=supabase as unknown as {from:(table:string)=>any};
 const {data:session}=await db.from("prefect_attendance_sessions").select("id,division_id,held_on,status").eq("id",sessionId).eq("institution_id",institution.id).maybeSingle();
 if(!session||session.status!=="open")redirect(`/dashboard/${slug}/prefect/attendance/${sessionId}?error=session`);
 const rows=[];for(const id of ids){const status=field(data,`status_${id}`),note=field(data,`note_${id}`);if(!allowed.includes(status)||note.length>500)redirect(`/dashboard/${slug}/prefect/attendance/${sessionId}?error=invalid`);rows.push({institution_id:institution.id,session_id:sessionId,student_id:id,status,note:note||null,recorded_by:user.id,recorded_at:new Date().toISOString()});}
 const {error}=await db.from("prefect_attendance_records").upsert(rows,{onConflict:"institution_id,session_id,student_id"});
 if(error)redirect(`/dashboard/${slug}/prefect/attendance/${sessionId}?error=save`);
 revalidatePath(`/dashboard/${slug}/prefect/attendance/${sessionId}`);redirect(`/dashboard/${slug}/prefect/attendance/${sessionId}?saved=1`);
}
