import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isPlatformSuperAdmin } from "@/lib/auth/platform-admin";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type PlatformContext =
  | { ok: true; supabase: SupabaseServerClient; user: User }
  | { ok: false; response: NextResponse };

export async function requirePlatformSuperadmin(request: Request, write = false): Promise<PlatformContext> {
  if (write) {
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin) {
      return { ok: false, response: NextResponse.json({ error: "Origen no autorizado." }, { status: 403 }) };
    }
  }
  let supabase: SupabaseServerClient;
  try {
    supabase = await createClient();
  } catch {
    return { ok: false, response: NextResponse.json({ error: "No se pudo validar la sesión." }, { status: 503 }) };
  }
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { ok: false, response: NextResponse.json({ error: "Autenticación requerida." }, { status: 401 }) };
  if (!isPlatformSuperAdmin(user)) return { ok: false, response: NextResponse.json({ error: "Se requiere el perfil Superadministrador global." }, { status: 403 }) };
  return { ok: true, supabase, user };
}

export type PlatformRpcResult = { data: unknown; error: { code?: string; message: string } | null };

export async function platformRpc(
  supabase: SupabaseServerClient,
  name: string,
  args: Record<string, unknown> = {},
): Promise<PlatformRpcResult> {
  const client = supabase as unknown as {
    rpc: (functionName: string, parameters: Record<string, unknown>) => Promise<PlatformRpcResult>;
  };
  return client.rpc(name, args);
}

export function rpcErrorResponse(error: PlatformRpcResult["error"]) {
  if (!error) return NextResponse.json({ error: "Error desconocido." }, { status: 500 });
  const status = error.code === "42501" ? 403
    : error.code === "P0002" ? 404
      : ["40001", "23505", "55P03", "23514"].includes(error.code ?? "") ? 409
        : error.code === "22023" ? 400 : 500;
  const safeMessages: Record<string, string> = {
    platform_superadmin_required: "Se requiere el perfil Superadministrador global.",
    institution_not_found: "La institución no existe.",
    active_institution_not_found: "La institución no existe o no está activa.",
    active_source_institution_not_found: "La institución de origen no existe o no está activa.",
    invalid_admin_assignment: "No se puede asignar el propio usuario Superadministrador como administrador institucional. Ingresá el UUID de otra cuenta existente.",
    auth_user_not_found: "El UUID ingresado no corresponde a un usuario existente en Supabase Auth.",
    institution_admin_role_missing: "Falta configurar el rol Administrador institucional en la base de datos.",
    active_admin_membership_not_found: "No se encontró una asignación activa para revocar.",
    self_revocation_forbidden: "No podés revocar tu propio acceso desde esta operación.",
    membership_is_not_institution_admin: "La asignación seleccionada no tiene el rol de administrador institucional.",
    institution_version_conflict: "La institución cambió. Actualizá la ficha y volvé a intentar.",
    invalid_institution_update: "Los datos de la ficha no superan la validación. Revisá nombre, razón social, idioma, zona horaria, correo, sitio web y logo.",
    cannot_revoke_last_institution_admin: "No se puede revocar al último administrador de la institución.",
    cannot_revoke_last_superadmin: "No se puede revocar al último Superadministrador global.",
    delegation_requires_second_superadmin: "La aprobación debe realizarla otro Superadministrador.",
    ai_plan_requires_independent_approval: "El plan debe aprobarlo otro Superadministrador.",
    independent_approval_required: "La aprobación debe realizarla otro Superadministrador.",
    idempotency_key_reused_with_different_request: "La clave de idempotencia ya fue usada con otros datos.",
    idempotent_request_in_progress: "La operación ya está en curso.",
  };
  return NextResponse.json({ error: safeMessages[error.message] ?? "La operación fue rechazada por los controles de seguridad.", code: error.code ?? "PLATFORM_OPERATION_FAILED" }, { status });
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function requestId() {
  return crypto.randomUUID();
}

export function validUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
