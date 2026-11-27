import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarClock, Check, CircleX, ClipboardCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { acceptAppointmentProposal, createAppointmentCommitment, respondToAppointment, saveAppointmentObservation, updateAppointmentCommitmentStatus, updateAppointmentStatus } from "./actions";

type Commitment = {
  commitment_id: string;
  appointment_id: string;
  title: string;
  details: string | null;
  responsible: "teacher" | "guardian" | "student" | "family";
  due_date: string | null;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  created_at: string;
  updated_at: string;
};

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
  commitments: Commitment[];
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

function appointmentEventLabel(eventType: string) {
  const labels: Record<string, string> = {
    guardian_confirmed: "Tutor confirmó la entrevista",
    guardian_declined: "Tutor rechazó la propuesta",
    teacher_accepted_proposal: "Horario alternativo aceptado",
    interview_completed: "Entrevista realizada",
    appointment_cancelled: "Citación cancelada",
  };
  return labels[eventType] ?? "Actualización de la citación";
}

export default async function AppointmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; updated?: string; created?: string; student?: string }>;
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
  const isPrefect = roles.includes("prefect");
  const canManageAppointments = isTeacher || isPrefect;
  if (!isGuardian && !canManageAppointments) redirect(`/dashboard/${slug}`);

  const { data, error } = await supabase.rpc("list_my_teacher_guardian_appointment_details");
  if (error) throw new Error("No se pudieron cargar las citaciones.");
  const appointments = (data ?? []) as unknown as Appointment[];
  const selectedStudentId = /^[0-9a-f-]{36}$/i.test(query.student ?? "") ? query.student! : null;
  const selectedStudentName = selectedStudentId
    ? appointments.find((item) => item.student_id === selectedStudentId)?.student_name ?? null
    : null;
  const scopedAppointments = selectedStudentId
    ? appointments.filter((item) => item.student_id === selectedStudentId)
    : appointments;
  const activeAppointments = scopedAppointments.filter((item) => ["requested", "confirmed", "rejected", "declined"].includes(item.status));
  const historyAppointments = scopedAppointments.filter((item) => ["completed", "cancelled"].includes(item.status));
  const displayAppointments = [...activeAppointments, ...historyAppointments];
  const { data: commitmentRows, error: commitmentError } = isTeacher || isGuardian
    ? await supabase.rpc("list_my_teacher_guardian_appointment_commitments")
    : { data: [], error: null };
  if (commitmentError) throw new Error("No se pudieron cargar los acuerdos de las entrevistas.");
  const commitments = (commitmentRows ?? []) as unknown as Commitment[];
  const commitmentsByAppointment = new Map<string, Commitment[]>();
  for (const commitment of commitments) {
    const current = commitmentsByAppointment.get(commitment.appointment_id) ?? [];
    current.push(commitment);
    commitmentsByAppointment.set(commitment.appointment_id, current);
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href={isGuardian ? `/dashboard/${slug}/portal` : isPrefect && !isTeacher ? `/dashboard/${slug}/prefect` : `/dashboard/${slug}/teaching`}
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700">
          <ArrowLeft size={16} /> Volver
        </Link>
        <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white shadow-sm">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-indigo-100">
            <CalendarClock size={14} /> COMUNICACIÓN INSTITUCIONAL
          </span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight">{isGuardian ? "Mis citaciones" : "Seguimiento de citaciones"}</h1>
          <p className="mt-2 text-sm leading-6 text-indigo-100">{institution.display_name} · Solicitudes de entrevista entre el equipo institucional y las familias.</p>
          {isTeacher ? (
            <div className="mt-5">
              <Link href={`/dashboard/${slug}/appointments/new`} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-indigo-950 shadow-sm transition hover:bg-indigo-50">
                <CalendarClock size={16} /> Nueva citación a un tutor
              </Link>
            </div>
          ) : null}
        </header>

        {selectedStudentId ? (
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Historial por estudiante</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{selectedStudentName ?? "Estudiante vinculado"}</p>
              <p className="mt-1 text-xs text-slate-600">Se muestran las citaciones y el historial de coordinación asociados a este alumno.</p>
            </div>
            <Link href={`/dashboard/${slug}/portal`} className="text-sm font-semibold text-violet-700 hover:text-violet-900">Volver al portal familiar</Link>
          </section>
        ) : null}

        {query.created ? <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">La citación fue enviada al tutor correctamente.</p> : null}
        {query.updated ? <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">El estado de la citación se actualizó correctamente.</p> : null}
        {query.error ? <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">No se pudo actualizar la citación. Puede haber cambiado de estado o no pertenecer a tu cuenta.</p> : null}

        {appointments.length ? (
          <section className="space-y-3">
            {isGuardian ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Requieren tu respuesta</p>
                  <p className="mt-1 text-2xl font-bold text-amber-950">{scopedAppointments.filter((item) => item.status === "requested").length}</p>
                  <p className="mt-1 text-xs text-amber-800">Solicitudes que todavía podés confirmar o responder</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Confirmadas</p>
                  <p className="mt-1 text-2xl font-bold text-emerald-950">{scopedAppointments.filter((item) => item.status === "confirmed").length}</p>
                  <p className="mt-1 text-xs text-emerald-800">Entrevistas con fecha acordada</p>
                </div>
                <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-violet-800">En coordinación</p>
                  <p className="mt-1 text-2xl font-bold text-violet-950">{scopedAppointments.filter((item) => ["rejected", "declined"].includes(item.status)).length}</p>
                  <p className="mt-1 text-xs text-violet-800">Respuestas enviadas; a la espera del equipo institucional</p>
                </div>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Pendientes / en curso</p><p className="mt-1 text-2xl font-bold text-amber-950">{activeAppointments.length}</p></div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Realizadas</p><p className="mt-1 text-2xl font-bold text-emerald-950">{historyAppointments.filter((item) => item.status === "completed").length}</p></div>
                <div className="rounded-xl border border-slate-200 bg-slate-100 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Canceladas</p><p className="mt-1 text-2xl font-bold text-slate-900">{historyAppointments.filter((item) => item.status === "cancelled").length}</p></div>
              </div>
            )}
            {isGuardian ? (() => {
              const myCommitments = commitments.filter((item) =>
                (item.responsible === "guardian" || item.responsible === "family") &&
                scopedAppointments.some((appointment) => appointment.appointment_id === item.appointment_id)
              );
              const studentCommitmentGroups = Array.from(myCommitments.reduce((groups, commitment) => {
                const appointment = scopedAppointments.find((item) => item.appointment_id === commitment.appointment_id);
                const key = appointment?.student_id ?? "unknown";
                const group = groups.get(key) ?? {
                  studentId: key,
                  studentName: appointment?.student_name ?? "Alumno",
                  items: [],
                };
                group.items.push(commitment);
                groups.set(key, group);
                return groups;
              }, new Map<string, { studentId: string; studentName: string; items: Commitment[] }>()).values());
              const pendingCommitments = myCommitments.filter((item) => item.status === "pending" || item.status === "in_progress");
              const todayParts = new Intl.DateTimeFormat("en-CA", {
                timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit",
              }).formatToParts(new Date());
              const today = `${todayParts.find((part) => part.type === "year")?.value}-${todayParts.find((part) => part.type === "month")?.value}-${todayParts.find((part) => part.type === "day")?.value}`;
              const isOpenCommitment = (item: Commitment) => item.status === "pending" || item.status === "in_progress";
              const overdueCommitments = pendingCommitments.filter((item) => item.due_date && item.due_date < today);
              const upcomingCommitments = pendingCommitments.filter((item) => item.due_date && item.due_date > today);
              const dueTodayCommitments = pendingCommitments.filter((item) => item.due_date === today);
              const undatedCommitments = pendingCommitments.filter((item) => !item.due_date);
              const commitmentStatusLabel = (status: Commitment["status"]) =>
                status === "completed" ? "Cumplido" :
                status === "cancelled" ? "Cancelado" :
                status === "in_progress" ? "En seguimiento" : "Pendiente";
              const commitmentDateLabel = (value: string | null) => value
                ? new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(`${value}T12:00:00-03:00`))
                : "Sin fecha definida";
              return (
                <section className="rounded-2xl border border-violet-200 bg-violet-50/70 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-violet-950">Compromisos a tu cargo</h2>
                      <p className="mt-1 text-sm text-violet-800">Acuerdos asignados al tutor o a la familia en entrevistas realizadas.</p>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-violet-800">{pendingCommitments.length} pendiente(s)</span>
                  </div>
                  {pendingCommitments.length ? (
                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                      <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
                        <p className="text-xs font-semibold text-rose-800">Vencidos</p>
                        <p className="text-xl font-bold text-rose-950">{overdueCommitments.length}</p>
                      </div>
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                        <p className="text-xs font-semibold text-amber-800">Próximos / hoy</p>
                        <p className="text-xl font-bold text-amber-950">{upcomingCommitments.length + dueTodayCommitments.length}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <p className="text-xs font-semibold text-slate-600">Sin fecha</p>
                        <p className="text-xl font-bold text-slate-900">{undatedCommitments.length}</p>
                      </div>
                    </div>
                  ) : null}
                  {studentCommitmentGroups.length ? (
                    <div className="mt-4 space-y-4">
                      {studentCommitmentGroups.map((group) => (
                        <section key={group.studentId} className="rounded-xl border border-violet-200 bg-white p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-violet-100 pb-3">
                            <h3 className="font-semibold text-slate-900">{group.studentName}</h3>
                            <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800">
                              {group.items.length} {group.items.length === 1 ? "compromiso" : "compromisos"}
                            </span>
                          </div>
                          <div className="mt-3 space-y-3">
                            {group.items.map((commitment) => {
                              const appointment = scopedAppointments.find((item) => item.appointment_id === commitment.appointment_id);
                              return (
                                <article key={commitment.commitment_id} className={`rounded-xl border p-4 ${
                                                            isOpenCommitment(commitment) && commitment.due_date && commitment.due_date < today
                                                              ? "border-rose-300 bg-rose-50/70"
                                                              : "border-violet-100 bg-white"
                                                          }`}>
                                                            <div className="flex flex-wrap items-start justify-between gap-2">
                                                              <div className="min-w-0">
                                                                <h3 className="font-semibold text-slate-900">{commitment.title}</h3>
                                                                {commitment.details ? <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{commitment.details}</p> : null}
                                                                <p className="mt-2 text-xs text-slate-500">
                                                                  {appointment ? `Alumno: ${appointment.student_name} · Entrevista: ${dateLabel(appointment.scheduled_at)}` : "Entrevista asociada"}
                                                                </p>
                                                              </div>
                                                              <div className="flex flex-wrap items-center gap-2">
                                                                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                                                  commitment.status === "completed" ? "bg-emerald-100 text-emerald-800" :
                                                                  commitment.status === "cancelled" ? "bg-slate-100 text-slate-600" :
                                                                  commitment.status === "in_progress" ? "bg-sky-100 text-sky-800" :
                                                                  "bg-amber-100 text-amber-800"
                                                                }`}>{commitmentStatusLabel(commitment.status)}</span>
                                                                {isOpenCommitment(commitment) && commitment.due_date && commitment.due_date < today ? (
                                                                  <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-800">Vencido</span>
                                                                ) : null}
                                                                {isOpenCommitment(commitment) && commitment.due_date === today ? (
                                                                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">Vence hoy</span>
                                                                ) : null}
                                                                {isOpenCommitment(commitment) && commitment.due_date && commitment.due_date > today ? (
                                                                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">Próximo</span>
                                                                ) : null}
                                                                {isOpenCommitment(commitment) && !commitment.due_date ? (
                                                                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Sin fecha</span>
                                                                ) : null}
                                                              </div>
                                                            </div>
                                                            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600">
                                                              <span><strong className="text-slate-700">Responsable:</strong> {commitment.responsible === "guardian" ? "Tutor" : "Familia"}</span>
                                                              <span><strong className="text-slate-700">Fecha de seguimiento:</strong> {commitmentDateLabel(commitment.due_date)}</span>
                                                              {isOpenCommitment(commitment) && commitment.due_date && commitment.due_date < today ? (
                                                                <span className="font-semibold text-rose-700">Requiere seguimiento: la fecha ya pasó</span>
                                                              ) : null}
                                                            </div>
                                                          </article>
                                                        );
                              );
                            })}
                          </div>
                        </section>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 rounded-xl border border-dashed border-violet-200 bg-white p-4 text-sm text-slate-600">No tenés compromisos asignados al tutor o a la familia por el momento.</p>
                  )}
                </section>
              );
            })() : null}
            {displayAppointments.map((appointment, index) => (
              <>
                {index === 0 && activeAppointments.length ? <h2 className="pt-3 text-lg font-semibold text-slate-900">Seguimiento actual</h2> : null}
                {index === activeAppointments.length && historyAppointments.length ? <h2 className="pt-6 text-lg font-semibold text-slate-900">Historial de entrevistas</h2> : null}
              <article key={appointment.appointment_id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                {(() => { appointment.commitments = commitmentsByAppointment.get(appointment.appointment_id) ?? []; return null; })()}
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
                  <section className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
                    <p className="text-sm font-semibold text-amber-950">Acción necesaria: esta citación espera tu respuesta</p>
                    <p className="mt-1 text-xs leading-5 text-amber-900">Revisá la fecha y el motivo. Podés confirmar la entrevista o indicar que no podés asistir y proponer otro horario.</p>
                    <form action={respondToAppointment} className="mt-3 space-y-3 rounded-lg border border-amber-200 bg-white p-3">
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
                  </section>
                ) : null}
                {isGuardian && appointment.status === "confirmed" ? (
                  <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">Entrevista confirmada. No necesitás responder nuevamente; consultá aquí la fecha acordada y el historial.</p>
                ) : null}
                {isGuardian && (appointment.status === "rejected" || appointment.status === "declined") ? (
                  <p className="mt-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950">Tu respuesta ya fue enviada. La citación queda en coordinación con el equipo institucional; no requiere otra acción de tu parte por ahora.</p>
                ) : null}
                {canManageAppointments && appointment.status === "rejected" && appointment.guardian_proposed_at ? (
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
                {appointment.status === "completed" ? (
                  <section className="mt-4 rounded-xl border border-violet-200 bg-violet-50/60 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-violet-950">Acuerdos y compromisos familiares</h3>
                        <p className="mt-1 text-xs text-violet-800">Acciones acordadas durante esta entrevista y su seguimiento.</p>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-violet-800">{appointment.commitments.length} registrado(s)</span>
                    </div>
                    {appointment.commitments.length ? (
                      <div className="mt-3 space-y-3">
                        {appointment.commitments.map((commitment) => (
                          <div key={commitment.commitment_id} className="rounded-xl border border-violet-100 bg-white p-3">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="font-semibold text-slate-900">{commitment.title}</p>
                                {commitment.details ? <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{commitment.details}</p> : null}
                              </div>
                              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${commitment.status === "completed" ? "bg-emerald-100 text-emerald-800" : commitment.status === "cancelled" ? "bg-slate-100 text-slate-600" : commitment.status === "in_progress" ? "bg-sky-100 text-sky-800" : "bg-amber-100 text-amber-800"}`}>
                                {commitment.status === "completed" ? "Cumplido" : commitment.status === "cancelled" ? "Cancelado" : commitment.status === "in_progress" ? "En seguimiento" : "Pendiente"}
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                              <span>Responsable: {commitment.responsible === "teacher" ? "Docente" : commitment.responsible === "guardian" ? "Tutor" : commitment.responsible === "student" ? "Alumno" : "Familia"}</span>
                              <span>Fecha de seguimiento: {commitment.due_date ? new Intl.DateTimeFormat("es-AR",{dateStyle:"medium",timeZone:"America/Argentina/Buenos_Aires"}).format(new Date(`${commitment.due_date}T12:00:00-03:00`)) : "Sin fecha"}</span>
                            </div>
                            {(commitment.status === "pending" || commitment.status === "in_progress") ? (
                              <form action={updateAppointmentCommitmentStatus} className="mt-3 flex flex-wrap items-center gap-2">
                                <input type="hidden" name="slug" value={slug}/>
                                <input type="hidden" name="commitment_id" value={commitment.commitment_id}/>
                                <select name="status" defaultValue={commitment.status} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
                                  <option value="pending">Pendiente</option><option value="in_progress">En seguimiento</option><option value="completed">Cumplido</option><option value="cancelled">Cancelado</option>
                                </select>
                                <button className="rounded-lg bg-violet-700 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-800">Actualizar estado</button>
                              </form>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : <p className="mt-3 rounded-lg bg-white p-3 text-sm text-slate-500">Todavía no hay compromisos registrados para esta entrevista.</p>}
                    {isTeacher ? (
                      <form action={createAppointmentCommitment} className="mt-4 space-y-3 rounded-xl border border-violet-200 bg-white p-3">
                        <input type="hidden" name="slug" value={slug}/>
                        <input type="hidden" name="appointment_id" value={appointment.appointment_id}/>
                        <p className="text-sm font-semibold text-slate-800">Registrar un nuevo compromiso</p>
                        <label className="block text-xs font-semibold text-slate-600">Acuerdo o acción
                          <input name="title" required minLength={3} maxLength={160} placeholder="Ej.: acompañar la rutina de lectura" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"/>
                        </label>
                        <label className="block text-xs font-semibold text-slate-600">Detalle (opcional)
                          <textarea name="details" maxLength={1000} rows={2} placeholder="Precisiones, recursos o pasos acordados..." className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"/>
                        </label>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block text-xs font-semibold text-slate-600">Responsable
                            <select name="responsible" defaultValue="guardian" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal">
                              <option value="guardian">Tutor</option><option value="family">Familia</option><option value="student">Alumno</option><option value="teacher">Docente</option>
                            </select>
                          </label>
                          <label className="block text-xs font-semibold text-slate-600">Fecha de seguimiento
                            <input name="due_date" type="date" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"/>
                          </label>
                        </div>
                        <button className="rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">Guardar compromiso</button>
                      </form>
                    ) : null}
                  </section>
                ) : null}
                {appointment.conversation?.length ? (
                  <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                      Ver historial de coordinación · {appointment.conversation.length} {appointment.conversation.length === 1 ? "movimiento" : "movimientos"}
                    </summary>
                    <ol className="mt-3 space-y-4">
                      {[...appointment.conversation]
                        .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
                        .map((event, index) => (
                          <li key={event.id} className="relative border-l-2 border-violet-200 pb-1 pl-4 last:border-l-transparent">
                            <span className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-violet-500" aria-hidden="true" />
                            <p className="text-sm font-semibold text-slate-800">{appointmentEventLabel(event.event_type)}</p>
                            <p className="mt-1 text-xs text-slate-500">{event.actor_name} · {dateLabel(event.created_at)}</p>
                            {event.body ? <p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-slate-600">{event.body}</p> : null}
                            {event.proposed_at ? (
                              <p className="mt-2 rounded-lg border border-violet-100 bg-white px-3 py-2 text-xs font-semibold text-violet-800">
                                Horario alternativo: {dateLabel(event.proposed_at)}
                              </p>
                            ) : null}
                          </li>
                        ))}
                    </ol>
                  </details>
                ) : null}
                {canManageAppointments && (appointment.status === "confirmed" || appointment.status === "requested") ? (
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
            <p className="mt-1 text-sm text-slate-500">{selectedStudentId ? "No hay citaciones ni comunicaciones de coordinación registradas para este estudiante." : isGuardian ? "Cuando un docente solicite una entrevista, aparecerá aquí para que puedas responder." : "Las solicitudes que envíes a las familias aparecerán aquí para que puedas seguir su estado."}</p>
          </section>
        )}
      </div>
    </main>
  );
}
