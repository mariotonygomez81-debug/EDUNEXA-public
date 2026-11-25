import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isPlatformSuperAdmin } from "@/lib/auth/platform-admin";
import { signOut } from "../../actions";
import type { PlatformInstitution } from "@/components/admin/platform-superadmin-console";

export const dynamic = "force-dynamic";

async function getInstitutions(): Promise<PlatformInstitution[]> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login");
  if (!isPlatformSuperAdmin(user)) redirect("/dashboard");
  const rpcClient = supabase as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{data: unknown; error: {message: string} | null}> };
  const { data, error } = await rpcClient.rpc("platform_list_institutions", {p_limit:100,p_before:null,p_status:null,p_search:null});
  if (error) throw new Error("No se pudo cargar el inventario institucional.");
  return (data ?? []) as PlatformInstitution[];
}

function Layout({children,title}:{children:React.ReactNode;title:string}) {
 return <main className="min-h-screen bg-slate-950 text-slate-100">
  <header className="border-b border-white/10"><div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4">
   <div><p className="text-xs font-bold tracking-[.2em] text-cyan-200">EDUNEXA GLOBAL</p><h1 className="mt-1 text-lg font-bold text-white">{title}</h1></div>
   <div className="flex gap-2"><Link href="/dashboard/platform" className="rounded-lg border border-cyan-200/30 px-3 py-2 text-sm text-cyan-100">← Panel principal</Link><form action={signOut}><button className="rounded-lg border border-white/15 px-3 py-2 text-sm" type="submit">Cerrar sesión</button></form></div>
  </div></header><div className="mx-auto max-w-6xl space-y-5 px-5 py-8">{children}</div>
 </main>;
}

import { InstitutionLifecyclePanel } from "@/components/admin/platform-superadmin-console";

export default async function PlatformInstitutionsPage() {
 const institutions = await getInstitutions();
 return <Layout title="ABM de plataformas"><p className="text-sm text-slate-400">Gestión independiente de altas, edición, activación y suspensión de instituciones.</p><InstitutionLifecyclePanel institutions={institutions}/></Layout>;
}
