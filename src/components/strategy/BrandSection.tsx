"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { notify } from "@/components/NoticeHost";
import { btn } from "./DocsSection";
import { when } from "./files";

/*
 * Бренд-кит клиента. Один формат для всех инструментов: сторис, карусели, баннеры, тени Системы.
 * Цвета и шрифты — по РОЛЯМ: инструмент должен знать не «какие цвета есть», а «куда какой ставить».
 */

type Font = { family: string; weight?: number; case?: "normal" | "upper" };
type Kit = {
  identity: { display_name?: string; role_line?: string; niche?: string; geo?: string; language?: string;
    address?: "вы" | "ты"; voice_notes?: string; words_yes?: string[]; words_no?: string[] };
  visual: { colors: Record<string, string>; fonts: { display: Font; accent: Font; body: Font };
    photo_style?: string; layout?: string[]; shape?: { radius?: string; divider?: string } };
  channels: { instagram?: string; site?: string; whatsapp?: string; telegram?: string; codeword?: string; cta_style?: string };
  rules: { compliance?: string; never?: string[]; consent_required_for_faces?: boolean };
};

const EMPTY: Kit = {
  identity: { address: "вы", language: "ru" },
  visual: {
    colors: { bg: "#111111", bg_alt: "#f5f5f5", text: "#ffffff", text_on_light: "#111111", accent: "#d8b26a", muted: "#9a9a9a", card: "#1c1c1c" },
    fonts: { display: { family: "Manrope", weight: 800 }, accent: { family: "Manrope", weight: 800 }, body: { family: "Manrope", weight: 500 } },
  },
  channels: {},
  rules: { compliance: "standard", consent_required_for_faces: true },
};

const COLOR_ROLES: [string, string][] = [
  ["bg", "Основной фон"], ["bg_alt", "Второй фон"], ["text", "Текст на фоне"], ["text_on_light", "Текст на светлом"],
  ["accent", "Акцент — одно слово в кадре"], ["muted", "Приглушённый текст"], ["card", "Плашки и карточки"],
];
const FONT_ROLES: [keyof Kit["visual"]["fonts"], string][] = [
  ["display", "Заголовок"], ["accent", "Ударное слово"], ["body", "Текст"],
];
const COMPLIANCE: [string, string][] = [
  ["standard", "Обычные правила"], ["meta_sensitive", "Чувствительная ниша (Meta)"],
  ["medical", "Медицина"], ["medical_us", "Медицина, США (строже всего)"],
];

const lines = (v?: string[]) => (v ?? []).join("\n");
const toList = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

