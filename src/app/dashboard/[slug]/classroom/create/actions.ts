"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function value(formData: FormData, key: string) {
  const item = formData.get(key);
  return typeof item === "string" ? item.trim() : "";
}

export type CreateClassroomResult = { ok: boolean; message: string; classroomId?: string };

export async function createTeacherClassroom(formData: FormData): Promise<CreateClassroomResult> {
  const slug = value(formData, "slug");
  const assignment = value(formData, "assignment");
  const [divisionId = "", subjectId = ""] = assignment.split(":");
  const title = value(formData, "title");
  const description = value(formData, "description");

  if (!slug || !/^[0-9a-f-]{36}$/i.test(divisionId) ||
      (subjectId && !/^[0-9a-f-]{36}$/i.test(subjectId)) ||
      title.length < 3 || title.length > 160 || description.length > 2000) {
    return { ok: false, message: "Revisá la materia, la división y el nombre del aula (entre 3 y 160 caracteres)." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: institution } = await supabase.from("institutions")
    .select("id").eq("slug", slug).maybeSingle();
  if (!institution) return { ok: false, message: "No se encontró la institución." };

  const { data: classroomId, error } = await supabase.rpc("create_teacher_virtual_classroom", {
    p_institution_id: institution.id,
    p_division_id: divisionId,
    p_course_subject_id: subjectId || null,
    p_title: title,
    p_description: description || null,
  });

  if (error || !classroomId) {
    const message = error?.code === "42501"
      ? "La división o materia ya no está dentro de tus asignaciones vigentes."
      : error?.code === "23503"
        ? "La materia seleccionada no corresponde a esa división."
        : "No se pudo crear el aula. Verificá tus permisos e intentá nuevamente.";
    return { ok: false, message };
  }

  revalidatePath(`/dashboard/${slug}/classroom`);
  return { ok: true, message: "Aula creada correctamente.", classroomId: String(classroomId) };
}
