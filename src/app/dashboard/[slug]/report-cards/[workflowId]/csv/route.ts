import { createClient } from "@/lib/supabase/server";

type Snapshot = {
  published_at?: string;
  institution?: { display_name?: string };
  student?: { first_name?: string; last_name?: string; student_number?: string | null };
  period?: { name?: string; starts_on?: string; ends_on?: string };
  academic_year?: { name?: string };
  subjects?: {
    subject?: string;
    course?: string;
    division?: string;
    assessments?: {
      title?: string;
      date?: string | null;
      maximum_score?: number;
      weight_percent?: number | null;
      score?: number | null;
      comment?: string | null;
    }[];
  }[];
  general_observation?: string | null;
};

function csvCell(value: unknown) {
  let text = String(value ?? "");
  // Prevent spreadsheet formula execution when a CSV is opened in Excel/Sheets.
  if (/^[\s]*[=+@\-\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; workflowId: string }> },
) {
  const { slug, workflowId } = await params;
  if (!/^[a-z0-9-]{2,80}$/i.test(slug) || !/^[0-9a-f-]{36}$/i.test(workflowId)) {
    return new Response("Solicitud inválida", { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("No autorizado", { status: 401 });

  const { data: institution } = await supabase.from("institutions")
    .select("id").eq("slug", slug).maybeSingle();
  if (!institution) return new Response("No encontrado", { status: 404 });

  const { data: membership } = await supabase.from("memberships")
    .select("id").eq("institution_id", institution.id)
    .eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership) return new Response("No autorizado", { status: 403 });

  const { data: row, error } = await supabase.from("report_card_snapshots")
    .select("snapshot")
    .eq("institution_id", institution.id)
    .eq("workflow_id", workflowId)
    .maybeSingle();
  if (error || !row?.snapshot) return new Response("Boletín publicado no encontrado", { status: 404 });

  const snapshot = row.snapshot as unknown as Snapshot;
  const studentName = [snapshot.student?.last_name, snapshot.student?.first_name].filter(Boolean).join(", ");
  const rows: unknown[][] = [[
    "Institución", "Alumno", "Legajo", "Ciclo lectivo", "Período",
    "Materia", "Curso", "División", "Evaluación", "Fecha",
    "Nota", "Puntaje máximo", "Ponderación (%)", "Observación de evaluación",
    "Observación general", "Fecha de publicación",
  ]];

  for (const subject of snapshot.subjects ?? []) {
    const assessments = subject.assessments ?? [];
    if (!assessments.length) {
      rows.push([
        snapshot.institution?.display_name, studentName, snapshot.student?.student_number,
        snapshot.academic_year?.name, snapshot.period?.name, subject.subject,
        subject.course, subject.division, "", "", "", "", "", "",
        snapshot.general_observation, snapshot.published_at,
      ]);
      continue;
    }
    for (const assessment of assessments) {
      rows.push([
        snapshot.institution?.display_name, studentName, snapshot.student?.student_number,
        snapshot.academic_year?.name, snapshot.period?.name, subject.subject,
        subject.course, subject.division, assessment.title, assessment.date,
        assessment.score, assessment.maximum_score, assessment.weight_percent,
        assessment.comment, snapshot.general_observation, snapshot.published_at,
      ]);
    }
  }

  const csv = "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const filename = `boletin-${(snapshot.student?.last_name ?? "alumno").normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase()}-${workflowId}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
