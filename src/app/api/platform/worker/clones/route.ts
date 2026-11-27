import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0" } });

function validWorkerSecret(request: Request): boolean {
  const configured = process.env.EDUNEXA_PLATFORM_WORKER_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!configured || !supplied) return false;
  const expectedBytes = Buffer.from(configured);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export async function POST(request: Request) {
  if (!validWorkerSecret(request)) return json({ error: "Trabajador no autorizado." }, 401);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return json({ error: "El trabajador requiere credenciales administrativas solo del servidor." }, 503);

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const claimed = await admin.rpc("platform_claim_clone_job", { p_lease_seconds: 180 });
  if (claimed.error) {
    console.error("[platform-clone-worker] claim failed", { code: claimed.error.code });
    return json({ error: "No se pudo reclamar un trabajo de clonación." }, 503);
  }
  if (!claimed.data) return json({ processed: false, status: "queue_empty" });

  const job = claimed.data as {
    id?: string;
    source_institution_id?: string;
    target_institution_id?: string;
    copy_mode?: string;
    attempt_count?: number;
  };
  if (!job.id || !job.source_institution_id || !job.target_institution_id
    || job.copy_mode !== "configuration_only") {
    return json({ error: "El trabajo reclamado no cumple el contrato configuration-only." }, 409);
  }

  // The database function copies only the private, category-allowlisted configuration
  // registry. It never selects memberships, students, guardians, grades or messages.
  const finished = await admin.rpc("platform_finish_clone_job", {
    p_job_id: job.id,
    p_success: true,
    p_failure_code: null,
  });
  if (finished.error) {
    const failureCode = finished.error.code === "23514" ? "unsafe_configuration_rejected" : "clone_copy_failed";
    const retry = await admin.rpc("platform_finish_clone_job", {
      p_job_id: job.id,
      p_success: false,
      p_failure_code: failureCode,
    });
    if (retry.error) {
      console.error("[platform-clone-worker] completion and retry recording failed", {
        jobId: job.id, completionCode: finished.error.code, retryCode: retry.error.code,
      });
      return json({ error: "El trabajo requiere reconciliación operativa.", jobId: job.id }, 500);
    }
    return json({ processed: true, job: retry.data, error: "La configuración no pudo copiarse; el trabajo fue reencolado o falló definitivamente." }, 502);
  }

  return json({ processed: true, job: finished.data });
}
