import { NextResponse } from "next/server";
import { ingestReference } from "@/lib/ingestReference";

// По ссылке на чужой ролик тянет статистику + транскрибацию и сохраняет в reference_videos.
// Логика общая с ТГ-ботом — в @/lib/ingestReference.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const url: string = (body.url || "").trim();
  const clientId = Number(body.clientId);
  if (!url || !clientId) return NextResponse.json({ error: "нужны url и clientId" }, { status: 400 });

  const r = await ingestReference(url, clientId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status || 400 });
  return NextResponse.json({ ok: true, reference: r.reference });
}
