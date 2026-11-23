import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";

export async function POST(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Tu sesión venció. Volvé a ingresar." }, { status: 401 });
    const { data: institution } = await supabase.from("institutions").select("id").eq("slug", slug).maybeSingle();
    if (!institution) return NextResponse.json({ error: "Institución no encontrada." }, { status: 404 });
    const { data: membership } = await supabase.from("memberships").select("id").eq("institution_id", institution.id).eq("user_id", user.id).eq("status", "active").maybeSingle();
    if (!membership) return NextResponse.json({ error: "No tenés una membresía activa en esta institución." }, { status: 403 });

    const [permissions, roleRows] = await Promise.all([
      getMembershipPermissions(supabase, membership.id),
      supabase.from("membership_roles").select("roles(key)").eq("membership_id", membership.id).eq("institution_id", institution.id),
    ]);
    if (!(roleRows.data ?? []).some((row) => row.roles?.key === "teacher") || !permissions.has("grades.read")) {
      return NextResponse.json({ error: "Esta prueba está disponible para docentes autorizados." }, { status: 403 });
    }
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ error: "Groq no está configurado en el servidor." }, { status: 503 });
    }

    // Synthetic-only endpoint: intentionally does not query students or academic records.
    const syntheticFacts = {
      studentReference: "el alumno",
      period: "Primer trimestre (período inventado)",
      data: {
        grades: [
          { subject: "Matemática", assessment: "Actividad de práctica", score: 8, maxScore: 10, date: "2026-04-10" },
          { subject: "Lengua", assessment: "Producción escrita", score: 9, maxScore: 10, date: "2026-04-14" },
          { subject: "Ciencias", assessment: "Trabajo práctico", score: 7, maxScore: 10, date: "2026-04-18" },
        ],
        attendance: { present: 19, absent: 1, late: 0, total: 20 },
        participation: { classroomContributions: 5, practicalActivitiesSubmitted: 4, activitiesAssigned: 4 },
        teacherObservations: [
          "Participa con interés en actividades grupales (observación ficticia).",
          "Puede continuar fortaleciendo la explicación de procedimientos (observación ficticia).",
        ],
      },
      notice: "Todos los datos son inventados y no corresponden a ninguna persona real.",
    };
    const prompt = `Generá un informe pedagógico breve en español a partir EXCLUSIVAMENTE del JSON ficticio. REGLA OBLIGATORIA DE IDENTIDAD: referite a la persona exclusivamente como "el alumno" en todo el informe. No uses nombres, iniciales ni códigos identificatorios. Identificálo expresamente como DEMOSTRACIÓN CON DATOS FICTICIOS. Organizá el texto en: resumen, evidencias académicas por materia, asistencia, participación, fortalezas observables, oportunidades de acompañamiento, recomendaciones pedagógicas y limitaciones. No inventes diagnósticos, causas, rasgos de personalidad ni datos adicionales. No presentes el ejemplo como un caso real. Cerrá indicando que el contenido es ilustrativo y requiere revisión docente.\n\nDATOS FICTICIOS:\n${JSON.stringify(syntheticFacts)}`;
    const model = process.env.GROQ_REPORT_MODEL || "openai/gpt-oss-20b";
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], max_tokens: 1800, temperature: 0.2 }),
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) {
      console.error("[academic-report-groq-test] Provider request failed", { status: response.status, model });
      const diagnostic = response.status === 401 || response.status === 403
        ? "Groq rechazó la clave o el acceso. Verificá GROQ_API_KEY."
        : response.status === 404
          ? "Groq no encontró el modelo solicitado. Revisá GROQ_REPORT_MODEL."
          : response.status === 429
            ? "Se alcanzó el límite gratuito de Groq. Revisá la cuota y volvé a intentar más tarde."
            : "Groq no pudo completar la prueba. Intentá nuevamente más tarde.";
      return NextResponse.json({ error: diagnostic, providerStatus: response.status }, { status: 502 });
    }
    const result = await response.json() as { choices?: { message?: { content?: string | null } }[] };
    const analysis = result.choices?.[0]?.message?.content?.trim() ?? "";
    if (!analysis) return NextResponse.json({ error: "Groq no devolvió un análisis utilizable." }, { status: 502 });
    return NextResponse.json({
      analysis, engine: "groq", isDemo: true,
      coverage: { dataMayBeIncomplete: false, grades: 3, attendance: 20, attendanceAvailable: true, observations: 2, classroomRecords: 1, subjects: ["Matemática", "Lengua", "Ciencias"] },
      generatedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ error: "No se pudo completar la prueba de Groq. No se consultaron ni modificaron registros académicos." }, { status: 500 });
  }
}
