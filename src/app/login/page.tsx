"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, resetClient } from "@/lib/supabase-browser";
import { isNetworkError, proxyOn, setProxy } from "@/lib/supabaseConfig";
import "@/styles/crm.css";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);

  /* Вход. Если браузер вообще не достучался до сервера авторизации («Failed to fetch»),
     включаем запасной путь через наш домен и пробуем ещё раз — у части провайдеров
     прямой адрес Supabase закрыт. */
  const signIn = async () => createClient().auth.signInWithPassword({ email, password });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError(null); setNote(null);
    let res = await signIn().catch(err => ({ data: { session: null }, error: err } as any));
    if (res.error && isNetworkError(res.error) && !proxyOn()) {
      setNote("Прямое подключение не прошло — пробую через резервный канал…");
      setProxy(true); resetClient();
      res = await signIn().catch(err => ({ data: { session: null }, error: err } as any));
      if (res.error) { setProxy(false); resetClient(); }
    }
    if (res.error) {
      setError(isNetworkError(res.error)
        ? "Нет связи с сервером CRM. Обычно это провайдер или антивирус: включите VPN либо мобильный интернет и попробуйте снова."
        : res.error.message === "Invalid login credentials" ? "Неверная почта или пароль" : res.error.message);
      setLoading(false); setNote(null); return;
    }
    if (res.data.session) { router.push("/dashboard"); router.refresh(); }
  };



  const inp: React.CSSProperties = { width: "100%", padding: "12px 14px", borderRadius: 12, fontSize: 15, outline: "none", background: "var(--inset)", border: "1px solid var(--brd)", color: "var(--t1)" };
  const lbl: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 800, letterSpacing: ".08em", marginBottom: 6, color: "var(--t3)" };

  return (
    <div className="auth-page">
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginBottom: 26 }}>
          <svg width={54} viewBox="0 0 745 605" aria-hidden><g fill="#c6ff1c"><path d="M316 0L745 0L691.6 94Q657 155 587 155L158 155L211.4 61Q246 0 316 0Z" /><path d="M235 225L545 225L491.6 319Q457 380 387 380L77 380L130.4 286Q165 225 235 225Z" /><path d="M158 450L642 450L588.6 544Q554 605 484 605L0 605L53.4 511Q88 450 158 450Z" /></g></svg>
          <h1 style={{ fontFamily: "var(--sans)", fontSize: 20, fontWeight: 800, letterSpacing: ".18em", color: "#fff" }}>EASYLIFE <span style={{ color: "var(--lime)" }}>AI</span></h1>
          <p style={{ fontSize: 12, letterSpacing: ".3em", fontWeight: 700, color: "#9e9bc8" }}>CRM PLATFORM</p>
        </div>
        <form onSubmit={handleLogin} className="zone-light" style={{ background: "#fff", borderRadius: 20, padding: 26, display: "flex", flexDirection: "column", gap: 16, boxShadow: "0 30px 80px rgba(0,0,0,.45)" }}>
          <div>
            <label style={lbl} htmlFor="login-email">EMAIL</label>
            <input id="login-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="your@email.com" style={inp} />
          </div>
          <div>
            <label style={lbl} htmlFor="login-pass">ПАРОЛЬ</label>
            <input id="login-pass" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" style={inp} />
          </div>
          {error && <div role="alert" style={{ fontSize: 13, textAlign: "center", padding: "9px 12px", borderRadius: 10, color: "var(--rd)", background: "rgba(var(--rd-rgb),0.1)" }}>{error}</div>}
          {note && <div style={{ fontSize: 13, textAlign: "center", padding: "9px 12px", borderRadius: 10, color: "var(--pu)", background: "var(--pud)" }}>{note}</div>}
          <button type="submit" disabled={loading}
            style={{ width: "100%", padding: "13px", borderRadius: 12, fontSize: 15, fontWeight: 800, border: 0, cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1, background: "var(--navy)", color: "var(--lime)" }}>{loading ? "Загрузка..." : "Войти"}</button>
          <div style={{ fontSize: 12.5, textAlign: "center", color: "var(--t3)" }}>Доступ выдаёт владелец в разделе «Команда»</div>
        </form>
      </div>
    </div>
  );
}
