import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

// Правка регламента онбординга (инструкция + текст клиенту). Только владелец/админ.
export async function POST(req: Request) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "нужен вход" }, { status: 401 });
  const { data: profile } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || !["owner", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "редактировать регламент может только владелец" }, { status: 403 });
  }

  const b = await req.json().catch(() => ({} as any));
  const id = Number(b.id);
  if (!id) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const patch: Record<string, any> = {};
  if (typeof b.instruction === "string") patch.instruction = b.instruction.trim() || null;
  if (typeof b.client_message === "string") patch.client_message = b.client_message.trim() || null;
  if (!Object.keys(patch).length) return NextResponse.json({ error: "нечего сохранять" }, { status: 400 });

  const { data, error } = await sb.from("onboarding_template").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, row: data });
}
