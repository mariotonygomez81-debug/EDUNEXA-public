import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";

type Sections = { grades: boolean; attendance: boolean; observations: boolean; classroom: boolean };
type ReportRequest = { studentId?: string; from?: string | null; to?: string | null; sections?: Partial<Sections> };

function redactToken(value: string, token: string, replacement: string) {
  if (!token) return value;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp("(^|[^\\p{L}\\p{N}])" + escaped + "(?=$|[^\\p{L}\\p{N}])", "giu");
  return value.replace(pattern, "$1" + replacement);
}

function safeText(value: unknown, studentName: string, studentNumber: string | null) {
  if (typeof value !== "string") return "";
  const nameParts = studentName.split(/\s+/).filter((part) => part.length >= 3);
  let text = redactToken(value, studentName, "[ALUMNO]");
  for (const part of nameParts) text = redactToken(text, part, "[ALUMNO]");
  if (studentNumber) text = text.replaceAll(studentNumber, "[IDENTIFICADOR]");
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]")
    .replace(/\b\d{7,12}\b/g, "[IDENTIFICADOR]")
    .replace(/\b(?:\+?\d[\d\s().-]{7,}\d)\b/g, "[TELEFONO]")
    .trim()
    .slice(0, 500);
}
function dateValid(value: string | null | undefined) {
  if (!value) return true;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const body = await request.json() as ReportRequest;
    const studentId = body.studentId ?? "";
    const from = body.from ?? null;
    const to = body.to ?? null;
    const sections: Sections = { grades: body.sections?.grades !== false, attendance: body.sections?.attendance !== false, observations: body.sections?.observations !== false, classroom: body.sections?.classroom !== false };
    if (!/^[0-9a-f-]{36}$/i.test(studentId) || !dateValid(from) || !dateValid(to) || (from && to && from > to)) return NextResponse.json({ error: "Revisá el alumno y el rango de fechas." }, { status: 400 });
    if (!Object.values(sections).some(Boolean)) return NextResponse.json({ error: "Seleccioná al menos una fuente de información." }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Tu sesión venció. Volvé a ingresar." }, { status: 401 });
    const { data: institution } = await supabase.from("institutions").select("id,display_name").eq("slug", slug).maybeSingle();
    if (!institution) return NextResponse.json({ error: "Institución no encontrada." }, { status: 404 });
    const { data: membership } = await supabase.from("memberships").select("id").eq("institution_id", institution.id).eq("user_id", user.id).eq("status", "active").maybeSingle();
    if (!membership) return NextResponse.json({ error: "No tenés una membresía activa en esta institución." }, { status: 403 });
    const [permissions, roleRows, studentResult] = await Promise.all([
      getMembershipPermissions(supabase, membership.id),
      supabase.from("membership_roles").select("roles(key)").eq("membership_id", membership.id).eq("institution_id", institution.id),
      supabase.from("students").select("id,first_name,last_name,student_number").eq("institution_id", institution.id).eq("id", studentId).eq("status", "active").maybeSingle(),
    ]);
    if (!(roleRows.data ?? []).some((row) => row.roles?.key === "teacher") || !permissions.has("grades.read")) return NextResponse.json({ error: "Esta función está disponible para docentes autorizados." }, { status: 403 });
    const student = studentResult.data;
    if (!student) return NextResponse.json({ error: "No se encontró el alumno o no tenés permiso para consultar sus datos." }, { status: 404 });
    const studentName = [student.first_name, student.last_name].filter(Boolean).join(" ");

    const [gradeResult, attendanceResult, observationResult] = await Promise.all([
      sections.grades ? supabase.from("grade_records").select("score,comment,entered_at,assessments(title,assessment_date,max_score,course_subject_id,division_id,grading_periods(name),course_subjects(subject_id,subjects(name)))").eq("institution_id", institution.id).eq("student_id", studentId).order("entered_at", { ascending: true }).limit(120) : Promise.resolve({ data: [] as unknown[], error: null }),
      sections.attendance && permissions.has("attendance.read") ? supabase.from("attendance_records").select("status,note,recorded_at,attendance_sessions(held_on,period_label)").eq("institution_id", institution.id).eq("student_id", studentId).order("recorded_at", { ascending: true }).limit(120) : Promise.resolve({ data: [] as unknown[], error: null }),
      sections.observations && permissions.has("grades.read") ? supabase.from("student_period_observations").select("observation,created_at,grading_period_id").eq("institution_id", institution.id).eq("student_id", studentId).order("created_at", { ascending: true }).limit(60) : Promise.resolve({ data: [] as unknown[], error: null }),
    ]);
    if (gradeResult.error || (sections.attendance && permissions.has("attendance.read") && attendanceResult.error) || observationResult.error) return NextResponse.json({ error: "No fue posible leer todas las fuentes. Verificá tus permisos y volvé a intentar." }, { status: 403 });

    const inRange = (date: string | null | undefined) => {
      if (!date) return !from && !to;
      return (!from || date >= from) && (!to || date <= to);
    };
    const gradeRows = (gradeResult.data ?? []) as unknown as { score: number | null; comment: string | null; assessments: { title: string; assessment_date: string | null; max_score: number; grading_periods: { name: string } | null; course_subjects: { subjects: { name: string } | null } | null } | null }[];
    const attendanceRows = (attendanceResult.data ?? []) as unknown as { status: string; note: string | null; attendance_sessions: { held_on: string; period_label: string | null } | null }[];
    const observationRows = (observationResult.data ?? []) as unknown as { observation: string; created_at: string; grading_period_id: string }[];
    const grades = gradeRows.filter((row) => inRange(row.assessments?.assessment_date)).map((row) => ({
      score: row.score,
      assessment: safeText(row.assessments?.title, studentName, student.student_number),
      date: row.assessments?.assessment_date,
      maxScore: row.assessments?.max_score,
      period: safeText(row.assessments?.grading_periods?.name, studentName, student.student_number),
      subject: safeText(row.assessments?.course_subjects?.subjects?.name, studentName, student.student_number),
      comment: safeText(row.comment, studentName, student.student_number),
    }));
    const attendance = attendanceRows.filter((row) => inRange(row.attendance_sessions?.held_on)).map((row) => ({
      date: row.attendance_sessions?.held_on,
      period: safeText(row.attendance_sessions?.period_label, studentName, student.student_number),
      status: row.status,
      note: safeText(row.note, studentName, student.student_number),
    }));
    // Never send internal database identifiers such as grading_period_id to an AI provider.
    const observations = observationRows.filter((row) => inRange(row.created_at?.slice(0, 10))).map((row) => ({
      period: "Período académico",
      date: row.created_at,
      observation: safeText(row.observation, studentName, student.student_number),
    }));

    const classroomRecords: unknown[] = [];
    if (sections.classroom) {
      const { data: accessible } = await supabase.rpc("list_accessible_classrooms", { p_institution_id: institution.id });
      for (const classroom of (accessible ?? []) as { id: string; title?: string }[]) {
        const { data: caps } = await supabase.rpc("get_classroom_capabilities", { p_classroom_id: classroom.id });
        if (!(caps as { can_grade?: boolean } | null)?.can_grade) continue;
        const { data: periods } = await supabase.rpc("list_classroom_term_periods", { p_classroom_id: classroom.id });
        for (const period of (periods ?? []) as { id: string; name: string }[]) {
          const { data: gradebook } = await supabase.rpc("list_classroom_term_gradebook", { p_classroom_id: classroom.id, p_grading_period_id: period.id });
          const payload = gradebook as { students?: { student_id: string; orientadora_1: number | null; orientadora_2: number | null; orientadora_3: number | null; trimestral: number | null; recuperacion: number | null; conduct: string | null; participates_in_class: boolean; submits_practical_work: boolean; demonstrates_interest: boolean; observation: string | null }[] } | null;
          const row = payload?.students?.find((item) => item.student_id === studentId);
          if (row) classroomRecords.push({ classroom: safeText(classroom.title ?? "Aula docente", studentName, student.student_number), period: safeText(period.name, studentName, student.student_number), grades: { orientadora1: row.orientadora_1, orientadora2: row.orientadora_2, orientadora3: row.orientadora_3, quarterly: row.trimestral, recovery: row.recuperacion }, conductObservation: safeText(row.conduct, studentName, student.student_number), participates: row.participates_in_class, submitsPracticalWork: row.submits_practical_work, demonstratesInterest: row.demonstrates_interest, teacherObservation: safeText(row.observation, studentName, student.student_number) });
        }
      }
    }

    const dataMayBeIncomplete = gradeRows.length >= 120 || attendanceRows.length >= 120 || observationRows.length >= 60;
    const subjects = [...new Set(grades.map((item) => item.subject).filter((item): item is string => Boolean(item)))];
    const facts = { studentReference: "el alumno", period: { from, to }, data: { grades, attendance, observations, classroomRecords }, coverage: { dataMayBeIncomplete, grades: grades.length, attendance: attendance.length, attendanceAvailable: !sections.attendance || permissions.has("attendance.read"), observations: observations.length, classroomRecords: classroomRecords.length, subjects } };
    const prompt = `Elaborá un informe pedagógico integral en español, claro, detallado y prudente, usando EXCLUSIVAMENTE los datos JSON adjuntos. REGLA OBLIGATORIA DE IDENTIDAD: referite a la persona exclusivamente como "el alumno" en todo el informe. No incluyas nombres, apellidos, iniciales, códigos, números de legajo ni etiquetas como "Estudiante A-001". No inventes hechos, causas, diagnósticos, trastornos, rasgos de personalidad ni intenciones. No etiquetes al alumno ni hagas predicciones. Diferenciá claramente: (1) datos objetivos y cantidades, (2) tendencias observables con fechas y materia cuando existan, (3) observaciones textuales del docente atribuidas como tales, (4) fortalezas respaldadas por evidencia, (5) aspectos que requieren acompañamiento sin juzgar, (6) recomendaciones pedagógicas concretas y proporcionadas, (7) limitaciones y datos faltantes. No conviertas un registro aislado en una tendencia. Si coverage.dataMayBeIncomplete es true, advertí explícitamente que la consulta alcanzó un límite de registros y que el análisis puede no incluir todo el historial. Si la asistencia o calificaciones están incompletas, aclará cobertura y no calcules porcentajes sobre denominadores desconocidos. Conducta debe describirse como observaciones situadas, nunca como etiqueta del alumno. Cerrá con una advertencia de revisión humana. Formato con títulos y párrafos, sin tabla.\n\nDATOS:\n${JSON.stringify(facts)}`;
    if (!process.env.GROQ_API_KEY) return NextResponse.json({ error: "Falta configurar GROQ_API_KEY en el servidor." }, { status: 503 });
    if (process.env.GROQ_ALLOW_STUDENT_DATA !== "true") {
      return NextResponse.json({ error: "El envío de datos académicos a Groq está deshabilitado hasta contar con autorización institucional y habilitar GROQ_ALLOW_STUDENT_DATA." }, { status: 403 });
    }
    const model = process.env.GROQ_REPORT_MODEL || "openai/gpt-oss-20b";
    const aiResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1800,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!aiResponse.ok) {
      console.error("[academic-report-groq] Provider request failed", { status: aiResponse.status, model });
      const message = aiResponse.status === 401 || aiResponse.status === 403
        ? "Groq rechazó la clave o el acceso. Verificá GROQ_API_KEY y los permisos de la cuenta."
        : aiResponse.status === 404
          ? "Groq no encontró el modelo configurado. Revisá GROQ_REPORT_MODEL."
          : aiResponse.status === 429
            ? "Se alcanzó el límite gratuito de Groq. Esperá a que se restablezca la cuota o revisá los límites de tu cuenta."
            : aiResponse.status >= 500
              ? "Groq presenta un problema temporal. Volvé a intentar más tarde."
              : "Groq no pudo completar el análisis. Revisá la configuración del modelo.";
      return NextResponse.json({ error: message }, { status: 502 });
    }
    const ai = await aiResponse.json() as { choices?: { message?: { content?: string | null } }[] };
    let analysis = ai.choices?.[0]?.message?.content?.trim() ?? "";
    // Defensa adicional: el texto final tampoco debe revelar identificadores directos.
    analysis = redactToken(analysis, studentName, "el alumno");
    for (const part of studentName.split(/\s+/).filter((item) => item.length >= 3)) analysis = redactToken(analysis, part, "el alumno");
    if (student.student_number) analysis = analysis.replaceAll(student.student_number, "");
    analysis = analysis.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "").replace(/\b\d{7,12}\b/g, "").replace(/[ \t]{2,}/g, " ").trim();
    if (!analysis) return NextResponse.json({ error: "La IA no devolvió un análisis utilizable." }, { status: 502 });
    return NextResponse.json(
      { analysis, coverage: facts.coverage, generatedAt: new Date().toISOString(), engine: "groq" },
      { headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" } },
    );
  } catch {
    return NextResponse.json({ error: "Ocurrió un error al preparar el informe. No se modificaron los registros académicos." }, { status: 500 });
  }
}
