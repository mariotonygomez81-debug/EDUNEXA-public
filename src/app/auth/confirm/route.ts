import { type EmailOtpType } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
const allowedNext = new Set(["/reset-password", "/dashboard"]);
export async function GET(request: NextRequest) {
 const { searchParams, origin } = new URL(request.url);
 const code = searchParams.get("code");
 const tokenHash = searchParams.get("token_hash");
 const type = searchParams.get("type") as EmailOtpType | null;
 const requestedNext = searchParams.get("next") ?? "/dashboard";
 const institutionSlug = searchParams.get("institution") ?? "";
 const platformBootstrap = searchParams.get("flow") === "platform-bootstrap";
 const next = allowedNext.has(requestedNext) ? requestedNext : "/dashboard";
 const supabase = await createClient();
 const finishRedirect = async () => {
  if (platformBootstrap) {
   const { data: { user } } = await supabase.auth.getUser();
   if (user?.email?.toLowerCase() !== "mario.tony.gomez81@gmail.com" || user.app_metadata?.platform_role !== "superadmin") {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?message=La%20cuenta%20no%20tiene%20autorizaci%C3%B3n%20de%20Superadministrador.", origin));
   }
  }
  return NextResponse.redirect(new URL(next, origin));
 };
 if (code) {
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (!error) {
   if (institutionSlug) {
    const { error: activationError } = await supabase.functions.invoke("manage-institution-users", { body: { action: "activate_self", slug: institutionSlug } });
    if (activationError) return NextResponse.redirect(new URL("/login?message=No%20se%20pudo%20activar%20la%20invitaci%C3%B3n.%20Contact%C3%A1%20al%20administrador.", origin));
   }
   return await finishRedirect();
  }
 }
 if (tokenHash && type) {
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (!error) {
   if (institutionSlug) {
    const { error: activationError } = await supabase.functions.invoke("manage-institution-users", { body: { action: "activate_self", slug: institutionSlug } });
    if (activationError) return NextResponse.redirect(new URL("/login?message=No%20se%20pudo%20activar%20la%20invitaci%C3%B3n.%20Contact%C3%A1%20al%20administrador.", origin));
   }
   return NextResponse.redirect(new URL(next, origin));
  }
 }
 return NextResponse.redirect(new URL("/login?message=El%20enlace%20no%20es%20v%C3%A1lido%20o%20ya%20venci%C3%B3.%20Solicit%C3%A1%20uno%20nuevo.", origin));
}
