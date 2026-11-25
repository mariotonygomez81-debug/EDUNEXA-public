import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isPlatformSuperAdmin } from "@/lib/auth/platform-admin";
import { signOut } from "../actions";
import PlatformSuperadminConsole, { type PlatformInstitution } from "@/components/admin/platform-superadmin-console";

export const dynamic = "force-dynamic";

export default async function PlatformAdminPage() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");
  if (!isPlatformSuperAdmin(user)) redirect("/dashboard");

  // Use only the authenticated RLS-constrained client. Never expose service-role keys.
  const { data, error } = await supabase
    .from("institutions")
    .select("id,display_name,legal_name,slug,status,locale,timezone,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-white/10 bg-slate-950/90">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/30 bg-cyan-300/10 text-cyan-200"><span className="text-xl font-black">E</span></div>
            <div><strong className="block text-sm tracking-[0.2em] text-white">EDUNEXA GLOBAL</strong><span className="text-[10px] font-semibold tracking-[0.18em] text-cyan-200/70">CENTRO DE SUPERADMINISTRACIÓN</span></div>
          </div>
          <form action={signOut}><button className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10" type="submit">Cerrar sesión</button></form>
        </div>
      </header>
      <PlatformSuperadminConsole institutions={(data ?? []) as PlatformInstitution[]} loadError={error ? "La sesión está verificada, pero la política de acceso de datos no permitió consultar el inventario global. No se intenta eludir RLS." : null} />
    </main>
  );
}
