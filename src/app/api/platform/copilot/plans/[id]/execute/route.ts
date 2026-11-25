import { NextResponse } from "next/server";
import {
  platformRpc, requirePlatformSuperadmin, rpcErrorResponse, validUuid,
} from "@/lib/auth/platform-api";
import { executeApprovedPlan } from "@/lib/platform/approved-plan-executor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };
const json = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0" } });

export async function POST(request: Request, context: Context) {
  const auth = await requirePlatformSuperadmin(request, true);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!validUuid(id)) return json({ error: "Identificador de plan inválido." }, 400);

  // The database claim is the idempotency boundary: only the independent approver
  // may claim an approved plan, and a second request cannot claim it again.
  const claim = await platformRpc(auth.supabase, "platform_claim_ai_change_plan_execution", {
    p_plan_id: id,
  });
  if (claim.error) return rpcErrorResponse(claim.error);

  const claimed = claim.data as { id?: string; plan?: unknown } | null;
  if (!claimed?.id || !claimed.plan || typeof claimed.plan !== "object") {
    return json({ error: "El plan aprobado no contiene instrucciones ejecutables." }, 409);
  }

  let execution: Awaited<ReturnType<typeof executeApprovedPlan>>;
  try {
    execution = await executeApprovedPlan(claimed.plan as Parameters<typeof executeApprovedPlan>[0]);
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 100) : "adapter_execution_failed";
    const finished = await platformRpc(auth.supabase, "platform_finish_ai_change_plan_execution", {
      p_plan_id: id, p_success: false, p_result: { completed: 0, actions: [] },
      p_failure_code: code,
    });
    if (finished.error) {
      console.error("[platform-copilot] execution and audit finalization failed", { planId: id, code });
      return json({ error: "La ejecución falló y el cierre de auditoría requiere reconciliación manual.", planId: id }, 500);
    }
    return json({ error: "El adaptador rechazó el plan o falló una operación. No se ejecutaron acciones fuera de la lista permitida.", result: finished.data }, 502);
  }

  const finalized = await platformRpc(auth.supabase, "platform_finish_ai_change_plan_execution", {
    p_plan_id: id, p_success: true, p_result: execution.summary,
    p_failure_code: null,
  });
  if (finalized.error) {
    const rollback = await execution.rollback();
    const failedFinalize = await platformRpc(auth.supabase, "platform_finish_ai_change_plan_execution", {
      p_plan_id: id, p_success: false,
      p_result: { rollback_attempted: rollback.attempted, rollback_failed: rollback.failed },
      p_failure_code: "audit_finalize_failed",
    });
    if (failedFinalize.error || rollback.failed > 0) {
      console.error("[platform-copilot] finalization compensation needs reconciliation", {
        planId: id, rollback, auditRecovered: !failedFinalize.error,
      });
      return json({ error: "Falló la auditoría final; la reversión requiere revisión manual.", rollback }, 500);
    }
    return json({ error: "La auditoría final falló; las acciones reversibles fueron revertidas.", rollback }, 503);
  }

  return json({ result: finalized.data, execution: execution.summary, singleExecution: true });
}
