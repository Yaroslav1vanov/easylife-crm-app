#!/usr/bin/env python3
"""Instagram клиента или конкурента — через браузер с входом на сервере аудитов.

С IP нашего сервера Instagram без входа профиль не отдаёт (и yt-dlp часто тоже).
Мост на сервере аудитов открывает его в браузере, где выполнен вход, и только смотрит.

  python3 ~/bin/igprofile.py <ник или ссылка на профиль> [--videos N] [--out папка]
      → папка ig_<ник>/: REELS.md (последние ролики: дата, просмотры, лайки, комменты, ссылка),
        profile.json, thumbs/<код>.jpg (обложки), а с --videos N — mp4 N свежих своих роликов.
  python3 ~/bin/igprofile.py video <код или ссылка на ролик> [--out папка]
      → один ролик mp4 (в т.ч. 18+ и «чувствительные», которые без входа не отдаются).

Браузер один на всех (бот аудитов тоже им пользуется): один профиль на задачу, видео до 10 штук.
"""
import json, os, re, subprocess, sys, time, urllib.request
from datetime import datetime, timezone

KEY = "/srv/easylife-chat-agent/.ssh/id_igbridge"
HOST = "auditig@195.201.137.115"


def bridge(*args, timeout=300):
    r = subprocess.run(["ssh", "-i", KEY, "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=15",
                        HOST, *args], capture_output=True, text=True, timeout=timeout)
    out = (r.stdout or "").strip().splitlines()
    for line in reversed(out):
        line = line.strip()
        if line.startswith("{"):
            j = json.loads(line)
            if j.get("error"):
                err = j["error"]
                if "LOGIN" in err:
                    err += " — вход в Instagram на сервере аудитов слетел, напиши в ответе: «Ярославу перезайти в Instagram в браузере сервера аудитов»"
                raise SystemExit("Мост Instagram: " + err)
            return j
    raise SystemExit("Мост Instagram не ответил: " + ((r.stderr or "").strip()[-300:] or "пустой ответ"))


def fetch(url, path):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=120) as resp, open(path, "wb") as f:
        while True:
            b = resp.read(1 << 20)
            if not b:
                break
            f.write(b)


def code_of(s):
    m = re.search(r"/(?:reel|reels|p|tv)/([A-Za-z0-9_-]+)", s)
    return m.group(1) if m else s.strip().strip("/")


def handle_of(s):
    m = re.search(r"instagram\.com/([A-Za-z0-9._]+)", s)
    return (m.group(1) if m else s).strip().lstrip("@").strip("/").lower()


def opt(name, default=None):
    if name in sys.argv:
        i = sys.argv.index(name)
        v = sys.argv[i + 1] if i + 1 < len(sys.argv) else default
        del sys.argv[i:i + 2]
        return v
    return default


def video(code, out):
    os.makedirs(out, exist_ok=True)
    j = bridge("video", code)
    path = os.path.join(out, f"{code}.mp4")
    fetch(j["url"], path)
    print(f"{path}  ({j.get('author') or '?'}, {round(j.get('duration') or 0)} с)")
    return path


def main():
    out = opt("--out")
    n_videos = int(opt("--videos", "0") or 0)
    args = sys.argv[1:]
    if not args:
        print(__doc__); sys.exit(1)
    if args[0] == "video":
        if len(args) < 2:
            raise SystemExit("нужен код или ссылка на ролик")
        video(code_of(args[1]), out or ".")
        return

    h = handle_of(args[0])
    out = out or f"ig_{h}"
    os.makedirs(os.path.join(out, "thumbs"), exist_ok=True)
    j = bridge("reels", h)
    json.dump(j, open(os.path.join(out, "profile.json"), "w"), ensure_ascii=False, indent=1)
    reels = j.get("reels") or []
    rows = []
    for r in reels:
        d = datetime.fromtimestamp(r.get("taken_at") or 0, timezone.utc).strftime("%Y-%m-%d")
        who = "свой" if (r.get("owner") or "").lower() == h else f"коллаб от @{r.get('owner')}"
        if r.get("coauthors"):
            who += " + " + ", ".join("@" + c for c in r["coauthors"] if c.lower() != h)
        if r.get("thumb"):
            try:
                fetch(r["thumb"], os.path.join(out, "thumbs", f"{r['code']}.jpg"))
            except Exception:
                pass
        rows.append(f"| {d} | {r.get('plays') or 0:,} | {r.get('likes') or 0:,} | {r.get('comments') or 0:,} | {who}{' · закреп' if r.get('pinned') else ''} | "
                    f"https://www.instagram.com/reel/{r['code']}/ | thumbs/{r['code']}.jpg |".replace(",", " "))
    plays = sorted(r.get("plays") or 0 for r in reels if not r.get("pinned"))
    med = plays[len(plays) // 2] if plays else 0
    md = [f"# @{h} — последние ролики ({len(reels)})", "",
          f"Подписчиков: {j.get('followers') or '?'} · медиана просмотров (без закрепов): {med:,}".replace(",", " "),
          f"Снято {time.strftime('%Y-%m-%d %H:%M')} через браузер с входом. Подписи мост не отдаёт — смысл бери из обложек и расшифровки.", "",
          "| дата | просмотры | лайки | комм. | чей | ссылка | обложка |", "|---|---|---|---|---|---|---|", *rows]
    open(os.path.join(out, "REELS.md"), "w").write("\n".join(md) + "\n")
    print(f"{out}/REELS.md — {len(reels)} роликов, обложки в {out}/thumbs/")

    if n_videos:
        own = [r for r in reels if (r.get("owner") or "").lower() == h and not r.get("pinned")][:min(n_videos, 10)]
        for r in own:
            try:
                video(r["code"], out)
            except SystemExit as e:
                print(f"{r['code']}: {e}")
            time.sleep(3)


if __name__ == "__main__":
    main()
