import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";
type Context={params:Promise<{slug:string;backupId:string}>};
export async function GET(_request:Request,{params}:Context){
 const {slug,backupId}=await params;const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();
 if(!user)return new Response("No autorizado",{status:401});
 const {data:institution}=await supabase.from("institutions").select("id,slug").eq("slug",slug).maybeSingle();
 if(!institution)return new Response("Institución no encontrada",{status:404});
 const {data:membership}=await supabase.from("memberships").select("id").eq("institution_id",institution.id).eq("user_id",user.id).eq("status","active").maybeSingle();
 if(!membership)return new Response("No autorizado",{status:403});
 const permissions=await getMembershipPermissions(supabase,membership.id);if(!permissions.has("institution.manage"))return new Response("No autorizado",{status:403});
 const {data,error}=await supabase.rpc("get_academic_year_backup",{p_institution_id:institution.id,p_backup_id:backupId});
 if(error||!data)return new Response("Respaldo no disponible",{status:404});
 const safeDate=String(data.created_at??new Date().toISOString()).slice(0,10);
 return new Response(JSON.stringify(data,null,2),{status:200,headers:{"Content-Type":"application/json; charset=utf-8","Content-Disposition":`attachment; filename="EDUNEXA-respaldo-${safeDate}.json"`,"Cache-Control":"private, no-store"}});
}
