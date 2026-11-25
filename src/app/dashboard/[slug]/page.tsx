import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";
import { signOut } from "../actions";
import { WorkspaceExperience } from "./workspace-experience";
import DelegatedSupportWorkspace from "@/components/admin/delegated-support-workspace";

const modules: { name: string; detail: string; icon: string; href: string; permissions: string[]; role: string; category: "Académico" | "Gestión" | "Comunidad" }[] = [
  { name: "Docentes", detail: "Enseñanza, aulas, actividades y evaluaciones", icon: "classroom", href: "teaching", permissions: ["classroom.read"], role: "teacher", category: "Académico" },
  { name: "Preceptor", detail: "Divisiones, seguimiento y asistencia", icon: "prefect", href: "prefect", permissions: ["students.read", "attendance.read"], role: "prefect", category: "Académico" },
  { name: "Alumnos", detail: "Trayectoria, aulas y actividades personales", icon: "students", href: "student", permissions: ["institution.read"], role: "student", category: "Académico" },
  { name: "Tutor", detail: "Seguimiento académico y comunicación familiar", icon: "portal", href: "portal", permissions: ["institution.read"], role: "guardian", category: "Comunidad" },
  { name: "Directivos", detail: "Indicadores y supervisión institucional", icon: "direction", href: "direction", permissions: ["reports.read", "students.read", "attendance.read", "grades.read"], role: "director", category: "Gestión" },
  { name: "Administrativos", detail: "Documentación, trámites y registros", icon: "administrative", href: "administrative", permissions: ["administrative_records.read"], role: "administrative", category: "Gestión" },
  { name: "Administrador", detail: "Usuarios, permisos y configuración del colegio", icon: "users", href: "admin-center", permissions: ["institution.manage"], role: "institution_admin", category: "Gestión" },
];

