import { NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import {
  platformRpc, readJson, requestId, requirePlatformSuperadmin, rpcErrorResponse, validUuid,
} from "@/lib/auth/platform-api";

type RouteContext = { params: Promise<{ segments: string[] }> };
type JsonObject = Record<string, unknown>;
const noStore = { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" };
const json = (body: JsonObject, status = 200) => NextResponse.json(body, { status, headers: noStore });
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const requiredReason = (value: unknown) => text(value).length >= 12 && text(value).length <= 1000;
const idempotencyKey = (request: Request) => request.headers.get("idempotency-key") ?? "";

async function context(request: Request, write = false) {
  const auth = await requirePlatformSuperadmin(request, write);
  return auth.ok ? auth : { response: auth.response };
}

export async function GET(request: Request, route: RouteContext) {
  const auth = await context(request);
  if ("response" in auth) return auth.response;
  const { segments } = await route.params;
  const url = new URL(request.url);
  if (segments.length === 1 && segments[0] === "institutions") {
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "50") || 50));
    const result = await platformRpc(auth.supabase, "platform_list_institutions", {
      p_limit: limit,
      p_before: url.searchParams.get("before") || null,
      p_status: url.searchParams.get("status") || null,
      p_search: url.searchParams.get("search") || null,
    });
    if (result.error) return rpcErrorResponse(result.error);
    return json({ institutions: result.data ?? [] });
  }
  if (segments.length === 1 && segments[0] === "superadmins") {
    const result = await platformRpc(auth.supabase, "platform_list_superadmins");
    if (result.error) return rpcErrorResponse(result.error);
    return json({ superadmins: result.data ?? [] });
  }
  if (segments.length === 3 && segments[0] === "institutions" && segments[2] === "administrators" && validUuid(segments[1])) {
    const result = await platformRpc(auth.supabase, "platform_list_institution_admins", { p_institution_id: segments[1] });
    if (result.error) return rpcErrorResponse(result.error);
    return json({ administrators: result.data ?? [] });
  }
  if (segments.length === 1 && segments[0] === "audit") {
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "50") || 50));
    const institutionId = url.searchParams.get("institutionId");
    if (institutionId && !validUuid(institutionId)) return json({ error: "Identificador de institución inválido." }, 400);
    const result = await platformRpc(auth.supabase, "platform_list_audit_events", {
      p_limit: limit,
      p_before: url.searchParams.get("before") || null,
      p_institution_id: institutionId || null,
    });
    if (result.error) return rpcErrorResponse(result.error);
    return json({ events: result.data ?? [] });
  }
  return json({ error: "Recurso no encontrado." }, 404);
}

