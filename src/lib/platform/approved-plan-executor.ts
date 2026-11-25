import "server-only";

type Json = Record<string, unknown>;
type PlanStep = { system: string; action: string; description?: string; input?: Json };
type ApprovedPlan = { provider: "groq"; executionMode: string; steps: PlanStep[] };

export type ExecutionResult = {
  summary: { completed: number; actions: Array<{ system: string; action: string; status: string; reference?: string }> };
  rollback: () => Promise<{ attempted: number; failed: number }>;
};

const INTEGRATION_BRANCH = "feature/EDUNEXA-MODELES";
const REPOSITORY = "mariotonygomez81-debug/EDUNEXA-public";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`server_credential_missing:${name}`);
  return value;
}

function safeString(value: unknown, max = 3000): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function allowedRenderService(serviceId: string): boolean {
  const allowlist = (process.env.EDUNEXA_RENDER_SERVICE_IDS || "").split(",").map((item) => item.trim()).filter(Boolean);
  return Boolean(serviceId) && allowlist.includes(serviceId);
}

async function requestJson(url: string, init: RequestInit = {}): Promise<{ response: Response; payload: Json }> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(20000), cache: "no-store" });
  const raw = await response.text();
  let payload: Json = {};
  try { payload = raw ? JSON.parse(raw) as Json : {}; } catch { payload = { message: "non_json_response" }; }
  if (!response.ok) throw new Error(`external_api_failed:${response.status}`);
  return { response, payload };
}

async function github(step: PlanStep, compensate: Array<() => Promise<void>>) {
  const token = requiredEnv("GITHUB_TOKEN");
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
  const root = `https://api.github.com/repos/${REPOSITORY}`;

  if (step.action === "review_repository") {
    const { payload } = await requestJson(root, { headers });
    return { system: step.system, action: step.action, status: "inspected", reference: safeString(payload.html_url, 300) };
  }

  if (step.action === "run_ci") {
    const workflow = process.env.EDUNEXA_CI_WORKFLOW_ID?.trim() || "ci.yml";
    await requestJson(`${root}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`, {
      method: "POST", headers, body: JSON.stringify({ ref: INTEGRATION_BRANCH }),
    });
    return { system: step.system, action: step.action, status: "dispatched", reference: INTEGRATION_BRANCH };
  }

  if (step.action === "create_pull_request") {
    const input = step.input ?? {};
    const title = safeString(input.title, 160);
    const body = safeString(input.body, 5000);
    const head = safeString(input.head, 120);
    const base = safeString(input.base, 120);
    if (!title || !body || !head.startsWith("feature/EDUNEXA-") || head === INTEGRATION_BRANCH
      || base !== INTEGRATION_BRANCH || head === "main") {
      throw new Error("github_pull_request_scope_rejected");
    }
    const { payload } = await requestJson(`${root}/pulls`, {
      method: "POST", headers, body: JSON.stringify({ title, body, head, base, draft: true }),
    });
    const number = Number(payload.number);
    if (!Number.isInteger(number) || number < 1) throw new Error("github_pull_request_reference_missing");
    compensate.push(async () => {
      await requestJson(`${root}/pulls/${number}`, {
        method: "PATCH", headers, body: JSON.stringify({ state: "closed" }),
      });
    });
    return { system: step.system, action: step.action, status: "created_as_draft", reference: String(number) };
  }

  throw new Error("github_action_not_allowlisted");
}

async function supabase(step: PlanStep) {
  const token = requiredEnv("SUPABASE_ACCESS_TOKEN");
  const projectRef = requiredEnv("SUPABASE_PROJECT_REF");
  if (!/^[a-z0-9]{20}$/.test(projectRef)) throw new Error("supabase_project_ref_invalid");

  if (step.action === "inspect_schema" || step.action === "review_rls") {
    const query = step.action === "review_rls"
      ? "select n.nspname as schema_name, c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname='public' order by c.relname limit 250"
      : "select table_schema, table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name limit 250";
    const { payload } = await requestJson(`https://api.supabase.com/v1/projects/${projectRef}/database/query/read-only`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    return { system: step.system, action: step.action, status: "read_only_inspection_completed", reference: `${Array.isArray(payload) ? payload.length : "result"} rows` };
  }

  // Applying migrations, changing Auth, or mutating a hosted project is intentionally
  // unavailable until the owner explicitly authorizes that live operation.
  throw new Error("supabase_live_mutation_not_authorized");
}

async function render(step: PlanStep) {
  const token = requiredEnv("RENDER_API_KEY");
  const serviceId = safeString(step.input?.serviceId, 128);
  if (!allowedRenderService(serviceId)) throw new Error("render_service_outside_allowlist");
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  const { payload } = await requestJson(`https://api.render.com/v1/services/${encodeURIComponent(serviceId)}`, { headers });
  const service = (payload.service && typeof payload.service === "object" ? payload.service : payload) as Json;

  if (step.action === "inspect_service" || step.action === "plan_deploy") {
    return {
      system: step.system, action: step.action,
      status: step.action === "plan_deploy" ? "plan_only_no_deploy_triggered" : "inspected",
      reference: safeString(service.name || service.id, 160),
    };
  }

  if (step.action === "inspect_logs") {
    const ownerId = requiredEnv("RENDER_OWNER_ID");
    const endTime = new Date().toISOString();
    const startTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const query = new URLSearchParams({ ownerId, resource: serviceId, startTime, endTime, limit: "50" });
    const logs = await requestJson(`https://api.render.com/v1/logs?${query.toString()}`, { headers });
    const count = Array.isArray(logs.payload.logs) ? logs.payload.logs.length : 0;
    return { system: step.system, action: step.action, status: "logs_inspected", reference: `${count} entries` };
  }

  throw new Error("render_action_not_allowlisted");
}

export async function executeApprovedPlan(plan: ApprovedPlan): Promise<ExecutionResult> {
  if (plan.provider !== "groq" || plan.executionMode !== "review_only"
    || !Array.isArray(plan.steps) || plan.steps.length < 1 || plan.steps.length > 10) {
    throw new Error("approved_plan_contract_invalid");
  }

  const compensations: Array<() => Promise<void>> = [];
  const actions: Array<{ system: string; action: string; status: string; reference?: string }> = [];
  try {
    for (const step of plan.steps) {
      if (step.system === "github" && ["review_repository", "create_pull_request", "run_ci"].includes(step.action)) {
        actions.push(await github(step, compensations));
      } else if (step.system === "supabase" && ["inspect_schema", "review_rls"].includes(step.action)) {
        actions.push(await supabase(step));
      } else if (step.system === "render" && ["inspect_service", "plan_deploy", "inspect_logs"].includes(step.action)) {
        actions.push(await render(step));
      } else {
        throw new Error("plan_step_not_allowlisted_or_live_write_not_authorized");
      }
    }
  } catch (error) {
    for (const compensate of [...compensations].reverse()) {
      try { await compensate(); } catch { /* surfaced in reconciliation count below */ }
    }
    throw error;
  }

  return {
    summary: { completed: actions.length, actions },
    rollback: async () => {
      let failed = 0;
      let attempted = 0;
      for (const compensate of [...compensations].reverse()) {
        attempted += 1;
        try { await compensate(); } catch { failed += 1; }
      }
      return { attempted, failed };
    },
  };
}
