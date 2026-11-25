"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function saveInstitutionalProfile(formData:FormData) {
  const slug=String(formData.get("slug")??"").trim();
  const displayName=String(formData.get("display_name")??"").trim();
  const phone=String(formData.get("phone")??"").trim();
  const address=String(formData.get("address")??"").trim();
  const avatarStyle=String(formData.get("avatar_style")??"neutral");
  const file=formData.get("photo");
  if(!/^[a-z0-9-]{2,80}$/i.test(slug)||displayName.length>120||phone.length>40||address.length>240||!["neutral","masculino","femenino"].includes(avatarStyle)) redirect(`/dashboard/${encodeURIComponent(slug)}/profile?error=invalid`);
  const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect("/login");
  const {data:institution}=await supabase.from("institutions").select("id").eq("slug",slug).maybeSingle(); if(!institution) redirect("/dashboard");
  const {data:membership}=await supabase.from("memberships").select("id").eq("institution_id",institution.id).eq("user_id",user.id).eq("status","active").maybeSingle(); if(!membership) redirect("/dashboard");
  const {data:roles}=await supabase.from("membership_roles").select("roles(key)").eq("membership_id",membership.id).eq("institution_id",institution.id);
  if(!(roles??[]).some(row=>["institution_admin","administrative","director","prefect"].includes(row.roles?.key??""))) redirect(`/dashboard/${slug}`);
  const {data:existing}=await supabase.from("profiles").select("avatar_path").eq("id",user.id).maybeSingle();
  let avatarPath:string|undefined;
  if(file instanceof File&&file.size>0){
    const ext=new Map([["image/jpeg","jpg"],["image/png","png"],["image/webp","webp"]]).get(file.type);
    if(!ext||file.size>5*1024*1024) redirect(`/dashboard/${slug}/profile?error=photo`);
    const bytes=new Uint8Array(await file.arrayBuffer());
    const valid=(ext==="jpg"&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)||(ext==="png"&&bytes.length>=8&&bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10)||(ext==="webp"&&bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP");
    if(!valid) redirect(`/dashboard/${slug}/profile?error=photo`);
    avatarPath=`${user.id}/${randomUUID()}.${ext}`;
    const {error}=await supabase.storage.from("teacher-profile-photos").upload(avatarPath,file,{contentType:file.type,upsert:false});
    if(error) redirect(`/dashboard/${slug}/profile?error=upload`);
  }
  const update:{display_name:string|null;phone:string|null;address:string|null;avatar_style:string;avatar_path?:string}={display_name:displayName||null,phone:phone||null,address:address||null,avatar_style:avatarStyle};
  if(avatarPath) update.avatar_path=avatarPath;
  const {error}=await supabase.from("profiles").update(update).eq("id",user.id);
  if(error){if(avatarPath) await supabase.storage.from("teacher-profile-photos").remove([avatarPath]);redirect(`/dashboard/${slug}/profile?error=save`);}
  if(avatarPath&&existing?.avatar_path&&existing.avatar_path!==avatarPath&&existing.avatar_path.startsWith(`${user.id}/`)) await supabase.storage.from("teacher-profile-photos").remove([existing.avatar_path]);
  revalidatePath(`/dashboard/${slug}/profile`); revalidatePath(`/dashboard/${slug}`);
  redirect(`/dashboard/${slug}/profile?saved=1`);
}
