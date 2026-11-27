"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function value(data: FormData, key: string) {
  const item = data.get(key);
  return typeof item === "string" ? item.trim() : "";
}

export type ClassroomSettingsResult = { ok: boolean; message: string };

export async function updateTeacherOwnedClassroom(formData: FormData): Promise<ClassroomSettingsResult> {
  const slug = value(formData, "slug");
  const classroomId = value(formData, "classroom_id");
  const title = value(formData, "title");
  const description = value(formData, "description");

  if (!slug || !/^[0-9a-f-]{36}$/i.test(classroomId) || title.length < 3 || title.length > 160 || description.length > 2000) {
    return { ok: false, message: "Revisá el nombre y la descripción del aula." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("update_teacher_owned_classroom", {
    p_classroom_id: classroomId,
    p_title: title,
    p_description: description || null,
  });
  if (error) return { ok: false, message: "No se pudieron guardar los cambios. Solo el docente titular puede modificar estos datos." };

  revalidatePath(`/dashboard/${slug}/classroom`);
  revalidatePath(`/dashboard/${slug}/classroom/${classroomId}`);
  revalidatePath(`/dashboard/${slug}/classroom/${classroomId}/settings`);
  return { ok: true, message: "La configuración del aula se actualizó correctamente." };
}

export async function updateTeacherClassroomPreferences(formData: FormData): Promise<ClassroomSettingsResult> {
  const slug = value(formData, "slug");
  const classroomId = value(formData, "classroom_id");
  const accentTheme = value(formData, "accent_theme");
  const layoutDensity = value(formData, "layout_density");
  const defaultSection = value(formData, "default_section");
  const showHeaderStats = value(formData, "show_header_stats") === "on";
  if (!slug || !/^[0-9a-f-]{36}$/i.test(classroomId)
    || !["indigo", "ocean", "emerald", "sunset", "violet"].includes(accentTheme)
    || !["comfortable", "compact"].includes(layoutDensity)
    || !["news", "work", "people", "attendance", "grades"].includes(defaultSection)) {
    return { ok: false, message: "Revisá las preferencias visuales del aula." };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await supabase.rpc("update_teacher_classroom_preferences", {
    p_classroom_id: classroomId,
    p_accent_theme: accentTheme,
    p_layout_density: layoutDensity,
    p_default_section: defaultSection,
    p_show_header_stats: showHeaderStats,
  });
  if (error) return { ok: false, message: "No se pudieron guardar las preferencias. Verificá tu acceso al aula." };
  revalidatePath(`/dashboard/${slug}/classroom/${classroomId}`);
  revalidatePath(`/dashboard/${slug}/classroom/${classroomId}/settings`);
  return { ok: true, message: "Tus preferencias del aula se guardaron correctamente." };
}
