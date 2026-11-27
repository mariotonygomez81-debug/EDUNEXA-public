/**
 * Platform-level authorization is intentionally independent from institution memberships.
 * Only trusted server-side Supabase Auth administration may write app_metadata.platform_role.
 * Never read user_metadata for privilege decisions.
 */
export function isPlatformSuperAdmin(user: { app_metadata?: Record<string, unknown> } | null | undefined): boolean {
  return user?.app_metadata?.platform_role === "superadmin";
}
