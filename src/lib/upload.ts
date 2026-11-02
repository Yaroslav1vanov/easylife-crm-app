/* Загрузка файла клиента в R2 из браузера.
   До 64 МБ — одним куском, как раньше. Больше — частями по ~25 МБ (3 одновременно, каждая с повторами),
   чтобы гигабайтные исходники с айфона не начинались заново из-за обрыва и не упирались в часовую ссылку. */

const SMALL = 64 * 1024 * 1024;
const PARALLEL = 3;
const TRIES = 5;

function put(url: string, body: Blob, type: string | null, onLoaded: (n: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("PUT", url);
    if (type) x.setRequestHeader("Content-Type", type);
    x.upload.onprogress = (e) => { if (e.lengthComputable) onLoaded(e.loaded); };
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error(`хранилище ответило ${x.status}`)));
    x.onerror = () => reject(new Error("сеть оборвалась"));
    x.ontimeout = () => reject(new Error("таймаут"));
    x.send(body);
  });
}

async function api(body: Record<string, any>) {
  const r = await fetch("/api/client-files/multipart", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `ошибка ${r.status}`);
  return j;
}

export async function uploadClientFileWithProgress(clientId: number, category: string, file: File, type: string, onPct: (p: number) => void): Promise<string> {
  if (file.size <= SMALL) {
    const r = await fetch("/api/client-files", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, category, filename: file.name }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "не удалось подготовить загрузку");
    await put(j.uploadUrl, file, type, (n) => onPct(Math.round((n / file.size) * 100)));
    return j.key as string;
  }

  const partSize = Math.max(25 * 1024 * 1024, Math.ceil(file.size / 9000));
  const count = Math.ceil(file.size / partSize);
  const { key, uploadId } = await api({ op: "create", clientId, category, filename: file.name, contentType: type });
  const { urls } = await api({ op: "sign", key, uploadId, parts: Array.from({ length: count }, (_, i) => i + 1) });
  const loaded = new Array(count).fill(0);
  const report = () => onPct(Math.min(99, Math.round((loaded.reduce((a, b) => a + b, 0) / file.size) * 100)));

  let next = 0;
  async function worker() {
    while (next < count) {
      const i = next++;
      const blob = file.slice(i * partSize, Math.min(file.size, (i + 1) * partSize));
      for (let t = 1; ; t++) {
        try {
          await put(urls[i + 1], blob, null, (n) => { loaded[i] = n; report(); });
          loaded[i] = blob.size; report();
          break;
        } catch (e) {
          loaded[i] = 0; report();
          if (t >= TRIES) throw e;
          await new Promise((r) => setTimeout(r, 2000 * t));   // интернет мигнул — пробуем этот кусок ещё раз
        }
      }
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(PARALLEL, count) }, worker));
    await api({ op: "complete", key, uploadId, count });
  } catch (e) {
    api({ op: "abort", key, uploadId }).catch(() => null);
    throw e;
  }
  onPct(100);
  return key;
}
