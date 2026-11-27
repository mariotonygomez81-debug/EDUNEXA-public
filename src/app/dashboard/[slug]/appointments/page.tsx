import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarClock, Check, CircleX, ClipboardCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { acceptAppointmentProposal, respondToAppointment, saveAppointmentObservation, updateAppointmentStatus } from "./actions";

type Appointment = {
  appointment_id: string;
  student_id: string;
  student_name: string;
  teacher_name: string;
  guardian_name: string;
  scheduled_at: string;
  reason: string;
  status: "requested" | "confirmed" | "rejected" | "declined" | "completed" | "cancelled";
  created_at: string;
  updated_at: string;
  guardian_response_note: string | null;
  guardian_proposed_at: string | null;
  conversation: { id: string; event_type: string; body: string | null; proposed_at: string | null; created_at: string; actor_name: string }[];
};

const statusLabels: Record<Appointment["status"], string> = {
  requested: "Pendiente de respuesta",
  confirmed: "Confirmada",
  rejected: "Rechazada",
  declined: "Rechazada",
  completed: "Realizada",
  cancelled: "Cancelada",
};

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "full", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" })
    .format(new Date(value));
}

export default async function AppointmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; updated?: string; created?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: institution } = await supabase.from("institutions")
    .select("id,display_name").eq("slug", slug).eq("status", "active").maybeSingle();
  if (!institution) redirect("/dashboard");

  const { data: membership } = await supabase.from("memberships")
    .select("id").eq("institution_id", institution.id)
    .eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership) redirect("/dashboard");

  const { data: roleRows, error: roleError } = await supabase.from("membership_roles")
    .select("roles(key)").eq("membership_id", membership.id).eq("institution_id", institution.id);
  if (roleError) throw new Error("No se pudieron verificar tus permisos.");
  const roles = (roleRows ?? []).map((row) => row.roles?.key);
  const isGuardian = roles.includes("guardian");
  const isTeacher = roles.includes("teacher");
  if (!isGuardian && !isTeacher) redirect(`/dashboard/${slug}`);

  const { data, error } = await supabase.rpc("list_my_teacher_guardian_appointment_details");
  if (error) throw new Error("No se pudieron cargar las citaciones.");
  const appointments = (data ?? []) as unknown as Appointment[];
  const activeAppointments = appointments.filter((item) => ["requested", "confirmed", "rejected", "declined"].includes(item.status));
  const historyAppointments = appointments.filter((item) => ["completed", "cancelled"].includes(item.status));
  const displayAppointments = [...activeAppointments, ...historyAppointments];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href={isGuardian ? `/dashboard/${slug}/portal` : `/dashboard/${slug}/teaching`}
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700">
          <ArrowLeft size={16} /> Volver
        </Link>
        <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white shadow-sm">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-indigo-100">
            <CalendarClock size={14} /> COMUNICACIÓN INSTITUCIONAL
          </span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight">{isGuardian ? "Mis citaciones" : "Seguimiento de citaciones"}</h1>
          <p className="mt-2 text-sm leading-6 text-indigo-100">{institution.display_name} · Solicitudes de entrevista entre docentes y familias.</p>
          {isTeacher ? (
            <div className="mt-5">
              <Link href={`/dashboard/${slug}/appointments/new`} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-indigo-950 shadow-sm transition hover:bg-indigo-50">
                <CalendarClock size={16} /> Nueva citación a un tutor
              </Link>
            </div>
          ) : null}
        </header>

        {query.created ? <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">La citación fue enviada al tutor correctamente.</p> : null}
        {query.updated ? <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">El estado de la citación se actualizó correctamente.</p> : null}
        {query.error ? <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">No se pudo actualizar la citación. Puede haber cambiado de estado o no pertenecer a tu cuenta.</p> : null}

        {appointments.length ? (
          <section className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Pendientes / en curso</p><p className="mt-1 text-2xl font-bold text-amber-950">{activeAppointments.length}</p></div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Realizadas</p><p className="mt-1 text-2xl font-bold text-emerald-950">{historyAppointments.filter((item) => item.status === "completed").length}</p></div>
              <div className="rounded-xl border border-slate-200 bg-slate-100 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Canceladas</p><p className="mt-1 text-2xl font-bold text-slate-900">{historyAppointments.filter((item) => item.status === "cancelled").length}</p></div>
            </div>
            {displayAppointments.map((appointment, index) => (
              <>
                {index === 0 ? <h2 className="pt-3 text-lg font-semibold text-slate-900">Seguimiento actual</h2> : null}
                {index === activeAppointments.length && historyAppointments.length ? <h2 className="pt-6 text-lg font-semibold text-slate-900">Historial de entrevistas</h2> : null}
              <article key={appointment.appointment_id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{appointment.student_name}</h2>
                    <p className="mt-1 text-sm text-slate-500">{isGuardian ? `Docente: ${appointment.teacher_name ?? "No disponible"}` : `Tutor: ${appointment.guardian_name ?? "No disponible"}`}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    appointment.status === "confirmed" ? "bg-emerald-100 text-emerald-800" :
                    appointment.status === "rejected" || appointment.status === "declined" || appointment.status === "cancelled" ? "bg-rose-100 text-rose-800" :
                    appointment.status === "completed" ? "bg-slate-100 text-slate-700" :
                    "bg-amber-100 text-amber-800"
                  }`}>{statusLabels[appointment.status]}</span>
                </div>
                <div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Fecha y hora</p><p className="mt-1 text-sm font-medium text-slate-800">{dateLabel(appointment.scheduled_at)}</p></div>
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Motivo</p><p className="mt-1 text-sm text-slate-700">{appointment.reason}</p></div>
                </div>
                {appointment.guardian_response_note || appointment.guardian_proposed_at ? (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Respuesta del tutor</p>
                    {appointment.guardian_response_note ? <p className="mt-2 whitespace-pre-wrap text-sm text-amber-950">{appointment.guardian_response_note}</p> : null}
                    {appointment.guardian_proposed_at ? <p className="mt-2 text-sm font-semibold text-amber-950">Horario alternativo propuesto: {dateLabel(appointment.guardian_proposed_at)}</p> : null}
                  </div>
                ) : null}
                {isGuardian && appointment.status === "requested" ? (
                  <form action={respondToAppointment} className="mt-4 space-y-3 rounded-xl border border-slate-200 p-4">
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="appointment_id" value={appointment.appointment_id} />
                    <label className="block text-sm font-semibold text-slate-700">Mensaje para el docente (opcional)
                      <textarea name="response_note" maxLength={500} rows={2} placeholder="Podés confirmar, explicar por qué no podés asistir o dejar una consulta..." className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"/>
                    </label>
                    <label className="block text-sm font-semibold text-slate-700">Proponer otro horario (opcional)
                      <input type="datetime-local" name="proposed_at" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"/>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button name="response" value="confirmed" className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800"><Check size={16} /> Confirmar entrevista</button>
                      <button name="response" value="rejected" className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50"><CircleX size={16} /> No puedo asistir</button>
                    </div>
                    <p className="text-xs text-slate-500">Si no podés asistir, podés sugerir una fecha alternativa. El docente recibirá tu respuesta para coordinar.</p>
                  </form>
                ) : null}
                {isTeacher && appointment.status === "rejected" && appointment.guardian_proposed_at ? (
                  <form action={acceptAppointmentProposal} className="mt-4">
                    <input type="hidden" name="slug" value={slug}/>
                    <input type="hidden" name="appointment_id" value={appointment.appointment_id}/>
                    <button className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800"><CalendarClock size={16}/> Aceptar horario alternativo y reenviar</button>
                  </form>
                ) : null}
                {appointment.status === "completed" ? (
                  <section className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                    <h3 className="text-sm font-semibold text-emerald-900">Observación final del docente</h3>
                    {(() => {
                      const finalObservation = [...(appointment.conversation ?? [])].reverse().find((event) => event.event_type === "teacher_final_observation");
                      return finalObservation ? (
                        <div className="mt-2">
                          <p className="whitespace-pre-wrap text-sm leading-6 text-emerald-950">{finalObservation.body}</p>
                          <p className="mt-2 text-xs text-emerald-700">{finalObservation.actor_name} · {dateLabel(finalObservation.created_at)}</p>
                        </div>
                      ) : isTeacher ? (
                        <form action={saveAppointmentObservation} className="mt-3 space-y-2">
                          <input type="hidden" name="slug" value={slug}/>
                          <input type="hidden" name="appointment_id" value={appointment.appointment_id}/>
                          <textarea name="observation" required minLength={3} maxLength={1500} rows={3} placeholder="Registrá los acuerdos, orientaciones o próximos pasos de la entrevista..." className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-800"/>
                          <button className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800">Guardar observación final</button>
                        </form>
                      ) : <p className="mt-2 text-sm text-emerald-800">El docente todavía no registró una observación final.</p>;
                    })()}
                  </section>
                ) : null}
                {appointment.conversation?.length ? (
                  <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-700">Historial de coordinación ({appointment.conversation.length})</summary>
                    <ol className="mt-3 space-y-3">
                      {appointment.conversation.map((event) => (
                        <li key={event.id} className="border-l-2 border-violet-200 pl-3">
                          <p className="text-xs font-semibold text-slate-700">{event.actor_name} · {dateLabel(event.created_at)}</p>
                          {event.body ? <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{event.body}</p> : null}
                          {event.proposed_at ? <p className="mt-1 text-xs font-semibold text-violet-700">Horario: {dateLabel(event.proposed_at)}</p> : null}
                        </li>
                      ))}
                    </ol>
                  </details>
                ) : null}
                {isTeacher && (appointment.status === "confirmed" || appointment.status === "requested") ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {appointment.status === "confirmed" ? (
                      <form action={updateAppointmentStatus}>
                        <input type="hidden" name="slug" value={slug} />
                        <input type="hidden" name="appointment_id" value={appointment.appointment_id} />
                        <input type="hidden" name="status" value="completed" />
                        <button className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800"><ClipboardCheck size={16} /> Marcar realizada</button>
                      </form>
                    ) : null}
                    <form action={updateAppointmentStatus}>
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="appointment_id" value={appointment.appointment_id} />
                      <input type="hidden" name="status" value="cancelled" />
                      <button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancelar citación</button>
                    </form>
                  </div>
                ) : null}
              </article>
              </>
            ))}
          </section>
        ) : (
          <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <CalendarClock size={34} className="mx-auto text-slate-300" />
            <h2 className="mt-3 font-semibold text-slate-900">Todavía no hay citaciones</h2>
            <p className="mt-1 text-sm text-slate-500">{isGuardian ? "Cuando un docente solicite una entrevista, aparecerá aquí para que puedas responder." : "Las solicitudes que envíes a las familias aparecerán aquí para que puedas seguir su estado."}</p>
          </section>
        )}
      </div>
    </main>
  );
}
