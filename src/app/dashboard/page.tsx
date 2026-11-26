import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Building2, LogOut, ShieldCheck } from "lucide-react";
import { EdunexaMark } from "@/components/brand/edunexa-mark";
import { signOut } from "./actions";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) redirect("/login");

  if (user.app_metadata?.platform_role === "superadmin") redirect("/dashboard/platform");

  const [{ data: profile }, { data: memberships, error: membershipError }] = await Promise.all([
    supabase.from("profiles").select("display_name,first_name,last_name").eq("id", user.id).maybeSingle(),
    supabase.from("memberships").select("id,institution_id,status").eq("user_id", user.id).eq("status", "active"),
  ]);

  if (!membershipError && memberships?.length === 1) {
    const { data: institution } = await supabase
      .from("institutions")
      .select("slug")
      .eq("id", memberships[0].institution_id)
      .maybeSingle();

    if (institution?.slug) redirect(`/dashboard/${institution.slug}`);
  }

  const displayName = profile?.display_name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
    "Usuario";

  const hasUnexpectedMultipleMemberships = (memberships?.length ?? 0) > 1;

  return (
    <main className="member-shell">
      <header className="member-top">
        <div className="auth-brand">
          <div className="auth-brand-mark"><EdunexaMark size={32} /></div>
          <div><strong>EDUNEXA</strong><span>TECNOLOGÍA QUE CONECTA LA EDUCACIÓN</span></div>
        </div>
        <form action={signOut}>
          <button className="signout-button"><LogOut size={16} /> Cerrar sesión</button>
        </form>
      </header>
      <section className="member-content">
        <div className="member-welcome">
          <span className="visual-kicker"><ShieldCheck size={14} /> SESIÓN VERIFICADA</span>
          <h1>¡Hola, {displayName}!</h1>
          <p>Acceso a la instalación de tu institución educativa.</p>
        </div>
        <div className="onboarding-card">
          <div className="simple-icon"><Building2 size={25} /></div>
          {hasUnexpectedMultipleMemberships ? (
            <>
              <h2>Necesitamos revisar tu cuenta</h2>
              <p>Esta instalación corresponde a un solo colegio. Tu cuenta tiene más de una relación institucional activa, por lo que bloqueamos el acceso hasta corregir esa configuración.</p>
            </>
          ) : (
            <>
              <h2>Tu cuenta todavía no tiene acceso institucional</h2>
              <p>La autenticación fue correcta, pero todavía no encontramos una relación activa con este colegio. El administrador institucional deberá habilitar tu cuenta.</p>
            </>
          )}
          <div className="secure-caption">
            <ShieldCheck size={17} />
            <span>Esta instalación está dedicada a una sola institución. No se permite seleccionar ni consultar otros colegios desde esta cuenta.</span>
          </div>
        </div>
        <div className="member-note">EDUNEXA · Aprender. Gestionar. Conectar.</div>
      </section>
    </main>
  );
}
