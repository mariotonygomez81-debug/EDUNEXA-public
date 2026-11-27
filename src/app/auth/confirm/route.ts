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
 const next = allowedNext.has(requestedNext) ? requestedNext : "/dashboard";
 const supabase = await createClient();
 if (code) {
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (!error) {
   const destination = new URL(next, origin);
   if (institutionSlug && next === "/reset-password") destination.searchParams.set("institution", institutionSlug);
   return NextResponse.redirect(destination);
  }
 }
 if (tokenHash && type) {
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (!error) {
   const destination = new URL(next, origin);
   if (institutionSlug && next === "/reset-password") destination.searchParams.set("institution", institutionSlug);
   return NextResponse.redirect(destination);
  }
 }
 return NextResponse.redirect(new URL("/login?message=El%20enlace%20no%20es%20v%C3%A1lido%20o%20ya%20venci%C3%B3.%20Solicit%C3%A1%20uno%20nuevo.", origin));
}
