import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase-admin";
import { resolvePortal } from "@/lib/portal";
import { PORTAL_TABLES } from "@/lib/portalTables";

/* Чтение для кабинета клиента. Только SELECT, только таблицы и поля из белого списка,
   и всегда — только строки этого клиента (секрет из ссылки → id клиента). */
export const dynamic = "force-dynamic";

const OPS = new Set(["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in", "not"]);
const NOT_OPS = new Set(["eq", "neq", "is", "in", "gt", "gte", "lt", "lte"]);
const COL = /^[a-z_][a-z0-9_]*$/;

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const sb = createAdmin();
  const cid = await resolvePortal(sb, params.token);
  if (!cid) return NextResponse.json({ data: null, error: { message: "Ссылка недействительна" } }, { status: 404 });

  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ data: null, error: { message: "bad json" } }, { status: 400 }); }
  const t = PORTAL_TABLES[String(b?.table || "")];
  if (!t) return NextResponse.json({ data: b?.single ? null : [], error: null });   // чужая таблица — просто пусто
  if (b.write) return NextResponse.json({ data: null, error: { message: "Режим просмотра" } }, { status: 403 });

  const allowed = (c: string) => COL.test(c) && (t.cols === "*" || t.cols.includes(c) || c === t.scope);
  // какие поля вернуть: запрошенные ∩ белый список (связанные таблицы «x(...)» не отдаём)
  const req_ = String(b.select || "*").split(",").map((x: string) => x.trim()).filter(Boolean).filter((x: string) => !x.includes("("));
  let cols: string[];
  if (req_.includes("*")) cols = t.cols === "*" ? ["*"] : t.cols;
  else { cols = req_.map((x: string) => x.split(":").pop()!.trim()).filter(allowed); if (!cols.length) cols = ["id"]; }

  let q: any = sb.from(b.table).select(cols.join(","), b.count ? { count: "exact", head: !!b.head } : undefined).eq(t.scope, cid);
  for (const f of Array.isArray(b.filters) ? b.filters : []) {
    const [op, col, val] = f || [];
    if (!OPS.has(op) || !allowed(String(col))) continue;
    if (op === "not") { const [nop, nval] = Array.isArray(val) ? val : []; if (NOT_OPS.has(nop)) q = q.not(col, nop, nval); continue; }
    if (op === "in") { if (Array.isArray(val)) q = q.in(col, val.slice(0, 2000)); continue; }
    q = q[op](col, val);
  }
  for (const [col, asc] of Array.isArray(b.order) ? b.order : []) if (allowed(String(col))) q = q.order(col, { ascending: asc !== false });
  const limit = Math.min(Math.max(Number(b.limit) || 1000, 1), 1000);
  const offset = Math.max(Number(b.offset) || 0, 0);
  q = q.range(offset, offset + limit - 1);
  if (b.single === "single") q = q.single();
  else if (b.single === "maybe") q = q.maybeSingle();

  const { data, error, count } = await q;
  return NextResponse.json({ data: data ?? (b.single ? null : []), error: error ? { message: error.message, code: error.code } : null, count: count ?? null });
}
