import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ membershipId: string }> };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0" } });

export async function POST(request: Request, context: RouteContext) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
    || request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim()
    ? `${request.headers.get("x-forwarded-proto")!.split(",")[0].trim()}:`
    : new URL(request.url).protocol;
  let parsedOrigin: URL | null = null;
  try { parsedOrigin = origin ? new URL(origin) : null; } catch { parsedOrigin = null; }
  if (!parsedOrigin || !host || parsedOrigin.host.toLowerCase() !== host.toLowerCase()
    || parsedOrigin.protocol !== protocol) {
    return json({ error: "Origen no autorizado." }, 403);
  }

  let body: Record<string, unknown>;
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) return json({ error: "Solicitud inválida." }, 400);
    body = value as Record<string, unknown>;
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }
  const institutionId = typeof body.institutionId === "string" ? body.institutionId : "";
  const { membershipId } = await context.params;
  if (!uuidPattern.test(institutionId) || !uuidPattern.test(membershipId)) {
    return json({ error: "Identificadores institucionales inválidos." }, 400);
  }

  let supabase;
  try { supabase = await createClient(); } catch {
    return json({ error: "No se pudo validar la sesión." }, 503);
  }
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json({ error: "Autenticación requerida." }, 401);

  const { data, error } = await supabase.rpc("platform_approve_institution_admin", {
    p_institution_id: institutionId,
    p_membership_id: membershipId,
    p_request_id: crypto.randomUUID(),
  });
  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404
      : error.code === "22023" ? 400 : 500;
    return json({ error: "La aprobación fue rechazada por los controles institucionales." }, status);
  }
  return json({ invitation: data });
}
