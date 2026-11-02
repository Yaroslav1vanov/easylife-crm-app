import { NextResponse } from "next/server";
import { AwsClient } from "aws4fetch";
import { createClient } from "@/lib/supabase-server";

/*
 * Загрузка больших файлов в R2 частями (исходники аватара с айфона — гигабайты).
 * Раньше файл шёл одним PUT по ссылке на час: на медленном интернете ссылка истекала,
 * а любой обрыв начинал загрузку заново (02.11: «грузилось больше часа и теперь 500»).
 * Теперь куски по ~25 МБ, каждый перезагружается отдельно, ссылки живут 12 часов.
 * ETag кусков браузеру читать не нужно (CORS R2 их не отдаёт) — при завершении сервер
 * сам спрашивает у хранилища список загруженных частей.
 *
 *   POST {op:"create", clientId, category, filename, contentType} → { key, uploadId }
 *   POST {op:"sign", key, uploadId, parts:[1,2,…]}                 → { urls: {1: url, …} }
 *   POST {op:"complete", key, uploadId, count}                    → { ok, key }
 *   POST {op:"abort", key, uploadId}                              → { ok }
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CATEGORIES = new Set(["audit", "strategy", "content_plan", "brief", "other", "logo", "font", "portrait", "process",
  "location", "result", "review", "generated", "story", "chat"]);
const TTL = 12 * 3600;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

function r2() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) return null;
  return {
    client: new AwsClient({ accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, region: "auto", service: "s3" }),
    base: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}`,
  };
}
const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1] || "";
const okKey = (k: unknown) => typeof k === "string" && /^strategy\/\d+\/[a-z_]+\/[0-9a-f-]{36}\.[a-z0-9]{1,8}$/.test(k);

export async function POST(req: Request) {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return bad("не авторизован", 401);
  const store = r2();
  if (!store) return bad("хранилище R2 не настроено", 500);
  const b = await req.json().catch(() => ({}));

  if (b.op === "create") {
    const clientId = Number(b.clientId), category = String(b.category || "other");
    if (!clientId || !CATEGORIES.has(category)) return bad("нет клиента или категории");
    const ext = (String(b.filename || "").split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
    const key = `strategy/${clientId}/${category}/${crypto.randomUUID()}.${ext}`;
    const r = await store.client.fetch(`${store.base}/${key}?uploads`, { method: "POST",
      headers: { "Content-Type": String(b.contentType || "application/octet-stream").slice(0, 100) } });
    const xml = await r.text();
    const uploadId = tag(xml, "UploadId");
    if (!r.ok || !uploadId) return bad(`хранилище не начало загрузку (${r.status})`, 502);
    return NextResponse.json({ key, uploadId });
  }

  if (!okKey(b.key) || typeof b.uploadId !== "string" || !b.uploadId) return bad("неверная загрузка");
  const u = `${store.base}/${b.key}`, id = encodeURIComponent(b.uploadId);

  if (b.op === "sign") {
    const parts = (Array.isArray(b.parts) ? b.parts : []).map(Number).filter((n: number) => n >= 1 && n <= 10000).slice(0, 500);
    const urls: Record<number, string> = {};
    for (const n of parts) urls[n] = (await store.client.sign(`${u}?partNumber=${n}&uploadId=${id}&X-Amz-Expires=${TTL}`, { method: "PUT", aws: { signQuery: true } })).url;
    return NextResponse.json({ urls });
  }

  if (b.op === "complete") {
    // список загруженных частей с ETag — у хранилища (браузеру ETag недоступен)
    const parts: { n: number; etag: string }[] = [];
    let marker = "";
    for (let i = 0; i < 20; i++) {
      const r = await store.client.fetch(`${u}?uploadId=${id}&max-parts=1000${marker ? `&part-number-marker=${marker}` : ""}`);
      const xml = await r.text();
      if (!r.ok) return bad(`хранилище не отдало части (${r.status})`, 502);
      for (const m of Array.from(xml.matchAll(/<Part>([\s\S]*?)<\/Part>/g))) parts.push({ n: Number(tag(m[1], "PartNumber")), etag: tag(m[1], "ETag") });
      if (tag(xml, "IsTruncated") !== "true") break;
      marker = tag(xml, "NextPartNumberMarker");
    }
    const need = Number(b.count) || 0;
    if (need && parts.length < need) return bad(`загружено ${parts.length} из ${need} частей — дождитесь или повторите`, 409);
    parts.sort((a, z) => a.n - z.n);
    const body = `<CompleteMultipartUpload>${parts.map((p) => `<Part><PartNumber>${p.n}</PartNumber><ETag>${p.etag}</ETag></Part>`).join("")}</CompleteMultipartUpload>`;
    const r = await store.client.fetch(`${u}?uploadId=${id}`, { method: "POST", body, headers: { "Content-Type": "application/xml" } });
    const xml = await r.text();
    if (!r.ok || /<Error>/.test(xml)) return bad(`хранилище не собрало файл (${r.status}) ${tag(xml, "Message")}`.trim(), 502);
    return NextResponse.json({ ok: true, key: b.key });
  }

  if (b.op === "abort") {
    await store.client.fetch(`${u}?uploadId=${id}`, { method: "DELETE" }).catch(() => null);
    return NextResponse.json({ ok: true });
  }
  return bad("неизвестная операция");
}
