import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { requireUser } from "@/lib/apiGuard";
import { cpSyncClient } from "@/lib/chatplace";

/* Статистика Instagram клиента из ChatPlace.
   GET  — что сейчас лежит в базе (последний снимок): идёт ли статистика.
   POST — забрать снимок прямо сейчас (после привязки бота, не дожидаясь ночного обновления). */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const view = (row: any) => row ? {
  day: row.day, availability: row.availability, bot_id: row.bot_id,
  followers: row.summary?.metrics?.followers ?? null, videos: Array.isArray(row.videos) ? row.videos.length : 0,
} : null;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireUser(); if (denied) return denied;
  const sb = createClient();
  const { data } = await sb.from("client_chatplace_insights").select("day, availability, bot_id, summary, videos")
    .eq("client_id", Number(params.id)).order("day", { ascending: false }).limit(1).maybeSingle();
  return NextResponse.json({ ok: true, last: view(data) });
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireUser(); if (denied) return denied;
  const sb = createClient();
  const { data: c } = await sb.from("clients").select("id, chatplace_bot_id").eq("id", Number(params.id)).maybeSingle();
  if (!c?.chatplace_bot_id) return NextResponse.json({ error: "бот ChatPlace не привязан" }, { status: 400 });
  try {
    const snap = await cpSyncClient(sb, c as any);
    return NextResponse.json({ ok: true, last: snap ? {
      day: new Date().toISOString().slice(0, 10), availability: snap.availability, bot_id: c.chatplace_bot_id,
      followers: snap.summary?.metrics?.followers ?? null, videos: snap.videos.length, reason: snap.reason,
    } : null });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 502 });
  }
}
