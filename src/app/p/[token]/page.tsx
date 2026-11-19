import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdmin } from "@/lib/supabase-admin";
import { resolvePortal } from "@/lib/portal";
import { SCRIPT_COLS, CLIENT_COLS } from "@/lib/portalTables";
import PortalView from "@/components/portal/PortalView";

/* Кабинет клиента: карточка клиента CRM в режиме просмотра — вкладки «Работа», «План», «Статистика».
   Без входа в CRM. Сервер по секрету из ссылки находит клиента и отдаёт только его данные
   (поля — по белому списку lib/portalTables). Стратегии, чата, настроек и команды здесь нет. */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const sb = createAdmin();
  const cid = await resolvePortal(sb, params.token);
  let title = "Проект";
  if (cid) {
    const { data } = await sb.from("clients").select("name, surname").eq("id", cid).maybeSingle();
    if (data) title = `${[data.name, data.surname].filter(Boolean).join(" ")} · проект`;
  }
  return { title, description: "Сценарии, план публикаций и статистика проекта", robots: { index: false, follow: false } };
}

export default async function PortalPage({ params }: { params: { token: string } }) {
  const sb = createAdmin();
  const cid = await resolvePortal(sb, params.token);
  if (!cid) notFound();
  const [{ data: client }, { data: scripts }, { data: months }] = await Promise.all([
    sb.from("clients").select(CLIENT_COLS.join(",")).eq("id", cid).maybeSingle(),
    sb.from("scripts").select(SCRIPT_COLS.join(",")).eq("client_id", cid).order("order_num"),
    sb.from("client_months").select("id, client_id, month_number, status, package, start_date, end_date").eq("client_id", cid).order("month_number"),
  ]);
  if (!client) notFound();
  return <PortalView token={params.token} client={client as any} scripts={(scripts || []) as any} clientMonths={(months || []) as any} />;
}
