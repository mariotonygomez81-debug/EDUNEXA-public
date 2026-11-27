import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, MessageCircle, MessagesSquare, Plus, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createDirectConversation } from "./actions";

type Contact = {
  membership_id: string;
  display_name: string;
  role_keys: string[];
};

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

const roleLabels: Record<string, string> = {
  institution_admin: "Administrador",
  director: "Directivo",
  administrative: "Administrativo",
  teacher: "Docente",
  prefect: "Preceptor",
  student: "Estudiante",
  guardian: "Familia",
};

function formatDate(value: string | null) {
  if (!value) return "Sin mensajes";
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function roleText(keys: string[]) {
  return keys.map((key) => roleLabels[key] ?? key).join(" · ");
}

export default async function MessagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ error?: string; subject?: string; student?: string }>;
}) {
  const { slug } = await params;
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

  const [contactsResult, conversationsResult] = await Promise.all([
    supabase.rpc("list_messageable_contacts", { p_institution_id: institution.id }),
    supabase.rpc("list_my_conversations", { p_institution_id: institution.id }),
  ]);

  const contacts = (contactsResult.data ?? []) as Contact[];
  const initialSubject = query.subject === "citation" ? "Solicitud de citación" : "";
  const selectedStudentId = /^[0-9a-f-]{36}$/i.test(query.student ?? "") ? query.student! : null;
  const [{ data: portalStudents }, { data: studentConversationRows, error: studentConversationsError }] = selectedStudentId
    ? await Promise.all([supabase.rpc("list_my_portal_students", { p_institution_id: institution.id }), supabase.rpc("list_my_student_conversations", { p_institution_id: institution.id, p_student_id: selectedStudentId })])
    : [{ data: null }, { data: null, error: null }];
  const selectedStudent = ((portalStudents ?? []) as Array<{ student_id: string; first_name: string; last_name: string }>).find((student) => student.student_id === selectedStudentId);
  const scopedConversationIds = new Set(((studentConversationRows ?? []) as Array<{ conversation_id: string }>).map((item) => item.conversation_id));
  const allConversations = (conversationsResult.data ?? []) as Conversation[];
  const conversations = selectedStudentId ? allConversations.filter((item) => scopedConversationIds.has(item.conversation_id)) : allConversations;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href={`/dashboard/${slug}`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700">
          <ArrowLeft size={16} /> Volver al espacio institucional
        </Link>

        <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white shadow-sm sm:p-9">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-indigo-100">
            <MessagesSquare size={14} /> MENSAJERÍA PRIVADA
          </span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight">Mensajes</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-indigo-100">
            Conversaciones privadas dentro de {institution.display_name}, limitadas a los vínculos y permisos de tu perfil.
          </p>
        </header>

        {query.error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
            {query.error === "scope"
              ? "No podés iniciar una conversación con ese contacto."
              : query.error === "invalid"
                ? "Revisá el contacto y el asunto."
                : "No se pudo iniciar la conversación. Intentá nuevamente."}
          </div>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-xl bg-violet-100 p-3 text-violet-700"><Plus size={21} /></div>
            <div>
              <h2 className="font-semibold text-slate-900">Nueva conversación</h2>
              <p className="text-sm text-slate-500">{selectedStudent ? `Nueva conversación vinculada a ${selectedStudent.first_name} ${selectedStudent.last_name}. El servidor validará el vínculo familiar y la asignación del contacto.` : "Solo aparecen contactos con los que tu perfil está autorizado a comunicarse."}</p>
            </div>
          </div>

          {selectedStudentId && !selectedStudent ? (\n            <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">No tenés un vínculo autorizado con el alumno solicitado.</p>\n          ) : studentConversationsError ? (\n            <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">No fue posible cargar el historial autorizado de este alumno.</p>\n          ) : contactsResult.error ? (
            <p className="text-sm text-amber-800">No fue posible cargar los contactos habilitados.</p>
          ) : contacts.length ? (
            <form action={createDirectConversation} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <input type="hidden" name="slug" value={slug} />
              {selectedStudent ? <input type="hidden" name="student_id" value={selectedStudent.student_id} /> : null}
              <label className="block text-sm font-medium text-slate-700">
                Contacto
                <select name="recipient_membership_id" required defaultValue=""
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal">
                  <option value="" disabled>Seleccioná una persona</option>
                  {contacts.map((contact) => (
                    <option key={contact.membership_id} value={contact.membership_id}>
                      {contact.display_name} — {roleText(contact.role_keys)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Asunto (opcional)
                <input name="subject" maxLength={120}
                  defaultValue={initialSubject}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal"
                  placeholder="Ej.: Consulta académica" />
              </label>
              <button type="submit"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">
                <MessageCircle size={16} /> Abrir chat
              </button>
            </form>
          ) : (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              No hay contactos disponibles dentro del alcance de tu perfil.
            </p>
          )}
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Tus conversaciones</h2>
            <p className="text-sm text-slate-500">Los mensajes y las confirmaciones de lectura son privados para sus participantes.</p>
          </div>

          {conversationsResult.error ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              No fue posible consultar las conversaciones.
            </div>
          ) : conversations.length ? (
            <div className="space-y-3">
              {conversations.map((conversation) => (
                <Link key={conversation.conversation_id}
                  href={`/dashboard/${slug}/messages/${conversation.conversation_id}${selectedStudent ? `?student=${selectedStudent.student_id}` : ""}`}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-violet-200 hover:bg-violet-50/40">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="rounded-full bg-indigo-100 p-3 text-indigo-700"><MessageCircle size={20} /></div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{conversation.counterpart_name}</p>
                      <p className="text-xs text-slate-500">{roleText(conversation.counterpart_role_keys)}{selectedStudent ? " · Vinculada al alumno" : ""}</p>
                      <p className="mt-1 truncate text-sm text-slate-600">
                        {conversation.subject || "Conversación"}{conversation.last_message_body ? ` · ${conversation.last_message_body}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="ml-auto flex items-center gap-3">
                    <time className="text-xs text-slate-500">{formatDate(conversation.last_message_at)}</time>
                    {conversation.unread_count > 0 ? (
                      <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-violet-700 px-2 py-1 text-xs font-bold text-white">
                        {conversation.unread_count}
                      </span>
                    ) : null}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <ShieldCheck className="mx-auto text-slate-300" size={30} />
              <p className="mt-3 text-sm text-slate-500">{selectedStudent ? "Todavía no hay conversaciones privadas vinculadas a este alumno." : "Todavía no tenés conversaciones."}</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
