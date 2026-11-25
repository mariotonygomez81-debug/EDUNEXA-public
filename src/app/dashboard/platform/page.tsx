import { redirect } from "next/navigation";
import { ShieldCheck, Building2, Users, LockKeyhole } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isPlatformSuperAdmin } from "@/lib/auth/platform-admin";
import { signOut } from "../actions";

export const dynamic = "force-dynamic";

export default async function PlatformAdminPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");
  if (!isPlatformSuperAdmin(user)) redirect("/dashboard");

  return (
    <main className="member-shell">
      <header className="member-top">
        <div className="auth-brand">
          <div className="auth-brand-mark"><ShieldCheck size={30} /></div>
          <div><strong>EDUNEXA GLOBAL</strong><span>CONSOLA DE SUPERADMINISTRACIÓN</span></div>
        </div>
        <form action={signOut}><button className="signout-button" type="submit">Cerrar sesión</button></form>
      </header>
      <section className="member-content">
        <div className="member-welcome">
          <span className="visual-kicker"><ShieldCheck size={14} /> ACCESO GLOBAL VERIFICADO</span>
          <h1>Centro de Superadministración</h1>
          <p>Este espacio pertenece a la plataforma EDUNEXA y no depende de una membresía de colegio.</p>
        </div>
        <div className="onboarding-card">
          <div className="simple-icon"><Building2 size={25} /></div>
          <h2>Instituciones educativas</h2>
          <p>La administración global de altas, habilitaciones y estados institucionales requiere un servicio de servidor con privilegios controlados y auditoría. Esta pantalla no ejecuta operaciones privilegiadas desde el navegador.</p>
        </div>
        <div className="onboarding-card">
          <div className="simple-icon"><Users size={25} /></div>
          <h2>Administradores institucionales</h2>
          <p>La asignación y revocación de administradores debe realizarse desde operaciones globales auditadas. Cada administrador institucional conserva acceso únicamente mediante su membresía activa y permisos de su colegio.</p>
        </div>
        <div className="secure-caption">
          <LockKeyhole size={17} />
          <span>Autorización global basada exclusivamente en Auth app_metadata.platform_role = "superadmin". No se aceptan claims de user_metadata ni roles institucionales para elevar privilegios.</span>
        </div>
      </section>
    </main>
  );
}
