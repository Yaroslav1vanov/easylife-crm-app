import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

/* Голосовое → текст для поля сообщения (кнопка 🎙 в чате клиента).
   Браузер шлёт запись как есть (webm/mp4), мы кладём её в AssemblyAI и ждём текст — обычно 3–15 секунд.
   POST body = аудио, ?lang=ru|uk|en (по умолчанию ru) → { text } */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const AAI = "https://api.assemblyai.com/v2";

export async function POST(req: Request) {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: "Нужно войти в CRM" }, { status: 401 });
  const key = process.env.ASSEMBLYAI_API_KEY;
  if (!key) return NextResponse.json({ error: "ASSEMBLYAI_API_KEY не задан в переменных Vercel" }, { status: 500 });
  const lang = new URL(req.url).searchParams.get("lang");
  const audio = await req.arrayBuffer();
  if (audio.byteLength < 1000) return NextResponse.json({ error: "Запись пустая — проверьте микрофон" }, { status: 400 });

  const up = await fetch(`${AAI}/upload`, { method: "POST", headers: { authorization: key, "content-type": "application/octet-stream" }, body: audio });
  const uj = await up.json().catch(() => null);
  if (!up.ok || !uj?.upload_url) return NextResponse.json({ error: `распознавание не приняло запись (${up.status})` }, { status: 502 });

  const tr = await fetch(`${AAI}/transcript`, {
    method: "POST", headers: { authorization: key, "content-type": "application/json" },
    body: JSON.stringify({ audio_url: uj.upload_url, language_code: ["ru", "uk", "en"].includes(lang || "") ? lang : "ru", punctuate: true, format_text: true }),
  });
  const tj = await tr.json().catch(() => null);
  if (!tr.ok || !tj?.id) return NextResponse.json({ error: tj?.error || `распознавание ответило ${tr.status}` }, { status: 502 });

  const until = Date.now() + 52_000;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 1500));
    const r = await fetch(`${AAI}/transcript/${tj.id}`, { headers: { authorization: key } });
    const j = await r.json().catch(() => null);
    if (j?.status === "completed") return NextResponse.json({ text: (j.text || "").trim() });
    if (j?.status === "error") return NextResponse.json({ error: j.error || "не удалось распознать" }, { status: 502 });
  }
  return NextResponse.json({ error: "Распознавание заняло больше минуты — попробуйте запись покороче" }, { status: 504 });
}