export async function POST(request: Request, route: RouteContext) {
  const auth = await context(request, true);
  if ("response" in auth) return auth.response;
  const { segments } = await route.params;
  const body = await readJson(request) ?? {};
  const requestIdValue = requestId();
  const key = idempotencyKey(request);
  let result: Awaited<ReturnType<typeof platformRpc>>;

  if (segments.length === 1 && segments[0] === "institutions") {
    if (!requiredReason(body.reason) || !text(body.displayName) || !text(body.legalName) || !text(body.slug)) {
      return json({ error: "Nombre, razón social, slug y motivo (mínimo 12 caracteres) son obligatorios." }, 400);
    }
    if (!key) return json({ error: "Falta la cabecera Idempotency-Key." }, 400);
    result = await platformRpc(auth.supabase, "platform_create_institution", {
      p_display_name: text(body.displayName), p_legal_name: text(body.legalName),
      p_slug: text(body.slug).toLowerCase(), p_reason: text(body.reason),
      p_request_id: requestIdValue, p_idempotency_key: key,
    });
    if (result.error) return rpcErrorResponse(result.error);
    return json({ institution: result.data }, 201);
  }

  if (segments.length === 3 && segments[0] === "institutions" && segments[2] === "administrators") {
    if (!validUuid(segments[1]) || !validUuid(body.userId) || !requiredReason(body.reason) || !key) {
      return json({ error: "Institución, usuario, motivo e Idempotency-Key son obligatorios." }, 400);
    }
    result = await platformRpc(auth.supabase, "platform_assign_institution_admin", {
      p_institution_id: segments[1], p_user_id: body.userId, p_reason: text(body.reason),
      p_request_id: requestIdValue, p_idempotency_key: key,
    });
    if (result.error) return rpcErrorResponse(result.error);
    return json({ administrator: result.data }, 201);
  }

  if (segments.length === 1 && segments[0] === "delegations") {
    if (!validUuid(body.institutionId) || !requiredReason(body.reason) || !text(body.expiresAt)) {
      return json({ error: "Institución, motivo y vencimiento son obligatorios." }, 400);
    }
    const expiresAt = new Date(text(body.expiresAt));
    if (Number.isNaN(expiresAt.getTime())) return json({ error: "Vencimiento inválido." }, 400);
    result = await platformRpc(auth.supabase, "platform_request_delegation", {
      p_institution_id: body.institutionId, p_reason: text(body.reason),
      p_expires_at: expiresAt.toISOString(), p_request_id: requestIdValue,
    });
    if (result.error) return rpcErrorResponse(result.error);
    return json({ delegationId: result.data, status: "pending_second_approval" }, 201);
  }

  if (segments.length === 3 && segments[0] === "delegations" && segments[2] === "approve") {
    if (!validUuid(segments[1])) return json({ error: "Identificador inválido." }, 400);
    result = await platformRpc(auth.supabase, "platform_approve_delegation", {
      p_delegation_id: segments[1], p_request_id: requestIdValue,
    });
    if (result.error) return rpcErrorResponse(result.error);
    return json({ delegation: result.data });
  }

  if (segments.length === 3 && segments[0] === "delegations" && segments[2] === "revoke") {
    if (!validUuid(segments[1]) || !requiredReason(body.reason)) return json({ error: "Identificador y motivo son obligatorios." }, 400);
    result = await platformRpc(auth.supabase, "platform_revoke_delegation", {
      p_delegation_id: segments[1], p_reason: text(body.reason), p_request_id: requestIdValue,
    });
    if (result.error) return rpcErrorResponse(result.error);
    return json({ delegation: result.data });
  }

  if (segments.length === 1 && segments[0] === "clones") {
    if (!validUuid(body.sourceInstitutionId) || !requiredReason(body.reason)
      || !text(body.displayName) || !text(body.legalName) || !text(body.slug)) {
      return json({ error: "Origen, nombre, razón social, slug y motivo son obligatorios." }, 400);
    }
    result = await platformRpc(auth.supabase, "platform_request_clone", {
      p_source_institution_id: body.sourceInstitutionId, p_display_name: text(body.displayName),
      p_legal_name: text(body.legalName), p_slug: text(body.slug).toLowerCase(),
      p_reason: text(body.reason), p_request_id: requestIdValue,
    });
    if (result.error) return rpcErrorResponse(result.error);
    return json({ clone: result.data, notice: "La clonación queda en cola y solo contempla configuración; no copia datos personales." }, 202);
  }

  if (segments.length === 2 && segments[0] === "superadmins" && segments[1] === "requests") {
    if (!validUuid(body.targetUserId) || !["grant", "revoke"].includes(text(body.action)) || !requiredReason(body.reason)) {
      return json({ error: "Usuario, acción grant/revoke y motivo son obligatorios." }, 400);
    }
    result = await platformRpc(auth.supabase, "platform_create_superadmin_change", {
      p_target_user_id: body.targetUserId, p_action: text(body.action),
      p_reason: text(body.reason), p_request_id: requestIdValue,
    });
    if (result.error) return rpcErrorResponse(result.error);
    return json({ requestId: result.data, status: "pending_second_approval" }, 201);
  }

  if (segments.length === 4 && segments[0] === "superadmins" && segments[1] === "requests" && segments[3] === "approve") {
    if (!validUuid(segments[2])) return json({ error: "Identificador inválido." }, 400);
    result = await platformRpc(auth.supabase, "platform_approve_superadmin_change", {
      p_request_id: segments[2], p_audit_request_id: requestIdValue,
    });
    if (result.error) return rpcErrorResponse(result.error);
    return json({ approval: result.data });
  }

  if (segments.length === 4 && segments[0] === "superadmins" && segments[1] === "requests" && segments[3] === "execute") {
    if (!validUuid(segments[2])) return json({ error: "Identificador inválido." }, 400);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const adminSecret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !adminSecret) return json({ error: "La ejecución de cambios de privilegio requiere una clave administrativa configurada solo en el servidor." }, 503);
    const claim = await platformRpc(auth.supabase, "platform_claim_superadmin_change", {
      p_request_id: segments[2], p_audit_request_id: requestIdValue,
    });
    if (claim.error) return rpcErrorResponse(claim.error);
    const change = claim.data as { target_user_id?: string; action?: string } | null;
    if (!change?.target_user_id || !["grant", "revoke"].includes(change.action ?? "")) {
      return json({ error: "La solicitud aprobada no contiene una instrucción válida." }, 409);
    }
    const admin = createSupabaseAdminClient(supabaseUrl, adminSecret, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const targetResult = await admin.auth.admin.getUserById(change.target_user_id);
    if (targetResult.error || !targetResult.data.user) {
      const finished = await platformRpc(auth.supabase, "platform_finish_superadmin_change", {
        p_request_id: segments[2], p_success: false, p_failure_code: "target_user_unavailable",
        p_audit_request_id: requestId(),
      });
      if (finished.error) return json({ error: "No se pudo registrar el resultado; requiere reconciliación manual." }, 500);
      return json({ error: "No se encontró el usuario de destino." }, 404);
    }
    const previousMetadata = targetResult.data.user.app_metadata ?? {};
    const nextMetadata: Record<string, unknown> = { ...previousMetadata };
    if (change.action === "grant") nextMetadata.platform_role = "superadmin";
    else delete nextMetadata.platform_role;
    const updated = await admin.auth.admin.updateUserById(change.target_user_id, { app_metadata: nextMetadata });
    if (updated.error) {
      const finished = await platformRpc(auth.supabase, "platform_finish_superadmin_change", {
        p_request_id: segments[2], p_success: false, p_failure_code: "auth_admin_update_failed",
        p_audit_request_id: requestId(),
      });
      if (finished.error) return json({ error: "Falló Auth y no se pudo cerrar la auditoría; requiere reconciliación manual." }, 500);
      return json({ error: "Supabase Auth rechazó el cambio de privilegio." }, 502);
    }
    const finished = await platformRpc(auth.supabase, "platform_finish_superadmin_change", {
      p_request_id: segments[2], p_success: true, p_failure_code: null, p_audit_request_id: requestId(),
    });
    if (finished.error) {
      const rollback = await admin.auth.admin.updateUserById(change.target_user_id, { app_metadata: previousMetadata });
      if (rollback.error) return json({ error: "Fallaron la auditoría final y la reversión. Bloqueá nuevas operaciones y reconciliá manualmente." }, 500);
      const failedFinish = await platformRpc(auth.supabase, "platform_finish_superadmin_change", {
        p_request_id: segments[2], p_success: false, p_failure_code: "audit_finalize_failed_rolled_back",
        p_audit_request_id: requestId(),
      });
      if (failedFinish.error) return json({ error: "El cambio se revirtió, pero la solicitud requiere reconciliación de auditoría." }, 500);
      return json({ error: "La auditoría no pudo finalizar; el cambio de privilegio fue revertido." }, 503);
    }
    return json({ result: finished.data, targetUserId: change.target_user_id, action: change.action });
  }

  if (segments.length === 4 && segments[0] === "copilot" && segments[1] === "plans" && segments[3] === "approve") {
    if (!validUuid(segments[2])) return json({ error: "Identificador inválido." }, 400);
    result = await platformRpc(auth.supabase, "platform_approve_ai_change_plan", {
      p_plan_id: segments[2], p_request_id: requestIdValue,
    });
    if (result.error) return rpcErrorResponse(result.error);
    return json({ approval: result.data, executionEnabled: false });
  }

  if (segments.length === 2 && segments[0] === "copilot" && segments[1] === "plans") {
    const instruction = text(body.instruction);
    if (instruction.length < 12 || instruction.length > 4000) return json({ error: "La instrucción debe tener entre 12 y 4000 caracteres." }, 400);
    const secretPattern = /(ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]{20,}|Bearer\s+[A-Za-z0-9._-]{20,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----)/i;
    const personalPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b\d{7,12}\b/i;
    if (secretPattern.test(instruction) || personalPattern.test(instruction)) {
      return json({ error: "No incluyas claves, tokens, correos ni datos personales en las instrucciones del Copiloto." }, 400);
    }
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) return json({ error: "Groq no está configurado en el servidor." }, 503);
    const model = process.env.GROQ_PLATFORM_MODEL || process.env.GROQ_REPORT_MODEL || "openai/gpt-oss-20b";
    const prompt = [
      "Sos el Copiloto de operaciones de EDUNEXA. El único proveedor permitido es Groq.",
      "Transformá la instrucción en un plan JSON revisable. No ejecutes acciones ni afirmes que las ejecutaste.",
      "Solo proponé acciones permitidas: GitHub review_repository/create_pull_request/run_ci; Supabase propose_migration/review_rls/inspect_schema; Render inspect_service/plan_deploy/inspect_logs; platform audit/clone_configuration.",
      "Nunca solicites, incluyas ni inventes secretos, tokens, credenciales, datos personales, datos de alumnos ni SQL destructivo.",
      "Toda modificación debe requerir aprobación independiente de otro Superadministrador. Para Supabase, generar propuestas de migración, nunca aplicarlas automáticamente. Para Render, planificar, nunca desplegar automáticamente.",
      "Respondé exclusivamente JSON válido con estas claves: provider (groq), category (github|supabase|render|platform), summary, risk (low|medium|high|critical), steps (array de objetos {system,action,description,requiresApproval:true}), affectedResources (array), rollback, requiresSecondApproval:true, executionMode:'review_only'.",
      "Instrucción del Superadministrador: " + instruction,
    ].join("\n");
    let providerResponse: Response;
    try {
      providerResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.1, max_tokens: 1600 }),
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      return json({ error: "Groq no está disponible. No se ejecutó ninguna operación." }, 502);
    }
    if (!providerResponse.ok) {
      console.error("[platform-copilot] Groq request failed", { status: providerResponse.status, model });
      return json({ error: providerResponse.status === 429 ? "Groq alcanzó su límite de solicitudes." : "Groq no pudo generar el plan." }, 502);
    }
    const providerPayload = await providerResponse.json() as { choices?: { message?: { content?: string | null } }[] };
    const rawPlan = providerPayload.choices?.[0]?.message?.content?.trim() ?? "";
    let parsed: JsonObject;
    try {
      const normalized = rawPlan.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      parsed = JSON.parse(normalized) as JsonObject;
    } catch {
      return json({ error: "Groq devolvió un plan que no cumple el formato JSON requerido." }, 502);
    }
    const allowed: Record<string, string[]> = {
      github: ["review_repository", "create_pull_request", "run_ci"],
      supabase: ["propose_migration", "review_rls", "inspect_schema"],
      render: ["inspect_service", "plan_deploy", "inspect_logs"],
      platform: ["audit", "clone_configuration"],
    };
    const category = text(parsed.category);
    const steps = Array.isArray(parsed.steps) ? parsed.steps as JsonObject[] : [];
    if (!allowed[category] || steps.length < 1 || steps.length > 10
      || steps.some((step) => !allowed[text(step.system)]?.includes(text(step.action)))) {
      return json({ error: "El plan de Groq contiene acciones fuera de la lista permitida." }, 502);
    }
    const plan = {
      provider: "groq", category, summary: text(parsed.summary).slice(0, 1000),
      risk: ["low", "medium", "high", "critical"].includes(text(parsed.risk)) ? text(parsed.risk) : "high",
      steps: steps.map((step) => ({
        system: text(step.system), action: text(step.action),
        description: text(step.description).slice(0, 800), requiresApproval: true,
      })),
      affectedResources: Array.isArray(parsed.affectedResources) ? parsed.affectedResources.slice(0, 20).map((item) => text(item).slice(0, 160)) : [],
      rollback: text(parsed.rollback).slice(0, 1000),
      requiresSecondApproval: true, executionMode: "review_only",
    };
    const stored = await platformRpc(auth.supabase, "platform_create_ai_change_plan", {
      p_instruction_redacted: instruction, p_plan: plan,
    });
    if (stored.error) return rpcErrorResponse(stored.error);
    return json({ planId: stored.data, plan, status: "pending_second_approval", executionEnabled: false }, 201);
  }

  return json({ error: "Recurso o acción no encontrado." }, 404);
}

