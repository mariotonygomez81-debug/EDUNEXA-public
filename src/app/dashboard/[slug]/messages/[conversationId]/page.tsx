import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCheck, MessageCircle, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { markConversationRead, sendConversationMessage } from "../actions";

type Conversation = {
  conversation_id: string;
  subject: string | null;
  counterpart_membership_id: string;
  counterpart_name: string;
  counterpart_role_keys: string[];
  last_message_body: string | null;
  last_message_at: string | null;
  unread_count: number;
};

type ConversationMessage = {
  id: string;
  sender_membership_id: string;
  sender_name: string;
  body: string;
  sent_at: string;
  read_at: string | null;
  is_mine: boolean;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; conversationId: string }>;
  searchParams?: Promise<{ sent?: string; read?: string; error?: string }>;
}) {
  const { slug, conversationId } = await params;
  const query = searchParams ? await searchParams : {};
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: institution } = await supabase.from("institutions")
    .select("id,display_name").eq("slug", slug).maybeSingle();
  if (!institution) redirect("/dashboard");

  const { data: membership } = await supabase.from("memberships")
    .select("id").eq("institution_id", institution.id)
    .eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership) redirect("/dashboard");

  const { data: conversations, error: conversationsError } = await supabase.rpc(
    "list_my_conversations",
    { p_institution_id: institution.id },
  );
  if (conversationsError) {
    return <main className="min-h-screen bg-slate-50 p-8 text-sm text-amber-900">No fue posible cargar esta conversación.</main>;
  }

  const conversation = ((conversations ?? []) as Conversation[])
    .find((item) => item.conversation_id === conversationId);
  if (!conversation) notFound();

  const { data: messageRows, error: messagesError } = await supabase.rpc(
    "list_conversation_messages",
    { p_institution_id: institution.id, p_conversation_id: conversationId, p_limit: 100 },
  );
  const messages = (messageRows ?? []) as ConversationMessage[];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto max-w-4xl space-y-5">
        <Link href={`/dashboard/${slug}/messages`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700">
          <ArrowLeft size={16} /> Volver a mensajes
        </Link>

        <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-indigo-100 p-3 text-indigo-700"><MessageCircle size={22} /></div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">{conversation.counterpart_name}</h1>
              <p className="text-sm text-slate-500">{conversation.subject || "Conversación privada"} · {institution.display_name}</p>
            </div>
          </div>
          {conversation.unread_count > 0 ? (
            <form action={markConversationRead}>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="conversation_id" value={conversationId} />
              <button type="submit" className="inline-flex items-center gap-2 rounded-lg border border-violet-200 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50">
                <CheckCheck size={15} /> Marcar {conversation.unread_count} como leídos
              </button>
            </form>
          ) : null}
        </header>

        {query.sent ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
            Mensaje enviado.
          </div>
        ) : null}
        {query.read ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
            Conversación marcada como leída.
          </div>
        ) : null}
        {query.error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
            {query.error === "invalid" ? "El mensaje está vacío o supera los 5000 caracteres." : "No se pudo completar la operación."}
          </div>
        ) : null}

        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          {messagesError ? (
            <p className="text-sm text-amber-800">No fue posible cargar los mensajes.</p>
          ) : messages.length ? (
            messages.map((message) => (
              <div key={message.id} className={`flex ${message.is_mine ? "justify-end" : "justify-start"}`}>
                <article className={`max-w-[85%] rounded-2xl px-4 py-3 sm:max-w-[75%] ${message.is_mine ? "bg-violet-700 text-white" : "bg-slate-100 text-slate-800"}`}>
                  <p className={`mb-1 text-xs font-semibold ${message.is_mine ? "text-violet-100" : "text-slate-500"}`}>
                    {message.is_mine ? "Vos" : message.sender_name}
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-6">{message.body}</p>
                  <div className={`mt-2 flex items-center justify-end gap-1.5 text-[11px] ${message.is_mine ? "text-violet-100" : "text-slate-400"}`}>
                    <time>{formatDate(message.sent_at)}</time>
                    {message.is_mine && message.read_at ? <CheckCheck size={13} aria-label="Leído" /> : null}
                  </div>
                </article>
              </div>
            ))
          ) : (
            <div className="py-10 text-center text-sm text-slate-500">
              Esta conversación todavía no tiene mensajes. Escribí el primero.
            </div>
          )}
        </section>

        <form action={sendConversationMessage} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="conversation_id" value={conversationId} />
          <label className="block text-sm font-medium text-slate-700">
            Escribí tu mensaje
            <textarea name="body" required minLength={1} maxLength={5000} rows={4}
              className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
              placeholder="Escribí aquí..." />
          </label>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-400">Máximo 5000 caracteres. No compartas contraseñas ni datos sensibles.</p>
            <button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">
              <Send size={16} /> Enviar
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
