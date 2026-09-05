import type { Plat } from "@/lib/socialHandles";

/* Viralmaxing с сервера: свои аккаунты доступны только через MCP-эндпоинт
   (REST /analytics/accounts отдаёт конкурентов). Ключ vmx_ в X-API-Key. */

export const VMX = "https://api.viralmaxing.com/api";
export const VM_PLAT: Record<string, Plat> = { instagram: "ig", tiktok: "tt", youtube: "yt" };
export type VmAccount = { id: number; plat: Plat; handle: string; followersApprox: number | null; own: boolean };

let rpcId = 1;
export async function vmxMcp(key: string, name: string, args: Record<string, any>): Promise<string> {
  const r = await fetch(`${VMX}/mcp`, {
    method: "POST", cache: "no-store",
    headers: { "X-API-Key": key, "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method: "tools/call", params: { name, arguments: args } }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Viralmaxing MCP ${r.status} ${name}: ${text.slice(0, 200)}`);
  let j: any = null;
  try { j = JSON.parse(text); } catch {
    const lines = text.split("\n").filter(l => l.startsWith("data:"));
    try { j = JSON.parse(lines[lines.length - 1].slice(5)); } catch { throw new Error(`Viralmaxing MCP: нечитаемый ответ ${name}`); }
  }
  if (j?.error) throw new Error(`Viralmaxing MCP ${name}: ${j.error.message || JSON.stringify(j.error)}`);
  return (j?.result?.content || []).filter((c: any) => c?.type === "text").map((c: any) => c.text).join("\n");
}

/** «12.5K» / «2.2M» → число */
export function parseCompact(v: string): number | null {
  const t = String(v || "").trim().replace(/,/g, "");
  if (!t || t === "—" || t === "-") return null;
  const m = t.match(/^([\d.]+)\s*([KkMm])?$/); if (!m) return null;
  const n = parseFloat(m[1]); return Math.round(m[2] ? n * (m[2].toLowerCase() === "k" ? 1e3 : 1e6) : n);
}

/** Свои отслеживаемые аккаунты (markdown-таблица list_my_accounts → объекты). */
export async function vmxMyAccounts(key: string): Promise<VmAccount[]> {
  const out: VmAccount[] = [];
  for (let off = 0; off < 500; off += 50) {
    const md = await vmxMcp(key, "list_my_accounts", { limit: 50, offset: off });
    let n = 0;
    for (const line of md.split("\n")) {
      const cells = line.split("|").map(x => x.trim());
      if (cells.length < 9 || !/^\d+$/.test(cells[1])) continue;
      const plat = VM_PLAT[cells[2].toLowerCase()]; const id = parseInt(cells[8], 10);
      if (!plat || !id) continue;
      out.push({ id, plat, handle: cells[3].replace(/^@/, "").toLowerCase(), followersApprox: parseCompact(cells[4]), own: true }); n++;
    }
    if (n < 50) break;
  }
  return out;
}

/** Конкурент по хэндлу через REST (свои там не ищутся). */
export async function vmxFindCompetitor(key: string, handle: string, plat: Plat): Promise<VmAccount | null> {
  try {
    const r = await fetch(`${VMX}/analytics/accounts/?search_query=${encodeURIComponent(handle)}&limit=20`, { headers: { "X-API-Key": key, accept: "application/json" }, cache: "no-store" });
    if (!r.ok) return null;
    const j: any = await r.json();
    const a = (j?.accounts || []).find((x: any) => VM_PLAT[String(x.platform || "").toLowerCase()] === plat && String(x.username || "").toLowerCase().replace(/^@/, "") === handle.toLowerCase());
    return a ? { id: a.id, plat, handle: handle.toLowerCase(), followersApprox: a.followersCount ?? null, own: false } : null;
  } catch { return null; }
}

/** Найти аккаунт по хэндлу: сначала среди своих, потом среди конкурентов. */
export async function vmxFindAccount(key: string, handle: string, plat: Plat): Promise<VmAccount | null> {
  const h = handle.toLowerCase();
  try { const mine = await vmxMyAccounts(key); const m = mine.find(a => a.plat === plat && a.handle === h); if (m) return m; } catch {}
  return vmxFindCompetitor(key, h, plat);
}

/** Аватар аккаунта лежит на CDN по id. */
export const vmxAvatarUrl = (id: number) => `https://cdn.viralmaxing.com/analytics/account_${id}/avatar.jpg`;
