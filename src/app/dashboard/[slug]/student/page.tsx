import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import StudentDashboardExperience from "./student-dashboard-experience";

type StudentSummary = {
  student_id: string;
  first_name: string;
  last_name: string;
  student_number: string | null;
  is_self: boolean;
  division_name: string | null;
  course_name: string | null;
  academic_year_name: string | null;
  enrollment_status: string;
  can_view_grades: boolean;
  published_report_card_count: number;
};

type Classroom = {
  id: string;
  title: string;
  description: string | null;
  course_name: string;
  division_name: string;
  subject_name: string | null;
};

export default async function StudentWorkspace({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: institution } = await supabase.from("institutions")
    .select("id,display_name").eq("slug", slug).maybeSingle();
  if (!institution) redirect("/dashboard");

  const { data: membership } = await supabase.from("memberships")
    .select("id").eq("institution_id", institution.id)
    .eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership) redirect("/dashboard");

  const [{ data: roleRows }, { data: profile }, { data: studentRows, error: studentError }, { data: classroomRows, error: classroomError }] = await Promise.all([
    supabase.from("membership_roles").select("roles(key)").eq("membership_id", membership.id),
    supabase.from("profiles").select("first_name,last_name,display_name,avatar_path,avatar_style").eq("id", user.id).maybeSingle(),
    supabase.rpc("list_my_portal_students", { p_institution_id: institution.id }),
    supabase.rpc("list_accessible_classrooms", { p_institution_id: institution.id }),
  ]);

  const roles = (roleRows ?? []).map((row) => row.roles?.key).filter(Boolean);
  if (!roles.includes("student")) redirect(`/dashboard/${slug}`);

  const students = (studentRows ?? []) as StudentSummary[];
  const student = students.find((item) => item.is_self) ?? students[0] ?? null;
  const classrooms = (classroomRows ?? []) as Classroom[];
  const fullName = student ? `${student.first_name} ${student.last_name}` : profile?.display_name ?? "Mi perfil";
  const firstName = student?.first_name ?? profile?.first_name ?? "Estudiante";
  const initials = fullName.split(/\\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "A";
  let avatarUrl: string | null = null;
  if (profile?.avatar_path) {
    const { data } = await supabase.storage.from("student-profile-photos").createSignedUrl(profile.avatar_path, 600);
    avatarUrl = data?.signedUrl ?? null;
  }

  return <StudentDashboardExperience
    slug={slug}
    institutionName={institution.display_name}
    hasLoadError={Boolean(studentError || classroomError)}
    classrooms={classrooms}
    student={{
      firstName: firstName.length > 18 ? firstName.slice(0, 18) : firstName,
      fullName,
      initials,
      courseName: student?.course_name ?? null,
      divisionName: student?.division_name ?? null,
      academicYearName: student?.academic_year_name ?? null,
      studentNumber: student?.student_number ?? null,
      enrollmentStatus: student?.enrollment_status ?? "pending",
      canViewGrades: student?.can_view_grades ?? false,
      publishedReportCardCount: student?.published_report_card_count ?? 0,
      avatarUrl,
      avatarStyle: profile?.avatar_style ?? "neutral",
    }}
  />;
}