export default function BrandSection({ clientId, clientName }: { clientId: number; clientName: string }) {
  const supabase = createClient();
  const [kit, setKit] = useState<Kit>(EMPTY);
  const [meta, setMeta] = useState<{ version: number; updated_at: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("client_brand").select("*").eq("client_id", clientId).maybeSingle();
      if (data?.kit && Object.keys(data.kit).length) {
        setKit(mergeKit(EMPTY, data.kit));
        setMeta({ version: data.version, updated_at: data.updated_at });
      } else {
        setKit({ ...EMPTY, identity: { ...EMPTY.identity, display_name: clientName } });
      }
      setLoading(false);
    })();
  }, [clientId]);

  // шрифты из Google Fonts — подгружаем, чтобы превью показывало настоящий вид
  const families = useMemo(() => Array.from(new Set(Object.values(kit.visual.fonts).map((f) => f.family).filter(Boolean))), [kit.visual.fonts]);
  useEffect(() => {
    if (!families.length) return;
    const id = "brand-fonts-" + clientId;
    document.getElementById(id)?.remove();
    const link = document.createElement("link");
    link.id = id; link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?" + families.map((f) => `family=${f.replace(/ /g, "+")}:wght@400;500;700;800;900`).join("&") + "&display=swap";
    document.head.appendChild(link);
  }, [families.join("|")]);

  function set(path: string, value: any) {
    setKit((prev) => {
      const next = structuredClone(prev);
      const keys = path.split(".");
      let node: any = next;
      keys.slice(0, -1).forEach((k) => { node[k] = node[k] ?? {}; node = node[k]; });
      node[keys[keys.length - 1]] = value;
      return next;
    });
    setDirty(true);
  }

  async function save() {
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const version = (meta?.version ?? 0) + 1;
    const { error } = await supabase.from("client_brand").upsert({
      client_id: clientId, kit, version, updated_at: new Date().toISOString(), updated_by: user?.id ?? null,
    });
    setBusy(false);
    if (error) return notify(`Не сохранилось: ${error.message}`);
    setMeta({ version, updated_at: new Date().toISOString() });
    setDirty(false);
    notify(`Бренд сохранён — версия ${version}`);
  }

  if (loading) return <p style={{ color: "var(--t3)", fontSize: 13 }}>Загружаю…</p>;
  const c = kit.visual.colors, f = kit.visual.fonts;

  return (
    <div>
      <p style={{ color: "var(--t3)", fontSize: 12.5, marginBottom: 14, lineHeight: 1.5 }}>
        Один раз заполнил — и сторис, карусели, баннеры собираются в стиле клиента. Цвета и шрифты задаются по ролям:
        так любой инструмент знает, куда какой ставить.
        {meta && <> Версия {meta.version} · {when(meta.updated_at)}.</>}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 260px", gap: 16, alignItems: "start" }} className="brand-grid">
        <div>
          <Block title="Кто и как говорит">
            <Row label="Имя в кадре"><Input v={kit.identity.display_name} on={(v) => set("identity.display_name", v)} ph="Госпожа Еля" /></Row>
            <Row label="Строка под именем"><Input v={kit.identity.role_line} on={(v) => set("identity.role_line", v)} ph="30 лет практики" /></Row>
            <Row label="Гео"><Input v={kit.identity.geo} on={(v) => set("identity.geo", v)} ph="Нью-Йорк, онлайн по США" /></Row>
            <Row label="Обращение">
              <Seg value={kit.identity.address ?? "вы"} options={[["вы", "на «вы»"], ["ты", "на «ты»"]]} on={(v) => set("identity.address", v)} />
            </Row>
            <Row label="Тон"><Area v={kit.identity.voice_notes} on={(v) => set("identity.voice_notes", v)} ph="Мягко, с заботой, боль-first, без давления" /></Row>
            <Row label="Так говорит клиент" hint="по строке"><Area v={lines(kit.identity.words_yes)} on={(v) => set("identity.words_yes", toList(v))} ph={"помогу понять\nнайдём решение"} /></Row>
            <Row label="Так не говорит никогда" hint="по строке"><Area v={lines(kit.identity.words_no)} on={(v) => set("identity.words_no", toList(v))} ph={"гарантирую\nмагия"} /></Row>
          </Block>

          <Block title="Цвета по ролям">
            {COLOR_ROLES.map(([role, label]) => (
              <Row key={role} label={label}>
                <div className="flex items-center gap-2">
                  <input type="color" value={toHex(c[role])} onChange={(e) => set(`visual.colors.${role}`, e.target.value)}
                    style={{ width: 38, height: 32, border: "1px solid var(--brd)", borderRadius: 8, background: "none", padding: 2, cursor: "pointer" }} />
                  <Input v={c[role]} on={(v) => set(`visual.colors.${role}`, v)} mono />
                </div>
              </Row>
            ))}
          </Block>

          <Block title="Шрифты по ролям" hint="имя из Google Fonts">
            {FONT_ROLES.map(([role, label]) => (
              <Row key={role} label={label}>
                <div className="flex items-center gap-2 flex-wrap">
                  <Input v={f[role].family} on={(v) => set(`visual.fonts.${role}.family`, v)} ph="Playfair Display" />
                  <select value={f[role].weight ?? 500} onChange={(e) => set(`visual.fonts.${role}.weight`, Number(e.target.value))} style={selectStyle}>
                    {[400, 500, 600, 700, 800, 900].map((w) => <option key={w} value={w}>{w}</option>)}
                  </select>
                  <select value={f[role].case ?? "normal"} onChange={(e) => set(`visual.fonts.${role}.case`, e.target.value)} style={selectStyle}>
                    <option value="normal">как есть</option><option value="upper">ЗАГЛАВНЫМИ</option>
                  </select>
                </div>
              </Row>
            ))}
          </Block>

          <Block title="Стиль кадра">
            <Row label="Настроение фото"><Area v={kit.visual.photo_style} on={(v) => set("visual.photo_style", v)} ph="тёплый полумрак, свечи, золото и шоколад" /></Row>
            <Row label="Каркас кадра" hint="сверху вниз, по строке"><Area rows={5} v={lines(kit.visual.layout)} on={(v) => set("visual.layout", toList(v))} ph={"пилюля-локация\nзаголовок: эмоция + ударное слово\nкарточка эксперта\nкнопка «Написать мне»"} /></Row>
            <Row label="Разделитель"><Input v={kit.visual.shape?.divider} on={(v) => set("visual.shape.divider", v)} ph="тонкая линия — ♥ — тонкая линия" /></Row>
          </Block>

          <Block title="Куда ведём">
            <Row label="Instagram"><Input v={kit.channels.instagram} on={(v) => set("channels.instagram", v)} ph="https://instagram.com/…" /></Row>
            <Row label="Сайт"><Input v={kit.channels.site} on={(v) => set("channels.site", v)} /></Row>
            <Row label="WhatsApp"><Input v={kit.channels.whatsapp} on={(v) => set("channels.whatsapp", v)} ph="+1 …" /></Row>
            <Row label="Telegram"><Input v={kit.channels.telegram} on={(v) => set("channels.telegram", v)} /></Row>
            <Row label="Кодовое слово"><Input v={kit.channels.codeword} on={(v) => set("channels.codeword", v)} ph="РАЗБОР" /></Row>
            <Row label="Как звучит призыв"><Input v={kit.channels.cta_style} on={(v) => set("channels.cta_style", v)} ph="Написать мне · Конфиденциально" /></Row>
          </Block>

          <Block title="Правила">
            <Row label="Ограничения">
              <select value={kit.rules.compliance ?? "standard"} onChange={(e) => set("rules.compliance", e.target.value)} style={{ ...selectStyle, width: "100%" }}>
                {COMPLIANCE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Row>
            <Row label="Нельзя никогда" hint="по строке"><Area v={lines(kit.rules.never)} on={(v) => set("rules.never", toList(v))} ph={"гарантированный результат\nутверждения о сверхспособностях"} /></Row>
            <Row label="Лица">
              <label className="flex items-center gap-2" style={{ fontSize: 13, color: "var(--t2)", cursor: "pointer" }}>
                <input type="checkbox" checked={kit.rules.consent_required_for_faces !== false}
                  onChange={(e) => set("rules.consent_required_for_faces", e.target.checked)} />
                фото с лицами — только с письменным согласием
              </label>
            </Row>
          </Block>

          <div className="flex gap-2 items-center" style={{ position: "sticky", bottom: 8, zIndex: 2 }}>
            <button className="v2-act" style={{ ...btn(true), height: 40 }} disabled={busy || !dirty} onClick={save}>
              {busy ? "Сохраняю…" : dirty ? "Сохранить бренд" : "Сохранено"}
            </button>
            {dirty && <small style={{ color: "var(--or)", fontSize: 12 }}>есть несохранённые изменения</small>}
          </div>
        </div>

        {/* живое превью кадра сторис */}
        <div style={{ position: "sticky", top: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--t3)", marginBottom: 6 }}>Как выглядит кадр</div>
          <div style={{ aspectRatio: "9 / 16", background: c.bg, borderRadius: 16, padding: "18% 9% 14%", display: "flex", flexDirection: "column",
            border: "1px solid var(--brd)", overflow: "hidden" }}>
            <div style={{ fontFamily: f.accent.family, fontWeight: f.accent.weight, fontSize: 9, letterSpacing: ".18em", color: c.accent, textTransform: "uppercase" }}>
              {kit.identity.geo || "локация"}
            </div>
            <div style={{ fontFamily: f.display.family, fontWeight: f.display.weight, fontSize: 21, lineHeight: 1.08, color: c.text, marginTop: 10,
              textTransform: f.display.case === "upper" ? "uppercase" : "none" }}>
              Когда ответ<br />нужен <span style={{ color: c.accent, fontFamily: f.accent.family, fontWeight: f.accent.weight,
                textTransform: f.accent.case === "upper" ? "uppercase" : "none" }}>сейчас</span>
            </div>
            <div style={{ fontFamily: f.body.family, fontWeight: f.body.weight, fontSize: 10.5, lineHeight: 1.4, color: c.muted, marginTop: 10 }}>
              {kit.visual.shape?.divider ? kit.visual.shape.divider + " · " : ""}пара строк о боли клиента
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ background: c.card, borderRadius: 10, padding: "8px 10px", display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: c.accent, flexShrink: 0 }} />
              <div>
                <div style={{ fontFamily: f.display.family, fontWeight: 700, fontSize: 10.5, color: c.text }}>{kit.identity.display_name || "Имя"}</div>
                <div style={{ fontFamily: f.body.family, fontSize: 8.5, color: c.muted }}>{kit.identity.role_line || "строка под именем"}</div>
              </div>
            </div>
            <div style={{ marginTop: 8, background: c.accent, color: c.bg, borderRadius: 10, padding: "8px 10px", textAlign: "center",
              fontFamily: f.accent.family, fontWeight: 800, fontSize: 10 }}>
              {kit.channels.cta_style?.split("·")[0]?.trim() || "Написать мне"}
            </div>
          </div>
          <p style={{ fontSize: 11, color: "var(--t3)", marginTop: 8, lineHeight: 1.45 }}>
            Схематичный кадр: проверить, что акцент читается на фоне, а шрифты сочетаются.
          </p>
        </div>
      </div>
      <style>{`@media (max-width: 760px){ .brand-grid{ grid-template-columns: 1fr !important } }`}</style>
    </div>
  );
}

