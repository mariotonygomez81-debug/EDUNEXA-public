import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SUPERADMIN_EMAIL = "mario.tony.gomez81@gmail.com";

export async function POST(request: NextRequest) {
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Origen de solicitud no válido." }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Iniciá sesión para continuar." }, { status: 401 });
  }

  if (
    user.email?.toLowerCase() !== SUPERADMIN_EMAIL ||
    !user.email_confirmed_at
  ) {
    return NextResponse.json({ error: "La cuenta no está autorizada para el alta inicial." }, { status: 403 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Falta configurar la clave administrativa de Supabase en el entorno seguro del servidor." },
      { status: 503 },
    );
  }

  const admin = createSupabaseAdminClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const { data, error } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...(user.app_metadata ?? {}),
      platform_role: "superadmin",
    },
  });

  if (error || data.user?.app_metadata?.platform_role !== "superadmin") {
    return NextResponse.json(
      { error: "No se pudo verificar la asignación del rol de Superadministrador." },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, role: "superadmin" });
}
