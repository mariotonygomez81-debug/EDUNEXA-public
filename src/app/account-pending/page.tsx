import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock3, MailCheck, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export default async function AccountPendingPage({
  searchParams,
}: {
  searchParams: Promise<{ institution?: string }>;
}) {
  const { institution: slug = "" } = await searchParams;
  if (!/^[a-z0-9-]{2,80}$/i.test(slug)) redirect("/login");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: school } = await supabase.from("institutions")
    .select("id,slug,display_name").eq("slug", slug).eq("status", "active").maybeSingle();
  if (!school) redirect("/dashboard");

  const { data: membership } = await supabase.from("memberships")
    .select("id,status,invitation_accepted_at").eq("institution_id", school.id)
    .eq("user_id", user.id).maybeSingle();

  if (membership?.status === "active") redirect(`/dashboard/${school.slug}`);
  if (!membership || membership.status !== "invited") redirect("/dashboard");

  return (
    <main className="simple-auth">
      <section className="simple-auth-card">
        <div className="simple-icon"><Clock3 size={26}/></div>
        <span className="login-eyebrow">INVITACIÓN INSTITUCIONAL</span>
        <h1>Tu cuenta está creada</h1>
        <p>Tu correo fue confirmado y tu contraseña quedó configurada para {school.display_name}.</p>
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left">
          <div className="flex items-center gap-2 font-semibold text-amber-900"><ShieldCheck size={18}/> Pendiente de habilitación</div>
          <p className="mt-2 text-sm leading-6 text-amber-800">
            El administrador de la institución debe habilitar tu acceso. Recibirás una notificación cuando esté disponible.
          </p>
        </div>
        <div className="mt-5 flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-left">
          <MailCheck size={20} className="mt-0.5 shrink-0 text-emerald-700"/>
          <p className="text-sm leading-6 text-slate-600">No necesitás volver a registrarte ni solicitar otra invitación. Podés actualizar esta página para consultar si el acceso ya fue habilitado.</p>
        </div>
        <Link href={`/account-pending?institution=${encodeURIComponent(slug)}`} className="mt-6 inline-flex w-full justify-center rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Actualizar estado
        </Link>
        <Link href="/login" className="mt-4 inline-flex w-full justify-center text-sm font-medium text-violet-700">Volver al ingreso</Link>
      </section>
    </main>
  );
}
