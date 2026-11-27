import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarCheck, CheckCircle2, Clock3, FileCheck2, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

type PortalStudent = {
  student_id: string;
  first_name: string;
  last_name: string;
  can_view_attendance: boolean;
};

type AttendanceRow = {
  session_id: string;
  held_on: string;
  period_label: string | null;
  division_name: string;
  attendance_status: string;
};

const statusLabels: Record<string, string> = {
  present: "Presente",
  absent: "Ausente",
  late: "Tardanza",
  justified: "Justificada",
  early_departure: "Retiro anticipado",
};

const statusStyles: Record<string, string> = {
  present: "bg-emerald-100 text-emerald-800",
  absent: "bg-rose-100 text-rose-800",
  late: "bg-amber-100 text-amber-800",
  justified: "bg-sky-100 text-sky-800",
  early_departure: "bg-orange-100 text-orange-800",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "long" }).format(new Date(value));
}

export default async function StudentAttendancePage({
  params,
}: {
  params: Promise<{ slug: string; studentId: string }>;
}) {
  const { slug, studentId } = await params;
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

  const { data: portalRows, error: portalError } = await supabase.rpc("list_my_portal_students", {
    p_institution_id: institution.id,
  });
  if (portalError) {
    return <main className="min-h-screen bg-slate-50 p-8 text-sm text-amber-900">No fue posible verificar el acceso.</main>;
  }
  const student = ((portalRows ?? []) as PortalStudent[])
    .find((row) => row.student_id === studentId && row.can_view_attendance);
  if (!student) notFound();

  const { data: attendanceRows, error } = await supabase.rpc("list_my_student_attendance", {
    p_institution_id: institution.id,
    p_student_id: studentId,
    p_limit: 100,
  });
  const records = (attendanceRows ?? []) as AttendanceRow[];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-800 sm:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <Link href={`/dashboard/${slug}/portal`} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-violet-700">
          <ArrowLeft size={16} /> Volver a Mi portal
        </Link>

        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-violet-100 p-3 text-violet-700"><CalendarCheck size={23} /></div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">Trayectoria escolar</p>
              <h1 className="text-2xl font-bold">Asistencia de {student.first_name} {student.last_name}</h1>
              <p className="mt-1 text-sm text-slate-500">{institution.display_name} · Últimos 100 registros cerrados</p>
            </div>
          </div>
        </header>

        {error ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
            No fue posible consultar los registros de asistencia.
          </div>
        ) : records.length ? (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="divide-y divide-slate-100">
              {records.map((record) => {
                const Icon = record.attendance_status === "present" ? CheckCircle2
                  : record.attendance_status === "absent" ? XCircle
                    : record.attendance_status === "late" ? Clock3 : FileCheck2;
                return (
                  <article key={record.session_id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-slate-100 p-2 text-slate-500"><Icon size={18} /></div>
                      <div>
                        <p className="font-semibold text-slate-900">{formatDate(record.held_on)}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {record.division_name}{record.period_label ? ` · ${record.period_label}` : ""}
                        </p>
                      </div>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[record.attendance_status] ?? "bg-slate-100 text-slate-700"}`}>
                      {statusLabels[record.attendance_status] ?? "Registrada"}
                    </span>
                  </article>
                );
              })}
            </div>
          </section>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            Todavía no hay registros de asistencia cerrados para este estudiante.
          </div>
        )}
      </div>
    </main>
  );
}
