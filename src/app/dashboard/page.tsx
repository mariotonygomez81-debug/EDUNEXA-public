import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Building2, LogOut, ShieldCheck } from "lucide-react";
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
    supabase.from("memberships").select("id,institution_id,status").eq("user_id", user.id).eq("status", "active"),
  ]);

  const institutionIds = [...new Set((memberships ?? []).map((membership) => membership.institution_id))];
  const { data: institutions, error: institutionsError } = institutionIds.length
    ? await supabase.from("institutions").select("id,display_name,slug,status")
        .in("id", institutionIds).eq("status", "active").order("display_name")
    : { data: [], error: null };

  const availableInstitutions = institutions ?? [];
  if (!membershipError && !institutionsError && availableInstitutions.length === 1) {
    redirect(`/dashboard/${availableInstitutions[0].slug}`);
  }

  const displayName = profile?.display_name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
    "Usuario";

  const hasAccessLookupError = Boolean(membershipError || institutionsError);
  const hasNoActiveInstitution = !hasAccessLookupError && availableInstitutions.length === 0;

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
          <p>Accedé a tus instituciones educativas desde una sola cuenta.</p>
        </div>

        {hasAccessLookupError ? (
          <div className="onboarding-card" role="alert">
            <div className="simple-icon"><ShieldCheck size={25} /></div>
            <h2>No pudimos verificar tus instituciones</h2>
            <p>Por seguridad, no habilitamos el acceso hasta poder comprobar tus membresías. Actualizá la página o contactá al administrador.</p>
          </div>
        ) : hasNoActiveInstitution ? (
          <div className="onboarding-card">
            <div className="simple-icon"><Building2 size={25} /></div>
            <h2>Tu cuenta todavía no tiene acceso institucional</h2>
            <p>La autenticación fue correcta, pero no encontramos una membresía activa en una institución habilitada. El administrador deberá autorizar tu cuenta.</p>
            <div className="secure-caption">
              <ShieldCheck size={17} />
              <span>Los datos de cada institución permanecen aislados y sólo se muestran después de verificar tu membresía.</span>
            </div>
          </div>
        ) : (
          <section className="onboarding-card" aria-labelledby="institution-list-title">
            <div className="simple-icon"><Building2 size={25} /></div>
            <h2 id="institution-list-title">Seleccioná tu institución</h2>
            <p>Tu cuenta tiene acceso a más de una institución. Elegí dónde querés trabajar; tus permisos se verificarán nuevamente al ingresar.</p>
            <div className="mt-6 grid gap-3">
              {availableInstitutions.map((institution) => (
                <Link
                  key={institution.id}
                  href={`/dashboard/${institution.slug}`}
                  className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-violet-300 hover:bg-violet-50/40"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><Building2 size={21} /></span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-slate-900">{institution.display_name}</span>
                      <span className="block text-sm text-slate-500">Ingresar al espacio institucional</span>
                    </span>
                  </span>
                  <ArrowRight size={18} className="shrink-0 text-violet-700" />
                </Link>
              ))}
            </div>
            <div className="secure-caption">
              <ShieldCheck size={17} />
              <span>Una sola sesión para EDUNEXA. Cada institución conserva sus propios datos, roles y permisos.</span>
            </div>
          </section>
        )}
        <div className="member-note">EDUNEXA · Aprender. Gestionar. Conectar.</div>
      </section>
    </main>
  );
}
