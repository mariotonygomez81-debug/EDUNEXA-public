"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function field(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function classroomContext(slug: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: institution } = await supabase
    .from("institutions").select("id").eq("slug", slug).maybeSingle();
  if (!institution) redirect("/dashboard");

  const { data: membership } = await supabase
    .from("memberships").select("id")
    .eq("institution_id", institution.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) redirect("/dashboard");

  return { supabase };
}

export async function createClassroomMaterial(formData: FormData): Promise<{ok:boolean;message:string}> {
 const slug=field(formData,"slug"), classroomId=field(formData,"classroom_id"), title=field(formData,"title"), body=field(formData,"body"), publish=field(formData,"publish")==="on";
 if(!slug||!/^[0-9a-f-]{36}$/i.test(classroomId)||title.length<3||title.length>160||body.length>20000) return {ok:false,message:"Revisá el título y el contenido del material."};
 const {supabase}=await classroomContext(slug);
 const {error}=await supabase.rpc("create_classroom_material",{p_classroom_id:classroomId,p_title:title,p_body:body||null,p_publish:publish});
 if(error) return {ok:false,message:"No se pudo publicar el material. Verificá tus permisos e intentá nuevamente."};
 revalidatePath(`/dashboard/${slug}/classroom`); revalidatePath(`/dashboard/${slug}/classroom/${classroomId}`);
 return {ok:true,message:"Material guardado correctamente."};
}
export async function createClassroomAssignment(formData: FormData): Promise<{ok:boolean;message:string}> {
 const slug=field(formData,"slug"), classroomId=field(formData,"classroom_id"), title=field(formData,"title"), instructions=field(formData,"instructions"), dueRaw=field(formData,"due_at"), gradingMode=field(formData,"grading_mode"), publish=field(formData,"publish")==="on";
 const maxScore=gradingMode==="graded"?100:gradingMode==="ungraded"?null:NaN, dueAt=dueRaw?new Date(dueRaw):null;
 if(!slug||!/^[0-9a-f-]{36}$/i.test(classroomId)||title.length<3||title.length>160||instructions.length>20000||(maxScore!==100&&maxScore!==null)||(dueRaw&&(!dueAt||Number.isNaN(dueAt.getTime())))) return {ok:false,message:"Revisá el título, la fecha límite y el puntaje máximo."};
 const {supabase}=await classroomContext(slug);
 const {error}=await supabase.rpc("create_classroom_assignment",{p_classroom_id:classroomId,p_title:title,p_instructions:instructions||null,p_due_at:dueAt?.toISOString()??null,p_max_score:maxScore,p_publish:publish});
 if(error) return {ok:false,message:"No se pudo crear la actividad. Verificá tus permisos e intentá nuevamente."};
 revalidatePath(`/dashboard/${slug}/classroom`); revalidatePath(`/dashboard/${slug}/classroom/${classroomId}`);
 return {ok:true,message:"Actividad creada correctamente."};
}
export async function submitClassroomAssignment(formData: FormData): Promise<{ok:boolean;message:string}> {
 const slug=field(formData,"slug"),classroomId=field(formData,"classroom_id"),assignmentId=field(formData,"assignment_id"),body=field(formData,"body") || "Entrega realizada mediante archivos adjuntos.";
 if(!slug||!/^[0-9a-f-]{36}$/i.test(classroomId)||!/^[0-9a-f-]{36}$/i.test(assignmentId)||body.length>20000)return {ok:false,message:"La respuesta no puede superar los 20.000 caracteres."};
 const {supabase}=await classroomContext(slug);
 const {error}=await supabase.rpc("submit_classroom_assignment",{p_assignment_id:assignmentId,p_body:body});
 if(error)return {ok:false,message:"No se pudo enviar la actividad. Verificá que siga habilitada para entregas."};
 revalidatePath(`/dashboard/${slug}/classroom/${classroomId}`);
 return {ok:true,message:"Actividad entregada correctamente."};
}
export async function gradeClassroomSubmission(formData: FormData): Promise<{ok:boolean;message:string}> {
 const slug=field(formData,"slug"),classroomId=field(formData,"classroom_id"),submissionId=field(formData,"submission_id"),scoreRaw=field(formData,"score"),feedback=field(formData,"feedback"),score=scoreRaw===""?null:Number(scoreRaw);
 if(!slug||!/^[0-9a-f-]{36}$/i.test(classroomId)||!/^[0-9a-f-]{36}$/i.test(submissionId)||(score!==null&&(!Number.isFinite(score)||score<0||score>100))||feedback.length>5000|| (score===null&&!feedback.trim()))return {ok:false,message:"Ingresá una nota válida o una devolución para una actividad sin puntaje."};
 const {supabase}=await classroomContext(slug);
 const {error}=await supabase.rpc("grade_classroom_submission",{p_submission_id:submissionId,p_score:score,p_feedback:feedback||null});
 if(error)return {ok:false,message:"No se pudo guardar la calificación. Verificá el puntaje máximo y tus permisos."};
 revalidatePath(`/dashboard/${slug}/classroom/${classroomId}`);
 return {ok:true,message:"Calificación y devolución guardadas."};
}
export async function updateClassroomSubmissionReviewStatus(formData: FormData): Promise<{ok:boolean;message:string}> {
 const slug=field(formData,"slug"),classroomId=field(formData,"classroom_id"),submissionId=field(formData,"submission_id"),statusRaw=field(formData,"review_status"),reviewStatus=statusRaw==="pending"?null:statusRaw;
 if(!slug||!/^[0-9a-f-]{36}$/i.test(classroomId)||!/^[0-9a-f-]{36}$/i.test(submissionId)||(reviewStatus!==null&&!["visto","aprobado","desaprobado","corregir"].includes(reviewStatus)))return {ok:false,message:"Seleccioná un estado de revisión válido."};
 const {supabase}=await classroomContext(slug);
 const {error}=await supabase.rpc("set_classroom_submission_review_status",{p_submission_id:submissionId,p_review_status:reviewStatus});
 if(error)return {ok:false,message:"No se pudo actualizar el estado de revisión."};
 revalidatePath(`/dashboard/${slug}/classroom/${classroomId}`);
 return {ok:true,message:"Estado de revisión actualizado."};
}
export async function rotateClassroomInvite(formData: FormData): Promise<{ok:boolean;message:string}> {
 const slug=field(formData,"slug"), classroomId=field(formData,"classroom_id");
 if(!slug||!/^[0-9a-f-]{36}$/i.test(classroomId)) return {ok:false,message:"No se pudo identificar el aula."};
 const {supabase}=await classroomContext(slug);
 const {error}=await supabase.rpc("rotate_classroom_invite",{p_classroom_id:classroomId});
 if(error) return {ok:false,message:"No se pudo renovar la invitación."};
 revalidatePath(`/dashboard/${slug}/classroom/${classroomId}`);
 return {ok:true,message:"Invitación renovada correctamente."};
}
export async function updateClassroomMaterial(formData: FormData): Promise<{ok:boolean;message:string}> {
 const slug=field(formData,"slug"), classroomId=field(formData,"classroom_id"), materialId=field(formData,"material_id"), title=field(formData,"title"), body=field(formData,"body"), publish=field(formData,"publish")==="on";
 if(!slug||!/^[0-9a-f-]{36}$/i.test(classroomId)||!/^[0-9a-f-]{36}$/i.test(materialId)||title.length<3||title.length>160||body.length>20000) return {ok:false,message:"Revisá el título y el contenido del material."};
 const {supabase}=await classroomContext(slug);
 const {error}=await supabase.rpc("update_classroom_material",{p_classroom_id:classroomId,p_material_id:materialId,p_title:title,p_body:body||null,p_publish:publish});
 if(error) return {ok:false,message:"No se pudo actualizar el material. Puede que no tengas permisos."};
 revalidatePath(`/dashboard/${slug}/classroom/${classroomId}`);
 return {ok:true,message:"Material actualizado correctamente."};
}
export async function updateClassroomAssignment(formData: FormData): Promise<{ok:boolean;message:string}> {
 const slug=field(formData,"slug"), classroomId=field(formData,"classroom_id"), assignmentId=field(formData,"assignment_id"), title=field(formData,"title"), instructions=field(formData,"instructions"), dueRaw=field(formData,"due_at"), gradingMode=field(formData,"grading_mode"), publish=field(formData,"publish")==="on";
 const maxScore=gradingMode==="graded"?100:gradingMode==="ungraded"?null:NaN, dueAt=dueRaw?new Date(dueRaw):null;
 if(!slug||!/^[0-9a-f-]{36}$/i.test(classroomId)||!/^[0-9a-f-]{36}$/i.test(assignmentId)||title.length<3||title.length>160||instructions.length>20000||(maxScore!==100&&maxScore!==null)||(dueRaw&&(!dueAt||Number.isNaN(dueAt.getTime())))) return {ok:false,message:"Revisá los datos de la actividad."};
 const {supabase}=await classroomContext(slug);
 const {error}=await supabase.rpc("update_classroom_assignment",{p_classroom_id:classroomId,p_assignment_id:assignmentId,p_title:title,p_instructions:instructions||null,p_due_at:dueAt?.toISOString()??null,p_max_score:maxScore,p_publish:publish});
 if(error) return {ok:false,message:"No se pudo actualizar la actividad. Verificá las calificaciones y permisos."};
 revalidatePath(`/dashboard/${slug}/classroom/${classroomId}`);
 return {ok:true,message:"Actividad actualizada correctamente."};
}