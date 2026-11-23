import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, ArrowLeft, LifeBuoy, Plus, Ticket } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";
import { createTicket } from "./actions";

const moduleLabels: Record<string, string> = {
  students: "Alumnos",
  attendance: "Asistencia",
  grades: "Calificaciones",
  classroom: "Aula virtual",
  announcements: "Comunicaciones",
  calendar: "Calendario",
  users: "Usuarios y personal",
  reports: "Informes y boletines",
  access: "Acceso",
  settings: "Configuración",
  other: "Otro módulo",
};

const statusLabels: Record<string, string> = {
  open: "Abierto",
  triaged: "En revisión",
  in_progress: "En curso",
  waiting_user: "Esperando respuesta",
  resolved: "Resuelto",
  closed: "Cerrado",
  reopened: "Reabierto",
};

export default async function SupportPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { error: errorCode } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: institution } = await supabase
    .from("institutions")
    .select("id,display_name,slug")
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

  const permissions = await getMembershipPermissions(supabase, membership.id);
  const canReadInstitutionTickets = permissions.has("support.read") || permissions.has("support.manage");
  const canCreateTicket = permissions.has("support.create");
  if (!canReadInstitutionTickets && !canCreateTicket) redirect(`/dashboard/${slug}`);
  const isInstitutionAdmin = canReadInstitutionTickets;

  const { data: tickets, error } = await supabase
    .from("support_tickets")
    .select("id,title,module_key,category,priority,status,created_at,updated_at")
    .eq("institution_id", institution.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-5">
          <Link href={`/dashboard/${slug}`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700">
            <ArrowLeft size={16} /> Volver al espacio institucional
          </Link>
          <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-violet-100 p-3 text-violet-700"><LifeBuoy size={24} /></div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">Ayuda y soporte</p>
                <h1 className="text-2xl font-bold">{isInstitutionAdmin ? "Soporte institucional" : "Mis tickets"}</h1>
              </div>
            </div>
            <p className="mt-3 max-w-2xl text-sm text-slate-500">
              Informá un problema de la plataforma y seguí las respuestas del equipo de tu institución.
            </p>
          </header>

          {errorCode && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              {errorCode === "invalid" ? "Revisá el título, el módulo, la descripción y los datos opcionales." : "No pudimos guardar la solicitud. Verificá los datos y volvé a intentarlo."}
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">{isInstitutionAdmin ? "Tickets de la institución" : "Solicitudes registradas"}</h2>
              <span className="text-xs text-slate-400">{tickets?.length ?? 0} tickets</span>
            </div>
            {error ? (
              <p className="text-sm text-rose-600">No se pudo cargar la bandeja de soporte.</p>
            ) : tickets?.length ? (
              <div className="divide-y divide-slate-100">
                {tickets.map((ticket) => (
                  <Link key={ticket.id} href={`/dashboard/${slug}/support/${ticket.id}`} className="flex items-center gap-3 py-4 hover:bg-slate-50">
                    <div className="rounded-lg bg-slate-100 p-2 text-slate-500"><Ticket size={18} /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{ticket.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{moduleLabels[ticket.module_key ?? "other"] ?? "Otro módulo"} · {ticket.category} · {new Date(ticket.created_at).toLocaleString("es-AR")}</p>
                    </div>
                    <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700">{statusLabels[ticket.status] ?? ticket.status}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-xl bg-slate-50 px-4 py-10 text-center">
                <Ticket className="mx-auto mb-3 text-slate-400" size={28} />
                <p className="font-medium">Todavía no hay tickets</p>
                <p className="mt-1 text-sm text-slate-500">Cuando se informe un inconveniente, aparecerá en esta lista.</p>
              </div>
            )}
          </div>
        </section>

        {canCreateTicket && <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Plus size={18} className="text-violet-700" />
            <h2 className="font-semibold">Crear una solicitud</h2>
          </div>
          <form action={createTicket} className="space-y-4">
            <input type="hidden" name="slug" value={slug} />
            <label className="block text-sm font-medium">
              Título del problema
              <input name="title" required minLength={5} maxLength={180} placeholder="Ej.: No puedo cargar asistencia" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" />
            </label>
            <label className="block text-sm font-medium">
              Módulo relacionado
              <select name="module_key" required defaultValue="other" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-violet-500">
                <option value="students">Alumnos y matrículas</option>
                <option value="attendance">Asistencia</option>
                <option value="grades">Calificaciones y boletines</option>
                <option value="classroom">Aula virtual</option>
                <option value="announcements">Comunicaciones</option>
                <option value="calendar">Calendario académico</option>
                <option value="users">Usuarios y personal</option>
                <option value="reports">Informes y reportes</option>
                <option value="access">Acceso y autenticación</option>
                <option value="settings">Configuración</option>
                <option value="other">Otro módulo</option>
              </select>
            </label>
            <label className="block text-sm font-medium">
              Categoría
              <select name="category" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-violet-500">
                <option value="bug">Error de funcionamiento</option>
                <option value="access">Acceso o contraseña</option>
                <option value="data">Datos incorrectos</option>
                <option value="performance">Lentitud</option>
                <option value="question">Consulta</option>
                <option value="other">Otro</option>
              </select>
            </label>
            <label className="block text-sm font-medium">
              Descripción
              <textarea name="description" required minLength={10} maxLength={10000} rows={5} placeholder="Contanos qué estabas haciendo, qué ocurrió y si aparece algún mensaje de error." className="mt-1.5 w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" />
            </label>
            <label className="block text-sm font-medium">
              Pasos para reproducir (opcional)
              <textarea name="steps_to_reproduce" maxLength={4000} rows={3} placeholder="1. Abrí el módulo… 2. Seleccioná… 3. Presioná…" className="mt-1.5 w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" />
            </label>
            <label className="block text-sm font-medium">
              Fecha y hora en que ocurrió (opcional, hora local)
              <input name="occurred_at" type="datetime-local" step={60} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" />
            </label>
            <button className="w-full rounded-lg bg-violet-700 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-800">Enviar solicitud</button>
            <p className="text-xs leading-relaxed text-slate-400">No incluyas contraseñas ni información médica o datos sensibles de alumnos en la descripción.</p>
          </form>
        </aside>}
      </div>
    </main>
  );
}
