"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import db, { Client, TeamMember } from "@/lib/database";
import { myClients } from "@/lib/scope";
import { useRole } from "@/components/RoleContext";
import { Search, FileText, Film, Flame, Send, X, Loader2 } from "lucide-react";

/* Поиск по всей CRM: сценарии (хук, текст, призыв, описание, расшифровка рефа), референсы, готовые ролики без сценария.
   Открывается кнопкой «Поиск» в меню или Cmd/Ctrl+K на любой странице. Каждый видит только своих клиентов
   (как на досках: тимлид — свои, монтажёр — свои и открытые ему). */

export const openGlobalSearch = () => window.dispatchEvent(new Event("crm:search"));

type Hit = { kind: "script" | "ref" | "pub"; id: number; client_id: number; title: string; snippet: string; meta: string; video?: string | null; href: string };

const ST: Record<string, string> = { notStarted: "идея", inProgress: "пишется", review: "на согласовании", approved: "согласован" };
const VS: Record<string, string> = { notStarted: "", inProgress: "в монтаже", review: "монтаж на проверке", ready: "ролик готов", published: "вышел" };
const clean = (q: string) => q.replace(/[,()%*"\\]/g, " ").replace(/\s+/g, " ").trim();

/** Кусок текста вокруг найденного слова. */
function around(text: string, q: string, n = 90) {
  const t = text.replace(/\s+/g, " ").trim();
  const i = t.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return t.slice(0, n * 2);
  const a = Math.max(0, i - n), b = Math.min(t.length, i + q.length + n);
  return (a > 0 ? "…" : "") + t.slice(a, b) + (b < t.length ? "…" : "");
}
function Mark({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
  return <>{parts.map((p, i) => p.toLowerCase() === q.toLowerCase() ? <mark key={i} style={{ background: "rgba(245,196,81,.35)", color: "inherit", borderRadius: 3, padding: "0 1px" }}>{p}</mark> : <span key={i}>{p}</span>)}</>;
}

export default function GlobalSearch() {
  const supabase = createClient();
  const router = useRouter();
  const role = useRole();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [me, setMe] = useState<TeamMember | null>(null);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen(true); }
      if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("crm:search", onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("crm:search", onOpen); };
  }, []);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => input.current?.focus(), 30);
    if (clients.length) return;
    (async () => {
      const [cls, { data: { user } }] = await Promise.all([db.getClients(supabase), supabase.auth.getUser()]);
      setClients(cls);
      if (user) { const { data } = await supabase.from("team_members").select("*").eq("profile_id", user.id).maybeSingle(); setMe((data as TeamMember) || null); }
    })();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const scope = useMemo(() => myClients(role, me, clients), [role, me, clients]);
  const nameOf = useMemo(() => Object.fromEntries(clients.map(c => [c.id, `${c.name} ${c.surname || ""}`.trim()])), [clients]);

  // поиск с задержкой — не дёргаем базу на каждую букву
  useEffect(() => {
    const term = clean(q);
    if (!open || term.length < 2 || !scope.length) { setHits(null); return; }
    const ids = scope.map(c => c.id);
    const t = setTimeout(async () => {
      setBusy(true);
      const like = `"*${term}*"`;   // формат фильтра PostgREST: звёздочки — любые символы, кавычки — для пробелов
      const sf = ["hook_text", "hook", "body_text", "cta", "post_caption", "description", "ref_text", "transcription"];
      const [sc, rf, pb] = await Promise.all([
        supabase.from("scripts").select("id, client_id, month_number, order_num, hook, hook_text, body_text, cta, post_caption, description, ref_text, transcription, script_status, video_status, pub_date, video_url")
          .in("client_id", ids).or(sf.map(f => `${f}.ilike.${like}`).join(",")).order("id", { ascending: false }).limit(40),
        supabase.from("reference_videos").select("id, client_id, url, author, caption, transcript, note, views")
          .in("client_id", ids).or(["caption", "transcript", "note", "author"].map(f => `${f}.ilike.${like}`).join(",")).order("id", { ascending: false }).limit(15),
        supabase.from("publications").select("id, client_id, content_type, base_text, caption_ig, publish_at, pub_status, video_url")
          .in("client_id", ids).is("script_id", null).or(["base_text", "caption_ig"].map(f => `${f}.ilike.${like}`).join(",")).order("id", { ascending: false }).limit(15),
      ]);
      const out: Hit[] = [];
      for (const s of (sc.data || []) as any[]) {
        const field = sf.find(f => String(s[f] || "").toLowerCase().includes(term.toLowerCase())) || "body_text";
        const where = { hook_text: "хук", hook: "заголовок", body_text: "текст", cta: "призыв", post_caption: "описание", description: "заметка", ref_text: "текст рефа", transcription: "расшифровка рефа" }[field];
        const toMontage = role === "montager" || s.script_status === "approved";
        out.push({ kind: "script", id: s.id, client_id: s.client_id, title: (s.hook_text || s.hook || "Без заголовка").replace(/\s+/g, " ").slice(0, 90),
          snippet: around(String(s[field] || ""), term), video: s.video_url,
          meta: [`М${s.month_number}${s.order_num ? ` · #${s.order_num}` : ""}`, VS[s.video_status] || ST[s.script_status], s.pub_date ? `выход ${s.pub_date.slice(8, 10)}.${s.pub_date.slice(5, 7)}` : "", `нашлось в: ${where}`].filter(Boolean).join(" · "),
          href: `/dashboard/${toMontage ? "montage" : "scripts"}?open=${s.id}` });
      }
      for (const r of (rf.data || []) as any[]) {
        const txt = [r.caption, r.transcript, r.note, r.author].find((x: any) => String(x || "").toLowerCase().includes(term.toLowerCase())) || "";
        out.push({ kind: "ref", id: r.id, client_id: r.client_id, title: r.author ? `Реф @${String(r.author).replace(/^@/, "")}` : "Референс", snippet: around(String(txt), term),
          meta: r.views ? `${Number(r.views).toLocaleString("ru")} просмотров` : "референс", href: "/dashboard/references" });
      }
      for (const p of (pb.data || []) as any[]) {
        out.push({ kind: "pub", id: p.id, client_id: p.client_id, title: p.content_type === "story" ? "Сторис" : p.content_type === "carousel" ? "Карусель" : "Готовый ролик (без сценария)",
          snippet: around(String(p.base_text || p.caption_ig || ""), term), video: p.video_url,
          meta: [p.publish_at ? `выход ${p.publish_at.slice(8, 10)}.${p.publish_at.slice(5, 7)}` : "", p.pub_status === "published" ? "вышел" : "в публикациях"].filter(Boolean).join(" · "), href: "/dashboard/publications" });
      }
      setHits(out); setSel(0); setBusy(false);
    }, 280);
    return () => clearTimeout(t);
  }, [q, open, scope]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (h: Hit) => { setOpen(false); router.push(h.href); };

  if (!open) return null;
  const term = clean(q);
  const Icon = (k: Hit["kind"]) => (k === "script" ? FileText : k === "ref" ? Flame : Send);

  return (
    <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 1000, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "8vh 12px 12px" }}>
      <div onClick={e => e.stopPropagation()} className="v2-card" style={{ width: "min(720px, 100%)", maxHeight: "80vh", display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: "1px solid var(--brd)" }}>
          {busy ? <Loader2 size={18} className="spin" style={{ color: "var(--t3)" }} /> : <Search size={18} style={{ color: "var(--t3)" }} />}
          <input ref={input} value={q} onChange={e => setQ(e.target.value)} placeholder="Слово или фраза из сценария, описания, рефа… например «капельница»"
            onKeyDown={e => {
              if (!hits?.length) return;
              if (e.key === "ArrowDown") { e.preventDefault(); setSel(s => Math.min(hits.length - 1, s + 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
              if (e.key === "Enter") { e.preventDefault(); go(hits[sel]); }
            }}
            style={{ flex: 1, border: 0, outline: "none", background: "transparent", color: "var(--t1)", fontSize: 15, fontFamily: "inherit" }} />
          <button onClick={() => setOpen(false)} style={{ background: "none", border: 0, color: "var(--t3)", cursor: "pointer" }}><X size={16} /></button>
        </div>
        <div style={{ overflowY: "auto", padding: 8 }}>
          {term.length < 2 && <div style={{ padding: 16, fontSize: 13, color: "var(--t3)", lineHeight: 1.6 }}>
            Ищет по всем вашим клиентам: хуки, тексты и призывы сценариев, описания к роликам, расшифровки референсов, готовые ролики без сценария.<br />
            Стрелки ↑↓ — выбрать, Enter — открыть. Открыть поиск с любой страницы: <b>Cmd + K</b> (на Windows <b>Ctrl + K</b>).
          </div>}
          {term.length >= 2 && hits && !hits.length && !busy && <div style={{ padding: 16, fontSize: 13, color: "var(--t3)" }}>Ничего не нашлось по «{term}». Попробуйте часть слова: «капельн» найдёт и «капельница», и «капельницу».</div>}
          {hits?.map((h, i) => { const I = Icon(h.kind); return (
            <div key={h.kind + h.id} onMouseEnter={() => setSel(i)} onClick={() => go(h)}
              style={{ display: "flex", gap: 10, padding: "10px 10px", borderRadius: 10, cursor: "pointer", background: i === sel ? "var(--pud)" : "transparent" }}>
              <I size={16} style={{ color: h.kind === "script" ? "var(--pu)" : h.kind === "ref" ? "var(--or)" : "var(--cy)", marginTop: 2, flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><Mark text={h.title} q={term} /></span>
                  <span style={{ fontSize: 11.5, color: "var(--t3)", whiteSpace: "nowrap", marginLeft: "auto" }}>{nameOf[h.client_id] || ""}</span>
                </div>
                <div style={{ fontSize: 12.5, color: "var(--t2)", marginTop: 3, lineHeight: 1.45 }}><Mark text={h.snippet} q={term} /></div>
                <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 3, display: "flex", gap: 10, alignItems: "center" }}>
                  <span>{h.meta}</span>
                  {h.video && <a href={h.video} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: "var(--cy)", display: "inline-flex", gap: 4, alignItems: "center" }}><Film size={11} /> смотреть ролик</a>}
                </div>
              </div>
            </div>
          ); })}
        </div>
      </div>
    </div>
  );
}
