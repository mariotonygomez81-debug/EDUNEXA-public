import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, History, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";

type Course = { id: string; name: string; grade_number: number | null };
type HistoryRow = {
  course_id: string;
  course_name: string;
  history_id: number;
  previous_orientation_name: string;
  new_orientation_name: string;
  actor_user_id: string;
  actor_name: string;
  changed_at: string;
  total_count: number;
};

function validDate(value?: string) {
  return value && /^\\d{4}-\\d{2}-\\d{2}$/.test(value) ? value : "";
}

function historyHref(slug: string, values: {
  course_id: string; page: number; from: string; to: string; actor: string;
}) {
  const params = new URLSearchParams();
  params.set("course_id", values.course_id);
  params.set("page", String(values.page));
  if (values.from) params.set("from", values.from);
  if (values.to) params.set("to", values.to);
  if (values.actor) params.set("actor", values.actor);
  return `/dashboard/${slug}/settings/academic-structure/history?${params.toString()}`;
}

export default async function CourseOrientationHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{
    course_id?: string; page?: string; from?: string; to?: string; actor?: string;
  }>;
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

  const permissions = await getMembershipPermissions(supabase, membership.id);
  if (!permissions.has("institution.manage")) redirect(`/dashboard/${slug}`);

  const { data: courseRows } = await supabase.from("courses")
    .select("id,name,grade_number")
    .eq("institution_id", institution.id)
    .order("grade_number", { ascending: true })
    .order("name", { ascending: true });
  const courses = (courseRows ?? []) as Course[];
  const selectedCourse = courses.find((course) => course.id === query.course_id) ?? null;
  const pageNumber = Math.min(100000, Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1));
  const from = validDate(query.from);
  const to = validDate(query.to);
  const actor = (query.actor ?? "").trim().slice(0, 100);
  const invalidRange = Boolean(from && to && from > to);

  let history: HistoryRow[] = [];
  if (selectedCourse && !invalidRange) {
    const { data } = await supabase.rpc("list_course_orientation_history_page", {
      p_institution_id: institution.id,
      p_course_id: selectedCourse.id,
      p_page: pageNumber,
      p_page_size: 25,
      p_from_date: from || null,
      p_to_date: to || null,
      p_actor_name: actor || null,
    });
    history = (data ?? []) as HistoryRow[];
  }

  const totalCount = Number(history[0]?.total_count ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / 25));
  const currentPage = Math.min(pageNumber, totalPages);
  const dateTime = new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires",
  });

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href={`/dashboard/${slug}/settings/academic-structure`}
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700">
          <ArrowLeft size={16} /> Volver a Estructura académica
        </Link>

        <header className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-7 text-white shadow-sm sm:p-9">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-indigo-100">
            <History size={14} /> REGISTRO INSTITUCIONAL
          </span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight">Historial de orientaciones</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-indigo-100">
            Consultá todos los cambios de orientación del curso, con responsable y fecha. El registro es histórico e inalterable.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <form method="get" className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <label className="text-sm font-medium text-slate-700 xl:col-span-2">Curso
              <select name="course_id" required defaultValue={selectedCourse?.id ?? ""}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal">
                <option value="" disabled>Seleccionar curso</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}{course.grade_number ? ` · ${course.grade_number}° año` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">Desde
              <input type="date" name="from" defaultValue={from}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
            </label>
            <label className="text-sm font-medium text-slate-700">Hasta
              <input type="date" name="to" defaultValue={to}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
            </label>
            <label className="text-sm font-medium text-slate-700">Responsable
              <input type="search" name="actor" maxLength={100} defaultValue={actor}
                placeholder="Nombre o correo"
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" />
            </label>
            <div className="flex flex-wrap items-end gap-2 md:col-span-2 xl:col-span-5">
              <button className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800">
                <Search size={16} /> Aplicar filtros
              </button>
              <Link href={selectedCourse
                ? historyHref(slug, { course_id: selectedCourse.id, page: 1, from: "", to: "", actor: "" })
                : `/dashboard/${slug}/settings/academic-structure/history`}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                Limpiar filtros
              </Link>
            </div>
          </form>
          {invalidRange ? (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              La fecha inicial no puede ser posterior a la fecha final.
            </p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="font-semibold text-slate-900">
                {selectedCourse ? `Movimientos · ${selectedCourse.name}` : "Seleccioná un curso"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {selectedCourse && !invalidRange
                  ? `${totalCount.toLocaleString("es-AR")} movimientos encontrados · 25 por página`
                  : "Elegí un curso para consultar su historial completo."}
              </p>
            </div>
            <Link href={`/dashboard/${slug}/admin/auditoria?action=education.course.orientation.updated`}
              className="text-sm font-semibold text-indigo-700 hover:text-indigo-900">
              Abrir bitácora institucional →
            </Link>
          </div>

          {history.length ? (
            <ol className="mt-5 space-y-5 border-l-2 border-indigo-100 pl-5">
              {history.map((event) => (
                <li key={event.history_id} className="relative">
                  <span className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-indigo-500" />
                  <p className="font-medium text-slate-800">
                    {event.previous_orientation_name}
                    <span className="px-2 text-slate-400">→</span>
                    {event.new_orientation_name}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {event.actor_name} · {dateTime.format(new Date(event.changed_at))}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">Movimiento #{event.history_id}</p>
                </li>
              ))}
            </ol>
          ) : selectedCourse && !invalidRange ? (
            <p className="py-10 text-center text-sm text-slate-500">No hay movimientos que coincidan con estos filtros.</p>
          ) : null}

          {totalPages > 1 ? (
            <nav aria-label="Paginación del historial" className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
              <p className="text-sm text-slate-500">Página {currentPage} de {totalPages}</p>
              <div className="flex gap-2">
                {currentPage > 1 ? (
                  <Link href={historyHref(slug, { course_id: selectedCourse!.id, page: currentPage - 1, from, to, actor })}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    <ChevronLeft size={16} /> Anterior
                  </Link>
                ) : null}
                {currentPage < totalPages ? (
                  <Link href={historyHref(slug, { course_id: selectedCourse!.id, page: currentPage + 1, from, to, actor })}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    Siguiente <ChevronRight size={16} />
                  </Link>
                ) : null}
              </div>
            </nav>
          ) : null}
        </section>
      </div>
    </main>
  );
}
