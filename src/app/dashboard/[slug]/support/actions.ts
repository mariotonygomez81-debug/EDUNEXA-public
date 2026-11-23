"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function value(formData: FormData, key: string) {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim() : "";
}

export async function createTicket(formData: FormData) {
  const slug = value(formData, "slug");
  const title = value(formData, "title");
  const description = value(formData, "description");
  const requestedCategory = value(formData, "category");
  const moduleKey = value(formData, "module_key") || "other";
  const stepsToReproduce = value(formData, "steps_to_reproduce");
  const occurredAt = value(formData, "occurred_at");
  const allowedCategories = ["bug", "access", "data", "performance", "question", "other"] as const;
  const allowedModules = ["students", "attendance", "grades", "classroom", "announcements", "calendar", "users", "reports", "access", "settings", "other"] as const;
  const category = allowedCategories.includes(requestedCategory as (typeof allowedCategories)[number])
    ? requestedCategory as (typeof allowedCategories)[number]
    : "other";

  if (!slug || title.length < 5 || title.length > 180 || description.length < 10 || description.length > 10000 ||
      !allowedModules.includes(moduleKey as (typeof allowedModules)[number]) ||
      stepsToReproduce.length > 4000 ||
      (occurredAt && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(occurredAt))) {
    redirect(`/dashboard/${encodeURIComponent(slug)}/support?error=invalid`);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: institution } = await supabase
    .from("institutions")
    .select("id,slug")
    .eq("slug", slug)
    .maybeSingle();

  if (!institution) redirect("/dashboard");

  const { data: membership } = await supabase
    .from("memberships")
    .select("id")
    .eq("institution_id", institution.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership) redirect("/dashboard");

  const { data: ticket, error } = await supabase
    .from("support_tickets")
    .insert({
      institution_id: institution.id,
      created_by_membership_id: membership.id,
      title,
      description,
      module_key: moduleKey,
      steps_to_reproduce: stepsToReproduce || null,
      occurred_at: occurredAt || null,
      category,
    })
    .select("id")
    .single();

  if (error || !ticket) {
    redirect(`/dashboard/${slug}/support?error=save`);
  }

  revalidatePath(`/dashboard/${slug}/support`);
  redirect(`/dashboard/${slug}/support/${ticket.id}`);
}

