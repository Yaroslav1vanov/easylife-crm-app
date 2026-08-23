import { NextResponse } from "next/server";
import { AwsClient } from "aws4fetch";

// Выдаёт подписанную ссылку для прямой загрузки видео в R2 (браузер/бот грузит мимо нашего сервера).
export async function POST(req: Request) {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicBase = process.env.R2_PUBLIC_URL;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBase)
    return NextResponse.json({ error: "R2_* переменные не заданы в окружении" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const kind: string = ["image","audio"].includes(body.kind) ? body.kind : "video";   // image — карусель, audio — файл на транскрибацию
  const filename: string = body.filename || (kind === "image" ? "slide.jpg" : kind === "audio" ? "audio.mp3" : "video.mp4");
  const clientId = body.clientId ?? "x";
  const scriptId = body.scriptId ?? Date.now();
  const defExt = kind === "image" ? "jpg" : kind === "audio" ? "mp3" : "mp4";
  const ext = (filename.split(".").pop() || defExt).toLowerCase().replace(/[^a-z0-9]/g, "") || defExt;
  const rand = Math.random().toString(36).slice(2, 8);
  const folder = kind === "image" ? "images" : kind === "audio" ? "transcribe" : "videos";
  const key = `${folder}/${clientId}/${scriptId}-${rand}.${ext}`;

  const r2 = new AwsClient({ accessKeyId, secretAccessKey, region: "auto", service: "s3" });
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`;
  const signed = await r2.sign(`${endpoint}?X-Amz-Expires=3600`, { method: "PUT", aws: { signQuery: true } });

  const publicUrl = `${publicBase.replace(/\/$/, "")}/${key}`;
  return NextResponse.json({ uploadUrl: signed.url, publicUrl, key });
}
