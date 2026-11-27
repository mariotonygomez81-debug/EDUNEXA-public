import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMembershipPermissions } from "@/lib/auth/permissions";
import { EdunexaMark } from "@/components/brand/edunexa-mark";
import InstitutionUsersManager from "@/components/admin/institution-users-manager";

export default async function InstitutionUsersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: institution } = await supabase.from("institutions")
    .select("id,slug").eq("slug", slug).eq("status", "active").maybeSingle();
  if (!institution) redirect("/dashboard");

  const { data: membership } = await supabase.from("memberships")
    .select("id").eq("institution_id", institution.id)
    .eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership) redirect("/dashboard");

  const permissions = await getMembershipPermissions(supabase, membership.id);
  if (!permissions.has("memberships.manage")) redirect(`/dashboard/${slug}`);

  return <main className="member-shell"><header className="member-top"><div className="auth-brand"><div className="auth-brand-mark"><EdunexaMark size={32}/></div><div><strong>EDUNEXA</strong><span>TECNOLOGÍA QUE CONECTA LA EDUCACIÓN</span></div></div></header><InstitutionUsersManager slug={slug}/></main>;
}
