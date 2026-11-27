import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";
export const runtime="nodejs";
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
 const files=Array.isArray(data.storage_files)?data.storage_files:[];let total=0;const exportFiles=[];
 for(const item of files){
  const size=Number(item.byte_size??0);total+=size;
  if(!Number.isSafeInteger(size)||size<1||size>10485760||total>104857600)return new Response("El respaldo supera el límite de exportación de 100 MB",{status:413});
  const {data:blob,error:downloadError}=await supabase.storage.from(item.bucket_id).download(item.object_path);
  if(downloadError||!blob)return new Response("No se pudo incluir uno de los archivos privados del respaldo",{status:424});
  const bytes=Buffer.from(await blob.arrayBuffer());
  if(bytes.byteLength!==size)return new Response("El tamaño del archivo no coincide con el manifiesto",{status:409});
  exportFiles.push({...item,content_base64:bytes.toString("base64")});
 }
 const packageData={...data,storage_files:exportFiles,storage_payload_included:true};
 const safeDate=String(data.created_at??new Date().toISOString()).slice(0,10);
 return new Response(JSON.stringify(packageData),{status:200,headers:{"Content-Type":"application/json; charset=utf-8","Content-Disposition":"attachment; filename=\"EDUNEXA-respaldo-"+safeDate+".json\"","Cache-Control":"private, no-store"}});
}
