import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Bell, BookOpen, CalendarCheck, FileText, GraduationCap, Megaphone, MessageCircle, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

type PublishedReportCard = {
  workflow_id: string;
  student_id: string;
  created_at: string;
  snapshot: {
    period?: { name?: string };
    academic_year?: { name?: string };
    published_at?: string;
    workflow_version?: number;
  };
};

type FamilyAnnouncement = { id: string; title: string; body: string; published_at: string | null; expires_at: string | null };
type StudentConversation = { conversation_id: string; student_id: string; student_name: string };
type ConversationSummary = { conversation_id: string; counterpart_name: string; counterpart_role_keys?: string[] | null; last_message_body: string | null; last_message_at: string | null; unread_count?: number | null };

type PortalStudent = {
  student_id: string;
  first_name: string;
  last_name: string;
  student_number: string | null;
  is_self: boolean;
  division_id: string | null;
  division_name: string | null;
  course_name: string | null;
  academic_year_id: string | null;
  academic_year_name: string | null;
  enrollment_status: string;
  can_view_grades: boolean;
  can_view_attendance: boolean;
  attendance_present: number;
  attendance_absent: number;
  attendance_late: number;
  attendance_justified: number;
  attendance_early_departure: number;
  attendance_total: number;
  last_attendance_on: string | null;
  published_report_card_count: number;
  latest_report_card_at: string | null;
};

function dateLabel(value: string | null) {
  if (!value) return "Sin registros";
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium" }).format(new Date(value));
}

function dateTimeLabel(value: string | null) {
  if (!value) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(value));
}

