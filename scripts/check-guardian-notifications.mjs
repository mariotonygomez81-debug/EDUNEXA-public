import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const draft = readFileSync("docs/database/guardian-notification-fanout.draft.sql", "utf8");
const inbox = readFileSync("src/app/dashboard/[slug]/notifications/page.tsx", "utf8");
const actions = readFileSync("src/app/dashboard/[slug]/notifications/actions.ts", "utf8");
const portal = readFileSync("src/app/dashboard/[slug]/portal/page.tsx", "utf8");
const workflow = readFileSync(".github/workflows/ci.yml", "utf8");

const checks = [
  ["SQL artifact remains explicitly a draft, not an executable migration",
    /^-- DRAFT ONLY — NOT A SUPABASE MIGRATION\./m.test(draft) &&
    /supabase migration new guardian_notification_fanout/.test(draft)],
  ["notification and preference constraints include appointment and report-card types",
    /'assignment_due','appointment','report_card'/.test(draft) &&
    /'assignment','appointment','report_card'/.test(draft)],
  ["preference RPC validates the supported categories and authenticated active membership",
    /p_notification_type not in \([\s\S]*'appointment','report_card'[\s\S]*\)/.test(draft) &&
    /auth\.uid\(\)/.test(draft) && /m\.status='active'/.test(draft)],
  ["conversation access is scoped to the authenticated active membership and two participants",
    /m\.user_id=\(select auth\.uid\(\)\)/.test(draft) &&
    /m\.status='active'/.test(draft) &&
    /count\(\*\)[\s\S]*\) <> 2/.test(draft)],
  ["tutor message access explicitly excludes student counterpart conversations",
    /A student-origin conversation is never visible in the tutor inbox/.test(draft) &&
    /r\.key='student'/.test(draft) &&
    /r\.key='guardian'/.test(draft)],
  ["message fanout excludes student senders and targets active guardians only",
    /if exists \([\s\S]*new\.sender_membership_id[\s\S]*r\.key='student'[\s\S]*return new;/.test(draft) &&
    /recipient\.status='active'/.test(draft) &&
    /r\.key='guardian'/.test(draft)],
  ["message fanout checks messaging authorization and guardian notification preferences",
    /private\.can_message_members\([\s\S]*new\.sender_membership_id,recipient\.id/.test(draft) &&
    /g\.receives_notifications/.test(draft) &&
    /np\.notification_type='message'/.test(draft)],
  ["message notifications contain no message body and are deduplicated per conversation",
    /'Tenés un nuevo mensaje en una conversación institucional\.'/ .test(draft) &&
    /'conversation',new\.conversation_id/.test(draft) &&
    /on conflict \([\s\S]*resource_id[\s\S]*do update set/.test(draft)],
  ["appointment fanout only runs on creation or status changes and omits private reason text",
    /after insert or update of status on public\.teacher_guardian_appointments/.test(draft) &&
    /old\.status is not distinct from new\.status/.test(draft) &&
    !/left\([^\n]*new\.reason/.test(draft)],
  ["appointment fanout validates the recipient and honors guardian preferences",
    /recipient\.status='active'/.test(draft) &&
    /np\.notification_type='appointment'/.test(draft) &&
    /g\.receives_notifications/.test(draft)],
  ["report-card fanout is restricted to guardian or both publication audiences",
    draft.includes("coalesce(new.publication_audience,'') not in ('guardian','both')") &&
    /sg\.can_view_report_cards=true/.test(draft)],
  ["report-card fanout requires an active guardian membership and enabled preferences",
    /gm\.status='active'/.test(draft) &&
    /r\.key='guardian'/.test(draft) &&
    /np\.notification_type='report_card'/.test(draft)],
  ["notification reads remain recipient-only and message access is revalidated",
    /m\.user_id=\(select auth\.uid\(\)\)/.test(draft) &&
    /m\.status='active'/.test(draft) &&
    /private\.has_current_conversation_access\([\s\S]*notifications\.resource_id/.test(draft)],
  ["notification center exposes the new preferences and server-side allowlist",
    /key: "appointment"/.test(inbox) && /key: "report_card"/.test(inbox) &&
    /"appointment", "report_card"/.test(actions)],
  ["notification center links appointments and report cards to their dedicated areas",
    /dashboard\/\$\{slug\}\/appointments/.test(inbox) &&
    /dashboard\/\$\{slug\}\/report-cards/.test(inbox)],
  ["guardian portal shows the personal notification inbox and unread count",
    /recipient_membership_id", membership\.id/.test(portal) &&
    /unreadNotifications/.test(portal) &&
    /dashboard\/\$\{slug\}\/notifications/.test(portal)],
  ["CI runs the guardian notification checks on the Tutor development branch",
    /feature\/tutor-module/.test(workflow) &&
    /check:guardian-notifications/.test(workflow)],
];

let failed = false;
for (const [label, passed] of checks) {
  process.stdout.write((passed ? "PASS " : "FAIL ") + label + "\n");
  if (!passed) failed = true;
}
if (failed) process.exit(1);
process.stdout.write("Validated " + checks.length + " guardian notification static checks. This is not SQL execution or PostgreSQL validation.\n");
