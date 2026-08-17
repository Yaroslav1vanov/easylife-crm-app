"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

// Страница задания нового пароля. Сюда ведёт ссылка «Восстановление пароля» из письма:
// Supabase к этому моменту уже установил временную сессию, остаётся сохранить новый пароль.
export default function ResetPasswordPage() {
  const supabase = createClient();
  const router = useRouter();
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [ready, setReady] = useState(false);
  const [noSession, setNoSession] = useState(false);

  useEffect(() => {
    // Ссылка может отдавать токены как в hash (#access_token=…), так и через code —
    // клиент Supabase разбирает это сам, ждём появления сессии.
    let done = false;
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) { done = true; setReady(true); }
    };
    check();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) { done = true; setReady(true); }
    });
    const t = setTimeout(() => { if (!done) { setNoSession(true); setReady(true); } }, 2500);
    return () => { clearTimeout(t); sub.subscription.unsubscribe(); };
  }, []);

  async function save() {
    setErr(null);
    if (pass.length < 6) { setErr("Пароль должен быть минимум 6 символов"); return; }
    if (pass !== pass2) { setErr("Пароли не совпадают"); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pass });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setOk(true);
    setTimeout(() => router.push("/dashboard"), 1200);
  }

  const inp: React.CSSProperties = {
    width: "100%", padding: "12px 14px", borderRadius: 11, background: "var(--inp, rgba(255,255,255,0.05))",
    border: "1px solid var(--brd)", color: "var(--t1)", fontSize: 14, outline: "none",
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'Manrope', sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 380, background: "var(--side)", border: "1px solid var(--brd)", borderRadius: 18, padding: 28, display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontSize: 20, fontWeight: 800, color: "var(--t1)" }}>Новый пароль</h1>
          <p style={{ fontSize: 12, color: "var(--t3)", marginTop: 5 }}>Придумай пароль для входа в CRM</p>
        </div>

        {!ready ? (
          <div style={{ fontSize: 13, color: "var(--t2)" }}>Проверяю ссылку…</div>
        ) : noSession ? (
          <>
            <div style={{ fontSize: 12, color: "var(--or)", background: "rgba(255,174,66,0.08)", border: "1px solid rgba(255,174,66,0.35)", borderRadius: 10, padding: "11px 13px", lineHeight: 1.55 }}>
              Ссылка недействительна или устарела — она живёт 60 минут. Попроси прислать письмо заново.
            </div>
            <a href="/login" style={{ textAlign: "center", padding: "11px", borderRadius: 11, background: "linear-gradient(135deg, var(--cy), var(--pu))", color: "#fff", fontSize: 13, fontWeight: 800, textDecoration: "none" }}>На страницу входа</a>
          </>
        ) : ok ? (
          <div style={{ fontSize: 13, color: "var(--gr)", fontWeight: 700 }}>✓ Пароль сохранён. Открываю CRM…</div>
        ) : (
          <>
            <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="Новый пароль" autoFocus style={inp} />
            <input type="password" value={pass2} onChange={e => setPass2(e.target.value)} placeholder="Ещё раз" style={inp}
              onKeyDown={e => { if (e.key === "Enter") save(); }} />
            {err && <div style={{ fontSize: 12, color: "var(--rd)" }}>{err}</div>}
            <button onClick={save} disabled={busy}
              style={{ padding: "12px", borderRadius: 11, background: "linear-gradient(135deg, var(--cy), var(--pu))", border: "none", color: "#fff", fontSize: 13, fontWeight: 800, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}>
              {busy ? "Сохраняю…" : "Сохранить пароль"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
