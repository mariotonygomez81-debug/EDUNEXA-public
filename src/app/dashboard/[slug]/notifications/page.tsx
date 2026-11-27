import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Bell, CheckCheck, Settings2, ShieldCheck, MessageCircle, Megaphone, CalendarCheck, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { markNotificationRead, setNotificationPreference } from "./actions";

type Notification = {
  id: string;
  notification_type: string;
  title: string;
  body: string;
  resource_type: string;
  resource_id: string;
  created_at: string;
  read_at: string | null;
};

type Preference = {
  notification_type: string;
  in_app_enabled: boolean;
};

const preferenceOptions = [
  { key: "announcement", label: "Anuncios institucionales", description: "Comunicaciones para tus grupos y divisiones." },
  { key: "message", label: "Mensajes", description: "Nuevos mensajes y respuestas en conversaciones." },
  { key: "grade", label: "Calificaciones", description: "Publicación o actualización de calificaciones." },
  { key: "attendance", label: "Asistencia", description: "Novedades y comunicaciones de asistencia." },
  { key: "support", label: "Soporte", description: "Cambios y respuestas en tus tickets de soporte." },
  { key: "appointment", label: "Citaciones y entrevistas", description: "Nuevas citaciones, respuestas, reprogramaciones y entrevistas realizadas." },
];

