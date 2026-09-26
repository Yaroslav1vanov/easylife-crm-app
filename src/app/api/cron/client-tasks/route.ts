import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase-admin";
import { plannedTasks, shift, taskDescription, taskTitle, type TaskKind } from "@/lib/clientTasks";
import { requireUserOrCron } from "@/lib/apiGuard";

/* Создаёт задачи проджектам по каждому активному клиенту: разговор на 15-й день после старта
   публикаций, недельный отчёт по пятницам, напоминание об оплате за 6 дней до конца месяца,
   контроль оплаты за 2 дня и итоги закрытого месяца. Идемпотентно: ключ клиент + тип + дата.
   GET /api/cron/client-tasks (ежедневно) */
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const HORIZON = 10;    // на сколько дней вперёд создаём
const BACKFILL = 5;    // и насколько назад добираем пропущенное

export async function GET(req: Request) {
  const denied = await requireUserOrCron(req); if (denied) return denied;
  const sb = createAdmin();
  const sp = new URL(req.url).searchParams;
  const today = new Date().toISOString().slice(0, 10);

  const { data: clients } = await sb.from("clients")
    .select("id, name, surname, stage, teamlead_id, metricool_blog_id, first_pub_date, package");
  const list = (clients || []).filter(c => c.stage === "active" && (!sp.get("clientId") || c.id === Number(sp.get("clientId"))));
  if (!list.length) return NextResponse.json({ ok: true, note: "нет активных клиентов", created: 0 });

  const ids = list.map(c => c.id);
  const [{ data: months }, { data: pubs }, { data: existing }] = await Promise.all([
    sb.from("client_months").select("client_id, month_number, start_date, end_date, status, package").in("client_id", ids),
    sb.from("scripts").select("client_id, pub_date, video_status").in("client_id", ids).eq("video_status", "published").not("pub_date", "is", null),
    sb.from("client_tasks").select("client_id, kind, due_date").in("client_id", ids).gte("due_date", shift(today, -BACKFILL - 1)),
  ]);

  const have = new Set((existing || []).map(t => `${t.client_id}:${t.kind}:${t.due_date}`));
  const rows: any[] = [];

  for (const c of list) {
    const cm = (months || []).filter(m => m.client_id === c.id && (m.status === "active" || m.status === "onboarding"))
      .sort((a, b) => b.month_number - a.month_number)[0] || null;
    const firstPub = (pubs || []).filter(p => p.client_id === c.id).map(p => p.pub_date as string).sort()[0]
      || (c as any).first_pub_date || null;

    const planned = plannedTasks({
      today, horizonDays: HORIZON, backfillDays: BACKFILL,
      monthNumber: cm?.month_number ?? null,
      monthStart: cm?.start_date ?? null,
      monthEnd: cm?.end_date ?? null,
      firstPublishDate: firstPub,
      hasMetricool: !!c.metricool_blog_id,
    });

    const clientName = `${c.name} ${c.surname || ""}`.trim();
    for (const p of planned) {
      const key = `${c.id}:${p.kind}:${p.due}`;
      if (have.has(key)) continue;
      have.add(key);
      const ctx = { clientName, monthNumber: cm?.month_number ?? null, endDate: cm?.end_date ?? null, package: cm?.package ?? c.package, weekFrom: p.weekFrom, weekTo: p.weekTo };
      rows.push({
        client_id: c.id, kind: p.kind as TaskKind, due_date: p.due,
        title: taskTitle(p.kind, ctx), description: taskDescription(p.kind, ctx),
        month_number: cm?.month_number ?? null, assignee_id: c.teamlead_id ?? null,
        status: "open", source: "auto",
      });
    }
  }

  if (!rows.length) return NextResponse.json({ ok: true, date: today, created: 0, note: "всё уже создано" });
  const { error } = await sb.from("client_tasks").upsert(rows, { onConflict: "client_id,kind,due_date", ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    ok: true, date: today, created: rows.length,
    byKind: rows.reduce((a: any, r) => ({ ...a, [r.kind]: (a[r.kind] || 0) + 1 }), {}),
  });
}