export async function addTicketMessage(formData: FormData) {
  const slug = value(formData, "slug");
  const ticketId = value(formData, "ticket_id");
  const body = value(formData, "body");

  if (!slug || !ticketId || body.length < 1 || body.length > 20000) {
    redirect(`/dashboard/${encodeURIComponent(slug)}/support?error=invalid`);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: institution } = await supabase
    .from("institutions")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (!institution) redirect("/dashboard");

  const { data: ticket } = await supabase
    .from("support_tickets")
    .select("id,institution_id,status")
    .eq("id", ticketId)
    .eq("institution_id", institution.id)
    .maybeSingle();

  if (!ticket) redirect(`/dashboard/${slug}/support`);
  if (ticket.status === "closed" || ticket.status === "resolved") {
    redirect(`/dashboard/${slug}/support/${ticket.id}?error=closed`);
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("id")
    .eq("institution_id", institution.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership) redirect("/dashboard");

  const { error } = await supabase.from("support_ticket_messages").insert({
    institution_id: institution.id,
    ticket_id: ticket.id,
    author_membership_id: membership.id,
    author_kind: "school_user",
    body,
    is_internal: false,
  });

  if (error) redirect(`/dashboard/${slug}/support/${ticket.id}?error=message`);

  revalidatePath(`/dashboard/${slug}/support/${ticket.id}`);
  redirect(`/dashboard/${slug}/support/${ticket.id}`);
}

export async function updateTicketStatus(formData: FormData) {
  const slug = value(formData, "slug");
  const ticketId = value(formData, "ticket_id");
  const status = value(formData, "status");
  const priority = value(formData, "priority");
  // Global escalation states remain unavailable until the PIE control plane is implemented.
  const allowedStatuses = ["open", "triaged", "in_progress", "waiting_user", "resolved", "closed", "reopened"] as const;
  const transitions: Record<string, readonly string[]> = {
    open: ["triaged", "in_progress", "waiting_user", "resolved"],
    triaged: ["open", "in_progress", "waiting_user", "resolved"],
    in_progress: ["triaged", "waiting_user", "resolved"],
    waiting_user: ["in_progress", "resolved"],
    resolved: ["closed", "reopened"],
    closed: ["reopened"],
    reopened: ["triaged", "in_progress", "waiting_user", "resolved"],
  };
  const allowedPriorities = ["low", "normal", "high", "urgent"] as const;

  if (!slug || !ticketId || !allowedStatuses.includes(status as (typeof allowedStatuses)[number]) ||
      !allowedPriorities.includes(priority as (typeof allowedPriorities)[number])) {
    redirect(`/dashboard/${encodeURIComponent(slug)}/support?error=invalid`);
  }

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

  const { data: roles } = await supabase
    .from("membership_roles").select("roles(key)")
    .eq("membership_id", membership.id);
  if (!(roles ?? []).some((row) => row.roles?.key === "institution_admin")) {
    redirect(`/dashboard/${slug}/support`);
  }

  const { data: currentTicket } = await supabase
    .from("support_tickets")
    .select("status")
    .eq("id", ticketId)
    .eq("institution_id", institution.id)
    .maybeSingle();

  if (!currentTicket || (status !== currentTicket.status && !transitions[currentTicket.status]?.includes(status))) {
    redirect(`/dashboard/${slug}/support/${ticketId}?error=transition`);
  }

  const { data: updatedTicket, error } = await supabase
    .from("support_tickets")
    .update({
      status: status as (typeof allowedStatuses)[number],
      priority: priority as (typeof allowedPriorities)[number],
    })
    .eq("id", ticketId)
    .eq("institution_id", institution.id)
    .eq("status", currentTicket.status)
    .select("id")
    .maybeSingle();

  if (error || !updatedTicket) {
    redirect(`/dashboard/${slug}/support/${ticketId}?error=update`);
  }

  revalidatePath(`/dashboard/${slug}/support`);
  revalidatePath(`/dashboard/${slug}/support/${ticketId}`);
  redirect(`/dashboard/${slug}/support/${ticketId}`);
}

const supportAttachmentMimeTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export async function createSupportTicketAttachmentIntent(
  slug: string,
  ticketId: string,
  originalFilename: string,
  mimeType: string,
  byteSize: number,
) {
  if (!/^[a-z0-9-]{1,80}$/i.test(slug) ||
      !/^[0-9a-f-]{36}$/i.test(ticketId) ||
      !originalFilename || originalFilename.length > 180 ||
      (originalFilename.includes("/") || originalFilename.includes("\\") || [...originalFilename].some((character) => character.charCodeAt(0) < 32)) ||
      !supportAttachmentMimeTypes.includes(mimeType as (typeof supportAttachmentMimeTypes)[number]) ||
      !Number.isInteger(byteSize) || byteSize < 1 || byteSize > 10 * 1024 * 1024) {
    return { ok: false as const, message: "El archivo no cumple los requisitos permitidos." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, message: "La sesión expiró. Volvé a ingresar." };

  const { data: institution } = await supabase
    .from("institutions").select("id").eq("slug", slug).maybeSingle();
  if (!institution) return { ok: false as const, message: "No se encontró la institución." };

  const { data: ticket } = await supabase
    .from("support_tickets").select("id")
    .eq("id", ticketId).eq("institution_id", institution.id).maybeSingle();
  if (!ticket) return { ok: false as const, message: "No tenés acceso a este ticket." };

  const { data, error } = await supabase.rpc("create_support_ticket_attachment_intent", {
    p_ticket_id: ticketId,
    p_original_filename: originalFilename,
    p_mime_type: mimeType,
    p_byte_size: byteSize,
  });
  const intent = data?.[0];
  if (error || !intent) {
    return { ok: false as const, message: "No se pudo preparar la carga del archivo. Verificá que el ticket siga abierto." };
  }

  return {
    ok: true as const,
    attachmentId: intent.attachment_id,
    bucket: intent.storage_bucket,
    path: intent.storage_path,
  };
}

export async function finalizeSupportTicketAttachment(
  slug: string,
  ticketId: string,
  attachmentId: string,
) {
  if (!/^[a-z0-9-]{1,80}$/i.test(slug) ||
      !/^[0-9a-f-]{36}$/i.test(ticketId) ||
      !/^[0-9a-f-]{36}$/i.test(attachmentId)) {
    return { ok: false as const, message: "La solicitud de adjunto no es válida." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, message: "La sesión expiró. Volvé a ingresar." };

  const { data: institution } = await supabase
    .from("institutions").select("id").eq("slug", slug).maybeSingle();
  if (!institution) return { ok: false as const, message: "No se encontró la institución." };

  const { data: ticket } = await supabase
    .from("support_tickets").select("id")
    .eq("id", ticketId).eq("institution_id", institution.id).maybeSingle();
  if (!ticket) return { ok: false as const, message: "No tenés acceso a este ticket." };

  const { data, error } = await supabase.rpc("finalize_support_ticket_attachment", {
    p_attachment_id: attachmentId,
  });
  if (error || !data) {
    return { ok: false as const, message: "El archivo no pudo verificarse. Intentá nuevamente." };
  }

  revalidatePath(`/dashboard/${slug}/support/${ticketId}`);
  return { ok: true as const };
}

