import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FileText, MessageCircle, Paperclip, Ticket } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";
import { addTicketMessage, assignSupportTicket, updateTicketStatus } from "../actions";
import SupportTicketAttachmentUploader from "../support-ticket-attachment-uploader";

const moduleLabels: Record<string, string> = {
  students: "Alumnos y matrículas",
  attendance: "Asistencia",
  grades: "Calificaciones y boletines",
  classroom: "Aula virtual",
  announcements: "Comunicaciones",
  calendar: "Calendario académico",
  users: "Usuarios y personal",
  reports: "Informes y reportes",
  access: "Acceso y autenticación",
  settings: "Configuración",
  other: "Otro módulo",
};

const statusLabels: Record<string, string> = {
  open: "Abierto", triaged: "En revisión", in_progress: "En curso",
  waiting_user: "Esperando respuesta", resolved: "Resuelto",
  closed: "Cerrado", reopened: "Reabierto",
};

export default async function TicketDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; ticketId: string }>;
  searchParams: Promise<{ error?: string; assigned?: string }>;
}) {
  const { slug, ticketId } = await params;
  const { error: errorCode, assigned } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: institution } = await supabase
    .from("institutions").select("id,slug").eq("slug", slug).maybeSingle();
  if (!institution) redirect("/dashboard");

  const { data: membership } = await supabase
    .from("memberships")
    .select("id")
    .eq("institution_id", institution.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) redirect("/dashboard");

  const permissions = await getMembershipPermissions(supabase, membership.id);
  const canManageSupport = permissions.has("support.manage");

  const { data: ticket } = await supabase
    .from("support_tickets")
    .select("id,title,description,module_key,steps_to_reproduce,occurred_at,category,priority,status,created_at,created_by_membership_id,assigned_to_membership_id")
    .eq("id", ticketId)
    .eq("institution_id", institution.id)
    .maybeSingle();
  if (!ticket) notFound();

  const { data: messages, error } = await supabase
    .from("support_ticket_messages")
    .select("id,body,author_kind,created_at")
    .eq("ticket_id", ticket.id)
    .eq("institution_id", institution.id)
    .order("created_at", { ascending: true });

  const isRequester = ticket.created_by_membership_id === membership.id;
  const isAssignedResponder = ticket.assigned_to_membership_id === membership.id &&
    permissions.has("support.respond_assigned");
  const canReply = isRequester || canManageSupport || isAssignedResponder;
  const canManageAttachments = isRequester || canManageSupport;

  const { data: attachmentRows, error: attachmentsError } = canManageAttachments
    ? await supabase.rpc("list_support_ticket_attachments", { p_ticket_id: ticket.id })
    : { data: null, error: null };
  const attachments = await Promise.all((attachmentRows ?? []).map(async (attachment) => {
    const { data: signed } = await supabase.storage.from(attachment.storage_bucket)
      .createSignedUrl(attachment.storage_path, 300);
    return { ...attachment, signedUrl: signed?.signedUrl ?? null };
  }));

  const { data: assignmentHistory } = await supabase.rpc("support_list_ticket_assignment_history", {
    p_ticket_id: ticket.id,
  });
  const { data: assignableMembers } = canManageSupport
    ? await supabase.rpc("support_list_assignable_members", { p_ticket_id: ticket.id })
    : { data: null };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto max-w-4xl space-y-5">
        <Link href={`/dashboard/${slug}/support`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700">
          <ArrowLeft size={16} /> Volver a mis tickets
        </Link>
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-violet-100 p-3 text-violet-700"><Ticket size={22} /></div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">Solicitud de soporte</p>
                <h1 className="text-xl font-bold">{ticket.title}</h1>
              </div>
            </div>
            <span className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700">{statusLabels[ticket.status] ?? ticket.status}</span>
          </div>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{ticket.description}</p>
          <p className="mt-4 text-xs text-slate-400">
            Creado el {new Date(ticket.created_at).toLocaleString("es-AR")}
            {" · "}Categoría: {ticket.category}
            {" · "}Módulo: {moduleLabels[ticket.module_key ?? "other"] ?? "Otro módulo"}
          </p>
          {ticket.occurred_at && (
            <p className="mt-2 text-xs text-slate-500">
              Ocurrió: {ticket.occurred_at.replace("T", " ").slice(0, 16)} (hora local informada)
            </p>
          )}
          {ticket.steps_to_reproduce && (
            <div className="mt-5 rounded-xl bg-slate-50 p-4">
              <h2 className="text-sm font-semibold text-slate-700">Pasos para reproducir</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{ticket.steps_to_reproduce}</p>
            </div>
          )}
        </section>


        {assigned === "1" && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">La asignación se actualizó correctamente.</p>}
        {errorCode?.startsWith("assignment_") && (
          <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {errorCode === "assignment_conflict" ? "Otro administrador modificó la asignación. Actualizá la página e intentá nuevamente." :
              errorCode === "assignment_invalid" ? "El responsable seleccionado ya no está habilitado para esta institución." :
                "No se pudo guardar la asignación. Verificá los permisos e intentá nuevamente."}
          </p>
        )}

        {canManageSupport && (
          <section className="rounded-2xl border border-violet-200 bg-violet-50 p-5">
            <h2 className="font-semibold text-violet-950">Asignación de responsable</h2>
            <p className="mt-1 text-sm text-violet-800">Elegí un integrante activo del personal de esta institución.</p>
            <form action={assignSupportTicket} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="ticket_id" value={ticket.id} />
              <input type="hidden" name="expected_assignee_membership_id" value={ticket.assigned_to_membership_id ?? ""} />
              <label className="min-w-0 flex-1 text-sm font-medium text-violet-950">
                Responsable
                <select name="assignee_membership_id" defaultValue={ticket.assigned_to_membership_id ?? ""} className="mt-1 block w-full rounded-lg border border-violet-200 bg-white px-3 py-2.5 text-sm">
                  <option value="">Sin asignar</option>
                  {(assignableMembers ?? []).map((member) => (
                    <option key={member.membership_id} value={member.membership_id}>{member.display_name} · {member.role_label}</option>
                  ))}
                </select>
              </label>
              <button className="rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">Guardar responsable</button>
            </form>
            {!(assignableMembers ?? []).length && <p className="mt-2 text-xs text-violet-800">No hay integrantes activos habilitados para recibir asignaciones.</p>}
          </section>
        )}

        {(canManageSupport || isAssignedResponder) && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="font-semibold">Historial de asignaciones</h2>
            {assignmentHistory?.length ? (
              <ol className="mt-4 space-y-3">
                {assignmentHistory.map((event, index) => (
                  <li key={String(event.created_at) + "-" + index} className="border-l-2 border-violet-200 pl-4">
                    <p className="text-sm"><span className="font-semibold">{event.actor_name}</span> modificó la asignación</p>
                    <p className="mt-1 text-sm text-slate-600">{event.previous_assignee_name ?? "Sin responsable"} → {event.new_assignee_name ?? "Sin responsable"}</p>
                    <p className="mt-1 text-xs text-slate-400">{new Date(event.created_at).toLocaleString("es-AR")}</p>
                  </li>
                ))}
              </ol>
            ) : <p className="mt-3 text-sm text-slate-500">Todavía no hay cambios de responsable registrados.</p>}
          </section>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Paperclip size={18} className="text-violet-700" />
            <h2 className="font-semibold">Archivos adjuntos</h2>
            <span className="text-xs text-slate-400">{attachments.length}</span>
          </div>
          {!canManageAttachments ? (
            <p className="text-sm text-slate-500">Los archivos adjuntos están disponibles para quien solicitó el ticket y para la administración institucional.</p>
          ) : attachmentsError ? (
            <p className="text-sm text-rose-600">No se pudieron cargar los archivos adjuntos.</p>
          ) : attachments.length ? (
            <div className="mb-5 space-y-2">
              {attachments.map((attachment) => (
                <div key={attachment.id} className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
                  <FileText size={18} className="shrink-0 text-slate-500" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{attachment.original_filename}</p>
                    <p className="text-xs text-slate-500">{(attachment.byte_size / 1024).toFixed(1)} KB</p>
                  </div>
                  {attachment.signedUrl ? (
                    <a href={attachment.signedUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-violet-700 hover:text-violet-900">
                      Abrir
                    </a>
                  ) : (
                    <span className="text-xs text-slate-400">No disponible</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="mb-5 text-sm text-slate-500">Este ticket todavía no tiene archivos adjuntos.</p>
          )}
          {canManageAttachments && ticket.status !== "closed" && ticket.status !== "resolved" && (
            <SupportTicketAttachmentUploader slug={slug} ticketId={ticket.id} />
          )}
        </section>

        {canManageSupport && (
          <section className="rounded-2xl border border-violet-200 bg-violet-50 p-5">
            <h2 className="font-semibold text-violet-950">Gestión institucional</h2>
            <p className="mt-1 text-sm text-violet-800">Actualizá el estado y la prioridad de esta solicitud.</p>
            <form action={updateTicketStatus} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="ticket_id" value={ticket.id} />
              <label className="text-sm font-medium text-violet-950">
                Estado
                <select name="status" defaultValue={ticket.status} className="mt-1 block w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm">
                  <option value="open">Abierto</option>
                  <option value="triaged">En revisión</option>
                  <option value="in_progress">En curso</option>
                  <option value="waiting_user">Esperando respuesta</option>
                  <option value="resolved">Resuelto</option>
                  <option value="closed">Cerrado</option>
                  <option value="reopened">Reabierto</option>
                </select>
              </label>
              <label className="text-sm font-medium text-violet-950">
                Prioridad
                <select name="priority" defaultValue={ticket.priority} className="mt-1 block w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm">
                  <option value="low">Baja</option>
                  <option value="normal">Normal</option>
                  <option value="high">Alta</option>
                  <option value="urgent">Urgente</option>
                </select>
              </label>
              <button className="self-end rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800">Guardar</button>
            </form>
            {errorCode === "update" && <p role="alert" className="mt-2 text-sm text-rose-700">No se pudo actualizar el ticket.</p>}
            {errorCode === "transition" && <p role="alert" className="mt-2 text-sm text-rose-700">Ese cambio de estado no está permitido desde el estado actual.</p>}
            {errorCode === "closed" && <p role="alert" className="mt-2 text-sm text-rose-700">Este ticket está resuelto o cerrado y ya no admite respuestas.</p>}
          </section>
        )}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-2">
            <MessageCircle size={19} className="text-violet-700" />
            <h2 className="font-semibold">Conversación</h2>
          </div>
          {error ? (
            <p className="text-sm text-rose-600">No se pudo cargar la conversación.</p>
          ) : messages?.length ? (
            <div className="space-y-3">
              {messages.map((message) => (
                <article key={message.id} className="rounded-xl bg-slate-50 p-4">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p>
                  <p className="mt-2 text-xs text-slate-400">{message.author_kind === "school_user" ? "Usuario de la institución" : "Soporte"} · {new Date(message.created_at).toLocaleString("es-AR")}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">Todavía no hay respuestas en este ticket.</p>
          )}

          {canReply && ticket.status !== "closed" && ticket.status !== "resolved" && (
            <form action={addTicketMessage} className="mt-6 space-y-3 border-t border-slate-100 pt-5">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="ticket_id" value={ticket.id} />
              <label className="block text-sm font-medium">
                Agregar un mensaje
                <textarea name="body" required minLength={1} maxLength={20000} rows={4} placeholder="Escribí una respuesta o ampliá la información..." className="mt-1.5 w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" />
              </label>
              {errorCode === "message" && <p role="alert" className="text-sm text-rose-600">No pudimos enviar el mensaje. Intentá nuevamente.</p>}
              <button className="rounded-lg bg-violet-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">Enviar mensaje</button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