/* ── мелкие поля формы ─────────────────────────────────────────────── */

function Block({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="v2-card" style={{ padding: 14, marginBottom: 12 }}>
      <div className="v2-sec-h" style={{ marginBottom: 10 }}>{title}{hint && <span style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0, color: "var(--t3)" }}>· {hint}</span>}</div>
      {children}
    </div>
  );
}
function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 10, alignItems: "start", marginBottom: 9 }} className="brand-row">
      <div style={{ fontSize: 12, color: "var(--t2)", paddingTop: 8 }}>{label}{hint && <div style={{ fontSize: 10.5, color: "var(--t3)" }}>{hint}</div>}</div>
      <div>{children}</div>
      <style>{`@media (max-width: 560px){ .brand-row{ grid-template-columns: 1fr !important } }`}</style>
    </div>
  );
}
const field: React.CSSProperties = { width: "100%", background: "var(--v2-inset)", color: "var(--t1)", border: "1px solid var(--brd)", borderRadius: 9, padding: "8px 11px", fontSize: 13, fontFamily: "inherit" };
const selectStyle: React.CSSProperties = { ...field, width: "auto" };
function Input({ v, on, ph, mono }: { v?: string; on: (v: string) => void; ph?: string; mono?: boolean }) {
  return <input value={v ?? ""} onChange={(e) => on(e.target.value)} placeholder={ph} style={{ ...field, fontFamily: mono ? "ui-monospace, monospace" : "inherit" }} />;
}
function Area({ v, on, ph, rows = 3 }: { v?: string; on: (v: string) => void; ph?: string; rows?: number }) {
  return <textarea value={v ?? ""} onChange={(e) => on(e.target.value)} placeholder={ph} rows={rows} style={{ ...field, resize: "vertical", lineHeight: 1.5 }} />;
}
function Seg({ value, options, on }: { value: string; options: [string, string][]; on: (v: string) => void }) {
  return (
    <div className="flex gap-1">
      {options.map(([v, l]) => (
        <button key={v} onClick={() => on(v)} style={{ ...btn(value === v), height: 32 }}>{l}</button>
      ))}
    </div>
  );
}

/** input[type=color] принимает только #rrggbb — rgba и градиенты показываем текстом */
function toHex(v?: string) {
  return v && /^#[0-9a-f]{6}$/i.test(v) ? v : "#000000";
}
function mergeKit(base: Kit, saved: any): Kit {
  return {
    identity: { ...base.identity, ...(saved.identity ?? {}) },
    visual: {
      ...base.visual, ...(saved.visual ?? {}),
      colors: { ...base.visual.colors, ...(saved.visual?.colors ?? {}) },
      fonts: {
        display: { ...base.visual.fonts.display, ...(saved.visual?.fonts?.display ?? {}) },
        accent: { ...base.visual.fonts.accent, ...(saved.visual?.fonts?.accent ?? {}) },
        body: { ...base.visual.fonts.body, ...(saved.visual?.fonts?.body ?? {}) },
      },
    },
    channels: { ...base.channels, ...(saved.channels ?? {}) },
    rules: { ...base.rules, ...(saved.rules ?? {}) },
  };
}
