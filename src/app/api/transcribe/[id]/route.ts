import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { pollFile } from "@/lib/transcribe";

// Опрос статуса: фронт дёргает раз в несколько секунд, пока status === processing.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const sb = createClient();
  const { data: t } = await sb.from("transcriptions").select("*").eq("id", id).maybeSingle();
  if (!t) return NextResponse.json({ error: "не найдено" }, { status: 404 });
  if (t.status !== "processing" || !t.provider_job_id) return NextResponse.json({ ok: true, item: t });

  const r = await pollFile(t.provider_job_id);
  const patch = !r.ok ? { status: "error", error: r.error }
    : !r.done ? null
    : { status: "done", text: r.text, language: r.language || t.language, duration_sec: r.durationSec };
  if (!patch) return NextResponse.json({ ok: true, item: t });

  const { data } = await sb.from("transcriptions").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select().single();
  return NextResponse.json({ ok: true, item: data || { ...t, ...patch } });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const sb = createClient();
  const { error } = await sb.from("transcriptions").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
