#!/usr/bin/env python3
"""Докачать старый файл переписки, которого уже нет на диске сервера (ночная чистка удаляет файлы старше 14 дней).
   python3 ~/bin/getfile.py <key> files/<имя>"""
import pathlib, sys, requests
HOME = pathlib.Path("/srv/easylife-chat-agent")
ENV = dict(l.strip().split("=", 1) for l in open(HOME / ".env") if "=" in l and not l.startswith("#"))
key, dest = sys.argv[1], pathlib.Path(sys.argv[2])
r = requests.post(ENV["CRM_API_URL"].rstrip("/") + "/api/agent/chat", headers={"x-agent-secret": ENV["AGENT_SECRET"]}, json={"op": "download", "key": key}, timeout=60)
url = r.json()["url"]
dest.parent.mkdir(parents=True, exist_ok=True)
with requests.get(url, stream=True, timeout=600) as g:
    g.raise_for_status()
    with open(dest, "wb") as f:
        for c in g.iter_content(1 << 20):
            f.write(c)
print("ok", dest, dest.stat().st_size)