export default async function InstitutionWorkspace({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: institution } = await supabase.from("institutions")
    .select("id,display_name,slug").eq("slug", slug).eq("status", "active").maybeSingle();
  if (!institution) redirect("/dashboard");

  const { data: membership } = await supabase.from("memberships")
    .select("id,status").eq("institution_id", institution.id)
    .eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership) {
    // Delegation is resolved from fresh trusted Auth metadata in PostgreSQL.
    // The resulting support workspace is intentionally read-only and never borrows
    // an institutional membership or exposes student/guardian records.
    const platformRpc = supabase as unknown as {
      rpc: (name: string, args: Record<string, unknown>) => Promise<{
        data: unknown; error: { message: string } | null;
      }>;
    };
    const delegated = await platformRpc.rpc("platform_resolve_delegated_context", {
      p_institution_id: institution.id,
    });
    const delegatedContext = delegated.data && typeof delegated.data === "object"
      ? delegated.data as { delegation_id?: string; expires_at?: string; mode?: string }
      : null;
    if (!delegated.error && delegatedContext?.mode === "delegated_support_read_only"
      && delegatedContext.delegation_id && delegatedContext.expires_at) {
      return <DelegatedSupportWorkspace
        institutionName={institution.display_name}
        institutionSlug={slug}
        delegationId={delegatedContext.delegation_id}
        expiresAt={delegatedContext.expires_at}
      />;
    }
    redirect("/dashboard");
  }

  const { data: roleRows } = await supabase.from("membership_roles")
    .select("roles(key,name)").eq("membership_id", membership.id);
  const roleNames = (roleRows ?? []).map((row) => row.roles?.name).filter(Boolean) as string[];
  const roleKeys = (roleRows ?? []).map((row) => row.roles?.key).filter(Boolean) as string[];
  const permissions = await getMembershipPermissions(supabase, membership.id);
  const visibleModules = modules.filter((module) =>
    module.permissions.every((permission) => permissions.has(permission)) && roleKeys.includes(module.role)
  ).map((module) => ({
    name: module.name, detail: module.detail, icon: module.icon,
    href: `/dashboard/${slug}/${module.href}`, category: module.category,
    unread: undefined,
  }));

  const { count: unreadNotificationCount } = permissions.has("institution.read")
    ? await supabase.from("notifications").select("id", { count: "exact", head: true })
      .eq("institution_id", institution.id).eq("recipient_membership_id", membership.id).is("read_at", null)
    : { count: 0 };
  const modulesWithUnread = visibleModules.map((module) => ({ ...module, unread: module.href.endsWith("/notifications") ? unreadNotificationCount ?? 0 : undefined }));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
  const { data: assignmentRows } = await supabase.from("staff_assignments")
    .select("starts_on,ends_on").eq("institution_id", institution.id).eq("membership_id", membership.id);
  const currentAssignmentCount = (assignmentRows ?? []).filter((assignment) =>
    (!assignment.starts_on || assignment.starts_on <= today) && (!assignment.ends_on || assignment.ends_on >= today)
  ).length;

  const profileCard = await (async () => {
    const eligibleRoles = ["teacher", "institution_admin", "administrative", "director", "prefect", "student"];
    if (!roleKeys.some((role) => eligibleRoles.includes(role))) return null;
    const { data: personalProfile } = await supabase.from("profiles")
      .select("first_name,last_name,display_name,avatar_path,avatar_style")
      .eq("id", user.id).maybeSingle();
    let avatarUrl: string | null = null;
    if (personalProfile?.avatar_path) {
      const { data } = await supabase.storage.from("teacher-profile-photos").createSignedUrl(personalProfile.avatar_path, 600);
      avatarUrl = data?.signedUrl ?? null;
    }
    const name = [personalProfile?.first_name, personalProfile?.last_name].filter(Boolean).join(" ").trim()
      || personalProfile?.display_name || "Usuario";
    const roleLabel = roleKeys.includes("teacher") ? "Docente"
      : roleKeys.includes("prefect") ? "Preceptor"
      : roleKeys.includes("director") ? "Directivo"
      : roleKeys.includes("administrative") ? "Administrativo"
      : roleKeys.includes("institution_admin") ? "Administrador" : "Alumno";
    const profileHref = roleKeys.includes("teacher") ? "teaching/profile"
      : roleKeys.includes("student") ? "student/profile" : "profile";
    let subjects: string[] = [];
    if (roleKeys.includes("teacher")) {
      const { data: assignments } = await supabase.from("staff_assignments").select("course_subject_id")
        .eq("institution_id", institution.id).eq("membership_id", membership.id).eq("assignment_type", "teacher")
        .or(`starts_on.is.null,starts_on.lte.${today}`).or(`ends_on.is.null,ends_on.gte.${today}`);
      const subjectIds = [...new Set((assignments ?? []).map((item) => item.course_subject_id).filter((id): id is string => Boolean(id)))];
      if (subjectIds.length) {
        const { data: subjectRows } = await supabase.from("course_subjects").select("subject_id")
          .eq("institution_id", institution.id).in("id", subjectIds);
        const ids = [...new Set((subjectRows ?? []).map((item) => item.subject_id))];
        if (ids.length) {
          const { data: names } = await supabase.from("subjects").select("name").eq("institution_id", institution.id).in("id", ids).order("name");
          subjects = [...new Set((names ?? []).map((item) => item.name))];
        }
      }
    }
    return { name, avatarUrl, avatarStyle: personalProfile?.avatar_style ?? "neutral", subjects, roleLabel, profileHref };
  })();

  const quickLinks: { title: string; detail: string; href: string; icon: string; tone: string }[] = [];
  const addQuick = (title: string, detail: string, href: string, icon: string, tone: string) =>
    quickLinks.push({ title, detail, href: `/dashboard/${slug}/${href}`, icon, tone });
  if (roleKeys.some((role) => ["institution_admin","administrative","director","prefect"].includes(role))) {
    addQuick("Mi perfil", "Foto, nombre visible y datos de contacto", "profile", "profile", "quick-mint");
  }
  if (roleKeys.includes("student")) {
    addQuick("Mi perfil de alumno", "Fotografía, avatar y datos personales", "student/profile", "profile", "quick-mint");
  }
  if (permissions.has("institution.read")) {
    addQuick("Mis notificaciones", "Avisos y preferencias personales", "notifications", "notifications", "quick-orange");
  }
  if (roleKeys.includes("teacher")) {
    if (permissions.has("classroom.read")) addQuick("Aula virtual", "Clases, tareas y materiales", "classroom", "classroom", "quick-violet");
    addQuick("Mi perfil docente", "Foto, títulos y contacto", "teaching/profile", "profile", "quick-mint");
    addQuick("Mensajes a tutores", "Contactar a las familias", "messages", "messages", "quick-cyan");
    addQuick("Citaciones", "Solicitar y hacer seguimiento", "appointments", "appointments", "quick-orange");
    addQuick("Informes de asistencia", "Reportes por división", "attendance/reports", "reports", "quick-green");
    addQuick("Calificaciones", "Evaluaciones y notas finales", "grades", "grades", "quick-indigo");
  }
  if (roleKeys.some((role) => role === "director" || role === "institution_admin") &&
      permissions.has("reports.read") && permissions.has("students.read") &&
      permissions.has("attendance.read") && permissions.has("grades.read")) {
    addQuick("Panel de Dirección", "Indicadores y seguimiento institucional", "direction", "direction", "quick-violet");
  }
  if (roleKeys.includes("prefect")) {
    addQuick("Espacio de preceptoría", "Divisiones, nóminas y asistencia", "prefect", "prefect", "quick-blue");
    addQuick("Citaciones a tutores", "Convocar familias y seguir entrevistas", "appointments", "appointments", "quick-orange");
  }
  if (permissions.has("academic_calendar.manage")) addQuick("Programar eventos", "Crear jornadas, ferias, exámenes y reuniones", "calendar", "calendar", "quick-orange");
  if (roleKeys.includes("institution_admin")) addQuick("Centro de control", "Administración general y permisos", "admin-center", "users", "quick-indigo");
  if (roleKeys.some((role) => role === "administrative" || role === "director")) addQuick("Panel administrativo", "Comunicados, boletines y gestión institucional", "administrative-office", "administrative", "quick-cyan");
  if (currentAssignmentCount > 0) addQuick("Mis asignaciones", "Funciones, divisiones y materias", "teaching", "classroom", "quick-green");
  if (permissions.has("admin_documents.read")) addQuick("Documentación", "Archivos institucionales autorizados", "admin-documents", "administrative", "quick-cyan");
  if (permissions.has("memberships.manage")) addQuick("Usuarios y accesos", "Perfiles y permisos institucionales", "users", "users", "quick-indigo");
  if (permissions.has("institution.manage")) {
    addQuick("Calendario académico", "Ciclos y períodos lectivos", "settings/academic-calendar", "calendar", "quick-orange");
    addQuick("Estructura académica", "Niveles, cursos y asignaciones", "settings/academic-structure", "structure", "quick-violet");
    addQuick("Escalas de calificación", "Criterios numéricos y conceptuales", "settings/grading-scales", "scales", "quick-blue");
  }
  if (permissions.has("support.create")) addQuick("Ayuda y soporte", "Consultas y seguimiento de solicitudes", "support", "support", "quick-green");

  return <WorkspaceExperience
    institutionName={institution.display_name}
    institutionSlug={slug}
    roleNames={roleNames}
    profileCard={profileCard}
    modules={modulesWithUnread}
    quickLinks={quickLinks}
    unreadCount={unreadNotificationCount ?? 0}
    assignmentCount={currentAssignmentCount}
    signOutAction={signOut}
  />;
}
