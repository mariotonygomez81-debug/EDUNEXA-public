import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";
import { signOut } from "../actions";
import { WorkspaceExperience } from "./workspace-experience";

const modules: { name: string; detail: string; icon: string; href: string; permission: string; roles?: string[]; category: "Académico" | "Gestión" | "Comunidad" }[] = [
  { name: "Alumnos", detail: "Legajos y trayectorias", icon: "students", href: "students", permission: "students.read", category: "Académico" as const },
  { name: "Gestión administrativa", detail: "Documentación, trámites y registros internos", icon: "administrative", href: "administrative", permission: "administrative_records.read", roles: ["institution_admin", "administrative"], category: "Gestión" as const },
  { name: "Asistencia", detail: "Presentismo y justificaciones", icon: "attendance", href: "attendance", permission: "attendance.read", roles: ["institution_admin", "administrative", "director", "teacher", "prefect"], category: "Académico" as const },
  { name: "Calificaciones", detail: "Evaluaciones, notas y boletines", icon: "grades", href: "grades", permission: "grades.read", roles: ["institution_admin", "administrative", "director", "teacher"], category: "Académico" as const },
  { name: "Boletines", detail: "Revisión, aprobación y publicación", icon: "report", href: "report-cards", permission: "grades.read", category: "Académico" as const },
  { name: "Aula virtual", detail: "Clases, tareas y materiales", icon: "classroom", href: "classroom", permission: "classroom.read", category: "Académico" as const },
  { name: "Comunicaciones", detail: "Anuncios para la comunidad educativa", icon: "announcements", href: "announcements", permission: "institution.read", category: "Comunidad" as const },
  { name: "Mensajes", detail: "Conversaciones privadas por perfil", icon: "messages", href: "messages", permission: "institution.read", category: "Comunidad" as const },
  { name: "Notificaciones", detail: "Avisos y preferencias personales", icon: "notifications", href: "notifications", permission: "institution.read", category: "Comunidad" as const },
  { name: "Citaciones", detail: "Solicitudes y respuestas entre docentes y tutores", icon: "appointments", href: "appointments", permission: "institution.read", roles: ["teacher", "guardian"], category: "Comunidad" as const },
  { name: "Preceptoría", detail: "Divisiones asignadas, nóminas y seguimiento", icon: "prefect", href: "prefect", permission: "attendance.read", roles: ["prefect"], category: "Académico" as const },
  { name: "Usuarios y accesos", detail: "Perfiles y permisos institucionales", icon: "users", href: "users", permission: "memberships.manage", category: "Gestión" as const },
  { name: "Centro de administración", detail: "Control operativo y configuración general del colegio", icon: "users", href: "admin", permission: "institution.manage", roles: ["institution_admin"], category: "Gestión" as const },
  { name: "Calendario académico", detail: "Ciclos lectivos y períodos de evaluación", icon: "calendar", href: "settings/academic-calendar", permission: "institution.manage", roles: ["institution_admin"], category: "Gestión" as const },
  { name: "Ayuda y soporte", detail: "Consultas y seguimiento de solicitudes", icon: "support", href: "support", permission: "support.create", category: "Comunidad" as const },
  { name: "Mi portal", detail: "Seguimiento académico personal y familiar", icon: "portal", href: "portal", permission: "institution.read", roles: ["student", "guardian"], category: "Comunidad" as const },
];