const typeLabels: Record<string, string> = {
  announcement: "Anuncio",
  message: "Mensaje",
  grade: "Calificación",
  attendance: "Asistencia",
  support: "Soporte",
  account_access: "Acceso a la cuenta",
  appointment: "Citación / entrevista",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function NotificationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ read?: string; preference?: string; error?: string; category?: string; status?: string }>;
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

  const [{ data: notificationRows, error: notificationError }, { data: preferenceRows }, unreadCountResult] = await Promise.all([
    supabase.from("notifications")
      .select("id,notification_type,title,body,resource_type,resource_id,created_at,read_at")
      .eq("institution_id", institution.id)
      .eq("recipient_membership_id", membership.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("notification_preferences")
      .select("notification_type,in_app_enabled")
      .eq("institution_id", institution.id)
      .eq("membership_id", membership.id),
    supabase.from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("institution_id", institution.id)
      .eq("recipient_membership_id", membership.id)
      .is("read_at", null),
  ]);

  const notifications = (notificationRows ?? []) as Notification[];
  const preferences = (preferenceRows ?? []) as Preference[];
  const preferenceMap = new Map(preferences.map((item) => [item.notification_type, item.in_app_enabled]));
  const unreadCount = unreadCountResult.count ?? 0;
  const categories = [
    { key: "message", label: "Mensajes", icon: MessageCircle, description: "Conversaciones y respuestas" },
    { key: "announcement", label: "Comunicados", icon: Megaphone, description: "Avisos institucionales" },
    { key: "appointment", label: "Citaciones", icon: CalendarCheck, description: "Entrevistas y sus novedades" },
    { key: "grade", label: "Boletines", icon: FileText, description: "Publicación de calificaciones" },
  ];
  const selectedCategory = categories.some((item) => item.key === query.category) ? query.category! : "all";
  const selectedStatus = query.status === "unread" ? "unread" : "all";
  const categoryCounts = new Map(categories.map((item) => [item.key, notifications.filter((n) => n.notification_type === item.key).length]));
  const filteredNotifications = notifications.filter((notification) => (selectedCategory === "all" || notification.notification_type === selectedCategory) && (selectedStatus !== "unread" || !notification.read_at));
  const filteredUnreadCount = notifications.filter((notification) => (selectedCategory === "all" || notification.notification_type === selectedCategory) && !notification.read_at).length;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href={`/dashboard/${slug}`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700">
          <ArrowLeft size={16} /> Volver al espacio institucional
        </Link>

        <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white shadow-sm sm:p-9">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-indigo-100">
            <Bell size={14} /> CENTRO DE AVISOS
          </span>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Notificaciones</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-indigo-100">
                Avisos personales de {institution.display_name}, según tu perfil y tus preferencias.
              </p>
            </div>
            <div className="rounded-2xl border border-white/20 bg-white/10 px-5 py-3">
              <p className="text-xs text-indigo-100">Pendientes de leer</p>
              <p className="text-3xl font-bold tabular-nums">{unreadCount}</p>
            </div>
          </div>
        </header>

        {query.read ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status">
            Notificación marcada como leída.
          </div>
        ) : null}
        {query.preference ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status">
            Tus preferencias se actualizaron.
          </div>
        ) : null}
        {query.error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
            {query.error === "not_found"
              ? "La notificación no existe o no pertenece a tu cuenta."
              : query.error === "preference"
                ? "No se pudo guardar la preferencia."
                : "La solicitud no es válida."}
          </div>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-xl bg-violet-100 p-3 text-violet-700"><Settings2 size={21} /></div>
            <div>
              <h2 className="font-semibold text-slate-900">Preferencias de notificaciones</h2>
              <p className="text-sm text-slate-500">Podés activar o desactivar los avisos dentro de la plataforma.</p>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {preferenceOptions.map((option) => {
              const enabled = preferenceMap.get(option.key) ?? true;
              return (
                <form key={option.key} action={setNotificationPreference}
                  className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="notification_type" value={option.key} />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{option.label}</p>
                    <p className="mt-1 text-xs text-slate-500">{option.description}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <input type="hidden" name="enabled" value="false" />
                    <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                      <input type="checkbox" name="enabled" value="true" defaultChecked={enabled}
                        className="h-4 w-4 rounded border-slate-300 text-violet-700 focus:ring-violet-500" />
                      Activadas
                    </label>
                    <button type="submit"
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                      Guardar
                    </button>
                  </div>
                </form>
              );
            })}
          </div>
          <p className="mt-5 text-xs leading-5 text-slate-400">
            Recibís avisos automáticos de anuncios y citaciones. Podés administrar cada categoría desde aquí.
          </p>
        </section>

        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="font-semibold text-slate-900">Tus avisos por categoría</h2><p className="mt-1 text-sm text-slate-500">Accedé directamente a mensajes, comunicados, citaciones y boletines publicados para tu cuenta.</p></div>
              <Link href={`/dashboard/${slug}/notifications`} className="text-xs font-semibold text-violet-700 hover:text-violet-900">Ver todos</Link>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {categories.map((category) => { const Icon = category.icon; const active = selectedCategory === category.key; return (
                <Link key={category.key} href={`/dashboard/${slug}/notifications?category=${category.key}${selectedStatus === "unread" ? "&status=unread" : ""}`} aria-current={active ? "page" : undefined}
                  className={active ? "rounded-xl border border-violet-300 bg-violet-50 p-3" : "rounded-xl border border-slate-200 bg-white p-3 hover:border-violet-200 hover:bg-slate-50"}>
                  <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Icon size={17} className="text-violet-700" />{category.label}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold tabular-nums text-slate-700">{categoryCounts.get(category.key) ?? 0}</span></div>
                  <p className="mt-1 text-xs text-slate-500">{category.description}</p>
                </Link>); })}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
              <Link href={`/dashboard/${slug}/notifications${selectedCategory === "all" ? "" : "?category=" + selectedCategory}`} className={selectedStatus === "all" ? "rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white" : "rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"}>Todos</Link>
              <Link href={`/dashboard/${slug}/notifications?${selectedCategory === "all" ? "" : "category=" + selectedCategory + "&"}status=unread`} className={selectedStatus === "unread" ? "rounded-full bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white" : "rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"}>Sin leer ({filteredUnreadCount})</Link>
              {selectedCategory !== "all" ? <Link href={`/dashboard/${slug}/notifications${selectedStatus === "unread" ? "?status=unread" : ""}`} className="ml-auto text-xs font-semibold text-slate-500 hover:text-violet-700">Quitar categoría</Link> : null}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-sky-100 p-3 text-sky-700"><Bell size={21} /></div>
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Actividad reciente</h2>
                <p className="text-sm text-slate-500">{filteredNotifications.length} avisos en esta vista · hasta 50 recientes.</p>
              </div>
            </div>
          </div>

          {notificationError ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
              No fue posible consultar tus notificaciones.
            </div>
          ) : filteredNotifications.length ? (
            <div className="space-y-3">
              {filteredNotifications.map((notification) => (
                <article key={notification.id}
                  className={`rounded-2xl border p-5 shadow-sm ${notification.read_at ? "border-slate-200 bg-white" : "border-violet-200 bg-violet-50/50"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-violet-700">
                        {typeLabels[notification.notification_type] ?? "Aviso"}
                      </span>
                      <h3 className="mt-2 text-base font-semibold text-slate-900">{notification.title}</h3>
                    </div>
                    <time className="text-xs text-slate-500">{formatDate(notification.created_at)}</time>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{notification.body}</p>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    {notification.resource_type === "announcement" ? (
                      <Link href={`/dashboard/${slug}/announcements`} className="text-sm font-semibold text-violet-700 hover:text-violet-900">
                        Ver anuncio
                      </Link>
                    ) : notification.resource_type === "conversation" ? (
                      <Link href={`/dashboard/${slug}/messages/${notification.resource_id}`} className="text-sm font-semibold text-violet-700 hover:text-violet-900">
                        Abrir conversación
                      </Link>
                    ) : notification.resource_type === "appointment" ? (
                      <Link href={`/dashboard/${slug}/appointments`} className="text-sm font-semibold text-violet-700 hover:text-violet-900">
                        Ver citaciones y entrevistas
                      </Link>
                    ) : notification.resource_type === "membership" ? (
                      <Link href={`/dashboard/${slug}`} className="text-sm font-semibold text-violet-700 hover:text-violet-900">
                        Ir a mi espacio
                      </Link>
                    ) : <span />}
                    {notification.read_at ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                        <CheckCheck size={14} /> Leída
                      </span>
                    ) : (
                      <form action={markNotificationRead}>
                        <input type="hidden" name="slug" value={slug} />
                        <input type="hidden" name="notification_id" value={notification.id} />
                        <button type="submit" className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50">
                          Marcar como leída
                        </button>
                      </form>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <ShieldCheck className="mx-auto text-slate-300" size={30} />
              <p className="mt-3 text-sm font-medium text-slate-700">{notifications.length ? "No hay avisos que coincidan con este filtro." : "Todavía no tenés notificaciones."}</p>
              <p className="mt-1 text-xs text-slate-500">{selectedStatus === "unread" ? "No hay avisos pendientes de lectura en esta categoría." : "Cuando recibas un aviso, aparecerá aquí automáticamente."}</p>
              {(selectedCategory !== "all" || selectedStatus !== "all") ? <Link href={`/dashboard/${slug}/notifications`} className="mt-3 inline-flex text-sm font-semibold text-violet-700 hover:text-violet-900">Mostrar todas las notificaciones</Link> : null}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
