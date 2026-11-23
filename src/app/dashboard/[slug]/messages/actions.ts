"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function field(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function back(slug: string, query: string): never {
  redirect(`/dashboard/${encodeURIComponent(slug)}/messages?${query}`);
}

async function getInstitutionContext(slug: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: institution } = await supabase.from("institutions")
    .select("id").eq("slug", slug).maybeSingle();
  if (!institution) redirect("/dashboard");

  const { data: membership } = await supabase.from("memberships")
    .select("id").eq("institution_id", institution.id)
    .eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership) redirect("/dashboard");

  return { supabase, institution };
}

export async function createDirectConversation(formData: FormData) {
  const slug = field(formData, "slug");
  const recipientMembershipId = field(formData, "recipient_membership_id");
  const subject = field(formData, "subject");

  if (!/^[a-z0-9-]{2,80}$/i.test(slug) ||
      !/^[0-9a-f-]{36}$/i.test(recipientMembershipId) ||
      subject.length > 120) {
    back(slug, "error=invalid");
  }

  const { supabase, institution } = await getInstitutionContext(slug);
  const args = {
    p_institution_id: institution.id,
    p_recipient_membership_id: recipientMembershipId,
    ...(subject ? { p_subject: subject } : {}),
  };
  const { data, error } = await supabase.rpc("create_direct_conversation", args);
  if (error || !data) back(slug, error?.code === "42501" ? "error=scope" : "error=create");

  revalidatePath(`/dashboard/${slug}/messages`);
  redirect(`/dashboard/${slug}/messages/${data}`);
}

export async function sendConversationMessage(formData: FormData) {
  const slug = field(formData, "slug");
  const conversationId = field(formData, "conversation_id");
  const body = field(formData, "body");

  if (!/^[a-z0-9-]{2,80}$/i.test(slug) ||
      !/^[0-9a-f-]{36}$/i.test(conversationId) ||
      body.length < 1 || body.length > 5000) {
    redirect(`/dashboard/${encodeURIComponent(slug)}/messages/${conversationId}?error=invalid`);
  }

  const { supabase, institution } = await getInstitutionContext(slug);
  const { error } = await supabase.rpc("send_conversation_message", {
    p_institution_id: institution.id,
    p_conversation_id: conversationId,
    p_body: body,
  });
  if (error) {
    redirect(`/dashboard/${encodeURIComponent(slug)}/messages/${conversationId}?error=send`);
  }

  revalidatePath(`/dashboard/${slug}/messages`);
  revalidatePath(`/dashboard/${slug}/messages/${conversationId}`);
  redirect(`/dashboard/${slug}/messages/${conversationId}?sent=1`);
}

export async function markConversationRead(formData: FormData) {
  const slug = field(formData, "slug");
  const conversationId = field(formData, "conversation_id");
  if (!/^[a-z0-9-]{2,80}$/i.test(slug) || !/^[0-9a-f-]{36}$/i.test(conversationId)) {
    redirect(`/dashboard/${encodeURIComponent(slug)}/messages?error=invalid`);
  }

  const { supabase, institution } = await getInstitutionContext(slug);
  const { error } = await supabase.rpc("mark_conversation_read", {
    p_institution_id: institution.id,
    p_conversation_id: conversationId,
  });
  if (error) {
    redirect(`/dashboard/${encodeURIComponent(slug)}/messages/${conversationId}?error=read`);
  }

  revalidatePath(`/dashboard/${slug}/messages`);
  revalidatePath(`/dashboard/${slug}/messages/${conversationId}`);
  redirect(`/dashboard/${slug}/messages/${conversationId}?read=1`);
}
