/* Загрузка и открытие файлов вкладки «Стратегия». Файл уходит прямо в R2, мимо нашего сервера. */

export async function uploadClientFile(clientId: number, category: string, file: File): Promise<string> {
  const r = await fetch("/api/client-files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, category, filename: file.name }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "не удалось подготовить загрузку");
  // тип файла указываем явно — иначе HTML-аудит откроется как текст, а не как страница
  const put = await fetch(j.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type || guessType(file.name) } });
  if (!put.ok) throw new Error("хранилище не приняло файл");
  return j.key as string;
}

export const fileUrl = (key: string) => `/api/client-files?key=${encodeURIComponent(key)}`;

export function guessType(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  return ({ html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8", pdf: "application/pdf", md: "text/markdown; charset=utf-8",
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", mp4: "video/mp4", mov: "video/quicktime",
    ttf: "font/ttf", otf: "font/otf", woff: "font/woff", woff2: "font/woff2", svg: "image/svg+xml" } as Record<string, string>)[ext || ""]
    || "application/octet-stream";
}

export const kindOf = (name: string): "image" | "video" | "font" | "other" => {
  const t = guessType(name);
  return t.startsWith("image/") ? "image" : t.startsWith("video/") ? "video" : t.startsWith("font/") ? "font" : "other";
};

export const when = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
