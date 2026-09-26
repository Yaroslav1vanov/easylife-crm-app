"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, resetClient } from "@/lib/supabase-browser";
import { isNetworkError, proxyOn, setProxy } from "@/lib/supabaseConfig";

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



  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-sm px-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold"><span style={{ color: "var(--t1)" }}>Easy</span><span className="brand-gradient">Life</span><span style={{ color: "var(--t1)" }}> AI</span></h1>
          <p className="text-xs mt-1 tracking-[3px] font-semibold" style={{ color: "var(--cy)" }}>CRM PLATFORM</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-[11px] font-medium tracking-wider mb-1.5" style={{ color: "var(--t2)" }}>EMAIL</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="your@email.com"
              className="w-full px-4 py-3 rounded-xl text-sm outline-none" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)" }} />
          </div>
          <div>
            <label className="block text-[11px] font-medium tracking-wider mb-1.5" style={{ color: "var(--t2)" }}>ПАРОЛЬ</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••"
              className="w-full px-4 py-3 rounded-xl text-sm outline-none" style={{ background: "var(--inp)", border: "1px solid var(--brd)", color: "var(--t1)" }} />
          </div>
          {error && <div className="text-xs text-center px-3 py-2 rounded-lg" style={{ color: "#f87171", background: "rgba(239,68,68,0.1)" }}>{error}</div>}
          {note && <div className="text-xs text-center px-3 py-2 rounded-lg" style={{ color: "#42d4f4", background: "rgba(66,212,244,0.1)" }}>{note}</div>}
          <button type="submit" disabled={loading} className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, var(--cy), var(--pu))" }}>{loading ? "Загрузка..." : "Войти"}</button>
          <div className="text-[11px] text-center pt-1" style={{ color: "var(--t3)" }}>Доступ выдаёт владелец в разделе «Команда»</div>
        </form>
      </div>
    </div>
  );
}
