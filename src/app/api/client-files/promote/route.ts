import { NextResponse } from "next/server";
import { AwsClient } from "aws4fetch";
import { createClient } from "@/lib/supabase-server";

/*
 * Перекладывает файл из чата клиента (закрытая папка strategy/{клиент}/…) в открытую папку
 * videos/ или images/ — туда, откуда его берут «Монтаж», «Публикации» и Metricool.
 * Нужна, чтобы ролик или кадры сторис, которые сделал ИИ, не приходилось скачивать и загружать заново.
 *
 *   POST { key, clientId, label? } → { publicUrl }
 * Копирование идёт внутри хранилища, через наш сервер файл не проходит.
 */
export async function POST(req: Request) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "не авторизован" }, { status: 401 });

  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !R2_PUBLIC_URL)
    return NextResponse.json({ error: "хранилище R2 не настроено" }, { status: 500 });

  const b = await req.json().catch(() => ({}));
  const clientId = Number(b.clientId);
  const key = String(b.key || "");
  if (!clientId || !key.startsWith(`strategy/${clientId}/`) || key.includes(".."))
    return NextResponse.json({ error: "файл не из папки этого клиента" }, { status: 400 });

  const ext = (key.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
  const isImage = ["png", "jpg", "jpeg", "webp", "gif"].includes(ext);
  const isVideo = ["mp4", "mov", "webm", "m4v"].includes(ext);
  if (!isImage && !isVideo) return NextResponse.json({ error: "можно переложить только видео или картинку" }, { status: 400 });

  const label = String(b.label || "ai").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "ai";
  const dest = `${isImage ? "images" : "videos"}/${clientId}/${label}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const r2 = new AwsClient({ accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, region: "auto", service: "s3" });
  const base = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}`;
  const res = await r2.fetch(`${base}/${dest}`, {
    method: "PUT",
    headers: { "x-amz-copy-source": `/${R2_BUCKET}/${key.split("/").map(encodeURIComponent).join("/")}` },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return NextResponse.json({ error: `хранилище не скопировало файл (${res.status}) ${t.slice(0, 200)}` }, { status: 502 });
  }
  return NextResponse.json({ publicUrl: `${R2_PUBLIC_URL.replace(/\/$/, "")}/${dest}`, key: dest });
}
