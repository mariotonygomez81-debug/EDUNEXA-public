import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dashboard = readFileSync("src/app/dashboard/page.tsx", "utf8");
const workspace = readFileSync("src/app/dashboard/[slug]/page.tsx", "utf8");

assert.match(dashboard, /supabase\.from\("memberships"\)[\s\S]*?\.eq\("status", "active"\)/,
  "The account selector must start from the authenticated user's active memberships.");
assert.match(dashboard, /\.in\("id", institutionIds\)[\s\S]*?\.eq\("status", "active"\)/,
  "Only active institutions related to the user's memberships may be listed.");
assert.match(dashboard, /availableInstitutions\.length === 1[\s\S]*?redirect\(/,
  "A single active institution should continue to open directly.");
assert.match(dashboard, /availableInstitutions\.map\(\(institution\)/,
  "Multiple active institutions must be selectable from the same account.");
assert.match(dashboard, /href=\{\`\/dashboard\/\$\{institution\.slug\}\`\}/,
  "Each institution selection must open its own workspace route.");
assert.doesNotMatch(dashboard, /hasUnexpectedMultipleMemberships|bloqueamos el acceso hasta corregir/,
  "Multiple memberships must not be treated as an account error.");
assert.match(workspace, /\.eq\("institution_id", institution\.id\)[\s\S]*?\.eq\("user_id", user\.id\)[\s\S]*?\.eq\("status", "active"\)/,
  "The institution workspace must independently verify the authenticated user's active membership.");

console.log("Multi-institution single-login checks passed.");
