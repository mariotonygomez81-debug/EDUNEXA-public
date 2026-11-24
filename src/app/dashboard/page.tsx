import { redirect } from "next/navigation";
import { Building2, LogOut, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EdunexaMark } from "@/components/brand/edunexa-mark";
import { signOut } from "./actions";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");

  const [{ data: profile }, { data: memberships, error: membershipError }] = await Promise.all([
    supabase.from("profiles").select("display_name,first_name,last_name").eq("id", user.id).maybeSingle(),
    supabase.from("memberships").select("id,institution_id,status")
      .eq("user_id", user.id).eq("status", "active").limit(2),
  ]);

  const displayName = profile?.display_name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Usuario";
  const hasLookupError = Boolean(membershipError);
  const activeMemberships = memberships ?? [];
  const hasNoMembership = !hasLookupError && activeMemberships.length === 0;
  const hasUnexpectedMemberships = !hasLookupError && activeMemberships.length > 1;

  if (!hasLookupError && activeMemberships.length === 1) {
    const { data: institution, error: institutionError } = await supabase.from("institutions")
      .select("slug").eq("id", activeMemberships[0].institution_id).eq("status", "active").maybeSingle();
    if (!institutionError && institution?.slug) redirect(`/dashboard/${institution.slug}`);
    if (institutionError) {
      return <AccessMessage displayName={displayName} title="No pudimos verificar el colegio"
        message="Por seguridad, no habilitamos el acceso hasta comprobar la institución asignada. Actualizá la página o contactá al administrador." signOut={signOut} />;
    }
  }

  const title = hasLookupError ? "No pudimos verificar tu acceso"
    : hasNoMembership ? "Tu cuenta todavía no tiene acceso institucional"
    : hasUnexpectedMemberships ? "Tu cuenta requiere revisión"
    : "No encontramos un colegio habilitado";
  const message = hasLookupError
    ? "Por seguridad, no habilitamos el acceso hasta comprobar tu membresía. Actualizá la página o contactá al administrador."
    : hasNoMembership
      ? "La autenticación fue correcta, pero todavía no existe una membresía activa. El administrador del colegio deberá autorizar tu cuenta."
      : hasUnexpectedMemberships
        ? "Esta instalación está configurada para un solo colegio y detectó más de una membresía activa. Contactá al administrador para revisar la asignación; no se permite elegir otro espacio desde esta cuenta."
        : "No encontramos un colegio activo asociado a tu membresía. Contactá al administrador.";

  return <AccessMessage displayName={displayName} title={title} message={message} signOut={signOut} />;
}

function AccessMessage({ displayName, title, message, signOut }: {
  displayName: string; title: string; message: string; signOut: () => Promise<void>;
}) {
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
          <p>Tu cuenta utiliza un único espacio institucional.</p>
        </div>
        <div className="onboarding-card" role="status">
          <div className="simple-icon"><Building2 size={25} /></div>
          <h2>{title}</h2>
          <p>{message}</p>
          <div className="secure-caption">
            <ShieldCheck size={17} />
            <span>El acceso al colegio y a sus módulos se habilita únicamente después de verificar tu membresía y permisos.</span>
          </div>
        </div>
        <div className="member-note">EDUNEXA · Aprender. Gestionar. Conectar.</div>
      </section>
    </main>
  );
}
