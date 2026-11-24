import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowLeftRight, GraduationCap, History, PencilLine, UsersRound, UserPlus, UserMinus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { closeStudentEnrollment, createEnrollment, createStudentPreviousSubject, linkStudentGuardian, transferStudentEnrollment, unlinkStudentGuardian, updateStudent, updateStudentPreviousSubjectStatus } from "../actions";
import { getMembershipPermissions } from "@/lib/auth/permissions";

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export default async function StudentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; studentId: string }>;
  searchParams: Promise<{ error?: string; updated?: string; enrolled?: string; transferred?: string; closed?: string; guardian_linked?: string; guardian_unlinked?: string; previous_added?: string; previous_updated?: string }>;
}) {
  const { slug, studentId } = await params;
  const { error, updated, enrolled, transferred, closed, guardian_linked, guardian_unlinked, previous_added, previous_updated } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: institution } = await supabase
    .from("institutions").select("id,display_name").eq("slug", slug).maybeSingle();
  if (!institution) redirect("/dashboard");

  const { data: membership } = await supabase
    .from("memberships").select("id")
    .eq("institution_id", institution.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) redirect("/dashboard");

  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id,student_number,first_name,last_name,birth_date,email,status,created_at")
    .eq("id", studentId)
    .eq("institution_id", institution.id)
    .maybeSingle();
  if (studentError || !student) notFound();

  const permissions = await getMembershipPermissions(supabase, membership.id);
  const canManageStudents = permissions.has("students.manage");

  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("id,status,enrolled_on,ended_on,division_id")
    .eq("institution_id", institution.id)
    .eq("student_id", student.id)
    .order("enrolled_on", { ascending: false });

  const divisionIds = [...new Set((enrollments ?? []).map((item) => item.division_id))];
  const { data: divisions } = divisionIds.length
    ? await supabase.from("divisions").select("id,name,course_id").in("id", divisionIds)
    : { data: [] };
  const courseIds = [...new Set((divisions ?? []).map((item) => item.course_id))];
  const { data: courses } = courseIds.length
    ? await supabase.from("courses").select("id,name").in("id", courseIds)
    : { data: [] };
  const courseById = new Map((courses ?? []).map((course) => [course.id, course.name] as const));

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
  const { data: availableDivisionsRaw } = canManageStudents
    ? await supabase.from("divisions").select("id,name,course_id,academic_year_id").eq("institution_id", institution.id).order("name")
    : { data: [] };
  const { data: availableAcademicYears } = canManageStudents
    ? await supabase.from("academic_years").select("id,starts_on,ends_on,status").eq("institution_id", institution.id)
    : { data: [] };
  const academicYearById = new Map((availableAcademicYears ?? []).map((year) => [year.id, year] as const));
  const availableDivisions = (availableDivisionsRaw ?? []).filter((division) => {
    const year = academicYearById.get(division.academic_year_id);
    return !!year && year.status !== "closed" && year.starts_on <= today && year.ends_on >= today;
  });
  const availableCourseIds = [...new Set(availableDivisions.map((item) => item.course_id))];
  const { data: availableCourses } = availableCourseIds.length
    ? await supabase.from("courses").select("id,name").in("id", availableCourseIds)
    : { data: [] };
  const availableCourseById = new Map((availableCourses ?? []).map((course) => [course.id, course.name] as const));
  const divisionById = new Map((divisions ?? []).map((division) => [
    division.id,
    { name: division.name, course: courseById.get(division.course_id) ?? "Curso" },
  ] as const));
  const { data: enrollmentEvents } = canManageStudents
    ? await supabase.rpc("list_student_enrollment_events", {
        p_institution_id: institution.id,
        p_student_id: student.id,
      })
    : { data: [] };
  const activeEnrollment = (enrollments ?? []).find((item) => item.status === "active" && !item.ended_on) ?? null;
  const { data: previousSubjects } = await supabase.from("student_previous_subjects")
    .select("id,subject_name,school_year,status,course_subject_id")
    .eq("institution_id", institution.id).eq("student_id", student.id)
    .order("school_year", { ascending: false });
  const { data: availableCourseSubjectsRaw } = canManageStudents
    ? await supabase.from("course_subjects").select("id,subject_id,course_id").eq("institution_id", institution.id)
    : { data: [] };
  const previousSubjectIds = [...new Set((availableCourseSubjectsRaw ?? []).map((item) => item.subject_id))];
  const { data: previousSubjectCatalog } = previousSubjectIds.length
    ? await supabase.from("subjects").select("id,name").in("id", previousSubjectIds)
    : { data: [] };
  const subjectNameById = new Map((previousSubjectCatalog ?? []).map((item) => [item.id, item.name] as const));
  const courseSubjectOptions = (availableCourseSubjectsRaw ?? []).map((item) => ({
    id: item.id,
    label: `${availableCourseById.get(item.course_id) ?? "Curso"} · ${subjectNameById.get(item.subject_id) ?? "Materia"}`,
  })).sort((a,b) => a.label.localeCompare(b.label,"es"));
  const previousSubjectStatusLabels: Record<string,string> = {
    pending: "Pendiente", in_progress: "En curso", approved: "Aprobada",
    equivalency: "Por equivalencia", not_approved: "No aprobada",
  };

  const transferMinDate = activeEnrollment ? addDays(activeEnrollment.enrolled_on, 1) : today;
  const transferDefaultDate = today > transferMinDate ? today : transferMinDate;
  const closeDefaultDate = activeEnrollment && today < activeEnrollment.enrolled_on ? activeEnrollment.enrolled_on : today;

  const { data: guardianLinks } = canManageStudents
    ? await supabase.from("student_guardians")
        .select("guardian_id,can_view_grades,can_view_attendance,can_authorize")
        .eq("institution_id", institution.id).eq("student_id", student.id)
    : { data: [] };
  const { data: guardianPayload } = canManageStudents
    ? await supabase.functions.invoke("manage-institution-users", {
        body: { action: "list_guardians", slug },
      })
    : { data: null };
  const availableGuardians = (guardianPayload?.guardians ?? []) as Array<{
    id: string; display_name: string; email: string; relationship_label: string;
  }>;
  const guardianById = new Map(availableGuardians.map((guardian) => [guardian.id, guardian] as const));
  const linkedGuardianIds = new Set((guardianLinks ?? []).map((link) => link.guardian_id));
  const linkedGuardians = (guardianLinks ?? []).map((link) => ({
    ...link,
    guardian: guardianById.get(link.guardian_id),
  }));

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href={`/dashboard/${slug}/students`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700">
          <ArrowLeft size={16} /> Volver a alumnos
        </Link>

        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-violet-100 p-3 text-violet-700"><GraduationCap size={25} /></div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">Legajo escolar</p>
              <h1 className="text-2xl font-bold">{student.last_name}, {student.first_name}</h1>
              <p className="mt-1 text-sm text-slate-500">{institution.display_name} · Matrícula {student.student_number || "sin asignar"}</p>
            </div>
          </div>
        </header>

        {updated === "1" && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Los datos del legajo se actualizaron.</div>}
        {enrolled === "1" && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">La matrícula se asignó correctamente.</div>}
        {transferred === "1" && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">La transferencia de división se registró correctamente.</div>}
        {closed === "1" && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">La matrícula se cerró y quedó registrada en el historial.</div>}
        {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error === "forbidden" ? "No tenés permiso para editar este legajo." : error === "invalid" ? "Revisá los datos ingresados." : error === "enrollment_invalid" ? "Seleccioná una división válida y una fecha correcta." : error === "enrollment_save" ? "No se pudo asignar la matrícula. Puede existir una matrícula activa duplicada." : error === "transfer_invalid" ? "Seleccioná una nueva división y una fecha posterior al inicio de la matrícula actual." : error === "transfer_save" ? "No se pudo transferir la matrícula. Verificá que la división y la fecha sean válidas." : error === "close_invalid" ? "Revisá el estado y la fecha de cierre." : error === "close_save" ? "No se pudo cerrar la matrícula. Verificá que siga activa." : "No se pudieron guardar los cambios. Revisá la matrícula."}</div>}

        {guardian_linked === "1" && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">El tutor quedó vinculado al legajo.</div>}
        {guardian_unlinked === "1" && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Se quitó el vínculo familiar.</div>}
        {error?.startsWith("guardian_") && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error === "guardian_invalid" ? "Seleccioná un tutor válido." : "No se pudo guardar el vínculo familiar. Verificá que la cuenta de tutor esté activa."}</div>}


        {canManageStudents && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <UsersRound size={20} className="text-violet-700" />
              <div>
                <h2 className="font-semibold">Familiares y tutores</h2>
                <p className="text-sm text-slate-500">Vinculá cuentas institucionales con perfil de tutor a este legajo.</p>
              </div>
            </div>
            {linkedGuardians.length ? (
              <div className="mb-5 divide-y divide-slate-100 rounded-xl border border-slate-100">
                {linkedGuardians.map((link) => (
                  <div key={link.guardian_id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <p className="font-medium">{link.guardian?.display_name ?? "Tutor vinculado"}</p>
                      <p className="text-sm text-slate-500">{link.guardian?.email ?? "Cuenta institucional"} · {link.guardian?.relationship_label ?? "Familiar"}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className={link.can_view_grades ? "rounded-full bg-emerald-50 px-2 py-1 text-emerald-700" : "rounded-full bg-slate-100 px-2 py-1 text-slate-500"}>Calificaciones {link.can_view_grades ? "habilitadas" : "no habilitadas"}</span>
                        <span className={link.can_view_attendance ? "rounded-full bg-emerald-50 px-2 py-1 text-emerald-700" : "rounded-full bg-slate-100 px-2 py-1 text-slate-500"}>Asistencia {link.can_view_attendance ? "habilitada" : "no habilitada"}</span>
                      </div>
                    </div>
                    <form action={unlinkStudentGuardian}>
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="student_id" value={student.id} />
                      <input type="hidden" name="guardian_id" value={link.guardian_id} />
                      <button className="inline-flex items-center gap-2 rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"><UserMinus size={15} /> Desvincular</button>
                    </form>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mb-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Todavía no hay tutores vinculados a este legajo.</p>
            )}
            {availableGuardians.some((guardian) => !linkedGuardianIds.has(guardian.id)) ? (
              <form action={linkStudentGuardian} className="grid gap-3 border-t border-slate-100 pt-5 sm:grid-cols-[minmax(0,1fr)_auto]">
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="student_id" value={student.id} />
                <div className="space-y-3">
                  <label className="block text-sm font-medium">Cuenta de tutor
                    <select name="guardian_id" required className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm">
                      <option value="">Seleccionar tutor habilitado</option>
                      {availableGuardians.filter((guardian) => !linkedGuardianIds.has(guardian.id)).map((guardian) => (
                        <option key={guardian.id} value={guardian.id}>{guardian.display_name} · {guardian.email || guardian.relationship_label}</option>
                      ))}
                    </select>
                  </label>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <label className="inline-flex items-center gap-2"><input type="checkbox" name="can_view_grades" defaultChecked /> Puede ver calificaciones</label>
                    <label className="inline-flex items-center gap-2"><input type="checkbox" name="can_view_attendance" defaultChecked /> Puede ver asistencia</label>
                  </div>
                </div>
                <button className="inline-flex h-fit items-center justify-center gap-2 self-end rounded-lg bg-violet-700 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-800"><UserPlus size={16} /> Vincular tutor</button>
              </form>
            ) : (
              <p className="border-t border-slate-100 pt-4 text-sm text-slate-500">No hay otras cuentas activas con perfil de tutor. Primero invitá a la persona desde Usuarios, seleccionando el perfil Tutor.</p>
            )}
            <p className="mt-4 text-xs text-slate-400">El tutor solo podrá consultar la información habilitada para este alumno. La autorización de retiros y otras gestiones sensibles requiere un proceso adicional.</p>
          </section>
        )}


        {(previous_added === "1" || previous_updated === "1") && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{previous_added === "1" ? "La materia previa se vinculó correctamente." : "El estado de la materia previa se actualizó."}</div>}
        {error?.startsWith("previous_") && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error === "previous_exists" ? "Esa materia ya está registrada como previa." : error === "previous_invalid" ? "Revisá la materia y el ciclo lectivo." : "No se pudo guardar la materia previa."}</div>}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div><h2 className="font-semibold">Materias previas</h2><p className="text-sm text-slate-500">Vinculá cada materia con su asignatura institucional para habilitar el contacto con el docente responsable.</p></div>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">{(previousSubjects ?? []).length} registradas</span>
          </div>
          {(previousSubjects ?? []).length ? <div className="mb-5 space-y-2">
            {(previousSubjects ?? []).map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
              <div><p className="font-medium text-slate-900">{item.subject_name}</p><p className="text-xs text-slate-500">{item.school_year ?? "Ciclo no informado"} · {item.course_subject_id ? "Vinculada a materia institucional" : "Sin vincular a docente"}</p></div>
              {canManageStudents ? <form action={updateStudentPreviousSubjectStatus} className="flex items-center gap-2">
                <input type="hidden" name="slug" value={slug}/><input type="hidden" name="student_id" value={student.id}/><input type="hidden" name="previous_subject_id" value={item.id}/>
                <select name="status" defaultValue={item.status} aria-label={`Estado de ${item.subject_name}`} className="rounded-lg border border-slate-300 px-2 py-2 text-xs">
                  <option value="pending">Pendiente</option><option value="in_progress">En curso</option><option value="approved">Aprobada</option><option value="equivalency">Por equivalencia</option><option value="not_approved">No aprobada</option>
                </select><button className="rounded-lg bg-violet-700 px-3 py-2 text-xs font-semibold text-white">Guardar</button>
              </form> : <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{previousSubjectStatusLabels[item.status] ?? item.status}</span>}
            </div>)}
          </div> : <p className="mb-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Todavía no hay materias previas registradas.</p>}
          {canManageStudents && <form action={createStudentPreviousSubject} className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[minmax(0,1fr)_160px_auto] sm:items-end">
            <input type="hidden" name="slug" value={slug}/><input type="hidden" name="student_id" value={student.id}/>
            <label className="block text-sm font-medium">Materia institucional
              <select name="course_subject_id" required defaultValue="" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"><option value="" disabled>Seleccionar materia</option>{courseSubjectOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
            </label>
            <label className="block text-sm font-medium">Ciclo lectivo
              <input name="school_year" maxLength={20} placeholder="Ej.: 2025" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal"/>
            </label>
            <button disabled={!courseSubjectOptions.length} className="rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50">Agregar previa</button>
          </form>}
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">Trayectoria y matrículas</h2>
              {activeEnrollment && <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Matrícula activa</span>}
            </div>
            {enrollments?.length ? (
              <div className="mt-4 space-y-3">
                {enrollments.map((enrollment) => {
                  const division = divisionById.get(enrollment.division_id);
                  const statusLabel: Record<string, string> = {
                    active: "Activa",
                    transferred: "Transferida",
                    withdrawn: "Retirada",
                    completed: "Finalizada",
                  };
                  return (
                    <div key={enrollment.id} className={`rounded-xl border p-4 ${enrollment.id === activeEnrollment?.id ? "border-emerald-200 bg-emerald-50/40" : "border-slate-100"}`}>
                      <p className="font-medium">{division ? `${division.course} · ${division.name}` : "División no disponible"}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Desde {new Date(`${enrollment.enrolled_on}T12:00:00Z`).toLocaleDateString("es-AR", { timeZone: "UTC" })}
                        {" · "}{statusLabel[enrollment.status] ?? enrollment.status}
                        {enrollment.ended_on ? ` · Hasta ${new Date(`${enrollment.ended_on}T12:00:00Z`).toLocaleDateString("es-AR", { timeZone: "UTC" })}` : ""}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-4 rounded-xl bg-slate-50 p-5 text-sm text-slate-500">Este legajo todavía no tiene una matrícula asignada a una división.</p>
            )}

            {canManageStudents && activeEnrollment && (
              <div className="mt-6 grid gap-4 border-t border-slate-100 pt-5 xl:grid-cols-2">
                <form action={transferStudentEnrollment} className="space-y-3 rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2">
                    <ArrowLeftRight size={17} className="text-violet-700" />
                    <h3 className="font-semibold">Transferir de división</h3>
                  </div>
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="student_id" value={student.id} />
                  <label className="block text-sm font-medium">Nueva división
                    <select name="division_id" required className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                      <option value="">Seleccionar división</option>
                      {(availableDivisions ?? []).filter((division) => division.id !== activeEnrollment.division_id).map((division) => (
                        <option key={division.id} value={division.id}>
                          {(availableCourseById.get(division.course_id) ?? "Curso") + " · " + division.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm font-medium">Fecha efectiva
                    <input name="effective_on" type="date" required min={transferMinDate} defaultValue={transferDefaultDate} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  </label>
                  <label className="block text-sm font-medium">Motivo (opcional)
                    <textarea name="reason" maxLength={500} rows={2} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
                  </label>
                  <button disabled={!(availableDivisions ?? []).some((division) => division.id !== activeEnrollment.division_id)} className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50">
                    <ArrowLeftRight size={15} /> Registrar transferencia
                  </button>
                </form>

                <form action={closeStudentEnrollment} className="space-y-3 rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2">
                    <History size={17} className="text-amber-700" />
                    <h3 className="font-semibold">Cerrar matrícula</h3>
                  </div>
                  <input type="hidden" name="slug" value={slug} />
                  <input type="hidden" name="student_id" value={student.id} />
                  <input type="hidden" name="enrollment_id" value={activeEnrollment.id} />
                  <label className="block text-sm font-medium">Motivo de cierre
                    <select name="final_status" required className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                      <option value="withdrawn">Retiro</option>
                      <option value="completed">Finalización / egreso</option>
                    </select>
                  </label>
                  <label className="block text-sm font-medium">Fecha efectiva
                    <input name="effective_on" type="date" required min={activeEnrollment.enrolled_on} defaultValue={closeDefaultDate} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  </label>
                  <label className="block text-sm font-medium">Observación (opcional)
                    <textarea name="reason" maxLength={500} rows={2} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
                  </label>
                  <button className="rounded-lg border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-50">
                    Cerrar matrícula
                  </button>
                </form>
              </div>
            )}

            {canManageStudents && !activeEnrollment && (
              <div className="mt-6 border-t border-slate-100 pt-5">
                <h3 className="font-semibold">Asignar a una división</h3>
                {availableDivisions?.length ? (
                  <form action={createEnrollment} className="mt-3 grid gap-3 sm:grid-cols-[1fr_170px_auto]">
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="student_id" value={student.id} />
                    <label className="text-sm font-medium">División
                      <select name="division_id" required className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                        <option value="">Seleccionar división</option>
                        {availableDivisions.map((division) => (
                          <option key={division.id} value={division.id}>
                            {(availableCourseById.get(division.course_id) ?? "Curso") + " · " + division.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm font-medium">Fecha de alta
                      <input name="enrolled_on" type="date" defaultValue={today} required className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    </label>
                    <button className="self-end rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800">Asignar</button>
                  </form>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">Primero debe configurarse al menos una división para el ciclo lectivo.</p>
                )}
              </div>
            )}

            {canManageStudents && (
              <div className="mt-6 border-t border-slate-100 pt-5">
                <h3 className="flex items-center gap-2 font-semibold"><History size={17} /> Historial de movimientos</h3>
                {enrollmentEvents?.length ? (
                  <ol className="mt-4 space-y-3">
                    {enrollmentEvents.map((event) => {
                      const label: Record<string, string> = {
                        enrolled: "Alta",
                        transferred: "Transferencia",
                        withdrawn: "Retiro",
                        completed: "Finalización / egreso",
                      };
                      return (
                        <li key={event.id} className="rounded-lg bg-slate-50 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <strong className="text-sm text-slate-800">{label[event.event_type] ?? event.event_type}</strong>
                            <time className="text-xs text-slate-500">{new Date(`${event.effective_on}T12:00:00Z`).toLocaleDateString("es-AR", { timeZone: "UTC" })}</time>
                          </div>
                          <p className="mt-1 text-xs text-slate-600">
                            {event.from_division_name ? `${event.from_division_name} → ` : ""}
                            {event.to_division_name ?? (event.from_division_name ? "Sin división" : "Matrícula")}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">Registrado por {event.actor_name}</p>
                          {event.reason ? <p className="mt-1 text-sm text-slate-600">{event.reason}</p> : null}
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">Todavía no hay movimientos registrados.</p>
                )}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <PencilLine size={18} className="text-violet-700" />
              <h2 className="font-semibold">Datos del alumno</h2>
            </div>
            {canManageStudents ? (
              <form action={updateStudent} className="space-y-3">
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="student_id" value={student.id} />
                <label className="block text-sm font-medium">Nombre
                  <input name="first_name" required minLength={2} maxLength={100} defaultValue={student.first_name} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </label>
                <label className="block text-sm font-medium">Apellido
                  <input name="last_name" required minLength={2} maxLength={100} defaultValue={student.last_name} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </label>
                <label className="block text-sm font-medium">Matrícula
                  <input name="student_number" maxLength={40} defaultValue={student.student_number ?? ""} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </label>
                <label className="block text-sm font-medium">Fecha de nacimiento
                  <input name="birth_date" type="date" defaultValue={student.birth_date ?? ""} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </label>
                <label className="block text-sm font-medium">Correo electrónico
                  <input name="email" type="email" maxLength={254} defaultValue={student.email ?? ""} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </label>
                <label className="block text-sm font-medium">Estado
                  <select name="status" defaultValue={student.status} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="active">Activo</option>
                    <option value="inactive">Inactivo</option>
                    <option value="graduated">Egresado</option>
                    <option value="withdrawn">Retirado</option>
                  </select>
                </label>
                <button className="w-full rounded-lg bg-violet-700 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-800">Guardar cambios</button>
              </form>
            ) : (
              <dl className="space-y-3 text-sm">
                <div><dt className="text-slate-500">Nombre</dt><dd className="font-medium">{student.first_name}</dd></div>
                <div><dt className="text-slate-500">Apellido</dt><dd className="font-medium">{student.last_name}</dd></div>
                <div><dt className="text-slate-500">Fecha de nacimiento</dt><dd className="font-medium">{student.birth_date ? new Date(`${student.birth_date}T12:00:00`).toLocaleDateString("es-AR") : "—"}</dd></div>
                <div><dt className="text-slate-500">Estado</dt><dd className="font-medium">{student.status}</dd></div>
              </dl>
            )}
            <p className="mt-4 text-xs leading-relaxed text-slate-400">El acceso a este legajo depende de tu rol, de las asignaciones académicas y de los vínculos familiares registrados.</p>
          </section>
        </div>
      </div>
    </main>
  );
}
