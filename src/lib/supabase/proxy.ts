import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database.types";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) return response;

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;
  const path = request.nextUrl.pathname;
  const isProtected = path.startsWith("/dashboard");

  if (isProtected && !claims) {
    const target = request.nextUrl.clone();
    target.pathname = "/login";
    target.searchParams.set("message", "Iniciá sesión para continuar.");
    return NextResponse.redirect(target);
  }

  // Do not redirect /login based only on JWT claims. The server-side
  // getUser() check can still reject an expired or otherwise invalid session.
  // Allowing /login to render prevents a /login <-> /dashboard redirect loop.
  return response;
}
