import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Returns the permission keys granted to an active institution membership.
 * The database remains the authority: RLS must still protect every read/write.
 */
export async function getMembershipPermissions(
  supabase: SupabaseServerClient,
  membershipId: string,
): Promise<Set<string>> {
  const { data: roleRows, error: rolesError } = await supabase
    .from("membership_roles")
    .select("role_id")
    .eq("membership_id", membershipId);

  if (rolesError || !roleRows?.length) return new Set();

  const roleIds = [...new Set(roleRows.map((row) => row.role_id))];
  const { data: permissionRows, error: permissionsError } = await supabase
    .from("role_permissions")
    .select("permissions(key)")
    .in("role_id", roleIds);

  if (permissionsError || !permissionRows) return new Set();

  return new Set(
    permissionRows
      .map((row) => row.permissions?.key)
      .filter((key): key is string => Boolean(key)),
  );
}
