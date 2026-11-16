/** Маленькая пометка «пробный» у ролика: тест сверх пакета (scripts.is_trial). */
export default function TrialBadge({ style }: { style?: React.CSSProperties }) {
  return (
    <span title="Пробный ролик: тест сверх пакета — в пакет и ЗП не идёт"
      style={{ display: "inline-block", padding: "0 5px", borderRadius: 4, background: "var(--ord)", color: "var(--or)", fontSize: 8.5, fontWeight: 800, lineHeight: "14px", whiteSpace: "nowrap", verticalAlign: "middle", ...style }}>
      пробный
    </span>
  );
}
