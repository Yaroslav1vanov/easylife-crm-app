"use client";
import { useEffect, useState } from "react";
import { SUPABASE_ANON, browserSupabaseUrl, proxyOn, setProxy } from "@/lib/supabaseConfig";

/* Если браузер сотрудника не достаёт до базы напрямую (провайдер, антивирус,
   корпоративный фильтр) — молча переключаем вкладку на запасной канал через наш
   домен и перезагружаем страницу. Иначе CRM выглядит «сломанной»: пустые списки
   и «таблица не готова». */
export default function ConnectionGuard() {
  const [down, setDown] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ping = async (base: string) => {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 8000);
        try {
          const r = await fetch(`${base}/auth/v1/health`, { headers: { apikey: SUPABASE_ANON }, signal: ctl.signal, cache: "no-store" });
          return r.ok;
        } catch { return false; } finally { clearTimeout(t); }
      };
      if (await ping(browserSupabaseUrl())) return;
      if (cancelled) return;
      if (!proxyOn()) {                      // пробуем запасной канал через наш домен
        if (await ping(`${window.location.origin}/sb`)) { setProxy(true); window.location.reload(); return; }
      }
      if (!cancelled) setDown(true);
    })();
    return () => { cancelled = true; };
  }, []);

  if (!down) return null;
  return (
    <div style={{ position: "fixed", left: 12, right: 12, bottom: 12, zIndex: 300, maxWidth: 520, margin: "0 auto",
      background: "rgba(255,92,122,0.12)", border: "1px solid rgba(255,92,122,0.45)", borderRadius: 12, padding: "10px 13px",
      fontSize: 12.5, color: "var(--t1)", lineHeight: 1.5 }}>
      Нет связи с базой CRM — списки могут быть пустыми. Обычно это провайдер или антивирус: включите VPN либо мобильный интернет и обновите страницу.
    </div>
  );
}
