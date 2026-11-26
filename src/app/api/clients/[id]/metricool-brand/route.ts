import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { requireUser } from "@/lib/apiGuard";
import { forgetMetricoolBrands } from "@/lib/mcFetch";

/* Новый клиент, которого ещё нет в Metricool: создаём бренд с именем клиента и сразу привязываем его к карточке.
   Дальше в настройках появляется «Ссылка клиенту: подключить соцсети» (anonymous-link), клиент подключает соцсети сам.
   API Metricool: POST /v2/settings/brands (multipart, поле brandLabel). Если упёрлись в лимит брендов тарифа, Metricool отвечает 403. */
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireUser(); if (denied) return denied;
  const userId = process.env.METRICOOL_USER_ID, token = process.env.METRICOOL_TOKEN;
  if (!userId || !token) return NextResponse.json({ error: "Metricool не настроен" }, { status: 400 });

  const sb = createClient();
  const id = Number(params.id);
  const { data: c } = await sb.from("clients").select("id, name, surname, metricool_blog_id").eq("id", id).maybeSingle();
  if (!c) return NextResponse.json({ error: "клиент не найден" }, { status: 404 });
  if (c.metricool_blog_id) return NextResponse.json({ error: "У клиента уже привязан бренд Metricool", blogId: c.metricool_blog_id }, { status: 409 });

  const label = [c.name, c.surname].filter(Boolean).join(" ").trim().slice(0, 120) || `Клиент ${id}`;
  const fd = new FormData();
  fd.append("brandLabel", label);
  const url = `https://app.metricool.com/api/v2/settings/brands?userId=${encodeURIComponent(userId)}&userToken=${encodeURIComponent(token)}`;
  const r = await fetch(url, { method: "POST", headers: { "X-Mc-Auth": token }, body: fd, cache: "no-store" });
  const text = await r.text();
  let j: any = null; try { j = JSON.parse(text); } catch {}
  if (!r.ok) {
    const why = r.status === 403 ? "Metricool не дал создать бренд: в тарифе закончились бренды. Удалите ненужный бренд в Metricool или поднимите лимит"
      : j?.error || j?.detail || j?.message || text.slice(0, 200) || `Metricool ${r.status}`;
    return NextResponse.json({ error: why, status: r.status }, { status: 502 });
  }
  const blogId = Number(j?.data?.id ?? j?.id);
  if (!blogId) return NextResponse.json({ error: "Metricool создал бренд, но не вернул его id. Найдите его в списке «Привязать бренд»" }, { status: 502 });

  forgetMetricoolBrands();
  const { error } = await sb.from("clients").update({ metricool_blog_id: blogId }).eq("id", id);
  if (error) return NextResponse.json({ error: `Бренд #${blogId} создан, но не сохранился в карточке: ${error.message}. Привяжите его через «Привязать бренд»`, blogId }, { status: 500 });
  return NextResponse.json({ ok: true, blogId, label });
}
