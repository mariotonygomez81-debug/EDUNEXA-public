import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Bell, Megaphone, Send, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";
import { createAnnouncement } from "./actions";

type Announcement = {
  id: string;
  title: string;
  body: string;
  audience: string;
  division_id: string | null;
  published_at: string | null;
  expires_at: string | null;
  created_at: string;
};

type DivisionOption = {
  id: string;
  name: string;
  course_name: string;
};

const audienceLabels: Record<string, string> = {
  institution: "Toda la institución",
  staff: "Personal",
  families: "Familias",
  students: "Estudiantes",
  course: "Curso / división",
};

function formatDate(value: string | null) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function AnnouncementsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ created?: string; error?: string }>;
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

  const [{ data: roleRows }, permissions] = await Promise.all([
    supabase.from("membership_roles").select("roles(key)").eq("membership_id", membership.id),
    getMembershipPermissions(supabase, membership.id),
  ]);
  const roleKeys = (roleRows ?? []).map((row) => row.roles?.key).filter(Boolean);
  const canManageCommunications = permissions.has("communications.manage");
  const isAdministrative = roleKeys.includes("administrative");
  const canPublishInstitutionWide = roleKeys.includes("institution_admin") || roleKeys.includes("director");

  const [{ data: announcementRows, error: announcementsError }, divisionsResult] = await Promise.all([
    supabase.from("announcements")
      .select("id,title,body,audience,division_id,published_at,expires_at,created_at")
      .eq("institution_id", institution.id)
      .order("published_at", { ascending: false })
      .limit(100),
    canManageCommunications
      ? supabase.rpc("list_announcement_divisions", { p_institution_id: institution.id })
      : Promise.resolve({ data: [] as DivisionOption[], error: null }),
  ]);

  const announcements = (announcementRows ?? []) as Announcement[];
  const divisions = (divisionsResult.data ?? []) as DivisionOption[];
  const divisionLabel = new Map(divisions.map((division) => [
    division.id,
    `${division.course_name} · ${division.name}`,
  ]));

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href={`/dashboard/${slug}`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700">
          <ArrowLeft size={16} /> Volver al espacio institucional
        </Link>

        <header className="rounded-3xl bg-gradient-to-br from-indigo-950 via-violet-900 to-indigo-800 p-7 text-white shadow-sm sm:p-9">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-violet-100">
            <Megaphone size={14} /> COMUNICACIONES
          </span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight">Anuncios institucionales</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-indigo-100">
            Novedades y comunicaciones para los grupos autorizados de {institution.display_name}.
          </p>
        </header>

        {query.created ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status">
            El anuncio se publicó correctamente.
          </div>
        ) : null}
        {query.error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
            {query.error === "forbidden"
              ? "Tu perfil no tiene permiso para publicar anuncios."
              : query.error === "scope"
                ? "No podés publicar en ese público o división. Verificá tu alcance institucional."
                : query.error === "invalid"
                  ? "Revisá el título, el contenido, el público y la fecha de vencimiento."
                  : "No se pudo publicar el anuncio. Verificá los datos y volvé a intentarlo."}
          </div>
        ) : null}

        {canManageCommunications ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-xl bg-violet-100 p-3 text-violet-700"><Send size={21} /></div>
              <div>
                <h2 className="font-semibold text-slate-900">Publicar un anuncio</h2>
                <p className="text-sm text-slate-500">El servidor vuelve a validar tu perfil y el alcance antes de guardar.</p>
              </div>
            </div>

            <form action={createAnnouncement} className="space-y-4">
              <input type="hidden" name="slug" value={slug} />
              <label className="block text-sm font-medium text-slate-700">
                Título
                <input name="title" required minLength={3} maxLength={160}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                  placeholder="Ej.: Reunión de familias" />
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Contenido
                <textarea name="body" required minLength={1} maxLength={10000} rows={5}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                  placeholder="Escribí el mensaje que recibirán los destinatarios..." />
              </label>

              {canPublishInstitutionWide ? (
                <label className="block text-sm font-medium text-slate-700">
                  Destinatarios
                  <select name="audience" required defaultValue="institution"
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal">
                    <option value="institution">Toda la institución</option>
                    <option value="staff">Personal</option>
                    <option value="families">Familias / tutores</option>
                    <option value="students">Estudiantes</option>
                    <option value="course">Un curso o división</option>
                  </select>
                </label>
              ) : isAdministrative ? (
                <label className="block text-sm font-medium text-slate-700">
                  Destinatarios
                  <select name="audience" required defaultValue="families"
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal">
                    <option value="families">Familias / tutores</option>
                    <option value="students">Estudiantes</option>
                  </select>
                  <span className="mt-1 block text-xs font-normal text-slate-500">El perfil Administrativo puede publicar comunicados para familias y estudiantes.</span>
                </label>
              ) : (
                <>
                  <input type="hidden" name="audience" value="course" />
                  <div className="rounded-xl bg-violet-50 p-3 text-sm text-violet-900">
                    Tu perfil puede publicar anuncios únicamente en los cursos o divisiones que tiene asignados.
                  </div>
                </>
              )}

              <label className="block text-sm font-medium text-slate-700">
                Curso o división
                <select name="division_id" defaultValue=""
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal">
                  <option value="">Seleccioná una división (solo para anuncios de curso)</option>
                  {divisions.map((division) => (
                    <option key={division.id} value={division.id}>
                      {division.course_name} · {division.name}
                    </option>
                  ))}
                </select>
                {divisionsResult.error ? (
                  <span className="mt-1 block text-xs text-amber-700">No fue posible cargar las divisiones autorizadas.</span>
                ) : null}
              </label>

              <label className="block text-sm font-medium text-slate-700">
                Fecha y hora de vencimiento (opcional)
                <input name="expires_at" type="datetime-local"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal"/>
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Al llegar ese momento, el anuncio deja de estar disponible para los destinatarios. Si lo dejás vacío, no vence automáticamente.
                </span>
              </label>
              <p className="text-xs leading-5 text-slate-500">
                Los anuncios se publican inmediatamente. Los avisos vencidos o no publicados no se muestran a los destinatarios.
              </p>
              <button type="submit" disabled={!canPublishInstitutionWide && divisions.length === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-400">
                <Send size={16} /> Publicar anuncio
              </button>
            </form>
          </section>
        ) : null}

        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-sky-100 p-3 text-sky-700"><Bell size={21} /></div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Anuncios disponibles</h2>
              <p className="text-sm text-slate-500">Solo se muestran comunicaciones habilitadas para tu perfil.</p>
            </div>
          </div>

          {announcementsError ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
              No fue posible consultar los anuncios. No se habilitó un acceso alternativo a la tabla.
            </div>
          ) : announcements.length ? (
            <div className="space-y-3">
              {announcements.map((announcement) => (
                <article key={announcement.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="inline-flex rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
                        {audienceLabels[announcement.audience] ?? "Anuncio"}
                      </span>
                      <h3 className="mt-2 text-lg font-semibold text-slate-900">{announcement.title}</h3>
                    </div>
                    <time className="text-xs text-slate-500">{formatDate(announcement.published_at)}</time>
                  </div>
                  {announcement.audience === "course" && announcement.division_id ? (
                    <p className="mt-2 text-xs text-slate-500">
                      {divisionLabel.get(announcement.division_id) ?? "División asignada"}
                    </p>
                  ) : null}
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{announcement.body}</p>
                  {announcement.expires_at ? (
                    <p className="mt-3 text-xs text-slate-400">Vigente hasta: {formatDate(announcement.expires_at)}</p>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <ShieldCheck className="mx-auto text-slate-300" size={30} />
              <p className="mt-3 text-sm text-slate-500">No hay anuncios disponibles para tu perfil en este momento.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
