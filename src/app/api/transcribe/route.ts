import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { detectPlatform, instagramVideoUrl, instagramVideoUrlHiker, submitFile, transcribeLink, type Lang } from "@/lib/transcribe";

export const maxDuration = 60;

// Создаёт задачу транскрибации: файл (R2-ссылка) → AssemblyAI, ссылка на ролик → ScrapeCreators.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({} as any));
  const mode: "file" | "link" = b.mode === "link" ? "link" : "file";
  const url: string = (b.url || "").trim();
  const language: Lang = ["ru", "uk", "en", "auto"].includes(b.language) ? b.language : "auto";
  if (!url) return NextResponse.json({ error: "нет файла или ссылки" }, { status: 400 });

  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();

  const row: Record<string, any> = {
    client_id: b.clientId ? Number(b.clientId) : null,
    script_id: b.scriptId ? Number(b.scriptId) : null,
    title: (b.title || "").trim() || null,
    source_type: mode,
    source_url: url,
    file_name: b.fileName || null,
    language,
    status: "processing",
    created_by: user?.id || null,
  };

  if (mode === "link") {
    const r = await transcribeLink(url);
    if (r.ok) Object.assign(row, { status: "done", text: r.text, platform: r.platform, provider: "scrapecreators" });
    else {
      // Готовой расшифровки нет — пробуем сам ролик: прямая ссылка на видео → распознавание речи (AssemblyAI).
      // Так проходят открытые ролики, на которых провайдер отвечал «нет видео» (20.10.2026).
      // 1) ScrapeCreators (без входа) → 2) HikerAPI (через вошедшие аккаунты: 18+, пластика, медицина)
      const ig = detectPlatform(url) === "instagram";
      const video = ig ? (await instagramVideoUrl(url)) || (await instagramVideoUrlHiker(url)) : null;
      const f = video ? await submitFile(video, language) : null;
      Object.assign(row, f?.ok
        ? { platform: "instagram", provider: "assemblyai", provider_job_id: f.jobId }
        : { status: "error", error: r.error, provider: "scrapecreators" });
    }
  } else {
    const r = await submitFile(url, language);
    Object.assign(row, r.ok
      ? { provider: "assemblyai", provider_job_id: r.jobId }
      : { status: "error", error: r.error, provider: "assemblyai" });
  }

  const { data, error } = await sb.from("transcriptions").insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}
