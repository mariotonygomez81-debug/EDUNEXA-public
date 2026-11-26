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

async function requestJson(url: string, init: RequestInit = {}): Promise<{ response: Response; payload: Json }> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(20000), cache: "no-store" });
  const raw = await response.text();
  let payload: Json = {};
  try { payload = raw ? JSON.parse(raw) as Json : {}; } catch { payload = { message: "non_json_response" }; }
  if (!response.ok) throw new Error(`external_api_failed:${response.status}`);
  return { response, payload };
}

async function github(step: PlanStep) {
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

  throw new Error("github_action_not_allowlisted");
}

export async function executeApprovedPlan(plan: ApprovedPlan): Promise<ExecutionResult> {
  if (plan.provider !== "groq" || plan.executionMode !== "review_only"
    || !Array.isArray(plan.steps) || plan.steps.length < 1 || plan.steps.length > 10) {
    throw new Error("approved_plan_contract_invalid");
  }

  // Validate the complete plan before any external call. No PRs, hosted Supabase,
  // Render APIs, deployments, migrations, or arbitrary repository writes are allowed.
  if (plan.steps.some((step) => step.system !== "github"
    || !["review_repository", "run_ci"].includes(step.action))) {
    throw new Error("plan_step_outside_current_platform_scope");
  }

  const actions: Array<{ system: string; action: string; status: string; reference?: string }> = [];
  for (const step of plan.steps) actions.push(await github(step));

  return {
    summary: { completed: actions.length, actions },
    // CI dispatch cannot be undone after GitHub accepts it. The audit saga records
    // the result and surfaces reconciliation if its finalization fails.
    rollback: async () => ({ attempted: 0, failed: 0 }),
  };
}
