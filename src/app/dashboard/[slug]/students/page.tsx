import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, GraduationCap, Plus, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createStudent } from "./actions";
import { getMembershipPermissions } from "@/lib/auth/permissions";

export default async function StudentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; created?: string; q?: string; status?: string }>;
}) {
  const { slug } = await params;
  const { error, created, q, status } = await searchParams;
  const search = (q ?? "").replace(/[^a-zA-Z0-9À-ÿ\s_-]/g, "").trim().slice(0, 80);
  const statusFilter = ["active", "inactive", "graduated", "withdrawn"].includes(status ?? "") ? status! : "";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: institution } = await supabase
    .from("institutions")
    .select("id,display_name")
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
  if (!permissions.has("students.read")) redirect(`/dashboard/${slug}`);
  const canManageStudents = permissions.has("students.manage");

  let studentsQuery = supabase
    .from("students")
    .select("id,student_number,first_name,last_name,birth_date,email,status,created_at")
    .eq("institution_id", institution.id)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true })
    .limit(100);
  if (search) studentsQuery = studentsQuery.or("first_name.ilike.%"+search+"%,last_name.ilike.%"+search+"%,student_number.ilike.%"+search+"%");
  if (statusFilter) studentsQuery = studentsQuery.eq("status", statusFilter);
  const { data: students, error: queryError } = await studentsQuery;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <Link href={`/dashboard/${slug}`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700">
          <ArrowLeft size={16} /> Volver al espacio institucional
        </Link>

        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-violet-100 p-3 text-violet-700"><GraduationCap size={25} /></div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">Gestión académica</p>
                <h1 className="text-2xl font-bold">Alumnos</h1>
                <p className="mt-1 text-sm text-slate-500">{institution.display_name} · Legajos y trayectorias escolares</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <Users size={17} /> {students?.length ?? 0} registros visibles
            </div>
          </div>
        </header>

        {created === "1" && (
          <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            El legajo se creó correctamente.
          </div>
        )}
        {error && (
          <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error === "invalid" ? "Revisá los datos. Nombre y apellido deben tener al menos 2 caracteres." :
             error === "forbidden" ? "Tu perfil no tiene permiso para crear legajos." :
             "No se pudo guardar el legajo. Verificá que el número de matrícula no esté duplicado."}
          </div>
        )}

        <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="min-w-[220px] flex-1 text-sm font-medium">Buscar alumno
            <input name="q" defaultValue={search} maxLength={80} placeholder="Nombre, apellido o matrícula" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal" />
          </label>
          <label className="min-w-[170px] text-sm font-medium">Estado
            <select name="status" defaultValue={statusFilter} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal">
              <option value="">Todos los estados</option><option value="active">Activo</option><option value="inactive">Inactivo</option><option value="graduated">Egresado</option><option value="withdrawn">Retirado</option>
            </select>
          </label>
          <button className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">Filtrar</button>
          <Link href={"/dashboard/"+slug+"/students"} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600">Limpiar</Link>
        </form>

        <div className={canManageStudents ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]" : "grid gap-6"}>
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="font-semibold">Listado de alumnos</h2>
              <span className="text-xs text-slate-400">Máximo 100 registros por consulta</span>
            </div>
            {queryError ? (
              <div className="p-8 text-center text-sm text-rose-700">
                No se pudo consultar el listado. Verificá que tu perfil tenga acceso a los legajos.
              </div>
            ) : students?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Alumno</th>
                      <th className="px-5 py-3 font-semibold">Matrícula</th>
                      <th className="px-5 py-3 font-semibold">Fecha de nacimiento</th>
                      <th className="px-5 py-3 font-semibold">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {students.map((student) => (
                      <tr key={student.id} className="hover:bg-slate-50">
                        <td className="px-5 py-4">
                          <Link href={`/dashboard/${slug}/students/${student.id}`} className="font-semibold text-violet-700 hover:underline">{student.last_name}, {student.first_name}</Link>
                          {student.email && <p className="mt-1 text-xs text-slate-500">{student.email}</p>}
                        </td>
                        <td className="px-5 py-4 text-slate-600">{student.student_number || "—"}</td>
                        <td className="px-5 py-4 text-slate-600">{student.birth_date ? new Date(`${student.birth_date}T12:00:00`).toLocaleDateString("es-AR") : "—"}</td>
                        <td className="px-5 py-4">
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">{student.status === "active" ? "Activo" : student.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-5 py-14 text-center">
                <GraduationCap size={32} className="mx-auto mb-3 text-slate-300" />
                <p className="font-semibold">No hay alumnos visibles</p>
                <p className="mt-1 text-sm text-slate-500">Los legajos aparecerán según los permisos de tu perfil y las divisiones asignadas.</p>
              </div>
            )}
          </section>

          {canManageStudents && (
            <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <Plus size={18} className="text-violet-700" />
                <h2 className="font-semibold">Nuevo legajo</h2>
              </div>
              <form action={createStudent} className="space-y-4">
                <input type="hidden" name="slug" value={slug} />
                <label className="block text-sm font-medium">
                  Nombre
                  <input name="first_name" required minLength={2} maxLength={100} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-violet-500" />
                </label>
                <label className="block text-sm font-medium">
                  Apellido
                  <input name="last_name" required minLength={2} maxLength={100} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-violet-500" />
                </label>
                <label className="block text-sm font-medium">
                  Número de matrícula
                  <input name="student_number" maxLength={40} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-violet-500" />
                </label>
                <label className="block text-sm font-medium">
                  Fecha de nacimiento
                  <input name="birth_date" type="date" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-violet-500" />
                </label>
                <label className="block text-sm font-medium">
                  Correo electrónico (opcional)
                  <input name="email" type="email" maxLength={254} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-violet-500" />
                </label>
                <button className="w-full rounded-lg bg-violet-700 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-800">Guardar legajo</button>
                <p className="text-xs leading-relaxed text-slate-400">No cargues DNI ni información médica en esta primera etapa. Esos datos requieren controles adicionales.</p>
              </form>
            </aside>
          )}
        </div>
      </div>
    </main>
  );
}
