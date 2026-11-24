import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20261124033000_assignment_due_notifications.sql", "utf8");
const preferenceMigration = readFileSync("supabase/migrations/20261124033200_enable_assignment_due_preferences.sql", "utf8");
const notificationPage = readFileSync("src/app/dashboard/[slug]/notifications/page.tsx", "utf8");
const notificationActions = readFileSync("src/app/dashboard/[slug]/notifications/actions.ts", "utf8");
const studentPage = readFileSync("src/app/dashboard/[slug]/student/page.tsx", "utf8");
const studentExperience = readFileSync("src/app/dashboard/[slug]/student/student-dashboard-experience.tsx", "utf8");

const checks = [
  ["notification type and resource constraints accept assignment reminders", migration.includes("'assignment_due'") && migration.includes("'assignment'")],
  ["private reminder generator is SECURITY DEFINER with an empty search path", /FUNCTION private\.generate_assignment_due_notifications\(\)[\s\S]*SECURITY DEFINER[\s\S]*SET search_path = ''/.test(migration)],
  ["reminders are limited to published assignments due within 24 hours", /a\.published_at IS NOT NULL/.test(migration) && /a\.due_at > now\(\)/.test(migration) && /a\.due_at <= now\(\) \+ interval '24 hours'/.test(migration)],
  ["recipients must be active student classroom members with active enrollment", /cm\.member_role = 'student'/.test(migration) && /m\.status = 'active'/.test(migration) && /r\.key = 'student'/.test(migration) && /e\.status = 'active'/.test(migration)],
  ["already submitted assignments are excluded", /NOT EXISTS \([\s\S]*FROM public\.submissions s[\s\S]*s\.submitted_at IS NOT NULL/.test(migration)],
  ["student preferences are respected and default to enabled", /np\.notification_type = 'assignment_due'/.test(migration) && /), true\)/.test(migration)],
  ["unique notification key prevents duplicate reminders", /ON CONFLICT \([\s\S]*recipient_membership_id[\s\S]*resource_id[\s\S]*DO NOTHING/.test(migration)],
  ["database scheduler runs every 15 minutes", /'\*\/15 \* \* \* \*'/.test(migration) && /edunexa-assignment-due-notifications/.test(migration)],
  ["only the database scheduler can execute the generator", /REVOKE ALL ON FUNCTION private\.generate_assignment_due_notifications\(\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/.test(migration)],
  ["preference RPC accepts assignment_due", preferenceMigration.includes("'assignment_due'") && preferenceMigration.includes("SECURITY DEFINER")],
  ["notification center exposes task reminder preference and destination", notificationPage.includes("Tareas próximas a vencer") && notificationPage.includes('notification.resource_type === "assignment"') && notificationPage.includes("/student/tasks")],
  ["preference server action allowlists assignment_due", notificationActions.includes('"assignment_due"')],
  ["student home loads unread notifications", studentPage.includes('from("notifications")') && studentPage.includes('is("read_at", null)') && studentPage.includes("unreadNotificationCount={unreadNotificationCount ?? 0}")],
  ["student dashboard provides a notification bell and unread badge", studentExperience.includes("/notifications") && studentExperience.includes("unreadNotificationCount > 0")],
];

let failed = false;
for (const [label, passed] of checks) {
  process.stdout.write((passed ? "PASS" : "FAIL") + " " + label + "\n");
  if (!passed) failed = true;
}
if (failed) process.exit(1);
process.stdout.write("Validated " + checks.length + " assignment reminder security and UI checks.\n");
