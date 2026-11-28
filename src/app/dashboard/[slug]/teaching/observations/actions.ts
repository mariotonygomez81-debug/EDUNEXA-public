"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";
function field(data:FormData,key:string){const v=data.get(key);return typeof v==="string"?v.trim():"";}
export async function saveStudentPeriodObservation(data:FormData){
 const slug=field(data,"slug"),divisionId=field(data,"division_id"),periodId=field(data,"period_id"),studentId=field(data,"student_id"),observation=field(data,"observation");
 const base="/dashboard/"+encodeURIComponent(slug)+"/teaching/observations";
 const suffix="?division="+divisionId+"&period="+periodId;
 if(!slug||![divisionId,periodId,studentId].every(x=>/^[0-9a-f-]{36}$/i.test(x))||!observation||observation.length>2000)redirect(base+"?error=save");
 const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");
 const {data:institution}=await supabase.from("institutions").select("id").eq("slug",slug).eq("status","active").maybeSingle();if(!institution)redirect("/dashboard");
 const {data:membership}=await supabase.from("memberships").select("id").eq("institution_id",institution.id).eq("user_id",user.id).eq("status","active").maybeSingle();if(!membership)redirect("/dashboard");
 const permissions=await getMembershipPermissions(supabase,membership.id);
 const {data:roles}=await supabase.from("membership_roles").select("roles(key)").eq("membership_id",membership.id).eq("institution_id",institution.id);
 if(!permissions.has("grades.manage")||!(roles??[]).some(x=>x.roles?.key==="teacher"))redirect(base+"?error=save"+suffix);
 const today=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Argentina/Buenos_Aires"}).format(new Date());
 const {data:assignments}=await supabase.from("staff_assignments").select("division_id,course_subject_id,starts_on,ends_on,assignment_type").eq("institution_id",institution.id).eq("membership_id",membership.id);
 const active=(assignments??[]).filter(x=>x.assignment_type==="teacher"&&(!x.starts_on||x.starts_on<=today)&&(!x.ends_on||x.ends_on>=today));
 let allowed=active.some(x=>x.division_id===divisionId);
 if(!allowed){const ids=active.map(x=>x.course_subject_id).filter((x):x is string=>Boolean(x));const {data:subjects}=ids.length?await supabase.from("course_subjects").select("course_id").eq("institution_id",institution.id).in("id",ids):{data:[] as any[]};const courses=[...new Set((subjects??[]).map(x=>x.course_id))];const {data:div}=await supabase.from("divisions").select("course_id").eq("institution_id",institution.id).eq("id",divisionId).maybeSingle();allowed=Boolean(div&&courses.includes(div.course_id));}
 const [{data:period},{data:division},{data:enrollment}]=await Promise.all([
  supabase.from("grading_periods").select("id,academic_year_id,status").eq("institution_id",institution.id).eq("id",periodId).maybeSingle(),
  supabase.from("divisions").select("academic_year_id").eq("institution_id",institution.id).eq("id",divisionId).maybeSingle(),
  supabase.from("enrollments").select("id").eq("institution_id",institution.id).eq("division_id",divisionId).eq("student_id",studentId).eq("status","active").maybeSingle()
 ]);
 if(!allowed||!period||period.status!=="open"||!division||period.academic_year_id!==division.academic_year_id||!enrollment)redirect(base+"?error=save"+suffix);
 const {data:existing,error}=await supabase.from("student_period_observations").select("id,author_membership_id").eq("institution_id",institution.id).eq("student_id",studentId).eq("grading_period_id",periodId).maybeSingle();
 if(error)redirect(base+"?error=save"+suffix);
 let result;
 if(existing){if(existing.author_membership_id!==membership.id)redirect(base+"?error=owned"+suffix);result=await supabase.from("student_period_observations").update({observation,updated_at:new Date().toISOString()}).eq("id",existing.id).eq("author_membership_id",membership.id);}
 else result=await supabase.from("student_period_observations").insert({institution_id:institution.id,student_id:studentId,grading_period_id:periodId,author_membership_id:membership.id,observation});
 if(result.error)redirect(base+"?error=save"+suffix);
 revalidatePath(base);revalidatePath("/dashboard/"+slug+"/report-cards");redirect(base+"?saved=1&division="+divisionId+"&period="+periodId);
}
