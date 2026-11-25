import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const bootstrapSecret = Deno.env.get("PIE_TEST_BOOTSTRAP_SECRET");

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const profiles = [
  { email: "pie-test-admin@example.com", first: "Alex", last: "Administrador", role: "institution_admin" },
  { email: "pie-test-director@example.com", first: "Dana", last: "Directiva", role: "director" },
  { email: "pie-test-administracion@example.com", first: "Ariel", last: "Administrativo", role: "administrative" },
  { email: "pie-test-secretaria@example.com", first: "Sara", last: "Secretaría", role: "director", subprofile: "secretaria" },
  { email: "pie-test-docente@example.com", first: "Tania", last: "Docente", role: "teacher" },
  { email: "pie-test-preceptor@example.com", first: "Pablo", last: "Preceptor", role: "prefect" },
  { email: "pie-test-alumno@example.com", first: "Luca", last: "Estudiante", role: "student" },
  { email: "pie-test-tutor@example.com", first: "Gala", last: "Tutora", role: "guardian" },
];

function newPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(30));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!bootstrapSecret) return Response.json({ error: "Configure PIE_TEST_BOOTSTRAP_SECRET in Supabase Edge Function secrets first." }, { status: 503 });
  if (!safeEqual(req.headers.get("x-pie-bootstrap-secret") ?? "", bootstrapSecret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: institution, error: institutionError } = await admin
    .from("institutions").select("id,display_name").eq("slug", "colegio-demo").single();
  if (institutionError || !institution) return Response.json({ error: "Demo institution not found." }, { status: 500 });

  const { data: roleRows, error: roleError } = await admin.from("roles").select("id,key");
  if (roleError) return Response.json({ error: roleError.message }, { status: 500 });
  const roleIds = new Map((roleRows ?? []).map((r) => [r.key, r.id]));
  for (const p of profiles) if (!roleIds.has(p.role)) {
    return Response.json({ error: `Missing role: ${p.role}` }, { status: 500 });
  }

  const { data: student, error: studentError } = await admin
    .from("students").select("id,student_number").eq("institution_id", institution.id)
    .eq("student_number", "DEMO-001").single();
  if (studentError || !student) return Response.json({ error: "Demo student DEMO-001 not found." }, { status: 500 });

  const { data: enrollment, error: enrollmentError } = await admin
    .from("enrollments").select("division_id").eq("institution_id", institution.id)
    .eq("student_id", student.id).eq("status", "active").limit(1).maybeSingle();
  if (enrollmentError || !enrollment) return Response.json({ error: "Demo student has no active enrollment." }, { status: 500 });

  const { data: courseSubject } = await admin.from("course_subjects")
    .select("id").eq("institution_id", institution.id).limit(1).maybeSingle();

  const { data: existingUsers, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) return Response.json({ error: listError.message }, { status: 500 });
  const byEmail = new Map((existingUsers.users ?? []).map((u) => [u.email?.toLowerCase(), u]));
  const results: Array<Record<string, unknown>> = [];

  for (const p of profiles) {
    let user = byEmail.get(p.email);
    const password = newPassword();
    let created = false;
    if (!user) {
      const { data, error } = await admin.auth.admin.createUser({
        email: p.email, password, email_confirm: true,
        user_metadata: {
          first_name: p.first, last_name: p.last,
          display_name: `${p.first} ${p.last}`,
        },
        app_metadata: { test_account: true, test_profile: p.role },
      });
      if (error || !data.user) {
        return Response.json({ error: `Could not create ${p.email}: ${error?.message ?? "unknown error"}`, partial: results }, { status: 500 });
      }
      user = data.user;
      created = true;
    } else {
      if (user.app_metadata?.test_account !== true || user.app_metadata?.test_profile !== p.role) {
        return Response.json({ error: `Email collision: ${p.email} already belongs to a non-matching account. No password was changed.`, partial: results }, { status: 409 });
      }
      const { data, error } = await admin.auth.admin.updateUserById(user.id, {
        password,
        user_metadata: {
          ...user.user_metadata,
          first_name: p.first, last_name: p.last,
          display_name: `${p.first} ${p.last}`,
        },
        app_metadata: { ...user.app_metadata, test_account: true, test_profile: p.role },
      });
      if (error || !data.user) {
        return Response.json({ error: `Could not rotate temporary password for ${p.email}: ${error?.message ?? "unknown error"}`, partial: results }, { status: 500 });
      }
      user = data.user;
    }

    const { data: membership, error: membershipError } = await admin
      .from("memberships").upsert({
        institution_id: institution.id, user_id: user.id,
        status: "active", joined_at: new Date().toISOString(),
        director_subprofile: p.subprofile ?? null,
      }, { onConflict: "institution_id,user_id" }).select("id").single();
    if (membershipError || !membership) {
      return Response.json({ error: `Membership failed for ${p.email}: ${membershipError?.message}`, partial: results }, { status: 500 });
    }

    const { error: membershipRoleError } = await admin.from("membership_roles").upsert({
      membership_id: membership.id, institution_id: institution.id, role_id: roleIds.get(p.role),
    }, { onConflict: "membership_id,role_id" });
    if (membershipRoleError) {
      return Response.json({ error: `Role failed for ${p.email}: ${membershipRoleError.message}`, partial: results }, { status: 500 });
    }

    results.push({
      profile: p.role, email: p.email, user_id: user.id,
      membership_id: membership.id, created, password, passwordIssued: true,
    });
  }

  const account = (role: string) => results.find((r) => r.profile === role)!;
  const { data: studentMembership } = await admin.from("memberships").select("id")
    .eq("institution_id", institution.id).eq("user_id", account("student").user_id).single();
  const { data: guardianMembership } = await admin.from("memberships").select("id")
    .eq("institution_id", institution.id).eq("user_id", account("guardian").user_id).single();

  const { error: studentLinkError } = await admin.from("student_memberships").upsert({
    institution_id: institution.id, student_id: student.id, membership_id: studentMembership!.id,
  }, { onConflict: "institution_id,student_id" });
  if (studentLinkError) return Response.json({ error: studentLinkError.message, partial: results }, { status: 500 });

  const { data: guardian, error: guardianError } = await admin.from("guardians").upsert({
    institution_id: institution.id, membership_id: guardianMembership!.id,
    relationship_label: "Tutor de prueba", receives_notifications: false,
  }, { onConflict: "institution_id,membership_id" }).select("id").single();
  if (guardianError || !guardian) {
    return Response.json({ error: guardianError?.message ?? "Could not create demo guardian.", partial: results }, { status: 500 });
  }

  const { error: guardianLinkError } = await admin.from("student_guardians").upsert({
    institution_id: institution.id, student_id: student.id, guardian_id: guardian.id,
    is_primary: true, can_view_grades: true, can_view_attendance: true, can_authorize: false,
  }, { onConflict: "student_id,guardian_id" });
  if (guardianLinkError) return Response.json({ error: guardianLinkError.message, partial: results }, { status: 500 });

  const staff = [
    { role: "teacher", type: "teacher", courseSubjectId: courseSubject?.id ?? null },
    { role: "prefect", type: "prefect", courseSubjectId: null },
    { role: "director", type: "director", courseSubjectId: null },
    { role: "administrative", type: "administrative", courseSubjectId: null },
  ];
  for (const item of staff) {
    const memberId = account(item.role).membership_id as string;
    const { data: existing } = await admin.from("staff_assignments").select("id")
      .eq("institution_id", institution.id).eq("membership_id", memberId)
      .eq("assignment_type", item.type).eq("division_id", enrollment.division_id)
      .limit(1).maybeSingle();
    if (!existing) {
      const { error } = await admin.from("staff_assignments").insert({
        institution_id: institution.id, membership_id: memberId,
        assignment_type: item.type, division_id: enrollment.division_id,
        course_subject_id: item.courseSubjectId,
        starts_on: new Date().toISOString().slice(0, 10),
      });
      if (error) return Response.json({ error: `Staff assignment failed: ${error.message}`, partial: results }, { status: 500 });
    }
  }

  return Response.json({
    institution: institution.display_name,
    note: "Eight test accounts provisioned. Passwords are returned for all eight test accounts. Existing matching test accounts have their temporary passwords rotated on every run. Save them securely and change them after first login.",
    accounts: results,
    linkedDemoStudent: student.student_number,
    divisionId: enrollment.division_id,
  });
});
