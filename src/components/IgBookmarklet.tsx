"use client";
import { useEffect, useRef, useState } from "react";
import { Bookmark } from "lucide-react";

/* Закладка «В CRM: транскрибация». Нужна для роликов, которые сервисы без входа не отдают:
   18+, «чувствительный» контент (пластика, медицина), закрытые аккаунты. Работает через вход сотрудника
   в Instagram в его же браузере: берёт видео ролика и отправляет на страницу-приёмник CRM. */
const CODE = `(async()=>{const m=location.pathname.match(/\\/(reel|reels|p|tv)\\/([A-Za-z0-9_-]+)/);if(!m){alert('Откройте сам ролик в Instagram и нажмите закладку ещё раз');return}const c=m[2];const w=window.open('${"https://crm.easylifeai.biz"}/dashboard/transcribe/receive','easylife_tr');const A='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';let id=0n;for(const ch of c)id=id*64n+BigInt(A.indexOf(ch));try{const j=await fetch('/api/v1/media/'+id+'/info/',{headers:{'X-IG-App-ID':'936619743392459','X-Requested-With':'XMLHttpRequest'},credentials:'include'}).then(r=>r.json());const it=j.items[0];const v=(it.video_versions||[]).slice().sort((a,b)=>b.width-a.width)[0]||(it.carousel_media||[]).map(x=>(x.video_versions||[])[0]).find(Boolean);if(!v){alert('В этой публикации нет видео');w&&w.close();return}const b=await fetch(v.url).then(r=>r.blob());const msg={type:'easylife-reel',code:c,url:'https://www.instagram.com/reel/'+c+'/',author:it.user&&it.user.username,caption:(it.caption&&it.caption.text||'').slice(0,300),duration:it.video_duration,blob:b};const send=e=>{if(e.origin==='https://crm.easylifeai.biz'&&e.data&&e.data.type==='easylife-ready'){w.postMessage(msg,'https://crm.easylifeai.biz');window.removeEventListener('message',send)}};window.addEventListener('message',send)}catch(e){alert('Не получилось взять ролик: '+e)}})()`;

export default function IgBookmarklet() {
  const a = useRef<HTMLAnchorElement>(null);
  const [open, setOpen] = useState(false);
  // React не даёт javascript: в href — ставим напрямую
  useEffect(() => { a.current?.setAttribute("href", "javascript:" + encodeURIComponent(CODE)); }, [open]);
  return (
    <div style={{ border: "1px dashed var(--brd)", borderRadius: 12, padding: "10px 12px", marginBottom: 14, fontSize: 12.5, color: "var(--t2)" }}>
      <button onClick={() => setOpen(o => !o)} style={{ background: "none", border: 0, padding: 0, cursor: "pointer", color: "var(--t1)", fontWeight: 800, display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit", fontSize: 13 }}>
        <Bookmark size={14} /> Ролик не берётся по ссылке? Закладка «В CRM: транскрибация» {open ? "▾" : "▸"}
      </button>
      {open && (
        <div style={{ marginTop: 8, lineHeight: 1.6 }}>
          Instagram не отдаёт без входа ролики 18+ и «чувствительные» (пластика, медицина, похудение) — их не скачает ни один сервис по ссылке.
          Закладка берёт ролик через ваш вход в Instagram прямо в браузере.
          <ol style={{ margin: "6px 0 0 18px" }}>
            <li>Перетащите эту кнопку на панель закладок (один раз): <a ref={a} onClick={e => { e.preventDefault(); alert("Не нажимайте здесь — перетащите кнопку на панель закладок браузера"); }}
              style={{ display: "inline-block", padding: "3px 10px", borderRadius: 8, background: "var(--pud)", color: "var(--pu)", fontWeight: 800, cursor: "grab", textDecoration: "none" }}>В CRM: транскрибация</a></li>
            <li>Откройте ролик в Instagram (вы вошли в свой аккаунт) и нажмите закладку.</li>
            <li>Откроется вкладка CRM — ролик загрузится и встанет в список ниже, текст через 1–2 минуты.</li>
          </ol>
          <div style={{ color: "var(--t3)", marginTop: 4 }}>Панели закладок не видно — Ctrl+Shift+B (Windows) или ⌘+Shift+B (Mac). Работает в Chrome на компьютере.</div>
        </div>
      )}
    </div>
  );
}
