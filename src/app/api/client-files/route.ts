import { NextResponse } from "next/server";
import { AwsClient } from "aws4fetch";
import { createClient } from "@/lib/supabase-server";

/*
 * Файлы вкладки «Стратегия» в карточке клиента: аудиты, логотипы, шрифты, фото, видео.
 *
 * В отличие от /api/r2/sign, пускает только вошедших в CRM.
 * Файлы лежат под длинным случайным именем в папке strategy/{клиент}/, а открываются
 * по подписанной ссылке на час — публичный адрес R2 наружу не отдаём: в медиатеке
 * бывают фото людей, у медицинских клиентов — пациентов.
 *
 *   POST { clientId, category, filename } → { uploadUrl, key }   залить файл
 *   GET  ?key=strategy/...                 → переадресация       открыть файл
 *   DELETE ?key=strategy/...               → { ok }              удалить файл из хранилища
 */

const CATEGORIES = new Set([
  "audit", "strategy", "content_plan", "brief", "other",
  "logo", "font", "portrait", "process", "location", "result", "review", "generated", "story",
]);

function r2() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) return null;
  return {
    client: new AwsClient({ accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, region: "auto", service: "s3" }),
    base: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}`,
  };
}

async function signedIn() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  return user;
}

export async function POST(req: Request) {
  if (!(await signedIn())) return NextResponse.json({ error: "не авторизован" }, { status: 401 });
  const store = r2();
  if (!store) return NextResponse.json({ error: "хранилище R2 не настроено" }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const clientId = Number(body.clientId);
  const category = String(body.category || "other");
  if (!clientId) return NextResponse.json({ error: "нет clientId" }, { status: 400 });
  if (!CATEGORIES.has(category)) return NextResponse.json({ error: "неизвестная категория" }, { status: 400 });

  const ext = (String(body.filename || "").split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
  const key = `strategy/${clientId}/${category}/${crypto.randomUUID()}.${ext}`;
  const signed = await store.client.sign(`${store.base}/${key}?X-Amz-Expires=3600`, { method: "PUT", aws: { signQuery: true } });
  return NextResponse.json({ uploadUrl: signed.url, key });
}

export async function GET(req: Request) {
  if (!(await signedIn())) return new NextResponse("не авторизован", { status: 401 });
  const store = r2();
  if (!store) return new NextResponse("хранилище R2 не настроено", { status: 500 });

  const key = new URL(req.url).searchParams.get("key") || "";
  // отдаём только файлы вкладки «Стратегия», и никаких выходов из папки
  if (!key.startsWith("strategy/") || key.includes("..")) return new NextResponse("нет файла", { status: 400 });

  const signed = await store.client.sign(`${store.base}/${key}?X-Amz-Expires=3600`, { method: "GET", aws: { signQuery: true } });
  return NextResponse.redirect(signed.url, 302);
}

/* Убрали файл из медиатеки — удаляем его и из хранилища, чтобы фото людей не оставались
   лежать без присмотра после того, как их убрали из CRM. */
export async function DELETE(req: Request) {
  if (!(await signedIn())) return NextResponse.json({ error: "не авторизован" }, { status: 401 });
  const store = r2();
  if (!store) return NextResponse.json({ error: "хранилище R2 не настроено" }, { status: 500 });

  const key = new URL(req.url).searchParams.get("key") || "";
  if (!key.startsWith("strategy/") || key.includes("..")) return NextResponse.json({ error: "нет файла" }, { status: 400 });

  const r = await store.client.fetch(`${store.base}/${key}`, { method: "DELETE" });
  // 404 — файла уже нет, это тоже результат
  if (!r.ok && r.status !== 404) return NextResponse.json({ error: `хранилище ответило ${r.status}` }, { status: 502 });
  return NextResponse.json({ ok: true });
}
