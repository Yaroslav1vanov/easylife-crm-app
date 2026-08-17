import { createClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const type = searchParams.get("type");                 // recovery — восстановление пароля
  const next = searchParams.get("next");
  // После восстановления пароля ведём на форму нового пароля, иначе — в дашборд.
  const dest = next || (type === "recovery" ? "/reset-password" : "/dashboard");
  if (code) {
    const sb = createClient();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${dest}`);
  }
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
