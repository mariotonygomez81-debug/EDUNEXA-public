"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";
function field(d:FormData,k:string){const v=d.get(k);return typeof v==="string"?v.trim():"";}
async function adminContext(slug:string,permission="institution.manage"){
 const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");
 const {data:institution}=await supabase.from("institutions").select("id").eq("slug",slug).maybeSingle();if(!institution)redirect("/dashboard");
 const {data:membership}=await supabase.from("memberships").select("id").eq("institution_id",institution.id).eq("user_id",user.id).eq("status","active").maybeSingle();if(!membership)redirect("/dashboard");
 const permissions=await getMembershipPermissions(supabase,membership.id);if(!permissions.has(permission))redirect(`/dashboard/${encodeURIComponent(slug)}`);
 return {supabase,institution};
}
export async function saveInstitutionProfile(d:FormData){
 const slug=field(d,"slug");const {supabase,institution}=await adminContext(slug);
 const {error}=await supabase.rpc("update_institution_profile",{p_institution_id:institution.id,p_display_name:field(d,"display_name"),p_legal_name:field(d,"legal_name"),p_tax_id:field(d,"tax_id")||null,p_contact_email:field(d,"contact_email")||null,p_contact_phone:field(d,"contact_phone")||null,p_address_line:field(d,"address_line")||null,p_city:field(d,"city")||null,p_province:field(d,"province")||null,p_country:field(d,"country")||"Argentina",p_website_url:field(d,"website_url")||null,p_timezone:field(d,"timezone"),p_locale:field(d,"locale"),p_expected_updated_at:field(d,"expected_updated_at")});
 if(error)redirect(`/dashboard/${slug}/admin/configuracion?error=profile`);revalidatePath(`/dashboard/${slug}/admin`);redirect(`/dashboard/${slug}/admin/configuracion?saved=profile`);
}
export async function saveEducationLevel(d:FormData){
 const slug=field(d,"slug");const {supabase,institution}=await adminContext(slug);
 const {error}=await supabase.rpc("save_education_level",{p_institution_id:institution.id,p_level_id:field(d,"level_id")||null,p_name:field(d,"name"),p_code:field(d,"code")||null,p_sort_order:Number(field(d,"sort_order"))});
 if(error)redirect(`/dashboard/${slug}/admin/configuracion?error=level`);revalidatePath(`/dashboard/${slug}/admin/configuracion`);revalidatePath(`/dashboard/${slug}/settings/academic-structure`);redirect(`/dashboard/${slug}/admin/configuracion?saved=level`);
}
export async function deleteEducationLevel(d:FormData){
 const slug=field(d,"slug");const {supabase,institution}=await adminContext(slug);
 const {error}=await supabase.rpc("delete_education_level",{p_institution_id:institution.id,p_level_id:field(d,"level_id")});
 if(error)redirect(`/dashboard/${slug}/admin/configuracion?error=level_in_use`);revalidatePath(`/dashboard/${slug}/admin/configuracion`);redirect(`/dashboard/${slug}/admin/configuracion?saved=level_deleted`);
}
export async function saveEducationOrientation(d:FormData){
 const slug=field(d,"slug");const {supabase,institution}=await adminContext(slug);
 const {error}=await supabase.rpc("save_education_orientation",{p_institution_id:institution.id,p_education_level_id:field(d,"education_level_id"),p_orientation_id:field(d,"orientation_id")||null,p_name:field(d,"name"),p_code:field(d,"code")||null,p_is_active:d.get("is_active")==="on" || !d.has("orientation_id")});
 if(error)redirect(`/dashboard/${slug}/admin/configuracion?error=orientation`);revalidatePath(`/dashboard/${slug}/admin/configuracion`);revalidatePath(`/dashboard/${slug}/settings/academic-structure`);redirect(`/dashboard/${slug}/admin/configuracion?saved=orientation`);
}
export async function deleteEducationOrientation(d:FormData){
 const slug=field(d,"slug");const {supabase,institution}=await adminContext(slug);
 const {error}=await supabase.rpc("delete_education_orientation",{p_institution_id:institution.id,p_orientation_id:field(d,"orientation_id")});
 if(error)redirect(`/dashboard/${slug}/admin/configuracion?error=orientation_in_use`);revalidatePath(`/dashboard/${slug}/admin/configuracion`);redirect(`/dashboard/${slug}/admin/configuracion?saved=orientation_deleted`);
}
export type StudentImportRow={student_number:string;first_name:string;last_name:string;birth_date:string|null;email:string|null};
export async function bulkImportStudents(slug:string,academicYearId:string,divisionId:string,rows:StudentImportRow[]){
 if(!/^[0-9a-f-]{36}$/i.test(academicYearId)||!/^[0-9a-f-]{36}$/i.test(divisionId)||!Array.isArray(rows)||rows.length<1||rows.length>500)redirect(`/dashboard/${slug}/admin/importacion?error=invalid`);
 const clean=rows.map(r=>({student_number:String(r.student_number??"").trim().slice(0,40),first_name:String(r.first_name??"").trim().slice(0,100),last_name:String(r.last_name??"").trim().slice(0,100),birth_date:r.birth_date?String(r.birth_date).trim():null,email:r.email?String(r.email).trim().toLowerCase().slice(0,254):null}));
 if(clean.some(r=>!r.student_number||r.first_name.length<2||r.last_name.length<2||(r.birth_date&&!/^\d{4}-\d{2}-\d{2}$/.test(r.birth_date))))redirect(`/dashboard/${slug}/admin/importacion?error=invalid`);
 if(new Set(clean.map(r=>r.student_number.toLowerCase())).size!==clean.length)redirect(`/dashboard/${slug}/admin/importacion?error=duplicates`);
 const {supabase,institution}=await adminContext(slug,"students.manage");const {data,error}=await supabase.rpc("import_students_to_division",{p_institution_id:institution.id,p_academic_year_id:academicYearId,p_division_id:divisionId,p_rows:clean});
 if(error)redirect(`/dashboard/${slug}/admin/importacion?error=import`);revalidatePath(`/dashboard/${slug}/students`);revalidatePath(`/dashboard/${slug}/admin`);redirect(`/dashboard/${slug}/admin/importacion?imported=${Number(data?.imported??clean.length)}`);
}
export async function createAcademicYearBackup(d:FormData){
 const slug=field(d,"slug");const {supabase,institution}=await adminContext(slug);const {data,error}=await supabase.rpc("create_academic_year_backup",{p_institution_id:institution.id,p_academic_year_id:field(d,"academic_year_id")});
 if(error||!data)redirect(`/dashboard/${slug}/admin/respaldo?error=backup`);revalidatePath(`/dashboard/${slug}/admin/respaldo`);redirect(`/dashboard/${slug}/admin/respaldo?created=${data}&year=${field(d,"academic_year_id")}`);
}
export async function prepareAcademicYearBackupStorageRestore(slug:string,yearId:string,snapshot:Record<string,unknown>){
 const {supabase,institution}=await adminContext(slug);
 const {data,error}=await supabase.rpc("create_academic_backup_storage_restore_intents",{p_institution_id:institution.id,p_academic_year_id:yearId,p_snapshot:snapshot});
 if(error)return {ok:false,message:"No se pudo autorizar la restauración de adjuntos."};
 return {ok:true,count:Number(data??0)};
}
export async function finishAcademicYearBackupRestore(slug:string,yearId:string,snapshot:Record<string,unknown>){
 const {supabase,institution}=await adminContext(slug);
 const {data,error}=await supabase.rpc("restore_academic_year_backup_package",{p_institution_id:institution.id,p_academic_year_id:yearId,p_snapshot:snapshot});
 if(error||!data?.restored)return {ok:false,message:"No se pudo incorporar el paquete de datos."};
 const files=Array.isArray(snapshot.storage_files)?snapshot.storage_files as {bucket_id:string;object_path:string}[]:[];
 for(const file of files){const {error:completeError}=await supabase.rpc("complete_academic_backup_storage_restore_intent",{p_bucket_id:file.bucket_id,p_object_path:file.object_path});if(completeError)return {ok:false,message:"Los datos se restauraron, pero quedaron adjuntos pendientes de finalizar."};}
 revalidatePath("/dashboard/"+slug+"/admin/respaldo");revalidatePath("/dashboard/"+slug+"/students");
 return {ok:true,files:files.length};
}
export async function restoreAcademicYearBackup(d:FormData){
 const slug=field(d,"slug"),yearId=field(d,"academic_year_id"),file=d.get("backup_file");
 if(!(file instanceof File)||file.size<1||file.size>25*1024*1024)redirect(`/dashboard/${slug}/admin/respaldo?error=file`);
 let snapshot:unknown;try{snapshot=JSON.parse(await file.text());}catch{redirect(`/dashboard/${slug}/admin/respaldo?error=format`);}
 const {supabase,institution}=await adminContext(slug);const {data,error}=await supabase.rpc("restore_academic_year_backup_package",{p_institution_id:institution.id,p_academic_year_id:yearId,p_snapshot:snapshot});
 if(error||!data?.restored)redirect(`/dashboard/${slug}/admin/respaldo?error=restore`);revalidatePath(`/dashboard/${slug}/admin`);revalidatePath(`/dashboard/${slug}/students`);redirect(`/dashboard/${slug}/admin/respaldo?restored=1`);
}
