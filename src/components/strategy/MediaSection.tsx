"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { notify } from "@/components/NoticeHost";
import { btn } from "./DocsSection";
import { uploadClientFile, fileUrl, kindOf, deleteClientFile } from "./files";

/*
 * Медиатека клиента: фото, видео, логотипы, шрифты, с которыми работают команда и ИИ.
 * Пометки важнее папок: фото с лицом без согласия в производство не идёт — это защита от иска.
 */

type Asset = {
  id: number; file_key: string; category: string; kind: string; title: string | null; tags: string[];
  has_face: boolean; consent: string; source: string; usable: boolean; created_at: string;
};

const CATEGORIES: [string, string][] = [
  ["portrait", "Портреты"], ["process", "Процесс"], ["location", "Локация"], ["result", "Результаты"],
  ["review", "Отзывы"], ["logo", "Логотипы"], ["font", "Шрифты"], ["generated", "Сделано ИИ"], ["story", "Готовые сторис"], ["other", "Другое"],
];
const CAT = Object.fromEntries(CATEGORIES);
const CONSENT: Record<string, [string, string]> = {
  yes: ["согласие есть", "var(--gr)"], no: ["согласия нет", "var(--rd)"],
  not_needed: ["не требуется", "var(--t3)"], unknown: ["согласие ?", "var(--or)"],
};

/** Тема (папка), которую поставил ИИ при разборе: тег «тема:IV drip». */
const topicOf = (a: Asset) => (a.tags || []).find((t) => t.toLowerCase().startsWith("тема:"))?.slice(5).trim() || null;
/** Файл уже разобран ИИ: есть тег «разобрано». */
const sorted = (a: Asset) => (a.tags || []).some((t) => t.toLowerCase() === "разобрано");

/** Файл можно брать в производство? Лицо без подтверждённого согласия — нельзя. */
const blocked = (a: Asset) => !a.usable || (a.has_face && a.consent !== "yes" && a.consent !== "not_needed");

