import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpen, MessageCircle, MessagesSquare, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createDirectConversation } from "../../messages/actions";

type Contact = { membership_id: string; display_name: string; role_keys: string[] };
type Conversation = { conversation_id: string; subject: string | null; counterpart_name: string; counterpart_role_keys: string[]; last_message_body: string | null; last_message_at: string | null; unread_count: number };

export default async function StudentTeacherQuestionsPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const query = searchParams ? await searchParams : {};
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: institution } = await supabase.from("institutions").select("id,display_name").eq("slug", slug).maybeSingle();
  if (!institution) redirect("/dashboard");
  const { data: membership } = await supabase.from("memberships").select("id").eq("institution_id", institution.id).eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership) redirect("/dashboard");

  const [{ data: contacts, error: contactsError }, { data: conversations, error: conversationsError }] = await Promise.all([
    supabase.rpc("list_messageable_contacts", { p_institution_id: institution.id }),
    supabase.rpc("list_my_conversations", { p_institution_id: institution.id }),
  ]);
  const teachers = ((contacts ?? []) as Contact[]).filter((contact) =>
    contact.role_keys?.some((role) => ["teacher", "docente"].includes(role.toLowerCase())),
  );
  const teacherConversations = ((conversations ?? []) as Conversation[]).filter((conversation) =>
    conversation.counterpart_role_keys?.some((role) => ["teacher", "docente"].includes(role.toLowerCase())),
  );

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href={`/dashboard/${slug}/portal`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700"><ArrowLeft size={16}/> Volver a Mi portal</Link>
      <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white shadow-sm sm:p-9">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-indigo-100"><MessagesSquare size={14}/> PARTICIPACIÓN ESTUDIANTIL</span>
        <h1 className="mt-5 text-3xl font-bold tracking-tight">Consultas a docentes</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-indigo-100">Hacé consultas sobre tus materias, actividades o evaluaciones y continuá la conversación cuando recibas una respuesta.</p>
      </header>
      {query.error ? <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{query.error === "scope" ? "No está habilitada la comunicación con ese contacto." : "No se pudo iniciar la consulta. Volvé a intentarlo."}</p> : null}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-3"><span className="rounded-xl bg-violet-100 p-3 text-violet-700"><Send size={20}/></span><div><h2 className="font-semibold text-slate-900">Iniciar una consulta</h2><p className="text-sm text-slate-500">Solo se muestran docentes con los que tu cuenta puede comunicarse.</p></div></div>
        {contactsError ? <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">No fue posible cargar los contactos habilitados.</p> : teachers.length ? <form action={createDirectConversation} className="mt-5 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <input type="hidden" name="slug" value={slug}/>
          <label className="block text-sm font-medium text-slate-700">Docente
            <select name="recipient_membership_id" required defaultValue="" className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal">
              <option value="" disabled>Seleccioná un docente</option>
              {teachers.map((teacher) => <option key={teacher.membership_id} value={teacher.membership_id}>{teacher.display_name}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">Tema de la consulta
            <select name="subject" required defaultValue="" className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal">
              <option value="" disabled>Elegí un tema</option><option value="Consulta sobre una clase">Consulta sobre una clase</option><option value="Consulta sobre una actividad">Consulta sobre una actividad</option><option value="Consulta sobre una evaluación">Consulta sobre una evaluación</option><option value="Otra consulta académica">Otra consulta académica</option>
            </select>
          </label>
          <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-800"><MessageCircle size={16}/> Abrir consulta</button>
        </form> : <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No hay docentes disponibles para iniciar una conversación desde tu cuenta.</p>}
      </section>
      <section className="space-y-4">
        <div><h2 className="text-xl font-semibold text-slate-900">Mis consultas</h2><p className="text-sm text-slate-500">Historial de conversaciones con docentes y respuestas recibidas.</p></div>
        {conversationsError ? <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">No fue posible recuperar tus conversaciones.</p> : teacherConversations.length ? <div className="space-y-3">
          {teacherConversations.map((conversation) => <Link key={conversation.conversation_id} href={`/dashboard/${slug}/messages/${conversation.conversation_id}`} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-violet-200 hover:bg-violet-50/40">
            <div className="flex min-w-0 items-center gap-3"><span className="rounded-full bg-indigo-100 p-3 text-indigo-700"><MessageCircle size={19}/></span><div className="min-w-0"><p className="font-semibold text-slate-900">{conversation.counterpart_name}</p><p className="text-xs text-violet-700">{conversation.subject || "Consulta académica"}</p><p className="mt-1 truncate text-sm text-slate-600">{conversation.last_message_body || "Todavía no hay mensajes. Abrí la conversación para escribir."}</p></div></div>
            <div className="ml-auto flex items-center gap-3">{conversation.unread_count > 0 ? <span className="rounded-full bg-violet-700 px-2.5 py-1 text-xs font-bold text-white">{conversation.unread_count} sin leer</span> : null}<BookOpen size={17} className="text-slate-400"/></div>
          </Link>)}
        </div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Todavía no iniciaste consultas con docentes.</div>}
      </section>
    </div>
  </main>;
}
