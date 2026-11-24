"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";

const categories = ["jornada", "feria", "examen", "previa", "acto", "reunion", "feriado", "otro"];
const audiences = ["all", "staff", "teachers", "students", "families", "prefects"];

export async function createAcademicEvent(formData: FormData) {
  const slug = String(formData.get("slug") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const category = String(formData.get("category") ?? "");
  const startsAt = String(formData.get("starts_at") ?? "");
  const endsAt = String(formData.get("ends_at") ?? "");
  const audience = String(formData.get("audience") ?? "all");
  const location = String(formData.get("location") ?? "").trim();

  if (!/^[a-z0-9-]{2,80}$/i.test(slug) || title.length < 3 || title.length > 160 ||
      description.length > 5000 || !categories.includes(category) ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(startsAt) ||
      (endsAt && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(endsAt)) ||
      (endsAt && endsAt < startsAt) || !audiences.includes(audience) || location.length > 160) {
    return { ok: false, message: "Revisá los datos del evento." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Tu sesión venció. Volvé a ingresar." };
  const { data: institution } = await supabase.from("institutions").select("id")
    .eq("slug", slug).eq("status", "active").maybeSingle();
  if (!institution) return { ok: false, message: "No se encontró la institución." };
  const { data: membership } = await supabase.from("memberships").select("id")
    .eq("institution_id", institution.id).eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership) return { ok: false, message: "No tenés una membresía activa." };
  const permissions = await getMembershipPermissions(supabase, membership.id);
  if (!permissions.has("academic_calendar.manage")) return { ok: false, message: "Tu perfil no puede administrar el calendario." };

  const { error } = await supabase.from("academic_calendar_events").insert({
    institution_id: institution.id, created_by_membership_id: membership.id,
    title, description, category, starts_at: new Date(startsAt + ":00-03:00").toISOString(),
    ends_at: endsAt ? new Date(endsAt + ":00-03:00").toISOString() : null,
    audience, location: location || null,
  });
  if (error) return { ok: false, message: "No se pudo guardar el evento. Intentá nuevamente." };
  revalidatePath("/dashboard/" + slug + "/calendar");
  return { ok: true, message: "Evento publicado en el calendario institucional." };
}