function roleLabel(roleKey: string) {
  const normalized = roleKey.trim().toLowerCase().replace(/[.\\s-]+/g, "_");
  const labels: Record<string, string> = {
    docente: "Docente",
    teacher: "Docente",
    preceptor: "Preceptor",
    preceptoria: "Preceptoría",
    directivo: "Directivo",
    directivos: "Directivos",
    rector: "Rector",
    vicerrector: "Vicerrector",
    administrativo: "Administrativo",
    administrativos: "Administrativos",
    tutor: "Tutor",
    alumno: "Alumno",
    estudiante: "Alumno",
    administrador: "Administrador",
    superadministrador: "Superadministrador",
  };
  return labels[normalized] ?? normalized.split("_").filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

export default async function StudentFamilyPortal({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
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

  const [{ data: rows, error }, { data: announcementRows, error: announcementError }, { count: unreadNotifications }] = await Promise.all([
    supabase.rpc("list_my_portal_students", { p_institution_id: institution.id }),
    supabase.from("announcements")
      .select("id,title,body,published_at,expires_at")
      .eq("institution_id", institution.id)
      .not("published_at", "is", null)
      .order("published_at", { ascending: false })
      .limit(6),
    supabase.from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("institution_id", institution.id)
      .eq("recipient_membership_id", membership.id)
      .is("read_at", null),
  ]);
  const familyAnnouncements = (announcementRows ?? []) as FamilyAnnouncement[];
  const students = (rows ?? []) as PortalStudent[];
  const gradeStudentIds = students
    .filter((student) => student.can_view_grades)
    .map((student) => student.student_id);
  const { data: publishedSnapshots } = gradeStudentIds.length
    ? await supabase.from("report_card_snapshots")
      .select("workflow_id,student_id,created_at,snapshot")
      .eq("institution_id", institution.id)
      .in("student_id", gradeStudentIds)
      .order("created_at", { ascending: false })
    : { data: [] as PublishedReportCard[] };
  const publishedReportCards = (publishedSnapshots ?? []) as PublishedReportCard[];
  const tutorStudents = students.filter((student) => !student.is_self);
  const [conversationRowsResult, studentConversationResults] = await Promise.all([
    tutorStudents.length
      ? supabase.rpc("list_my_conversations", { p_institution_id: institution.id })
      : Promise.resolve({ data: [], error: null }),
    Promise.all(tutorStudents.map((student) =>
      supabase.rpc("list_my_student_conversations", {
        p_institution_id: institution.id,
        p_student_id: student.student_id,
      })
    )),
  ]);
  const conversationSummaries = (conversationRowsResult.data ?? []) as ConversationSummary[];
  const conversationSummaryById = new Map(conversationSummaries.map((conversation) => [conversation.conversation_id, conversation]));
  const recentMessageCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const studentConversationsByStudent = new Map<string, StudentConversation[]>();
  tutorStudents.forEach((student, index) => {
    const result = studentConversationResults[index];
    studentConversationsByStudent.set(
      student.student_id,
      result.error ? [] : (result.data ?? []) as StudentConversation[],
    );
  });

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <Link href={`/dashboard/${slug}`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700">
          <ArrowLeft size={16} /> Volver al espacio institucional
        </Link>

        <header className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white shadow-sm sm:p-9">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-indigo-100">
            <GraduationCap size={14} /> PORTAL DEL ESTUDIANTE Y LA FAMILIA
          </span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight">Mi espacio educativo</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-indigo-100">
            Consultá la información académica habilitada para tu cuenta en {institution.display_name}.
          </p>
        </header>

        <section className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-violet-100 p-3 text-violet-700"><Megaphone size={21}/></div>
                <div>
                  <h2 className="font-semibold text-slate-900">Comunicados de la institución</h2>
                  <p className="text-xs text-slate-500">Avisos habilitados para tu cuenta y tus vínculos familiares</p>
                </div>
              </div>
              <Link href={`/dashboard/${slug}/announcements`} className="text-sm font-semibold text-violet-700 hover:text-violet-900">Ver todos</Link>
            </div>
            {announcementError ? (
              <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">No fue posible cargar los comunicados.</p>
            ) : familyAnnouncements.length ? (
              <div className="mt-4 divide-y divide-slate-100">
                {familyAnnouncements.map((announcement) => (
                  <article key={announcement.id} className="py-3 first:pt-0 last:pb-0">
                    <p className="text-xs font-medium text-violet-700">{dateTimeLabel(announcement.published_at)}</p>
                    <h3 className="mt-1 font-semibold text-slate-900">{announcement.title}</h3>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">{announcement.body}</p>
                    {announcement.expires_at ? <p className="mt-2 text-xs text-slate-400">Disponible hasta {dateTimeLabel(announcement.expires_at)}</p> : null}
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No hay comunicados disponibles para tu perfil en este momento.</p>
            )}
          </article>
          <Link href={`/dashboard/${slug}/notifications`} className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-violet-200 hover:bg-violet-50/40">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-sky-100 p-3 text-sky-700"><Bell size={21}/></div>
              <div>
                <h2 className="font-semibold text-slate-900">Centro de notificaciones</h2>
                <p className="text-xs text-slate-500">Mensajes y avisos de tu cuenta</p>
              </div>
            </div>
            <div className="mt-5 flex items-end justify-between gap-3">
              <p className="text-sm text-slate-600">Tenés <strong className="text-slate-900">{unreadNotifications ?? 0}</strong> avisos sin leer</p>
              <span className="text-sm font-semibold text-violet-700">Abrir centro →</span>
            </div>
          </Link>
        </section>

        {error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
            No fue posible cargar tu portal. Verificá que tu cuenta tenga un perfil de alumno o tutor activo.
          </div>
        ) : students.length ? (
          <div className="grid gap-5 lg:grid-cols-2">
            {students.map((student) => (
              <article id={`student-${student.student_id}`} key={student.student_id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-[box-shadow,border-color] duration-300 has-[section:target]:border-violet-400 has-[section:target]:ring-2 has-[section:target]:ring-violet-300 has-[section:target]:shadow-lg has-[li:target]:border-violet-400 has-[li:target]:ring-2 has-[li:target]:ring-violet-300 has-[li:target]:shadow-lg">
                <div className="border-b border-slate-100 bg-slate-50/70 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-semibold text-slate-900">{student.last_name}, {student.first_name}</h2>
                        <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                          {student.is_self ? "Mi cuenta" : "Estudiante a cargo"}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">
                        {student.course_name && student.division_name
                          ? `${student.course_name} · ${student.division_name}`
                          : "Sin matrícula activa"}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {student.academic_year_name ? `Ciclo lectivo ${student.academic_year_name}` : "Ciclo lectivo no asignado"}
                        {student.student_number ? ` · Legajo ${student.student_number}` : ""}
                      </p>
                    </div>
                    <div className="rounded-xl bg-violet-100 p-3 text-violet-700"><GraduationCap size={23} /></div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-5">
                  <div className="rounded-xl bg-emerald-50 p-3">
                    <p className="text-xs text-emerald-700">Presentes</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-900">{student.can_view_attendance ? student.attendance_present : "—"}</p>
                  </div>
                  <div className="rounded-xl bg-rose-50 p-3">
                    <p className="text-xs text-rose-700">Ausentes</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-rose-900">{student.can_view_attendance ? student.attendance_absent : "—"}</p>
                  </div>
                  <div className="rounded-xl bg-amber-50 p-3">
                    <p className="text-xs text-amber-700">Tardanzas</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-amber-900">{student.can_view_attendance ? student.attendance_late : "—"}</p>
                  </div>
                  <div className="rounded-xl bg-sky-50 p-3">
                    <p className="text-xs text-sky-700">Justificadas</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-sky-900">{student.can_view_attendance ? student.attendance_justified : "—"}</p>
                  </div>
                  <div className="rounded-xl bg-orange-50 p-3">
                    <p className="text-xs text-orange-700">Retiros anticipados</p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-orange-900">{student.can_view_attendance ? student.attendance_early_departure : "—"}</p>
                  </div>
                </div>

                <div className="px-5 pb-4">
                  {student.can_view_attendance ? (
                    <p className="text-xs text-slate-500">
                      {student.attendance_total} registros · Última asistencia: {dateLabel(student.last_attendance_on)}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-400">Tu perfil no tiene habilitada la consulta de asistencia para este estudiante.</p>
                  )}
                  {student.can_view_grades ? (
                    <p className="mt-1 text-xs text-slate-500">
                      {student.published_report_card_count} boletines publicados · Último: {dateLabel(student.latest_report_card_at)}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400">Tu perfil no tiene habilitada la consulta de calificaciones para este estudiante.</p>
                  )}
                </div>

                {student.can_view_grades && (
                  <section className="border-t border-slate-100 px-5 py-4">
                    <h3 className="text-sm font-semibold text-slate-800">Boletines oficiales publicados</h3>
                    {publishedReportCards.filter((card) => card.student_id === student.student_id).length ? (
                      <ul className="mt-3 space-y-2">
                        {publishedReportCards
                          .filter((card) => card.student_id === student.student_id)
                          .map((card) => (
                            <li key={card.workflow_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                              <div>
                                <p className="text-sm font-medium text-slate-800">
                                  {card.snapshot.period?.name ?? "Boletín académico"}
                                  {card.snapshot.academic_year?.name ? ` · ${card.snapshot.academic_year.name}` : ""}
                                  {card.snapshot.workflow_version && card.snapshot.workflow_version > 1 ? ` · v${card.snapshot.workflow_version}` : ""}
                                </p>
                                <p className="text-xs text-slate-500">Publicado: {dateLabel(card.snapshot.published_at ?? card.created_at)}</p>
                              </div>
                              <Link
                                href={`/dashboard/${slug}/report-cards/${card.workflow_id}/pdf`}
                                className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50"
                              >
                                <FileText size={14} /> Descargar PDF
                              </Link>
                            </li>
                          ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs text-slate-500">Todavía no hay boletines oficiales publicados para este estudiante.</p>
                    )}
                  </section>
                )}

                <style>{`li[id^="conversation-"]:target .conversation-open-label { display: inline-flex; }`}</style>
                <section id={`student-${student.student_id}-conversations`} className="scroll-mt-6 border-t border-slate-100 px-5 py-4 transition-colors duration-300 target:rounded-xl target:border-violet-300 target:bg-violet-50/80 target:ring-2 target:ring-violet-200 target:ring-inset has-[li:target]:rounded-xl has-[li:target]:border-violet-300 has-[li:target]:bg-violet-50/80 has-[li:target]:ring-2 has-[li:target]:ring-violet-200 has-[li:target]:ring-inset" aria-label="Historial de conversaciones del alumno">
                  <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-slate-800">Conversaciones sobre este alumno</h3>
                      <p className="mt-1 text-xs leading-5 text-slate-500">Historial privado con docentes y preceptores autorizados</p>
                    </div>
                    {!student.is_self ? (
                      <Link
                        href={`/dashboard/${slug}/messages?student=${student.student_id}`}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-violet-700 px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-violet-800 sm:w-auto sm:shrink-0"
                        aria-label={`Iniciar una conversación vinculada a ${student.first_name} ${student.last_name}`}
                      >
                        <Plus size={14} /> Nueva conversación
                      </Link>
                    ) : (
                      <MessageCircle size={18} className="self-end text-violet-600 sm:self-auto" />
                    )}
                  </div>
                  {student.is_self ? (
                    <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">Este historial está disponible en el perfil de tutor vinculado al alumno.</p>
                  ) : (studentConversationsByStudent.get(student.student_id) ?? []).length ? (
                    <>
                      {(() => {
                        const authorizedConversations = studentConversationsByStudent.get(student.student_id) ?? [];
                        const unreadTotal = authorizedConversations.reduce(
                          (total, item) => total + Math.max(0, conversationSummaryById.get(item.conversation_id)?.unread_count ?? 0),
                          0,
                        );
                        return (
                          <div className="mt-3 grid grid-cols-2 gap-2" aria-label="Resumen de conversaciones del alumno">
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                              <p className="text-[11px] font-medium text-slate-500">Conversaciones privadas</p>
                              <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{authorizedConversations.length}</p>
                            </div>
                            <div className={`rounded-xl border px-3 py-2 ${unreadTotal > 0 ? "border-violet-200 bg-violet-50" : "border-slate-200 bg-slate-50"}`}>
                              <p className={`text-[11px] font-medium ${unreadTotal > 0 ? "text-violet-700" : "text-slate-500"}`}>Mensajes sin leer</p>
                              <p className={`mt-1 text-xl font-bold tabular-nums ${unreadTotal > 0 ? "text-violet-900" : "text-slate-900"}`}>{unreadTotal}</p>
                            </div>
                          </div>
                        );
                      })()}
                    <ul className="mt-3 space-y-2">
                      {[...(studentConversationsByStudent.get(student.student_id) ?? [])]
                        .sort((a, b) => {
                          const aTime = Date.parse(conversationSummaryById.get(a.conversation_id)?.last_message_at ?? "") || 0;
                          const bTime = Date.parse(conversationSummaryById.get(b.conversation_id)?.last_message_at ?? "") || 0;
                          return bTime - aTime;
                        })
                        .map((item) => {
                        const counterpart = conversationSummaryById.get(item.conversation_id);
                        const unreadCount = counterpart?.unread_count ?? 0;
                        const lastMessageTime = counterpart?.last_message_at ? Date.parse(counterpart.last_message_at) : 0;
                        const isRecent = lastMessageTime >= recentMessageCutoff && lastMessageTime <= Date.now();
                        const hasMessages = Boolean(counterpart?.last_message_at || counterpart?.last_message_body);
                        return (
                          <li id={`conversation-${item.conversation_id}`} key={item.conversation_id} className={`scroll-mt-8 flex flex-col items-stretch gap-3 rounded-xl border px-3 py-3 transition-[background-color,border-color,box-shadow] duration-300 target:border-violet-400 target:bg-violet-100 target:ring-2 target:ring-violet-300 target:shadow-md sm:flex-row sm:items-center sm:justify-between ${isRecent ? "border-violet-200 bg-violet-50/70" : "border-slate-200 bg-slate-50"}`}>
                            <div className="min-w-0 w-full flex-1">
                              <div className="flex min-w-0 flex-col items-start gap-2.5">
                                <div className="flex min-w-0 flex-col items-start gap-1.5">
                                  <p className="max-w-full break-words text-sm font-semibold leading-5 text-slate-900">{counterpart?.counterpart_name ?? "Contacto escolar autorizado"}</p>
                                  <span className="conversation-open-label hidden rounded-full border border-violet-300 bg-white px-2 py-0.5 text-[11px] font-bold text-violet-800" role="status" aria-label="Esta es la conversación que acabás de visitar">Conversación abierta</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5" aria-label="Perfil y estado de la conversación">
                                  {(counterpart?.counterpart_role_keys ?? []).length ? (
                                    (counterpart?.counterpart_role_keys ?? []).map((roleKey) => (
                                      <span key={roleKey} className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                                        {roleLabel(roleKey)}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500">
                                      Perfil institucional
                                    </span>
                                  )}
                                  <span className={hasMessages
                                    ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800"
                                    : "rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600"}
                                  >
                                    {hasMessages ? "Activa" : "Sin mensajes"}
                                  </span>
                                  {isRecent ? (
                                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-800">Reciente</span>
                                  ) : null}
                                  {unreadCount > 0 ? (
                                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-800" aria-label={`${unreadCount} mensajes sin leer`}>
                                      {unreadCount} sin leer
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                              {hasMessages ? (
                                <div className="mt-2.5 rounded-lg border border-slate-200/80 bg-white/80 px-3 py-2.5">
                                  <p className="text-xs leading-5 text-slate-600">{counterpart?.last_message_body ? counterpart.last_message_body.slice(0, 110) : "Mensaje enviado en esta conversación"}</p>
                                  {counterpart?.last_message_body && counterpart.last_message_body.length > 110 ? <span className="sr-only">El resumen fue abreviado</span> : null}
                                  {counterpart?.last_message_at ? (
                                    <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] font-medium text-slate-400">Último mensaje · {dateTimeLabel(counterpart.last_message_at)}</p>
                                  ) : null}
                                </div>
                              ) : (
                                <div className="mt-2.5 flex items-start gap-2.5 rounded-lg border border-dashed border-slate-300 bg-slate-100/70 px-3 py-3" aria-label="Todavía no hay mensajes en esta conversación">
                                  <MessageCircle size={15} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
                                  <p className="text-xs leading-5 text-slate-500">Aún no hay intercambio. El primer mensaje aparecerá aquí.</p>
                                </div>
                              )}
                            </div>
                            <Link href={`/dashboard/${slug}/messages/${item.conversation_id}?student=${student.student_id}`} className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-violet-200 bg-white px-3 py-2.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-50 sm:w-auto sm:self-center">
                              Abrir conversación <MessageCircle size={14} />
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                    </>
                  ) : (
                    <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">Todavía no hay conversaciones privadas vinculadas a este alumno.</p>
                  )}
                </section>

                <div className="flex flex-wrap gap-2 border-t border-slate-100 p-5">
                  {student.can_view_grades ? (
                    <Link href={`/dashboard/${slug}/report-cards?student=${student.student_id}`}
                      className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-800">
                      <FileText size={15} /> Boletines
                    </Link>
                  ) : null}
                  {student.can_view_attendance ? (
                    <Link href={`/dashboard/${slug}/portal/attendance/${student.student_id}`}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                      <CalendarCheck size={15} /> Ver asistencia
                    </Link>
                  ) : null}
                  <Link href={`/dashboard/${slug}/classroom`}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    <BookOpen size={15} /> Aula virtual
                  </Link>
                  <Link href={`/dashboard/${slug}/messages?student=${student.student_id}`}
                    className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800 hover:bg-violet-100">
                    <MessageCircle size={15} /> Ver mensajería del alumno
                  </Link>
                  <Link href={`/dashboard/${slug}/appointments?student=${student.student_id}`}
                    className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800 hover:bg-violet-100">
                    <CalendarCheck size={15} /> Historial de comunicaciones y citaciones
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <ShieldCheck className="mx-auto text-slate-300" size={32} />
            <h2 className="mt-4 font-semibold text-slate-800">Todavía no hay estudiantes vinculados</h2>
            <p className="mt-2 text-sm text-slate-500">
              Cuando la institución vincule tu cuenta con un legajo y una matrícula, la información autorizada aparecerá aquí.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