export async function PATCH(request: Request, route: RouteContext) {
  const auth = await context(request, true);
  if ("response" in auth) return auth.response;
  const { segments } = await route.params;
  const body = await readJson(request);
  if (!body) return json({ error: "El cuerpo JSON no es válido." }, 400);
  if (segments.length === 2 && segments[0] === "institutions" && validUuid(segments[1])) {
    if (!requiredReason(body.reason) || !text(body.displayName) || !text(body.legalName)
      || !text(body.locale) || !text(body.timezone) || !text(body.expectedUpdatedAt) || !idempotencyKey(request)) {
      return json({ error: "Nombre, razón social, idioma, zona horaria, versión, motivo e Idempotency-Key son obligatorios." }, 400);
    }
    const expected = new Date(text(body.expectedUpdatedAt));
    if (Number.isNaN(expected.getTime())) return json({ error: "Versión de institución inválida." }, 400);
    const updated = await platformRpc(auth.supabase, "platform_update_institution", {
      p_institution_id: segments[1], p_display_name: text(body.displayName), p_legal_name: text(body.legalName),
      p_locale: text(body.locale), p_timezone: text(body.timezone), p_expected_updated_at: expected.toISOString(),
      p_reason: text(body.reason), p_request_id: requestId(), p_idempotency_key: idempotencyKey(request),
    });
    if (updated.error) return rpcErrorResponse(updated.error);
    return json({ institution: updated.data });
  }

  if (segments.length !== 3 || segments[0] !== "institutions" || segments[2] !== "status" || !validUuid(segments[1])) {
    return json({ error: "Recurso no encontrado." }, 404);
  }
  if (!["active", "suspended"].includes(text(body.status)) || !requiredReason(body.reason)
    || !text(body.expectedUpdatedAt) || !idempotencyKey(request)) {
    return json({ error: "Estado, versión, motivo e Idempotency-Key son obligatorios." }, 400);
  }
  const expected = new Date(text(body.expectedUpdatedAt));
  if (Number.isNaN(expected.getTime())) return json({ error: "Versión de institución inválida." }, 400);
  const result = await platformRpc(auth.supabase, "platform_set_institution_status", {
    p_institution_id: segments[1], p_status: text(body.status),
    p_expected_updated_at: expected.toISOString(), p_reason: text(body.reason),
    p_request_id: requestId(), p_idempotency_key: idempotencyKey(request),
  });
  if (result.error) return rpcErrorResponse(result.error);
  return json({ institution: result.data });
}

export async function DELETE(request: Request, route: RouteContext) {
  const auth = await context(request, true);
  if ("response" in auth) return auth.response;
  const { segments } = await route.params;
  const body = await readJson(request);
  if (segments.length !== 4 || segments[0] !== "institutions" || segments[2] !== "administrators"
    || !validUuid(segments[1]) || !validUuid(segments[3])) return json({ error: "Recurso no encontrado." }, 404);
  if (!body || !requiredReason(body.reason) || !idempotencyKey(request)) return json({ error: "Motivo e Idempotency-Key son obligatorios." }, 400);
  const result = await platformRpc(auth.supabase, "platform_revoke_institution_admin", {
    p_institution_id: segments[1], p_membership_id: segments[3],
    p_reason: text(body.reason), p_request_id: requestId(), p_idempotency_key: idempotencyKey(request),
  });
  if (result.error) return rpcErrorResponse(result.error);
  return json({ administrator: result.data });
}