export default function MediaSection({ clientId }: { clientId: number }) {
  const supabase = createClient();
  const [items, setItems] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [category, setCategory] = useState("other");
  const [asking, setAsking] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [edit, setEdit] = useState<Asset | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function load() {
    const { data } = await supabase.from("client_assets").select("*").eq("client_id", clientId).order("created_at", { ascending: false });
    setItems((data ?? []) as Asset[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, [clientId]);

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    const { data: { user } } = await supabase.auth.getUser();
    let done = 0;
    for (const file of files) {
      setProgress(`Загружаю ${done + 1} из ${files.length}…`);
      try {
        const key = await uploadClientFile(clientId, category, file);
        await supabase.from("client_assets").insert({
          client_id: clientId, file_key: key, category, kind: kindOf(file.name), title: file.name,
          // портреты и результаты почти всегда с лицом — лучше перестраховаться и спросить про согласие
          has_face: category === "portrait" || category === "result",
          source: category === "generated" ? "ai" : "team", created_by: user?.id ?? null,
        });
        done++;
      } catch (err: any) {
        notify(`${file.name}: ${err.message ?? err}`);
      }
    }
    setProgress(null);
    notify(`Загружено: ${done} из ${files.length}`);
    load();
  }

  async function saveEdit(a: Asset) {
    const { error } = await supabase.from("client_assets").update({
      category: a.category, has_face: a.has_face, consent: a.consent, source: a.source, usable: a.usable, tags: a.tags, title: a.title,
    }).eq("id", a.id);
    if (error) return notify(`Не сохранилось: ${error.message}`);
    setEdit(null); load();
  }

  async function remove(a: Asset) {
    if (!confirm("Удалить файл из медиатеки? Он удалится и из хранилища — вернуть не получится.")) return;
    const { error } = await supabase.from("client_assets").delete().eq("id", a.id);
    if (error) return notify(`Не удалилось: ${error.message}`);
    try { await deleteClientFile(a.file_key); }
    catch (e: any) { notify(`Из медиатеки убрано, но файл в хранилище остался: ${e.message}`); }
    setEdit(null); load();
  }

  /* Разбор с ИИ: задача уходит в чат «Стратегия» этого клиента. ИИ смотрит каждый новый файл,
     подписывает, раскладывает по темам (у клиники — по процедурам) и запоминает лучшие моменты. */
  async function askAI() {
    const fresh = items.filter((a) => !sorted(a) && (a.kind === "image" || a.kind === "video"));
    if (!fresh.length) return notify("Все файлы уже разобраны ИИ");
    setAsking(true);
    const { data: c } = await supabase.from("clients").select("ai_chat").eq("id", clientId).maybeSingle();
    if (!c?.ai_chat) { setAsking(false); return notify("У клиента выключен ИИ: «Настройки» карточки → «ИИ-монтажёр в чате»"); }
    const { data: { user } } = await supabase.auth.getUser();
    const { data: tm } = user ? await supabase.from("team_members").select("name").eq("profile_id", user.id).maybeSingle() : { data: null };
    const { error } = await supabase.from("client_chat_messages").insert({
      client_id: clientId, author_type: "user", author_id: user?.id ?? null, author_name: tm?.name || user?.email?.split("@")[0] || "Сотрудник",
      thread: "strategy", ai_status: "queued", attachments: [],
      body: `Разбери медиатеку клиента: новых файлов ${fresh.length} (${fresh.filter((a) => a.kind === "video").length} видео, ${fresh.filter((a) => a.kind === "image").length} фото). ` +
        "Посмотри каждый, подпиши что на нём, разложи по темам (для клиники — по процедурам/услугам), отметь лучшие моменты и куда годится (рилс, сторис). Сохрани в LIBRARY.md и обнови подписи в CRM.",
    });
    setAsking(false);
    if (error) return notify(`Не отправилось: ${error.message}`);
    notify("Отправлено ИИ — результат придёт в «Чат · ИИ» → «Стратегия», подписи и темы появятся здесь");
  }

  const topics = Array.from(new Set(items.map(topicOf).filter(Boolean))) as string[];
  const unsortedCount = items.filter((a) => !sorted(a) && (a.kind === "image" || a.kind === "video")).length;
  const shown = filter === "all" ? items : filter === "blocked" ? items.filter(blocked) : filter === "unsorted" ? items.filter((a) => !sorted(a))
    : filter.startsWith("topic:") ? items.filter((a) => topicOf(a) === filter.slice(6)) : items.filter((a) => a.category === filter);
  const blockedCount = items.filter(blocked).length;

  if (loading) return <p style={{ color: "var(--t3)", fontSize: 13 }}>Загружаю…</p>;

  return (
    <div>
      <p style={{ color: "var(--t3)", fontSize: 12.5, marginBottom: 14, lineHeight: 1.5 }}>
        Сюда загружайте всё — видео и фото для рилс и сторис, в одно место. Нажмите «Разобрать с ИИ»: он посмотрит каждый файл,
        подпишет, разложит по темам (у клиники — по процедурам) и потом сам возьмёт нужные кадры в монтаж и сторис.
        Фото с лицом без согласия помечается красным и в производство не идёт.
      </p>

      <div className="v2-card" style={{ padding: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "var(--t2)" }}>Тип (можно не выбирать):</span>
        <select value={category} onChange={(e) => setCategory(e.target.value)}
          style={{ background: "var(--v2-inset)", color: "var(--t1)", border: "1px solid var(--brd)", borderRadius: 9, padding: "7px 10px", fontSize: 13 }}>
          {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button className="v2-act" style={btn(true)} disabled={!!progress} onClick={() => input.current?.click()}>
          {progress ?? "Загрузить файлы"}
        </button>
        <input ref={input} type="file" hidden multiple accept="image/*,video/*,.ttf,.otf,.woff,.woff2,.svg" onChange={onFiles} />
        <button className="v2-act" style={{ ...btn(false), marginLeft: "auto" }} disabled={asking || !unsortedCount} onClick={askAI}
          title="ИИ посмотрит новые файлы, подпишет и разложит по темам">
          {asking ? "Отправляю…" : unsortedCount ? `✨ Разобрать с ИИ · ${unsortedCount}` : "✓ Всё разобрано ИИ"}
        </button>
      </div>

      <div className="flex gap-1 flex-wrap" style={{ margin: "12px 0" }}>
        <Chip on={filter === "all"} onClick={() => setFilter("all")}>Все · {items.length}</Chip>
        {unsortedCount > 0 && <Chip on={filter === "unsorted"} onClick={() => setFilter("unsorted")}>Не разобрано · {unsortedCount}</Chip>}
        {topics.map((t) => (
          <Chip key={t} on={filter === "topic:" + t} onClick={() => setFilter("topic:" + t)}>📁 {t} · {items.filter((a) => topicOf(a) === t).length}</Chip>
        ))}
        {blockedCount > 0 && <Chip on={filter === "blocked"} onClick={() => setFilter("blocked")} warn>Не в производство · {blockedCount}</Chip>}
        {CATEGORIES.filter(([v]) => items.some((a) => a.category === v)).map(([v, l]) => (
          <Chip key={v} on={filter === v} onClick={() => setFilter(v)}>{l} · {items.filter((a) => a.category === v).length}</Chip>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="v2-card" style={{ padding: 22, textAlign: "center", color: "var(--t3)", fontSize: 13 }}>
          {items.length ? "В этой категории пусто." : "Медиатека пуста. Загрузи фото эксперта, процесса, локации."}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
          {shown.map((a) => (
            <button key={a.id} onClick={() => setEdit({ ...a })} style={{ padding: 0, border: `1px solid ${blocked(a) ? "var(--rd)" : "var(--brd)"}`,
              borderRadius: 12, overflow: "hidden", background: "var(--v2-card)", cursor: "pointer", textAlign: "left" }}>
              <div style={{ aspectRatio: "4 / 5", background: "var(--v2-inset)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                {a.kind === "image" ? <img src={fileUrl(a.file_key)} alt={a.title ?? ""} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : a.kind === "video" ? <video src={fileUrl(a.file_key)} muted preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <span style={{ fontSize: 12, color: "var(--t3)" }}>{a.kind === "font" ? "Шрифт" : "Файл"}</span>}
              </div>
              <div style={{ padding: "7px 8px" }}>
                {topicOf(a) && <div style={{ fontSize: 10.5, color: "var(--pu)", fontWeight: 800 }}>📁 {topicOf(a)}</div>}
                {a.title && <div style={{ fontSize: 11, color: "var(--t1)", lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{a.title}</div>}
                <div style={{ fontSize: 10.5, color: "var(--t3)", fontWeight: 700 }}>{CAT[a.category] ?? a.category}{a.source === "ai" ? " · ИИ" : ""}{sorted(a) ? " · разобрано" : ""}</div>
                {a.has_face && <div style={{ fontSize: 10.5, fontWeight: 700, color: CONSENT[a.consent]?.[1] }}>лицо · {CONSENT[a.consent]?.[0]}</div>}
                {blocked(a) && <div style={{ fontSize: 10.5, fontWeight: 800, color: "var(--rd)" }}>не в производство</div>}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* карточка файла: пометки */}
      {edit && (
        <div onClick={() => setEdit(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} className="v2-card" style={{ maxWidth: 440, width: "100%", padding: 16, maxHeight: "90vh", overflow: "auto" }}>
            <div className="tt">{edit.title}</div>
            <a href={fileUrl(edit.file_key)} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--cy)" }}>открыть оригинал ↗</a>

            <Field label="Категория">
              <select value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} style={sel}>
                {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="На фото есть лицо">
              <label style={{ fontSize: 13, color: "var(--t2)" }}><input type="checkbox" checked={edit.has_face} onChange={(e) => setEdit({ ...edit, has_face: e.target.checked })} /> да</label>
            </Field>
            <Field label="Согласие на соцсети">
              <select value={edit.consent} onChange={(e) => setEdit({ ...edit, consent: e.target.value })} style={sel}>
                <option value="unknown">не знаем</option><option value="yes">есть, письменное</option>
                <option value="no">нет</option><option value="not_needed">не требуется (сам клиент, без пациентов)</option>
              </select>
            </Field>
            <Field label="Откуда">
              <select value={edit.source} onChange={(e) => setEdit({ ...edit, source: e.target.value })} style={sel}>
                <option value="client">прислал клиент</option><option value="team">сняла команда</option><option value="ai">сделано ИИ</option>
              </select>
            </Field>
            <Field label="Теги" hint="через запятую">
              <input value={edit.tags.join(", ")} onChange={(e) => setEdit({ ...edit, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
                placeholder="кабинет, свечи, крупный план" style={sel} />
            </Field>
            <Field label="Можно в производство">
              <label style={{ fontSize: 13, color: "var(--t2)" }}><input type="checkbox" checked={edit.usable} onChange={(e) => setEdit({ ...edit, usable: e.target.checked })} /> да</label>
            </Field>
            {edit.source === "ai" && (
              <p style={{ fontSize: 11.5, color: "var(--or)", marginTop: 8 }}>Сделанное ИИ — только для фона и атмосферы. Никогда не выдаём за результат работы.</p>
            )}
            {blocked(edit) && (
              <p style={{ fontSize: 11.5, color: "var(--rd)", marginTop: 8 }}>С такими пометками файл не пойдёт в производство.</p>
            )}

            <div className="flex gap-2 mt-4">
              <button className="v2-act" style={btn(true)} onClick={() => saveEdit(edit)}>Сохранить</button>
              <button className="v2-act" style={btn(false)} onClick={() => setEdit(null)}>Закрыть</button>
              <button className="v2-act" style={{ ...btn(false), color: "var(--rd)", marginLeft: "auto" }} onClick={() => remove(edit)}>Убрать</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const sel: React.CSSProperties = { width: "100%", background: "var(--v2-inset)", color: "var(--t1)", border: "1px solid var(--brd)", borderRadius: 9, padding: "7px 10px", fontSize: 13 };
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 11.5, color: "var(--t3)", fontWeight: 700, marginBottom: 4 }}>{label}{hint && <span style={{ fontWeight: 500 }}> · {hint}</span>}</div>
      {children}
    </div>
  );
}
function Chip({ on, warn, onClick, children }: { on: boolean; warn?: boolean; onClick: () => void; children: React.ReactNode }) {
  const color = warn ? "var(--rd)" : "var(--cy)";
  return (
    <button onClick={onClick} style={{ height: 28, padding: "0 11px", borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: "pointer",
      border: `1px solid ${on ? color : "var(--brd)"}`, background: on ? `color-mix(in srgb, ${color} 14%, transparent)` : "transparent",
      color: on ? color : warn ? color : "var(--t2)" }}>{children}</button>
  );
}
