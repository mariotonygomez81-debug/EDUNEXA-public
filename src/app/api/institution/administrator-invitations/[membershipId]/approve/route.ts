import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { platformRpc, readJson, requestId, rpcErrorResponse, validUuid } from "@/lib/auth/platform-api";

type RouteContext = { params: Promise<{ membershipId: string }> };

export async function POST(request: Request, route: RouteContext) {
  const origin = request.headers.get("origin");
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto ? `${forwardedProto}:` : new URL(request.url).protocol;
  let originUrl: URL | null = null;
  try {
    originUrl = origin ? new URL(origin) : null;
  } catch {
    originUrl = null;
  }
  if (!originUrl || !host || originUrl.host.toLowerCase() !== host.toLowerCase()
    || originUrl.protocol !== protocol) {
    return NextResponse.json({ error: "Origen no autorizado." }, { status: 403 });
  }

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "No se pudo validar la sesión." }, { status: 503 });
  }
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Autenticación requerida." }, { status: 401 });
  }

  const { membershipId } = await route.params;
  const body = await readJson(request);
  const institutionId = body?.institutionId;
  if (!validUuid(membershipId) || !validUuid(institutionId)) {
    return NextResponse.json({ error: "Institución o membresía inválida." }, { status: 400 });
  }

  const result = await platformRpc(supabase, "platform_approve_institution_admin", {
    p_institution_id: institutionId,
    p_membership_id: membershipId,
    p_request_id: requestId(),
  });
  if (result.error) return rpcErrorResponse(result.error);
  return NextResponse.json({ invitation: result.data }, {
    headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" },
  });
}
