const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const routes = [
  { path: "/login", marker: "EDUNEXA" },
  { path: "/demo", marker: "Panel de demostración" },
  { path: "/forgot-password" },
  { path: "/reset-password" },
];

async function waitForServer() {
  let lastError;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(baseUrl, { redirect: "manual" });
      if (response.status < 500) return;
      lastError = new Error(`Server returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Next.js server did not become ready: ${lastError}`);
}

await waitForServer();

const failures = [];
for (const route of routes) {
  try {
    const response = await fetch(new URL(route.path, baseUrl));
    const html = await response.text();
    if (!response.ok) {
      failures.push(`${route.path}: HTTP ${response.status}`);
      continue;
    }
    if (route.marker && !html.includes(route.marker)) {
      failures.push(`${route.path}: expected page marker "${route.marker}" was missing`);
      continue;
    }
    process.stdout.write(`PASS ${route.path} (HTTP ${response.status})\n`);
  } catch (error) {
    failures.push(`${route.path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures.length) {
  process.stderr.write(`\nSmoke test failures:\n- ${failures.join("\n- ")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`\nAll ${routes.length} public route smoke checks passed.\n`);
}