export default async function InstitutionWorkspace({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: institution } = await supabase.from("institutions")
    .select("id,display_name,slug").eq("slug", slug).maybeSingle();
  if (!institution) redirect("/dashboard");

  const { data: membership } = await supabase.from("memberships")
    .select("id,status").eq("institution_id", institution.id)
    .eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership) redirect("/dashboard");

  const { data: roleRows } = await supabase.from("membership_roles")
    .select("roles(key,name)").eq("membership_id", membership.id);
  const roleNames = (roleRows ?? []).map((row) => row.roles?.name).filter(Boolean) as string[];
  const roleKeys = (roleRows ?? []).map((row) => row.roles?.key).filter(Boolean) as string[];
  const permissions = await getMembershipPermissions(supabase, membership.id);
  const visibleModules = modules.filter((module) =>
    permissions.has(module.permission) && (module.roles?.some((role) => roleKeys.includes(role)) ?? true)
  ).map((module) => ({
    name: module.href === "students" && roleKeys.includes("secretary") ? "Secretaría" :
      module.href === "students" && roleKeys.includes("administrative") ? "Gestión administrativa" : module.name,
    detail: module.href === "students" && roleKeys.includes("secretary") ? "Inscripciones, matrículas y legajos académicos" :
      module.href === "students" && roleKeys.includes("administrative") ? "Consulta de registros y datos autorizados" : module.detail,
    icon: module.icon, href: `/dashboard/${slug}/${module.href}`, category: module.category,
    unread: undefined,
  }));

  const { count: unreadNotificationCount } = permissions.has("institution.read")
    ? await supabase.from("notifications").select("id", { count: "exact", head: true })
      .eq("institution_id", institution.id)
      .eq("recipient_membership_id", membership.id).is("read_at", null)
    : { count: 0 };
  const modulesWithUnread = visibleModules.map((module) => ({ ...module, unread: module.href.endsWith("/notifications") ? unreadNotificationCount ?? 0 : undefined }));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
  const { data: assignmentRows } = await supabase.from("staff_assignments")
    .select("starts_on,ends_on").eq("institution_id", institution.id).eq("membership_id", membership.id);
  const currentAssignmentCount = (assignmentRows ?? []).filter((assignment) =>
    (!assignment.starts_on || assignment.starts_on <= today) && (!assignment.ends_on || assignment.ends_on >= today)
  ).length;

  const quickLinks: { title: string; detail: string; href: string; icon: string; tone: string }[] = [];
  const addQuick = (title: string, detail: string, href: string, icon: string, tone: string) =>
    quickLinks.push({ title, detail, href: `/dashboard/${slug}/${href}`, icon, tone });
  if (roleKeys.includes("teacher")) {
    addQuick("Mis aulas y clases", "Divisiones, materias y actividades", "classroom", "classroom", "quick-violet");
    addQuick("Mi perfil docente", "Foto, títulos y contacto", "teaching/profile", "profile", "quick-blue");
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
  if (roleKeys.includes("prefect")) addQuick("Espacio de preceptoría", "Divisiones, nóminas y asistencia", "prefect", "prefect", "quick-blue");
  if (currentAssignmentCount > 0) addQuick("Mis asignaciones", "Funciones, divisiones y materias", "teaching", "classroom", "quick-green");
  if (permissions.has("admin_documents.read")) addQuick("Documentación", "Archivos institucionales autorizados", "admin-documents", "administrative", "quick-cyan");
  if (permissions.has("memberships.manage")) addQuick("Usuarios y accesos", "Perfiles y permisos institucionales", "users", "users", "quick-indigo");
  if (roleKeys.includes("institution_admin") && permissions.has("institution.manage")) addQuick("Centro de administración", "Panel general, prioridades y configuración del colegio", "admin", "users", "quick-indigo");
  if (permissions.has("institution.manage")) {
    addQuick("Calendario académico", "Ciclos y períodos lectivos", "settings/academic-calendar", "calendar", "quick-orange");
    addQuick("Estructura académica", "Niveles, cursos y asignaciones", "settings/academic-structure", "structure", "quick-violet");
    addQuick("Escalas de calificación", "Criterios numéricos y conceptuales", "settings/grading-scales", "scales", "quick-blue");
  }
  if (permissions.has("support.create")) addQuick("Ayuda y soporte", "Consultas y seguimiento de solicitudes", "support", "support", "quick-green");

  return <WorkspaceExperience
    institutionName={institution.display_name}
    roleNames={roleNames}
    modules={modulesWithUnread}
    quickLinks={quickLinks}
    unreadCount={unreadNotificationCount ?? 0}
    assignmentCount={currentAssignmentCount}
    signOutAction={signOut}
  />;
}
