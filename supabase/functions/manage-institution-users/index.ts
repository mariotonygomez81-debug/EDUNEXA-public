import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}")["default"] ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!serviceKey) throw new Error("Missing Supabase server secret.");

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const directorSubprofiles = new Set([
  "rector", "vicerrector", "secretaria", "director_proyectos",
  "director_deportes", "representante_legal", "pedagoga",
]);
const allowedRoles = new Set([
  "institution_admin", "director", "administrative", "teacher",
  "prefect", "student", "guardian",
]);
const appUrl = Deno.env.get("EDUNEXA_APP_URL") ?? "https://edunexa.example.edu";
const allowedOrigins = new Set([
  new URL(appUrl).origin,
  "http://localhost:3000",
]);

function response(data: unknown, status = 200, origin = "") {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
  if (allowedOrigins.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] = "authorization, x-client-info, apikey, content-type";
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
  }
  return new Response(JSON.stringify(data), { status, headers });
}
function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function clean(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
async function audit(institutionId: string, actorId: string, action: string, entityId: string, metadata: Record<string, unknown>) {
  const { error } = await admin.from("audit_logs").insert({
    institution_id: institutionId, actor_user_id: actorId,
    action, entity_type: "membership", entity_id: entityId, metadata,
  });
  if (error) throw error;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") return response({ ok: true }, 200, origin);
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405, origin);

  try {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return response({ error: "Authentication required." }, 401, origin);
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const actor = authData.user;
    if (authError || !actor || actor.is_anonymous) return response({ error: "Invalid session." }, 401, origin);

    const body = await req.json();
    const action = clean(body.action, 40);
    const slug = clean(body.slug, 80);
    if (!slug) return response({ error: "Institution is required." }, 400, origin);

    const { data: institution, error: institutionError } = await admin
      .from("institutions").select("id,display_name,status").eq("slug", slug).single();
    if (institutionError || !institution || institution.status !== "active") {
      return response({ error: "Institution not found or inactive." }, 404, origin);
    }

    if (["list_guardians", "link_guardian", "unlink_guardian"].includes(action)) {
      const { data: actorMembership, error: actorMembershipError } = await admin
        .from("memberships").select("id").eq("institution_id", institution.id)
        .eq("user_id", actor.id).eq("status", "active").maybeSingle();
      if (actorMembershipError || !actorMembership) {
        return response({ error: "Institution access denied." }, 403, origin);
      }
      const { data: actorRoles, error: actorRolesError } = await admin
        .from("membership_roles").select("role_id").eq("membership_id", actorMembership.id);
      if (actorRolesError) throw actorRolesError;
      const actorRoleIds = (actorRoles ?? []).map((r) => r.role_id);
      const { data: grants, error: grantsError } = await admin
        .from("role_permissions").select("permissions!inner(key)").in("role_id", actorRoleIds);
      if (grantsError) throw grantsError;
      const canManageStudents = (grants ?? []).some((g) => firstRelation(g.permissions)?.key === "students.manage");
      if (!canManageStudents) return response({ error: "You cannot manage student records." }, 403, origin);

      if (action === "list_guardians") {
        const { data: guardianRows, error: guardianError } = await admin.from("guardians")
          .select("id,membership_id,relationship_label,receives_notifications")
          .eq("institution_id", institution.id);
        if (guardianError) throw guardianError;
        const membershipIds = (guardianRows ?? []).map((g) => g.membership_id);
        const { data: memberships, error: membershipError } = membershipIds.length
          ? await admin.from("memberships").select("id,user_id,status").in("id", membershipIds).eq("institution_id", institution.id)
          : { data: [], error: null };
        if (membershipError) throw membershipError;
        const activeMemberships = (memberships ?? []).filter((m) => m.status === "active");
        const userIds = activeMemberships.map((m) => m.user_id);
        const { data: profiles, error: profileError } = userIds.length
          ? await admin.from("profiles").select("id,first_name,last_name,display_name").in("id", userIds)
          : { data: [], error: null };
        if (profileError) throw profileError;
        const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
        const membershipMap = new Map(activeMemberships.map((m) => [m.id, m]));
        const emailMap = new Map<string, string>();
        for (let page = 1; page <= 10; page++) {
          const { data, error: usersError } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
          if (usersError) throw usersError;
          for (const u of data.users) if (userIds.includes(u.id)) emailMap.set(u.id, u.email ?? "");
          if (data.users.length < 1000) break;
        }
        const guardians = (guardianRows ?? []).flatMap((g) => {
          const member = membershipMap.get(g.membership_id);
          if (!member) return [];
          const profile = profileMap.get(member.user_id);
          return [{
            id: g.id,
            membership_id: g.membership_id,
            display_name: profile?.display_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Tutor",
            email: emailMap.get(member.user_id) ?? "",
            relationship_label: g.relationship_label ?? "Familiar",
            receives_notifications: g.receives_notifications,
          }];
        });
        return response({ guardians }, 200, origin);
      }

      const studentId = clean(body.student_id, 80);
      const guardianId = clean(body.guardian_id, 80);
      if (!/^[0-9a-f-]{36}$/i.test(studentId) || !/^[0-9a-f-]{36}$/i.test(guardianId)) {
        return response({ error: "Student and guardian are required." }, 400, origin);
      }
      const { data: student, error: studentError } = await admin.from("students")
        .select("id").eq("id", studentId).eq("institution_id", institution.id).maybeSingle();
      if (studentError || !student) return response({ error: "Student not found." }, 404, origin);
      const { data: guardian, error: guardianError } = await admin.from("guardians")
        .select("id,membership_id").eq("id", guardianId).eq("institution_id", institution.id).maybeSingle();
      if (guardianError || !guardian) return response({ error: "Guardian not found in this institution." }, 404, origin);
      const { data: guardianMembership, error: guardianMembershipError } = await admin.from("memberships")
        .select("id,status").eq("id", guardian.membership_id).eq("institution_id", institution.id).maybeSingle();
      if (guardianMembershipError || !guardianMembership || guardianMembership.status !== "active") {
        return response({ error: "The guardian account is not active." }, 409, origin);
      }
      const { data: guardianRoleRows, error: guardianRoleError } = await admin.from("membership_roles")
        .select("roles!inner(key)").eq("membership_id", guardian.membership_id);
      if (guardianRoleError) throw guardianRoleError;
      if (!(guardianRoleRows ?? []).some((row) => firstRelation(row.roles)?.key === "guardian")) {
        return response({ error: "The selected account does not have the guardian profile." }, 409, origin);
      }

      if (action === "link_guardian") {
        const { error } = await admin.from("student_guardians").upsert({
          institution_id: institution.id,
          student_id: student.id,
          guardian_id: guardian.id,
          is_primary: false,
          can_view_grades: body.can_view_grades === true,
          can_view_attendance: body.can_view_attendance === true,
          can_authorize: false,
        }, { onConflict: "student_id,guardian_id" });
        if (error) throw error;
        await audit(institution.id, actor.id, "student.guardian_linked", student.id, {
          guardian_id: guardian.id,
          can_view_grades: body.can_view_grades === true,
          can_view_attendance: body.can_view_attendance === true,
        });
        return response({ ok: true }, 200, origin);
      }

      const { error } = await admin.from("student_guardians").delete()
        .eq("institution_id", institution.id).eq("student_id", student.id).eq("guardian_id", guardian.id);
      if (error) throw error;
      await audit(institution.id, actor.id, "student.guardian_unlinked", student.id, {
        guardian_id: guardian.id,
      });
      return response({ ok: true }, 200, origin);
    }

    if (action === "activate_self") {
      const { data: pending, error: pendingError } = await admin.from("memberships")
        .select("id").eq("institution_id", institution.id)
        .eq("user_id", actor.id).eq("status", "invited");
      if (pendingError) throw pendingError;
      if (pending?.length) {
        const { error } = await admin.from("memberships").update({
          status: "active", joined_at: new Date().toISOString(),
        }).in("id", pending.map((m) => m.id)).eq("institution_id", institution.id);
        if (error) throw error;
        await audit(institution.id, actor.id, "membership.invitation_accepted", pending[0].id, {
          activated_memberships: pending.length,
        });
      }
      return response({ activated: pending?.length ?? 0 }, 200, origin);
    }

    const { data: actorMembership, error: actorMembershipError } = await admin
      .from("memberships").select("id").eq("institution_id", institution.id)
      .eq("user_id", actor.id).eq("status", "active").maybeSingle();
    if (actorMembershipError || !actorMembership) return response({ error: "Institution access denied." }, 403, origin);

    const { data: actorRoles, error: actorRolesError } = await admin
      .from("membership_roles").select("role_id").eq("membership_id", actorMembership.id);
    if (actorRolesError) throw actorRolesError;
    const actorRoleIds = (actorRoles ?? []).map((r) => r.role_id);
    const { data: grants, error: grantsError } = await admin
      .from("role_permissions").select("permissions!inner(key)")
      .in("role_id", actorRoleIds);
    if (grantsError) throw grantsError;
    const canManage = (grants ?? []).some((g) => firstRelation(g.permissions)?.key === "memberships.manage");
    if (!canManage) return response({ error: "You cannot manage institutional accounts." }, 403, origin);

    const { data: roleRows, error: roleError } = await admin.from("roles")
      .select("id,key,name").in("key", [...allowedRoles]);
    if (roleError) throw roleError;
    const roles = new Map((roleRows ?? []).map((r) => [r.key, r]));

    if (action === "list") {
      const { data: memberships, error } = await admin.from("memberships")
        .select("id,user_id,status,joined_at,director_subprofile,membership_roles(role_id,roles(key,name))")
        .eq("institution_id", institution.id).order("created_at", { ascending: false });
      if (error) throw error;
      const ids = (memberships ?? []).map((m) => m.user_id);
      const { data: profileRows, error: profileError } = ids.length
        ? await admin.from("profiles").select("id,first_name,last_name,display_name").in("id", ids)
        : { data: [], error: null };
      if (profileError) throw profileError;
      const profileMap = new Map((profileRows ?? []).map((p) => [p.id, p]));
      const usersById = new Map<string, { email?: string }>();
      for (let page = 1; page <= 10; page++) {
        const { data, error: usersError } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (usersError) throw usersError;
        for (const u of data.users) usersById.set(u.id, { email: u.email });
        if (data.users.length < 1000) break;
      }
      return response({
        institution: institution.display_name,
        users: (memberships ?? []).map((m) => {
          const p = profileMap.get(m.user_id);
          const userRoles = (m.membership_roles ?? []).map((mr) => firstRelation(mr.roles)).filter((role): role is NonNullable<typeof role> => Boolean(role));
          return {
            membership_id: m.id, user_id: m.user_id, status: m.status,
            joined_at: m.joined_at, director_subprofile: m.director_subprofile, email: usersById.get(m.user_id)?.email ?? "",
            display_name: p?.display_name || [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "Usuario",
            role_key: userRoles[0]?.key ?? "", role_name: userRoles[0]?.name ?? "Sin perfil",
            role_keys: userRoles.map((role) => role.key),
            role_names: userRoles.map((role) => role.name),
          };
        }),
        roles: [...roles.values()].map((r) => ({ key: r.key, name: r.name })),
      }, 200, origin);
    }

    if (action === "invite") {
      const email = clean(body.email, 254).toLowerCase();
      const firstName = clean(body.first_name, 80);
      const lastName = clean(body.last_name, 80);
      const requestedRoleKeys = Array.isArray(body.role_keys)
        ? body.role_keys.map((key: unknown) => clean(key, 40))
        : [clean(body.role_key, 40)];
      const roleKeys: string[] = [...new Set<string>(requestedRoleKeys)];
      const directorSubprofile = clean(body.director_subprofile, 40);
      if (roleKeys.includes("director") && !directorSubprofiles.has(directorSubprofile)) {
        return response({ error: "Select a Directivos subprofile." }, 400, origin);
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
          firstName.length < 2 || lastName.length < 2 || !roleKeys.length ||
          roleKeys.some((key) => !allowedRoles.has(key) || !roles.has(key))) {
        return response({ error: "Check the email, name and selected profiles." }, 400, origin);
      }
      const { count: recentInvites, error: rateError } = await admin.from("audit_logs")
        .select("id", { count: "exact", head: true })
        .eq("institution_id", institution.id)
        .eq("actor_user_id", actor.id)
        .eq("action", "membership.invited")
        .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());
      if (rateError) throw rateError;
      if ((recentInvites ?? 0) >= 20) {
        return response({ error: "You have reached the hourly invitation limit. Try again later." }, 429, origin);
      }
      const { data: allUsers, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (usersError) throw usersError;
      if (allUsers.users.some((u) => u.email?.toLowerCase() === email)) {
        return response({ error: "An account with this email already exists. Ask the user to contact the institution administrator." }, 409, origin);
      }
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { first_name: firstName, last_name: lastName, display_name: firstName + " " + lastName },
        redirectTo: appUrl.replace(/\/$/, "") + "/auth/confirm?next=/reset-password&institution=" + encodeURIComponent(slug),
      });
      if (error || !data.user) return response({ error: error?.message ?? "Invitation could not be created." }, 502, origin);

      const { data: membership, error: membershipError } = await admin.from("memberships").insert({
        institution_id: institution.id, user_id: data.user.id, status: "invited",
        director_subprofile: roleKeys.includes("director") ? directorSubprofile : null,
      }).select("id").single();
      if (membershipError || !membership) {
        await admin.auth.admin.deleteUser(data.user.id);
        throw membershipError ?? new Error("Membership could not be created.");
      }
      const selectedRoles = roleKeys.map((key) => roles.get(key)!).filter(Boolean);
      const { error: assignError } = await admin.from("membership_roles").insert(
        selectedRoles.map((role) => ({
          membership_id: membership.id, institution_id: institution.id, role_id: role.id,
        })),
      );
      if (assignError) {
        await admin.from("memberships").delete().eq("id", membership.id).eq("institution_id", institution.id);
        await admin.auth.admin.deleteUser(data.user.id);
        throw assignError;
      }
      if (roleKeys.includes("guardian")) {
        const { error: guardianCreateError } = await admin.from("guardians").insert({
          institution_id: institution.id,
          membership_id: membership.id,
          receives_notifications: true,
        });
        if (guardianCreateError) {
          await admin.from("membership_roles").delete().eq("membership_id", membership.id).eq("institution_id", institution.id);
          await admin.from("memberships").delete().eq("id", membership.id).eq("institution_id", institution.id);
          await admin.auth.admin.deleteUser(data.user.id);
          throw guardianCreateError;
        }
      }
      await audit(institution.id, actor.id, "membership.invited", membership.id, {
        email, roles: roleKeys,
      });
      return response({ ok: true, message: "Invitation sent. The account will be enabled after the recipient confirms the email and sets a password." }, 201, origin);
    }

    const membershipId = clean(body.membership_id, 80);
    if (!membershipId) return response({ error: "Membership is required." }, 400, origin);
    const { data: target, error: targetError } = await admin.from("memberships")
      .select("id,user_id,status,membership_roles(role_id,roles(key))")
      .eq("id", membershipId).eq("institution_id", institution.id).maybeSingle();
    if (targetError || !target) return response({ error: "Account not found in this institution." }, 404, origin);
    if (target.user_id === actor.id) return response({ error: "You cannot change your own access from this screen." }, 409, origin);

    const currentRoleKeys = (target.membership_roles ?? [])
      .map((item) => firstRelation(item.roles)?.key)
      .filter((key): key is string => Boolean(key));
    if (currentRoleKeys.includes("institution_admin") && ["update_role", "update_roles"].includes(action)) {
      const requestedRoleKeys = action === "update_roles" && Array.isArray(body.role_keys)
        ? [...new Set(body.role_keys.map((key: unknown) => clean(key, 40)))]
        : [clean(body.role_key, 40)];
      if (!requestedRoleKeys.includes("institution_admin")) {
      const { data: adminRole, error: adminRoleError } = await admin.from("roles")
        .select("id").eq("key", "institution_admin").single();
      if (adminRoleError) throw adminRoleError;
      if (!adminRole) return response({ error: "Institution administrator role is not configured." }, 500, origin);
      const { data: admins, error: adminsError } = await admin.from("membership_roles")
        .select("membership_id").eq("institution_id", institution.id).eq("role_id", adminRole.id);
      if (adminsError) throw adminsError;
      const { data: activeMemberships, error: activeError } = await admin.from("memberships")
        .select("id").eq("institution_id", institution.id).eq("status", "active");
      if (activeError) throw activeError;
      const activeIds = new Set((activeMemberships ?? []).map((m) => m.id));
      const remaining = (admins ?? []).filter((a) => a.membership_id !== membershipId && activeIds.has(a.membership_id));
      if (!remaining.length) return response({ error: "The institution must keep at least one active administrator." }, 409, origin);
      }
    }

    if (["update_role", "update_roles"].includes(action)) {
      const requestedRoleKeys = action === "update_roles" && Array.isArray(body.role_keys)
        ? body.role_keys.map((key: unknown) => clean(key, 40))
        : [clean(body.role_key, 40)];
      const nextRoleKeys: string[] = [...new Set<string>(requestedRoleKeys)];
      const directorSubprofile = clean(body.director_subprofile, 40);
      if (nextRoleKeys.includes("director") && !directorSubprofiles.has(directorSubprofile)) {
        return response({ error: "Select a Directivos subprofile." }, 400, origin);
      }
      if (!nextRoleKeys.length || nextRoleKeys.some((key) => !allowedRoles.has(key) || !roles.has(key))) {
        return response({ error: "Select at least one valid profile." }, 400, origin);
      }
      const nextRoles = nextRoleKeys.map((key) => roles.get(key)!);
      const { error: removeError } = await admin.from("membership_roles").delete()
        .eq("membership_id", membershipId).eq("institution_id", institution.id);
      if (removeError) throw removeError;
      const { error: insertError } = await admin.from("membership_roles").insert(
        nextRoles.map((role) => ({
          membership_id: membershipId, institution_id: institution.id, role_id: role.id,
        })),
      );
      if (insertError) {
        const previousRoles = currentRoleKeys.map((key) => roles.get(key)).filter((role) => Boolean(role));
        if (previousRoles.length) {
          await admin.from("membership_roles").insert(
            previousRoles.map((role) => ({
              membership_id: membershipId, institution_id: institution.id, role_id: role!.id,
            })),
          );
        }
        throw insertError;
      }
      const { error: subprofileError } = await admin.from("memberships").update({
        director_subprofile: nextRoleKeys.includes("director") ? directorSubprofile : null,
      }).eq("id", membershipId).eq("institution_id", institution.id);
      if (subprofileError) throw subprofileError;
      const { error: subprofileError } = await admin.from("memberships").update({
        director_subprofile: nextRoleKeys.includes("director") ? directorSubprofile : null,
      }).eq("id", membershipId).eq("institution_id", institution.id);
      if (subprofileError) throw subprofileError;
      await audit(institution.id, actor.id, "membership.roles_changed", membershipId, {
        from: currentRoleKeys, to: nextRoleKeys,
      });
      return response({ ok: true }, 200, origin);
    }

    if (action === "set_status") {
      const status = clean(body.status, 20);
      if (!["active", "suspended"].includes(status)) return response({ error: "Invalid account status." }, 400, origin);
      if (target.status === "active" && status === "suspended" && currentRoleKeys.includes("institution_admin")) {
        const { data: adminRole } = await admin.from("roles").select("id").eq("key", "institution_admin").single();
        if (!adminRole) return response({ error: "Institution administrator role is not configured." }, 500, origin);
        const { data: otherAdmins, error } = await admin.from("membership_roles")
          .select("membership_id").eq("institution_id", institution.id).eq("role_id", adminRole.id);
        if (error) throw error;
        const { data: activeMemberships, error: activeError } = await admin.from("memberships")
          .select("id").eq("institution_id", institution.id).eq("status", "active");
        if (activeError) throw activeError;
        const activeIds = new Set((activeMemberships ?? []).map((m) => m.id));
        const remaining = (otherAdmins ?? []).filter((a) => a.membership_id !== membershipId && activeIds.has(a.membership_id));
        if (!remaining.length) return response({ error: "The institution must keep at least one active administrator." }, 409, origin);
      }
      const { error } = await admin.from("memberships").update({ status }).eq("id", membershipId).eq("institution_id", institution.id);
      if (error) throw error;
      await audit(institution.id, actor.id, status === "suspended" ? "membership.suspended" : "membership.reactivated", membershipId, {
        previous_status: target.status, status,
      });
      return response({ ok: true }, 200, origin);
    }
    return response({ error: "Unsupported action." }, 400, origin);
  } catch (error) {
    console.error("manage-institution-users:", error);
    return response({ error: "The operation could not be completed. Check the institution configuration and try again." }, 500, origin);
  }
});
