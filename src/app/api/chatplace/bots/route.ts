import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiGuard";
import { cpListBots } from "@/lib/chatplace";

/* GET /api/chatplace/bots — Instagram-аккаунты, подключённые к ChatPlace, для выбора в карточке клиента. */
export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireUser(); if (denied) return denied;
  try {
    const bots = (await cpListBots()).filter(b => b.platform === "instagram");
    return NextResponse.json({ ok: true, bots });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 502 });
  }
}
