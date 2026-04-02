"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError(null);
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) { setError(err.message); setLoading(false); return; }
    if (data.session) { router.push("/dashboard"); router.refresh(); }
  };

  const handleSignUp = async () => {
    setLoading(true); setError(null);
    const { error: err } = await supabase.auth.signUp({ email, password });
    if (err) setError(err.message);
    else alert("Проверьте email для подтверждения!");
    setLoading(false);
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
          <button type="submit" disabled={loading} className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, var(--cy), var(--pu))" }}>{loading ? "Загрузка..." : "Войти"}</button>
          <button type="button" onClick={handleSignUp} disabled={loading} className="w-full py-3 rounded-xl text-sm font-medium disabled:opacity-50"
            style={{ color: "var(--t2)", border: "1px solid var(--brd)", background: "transparent" }}>Создать аккаунт</button>
        </form>
      </div>
    </div>
  );
}
