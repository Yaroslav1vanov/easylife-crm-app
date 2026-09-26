import { NextResponse } from "next/server";
import { AwsClient } from "aws4fetch";
import { createAdmin } from "@/lib/supabase-admin";
import { requireUserOrCron } from "@/lib/apiGuard";

/* Ночной снимок базы в наше хранилище R2 — страховка на случай, если данные
   удалят: случайно или злонамеренно. Файл backups/ГГГГ-ММ-ДД.json со всеми
   рабочими таблицами. Хранилище отдельное от базы и ключи разные, так что
   одним доступом это не снести.
   GET /api/cron/backup — по расписанию ночью или вручную, когда вошёл в CRM. */

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const TABLES = [
  "clients", "client_months", "team_members", "profiles", "scripts", "publications",
  "references", "transcriptions", "client_tasks", "strategy_tasks", "strategy_sprints",
  "client_weekly_stats", "social_snapshots", "reel_snapshots", "analytics_daily",
  "analytics_posts", "payroll_adjustments", "app_settings", "calendar_targets",
];
const PAGE = 1000;   // больше 1000 строк за раз Supabase не отдаёт

export async function GET(req: Request) {
  const denied = await requireUserOrCron(req); if (denied) return denied;

  const sb = createAdmin();
  const data: Record<string, any[]> = {};
  const skipped: string[] = [];

  for (const t of TABLES) {
    const rows: any[] = [];
    let failed = false;
    for (let from = 0; from < 200_000; from += PAGE) {
      const r = await sb.from(t).select("*").range(from, from + PAGE - 1);
      if (r.error) { skipped.push(`${t}: ${r.error.message}`); failed = true; break; }
      rows.push(...(r.data || []));
      if ((r.data?.length || 0) < PAGE) break;
    }
    if (!failed) data[t] = rows;
  }

  const body = JSON.stringify({ made_at: new Date().toISOString(), data });
  const accountId = process.env.R2_ACCOUNT_ID, accessKeyId = process.env.R2_ACCESS_KEY_ID,
    secretAccessKey = process.env.R2_SECRET_ACCESS_KEY, bucket = process.env.R2_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket)
    return NextResponse.json({ error: "R2_* переменные не заданы" }, { status: 400 });

  const path = `backups/${new Date().toISOString().slice(0, 10)}.json`;
  const r2 = new AwsClient({ accessKeyId, secretAccessKey, region: "auto", service: "s3" });
  const put = await r2.fetch(`https://${accountId}.r2.cloudflarestorage.com/${bucket}/${path}`, {
    method: "PUT", body, headers: { "Content-Type": "application/json" },
  });
  if (!put.ok) return NextResponse.json({ error: `R2 ответил ${put.status}`, detail: (await put.text()).slice(0, 300) }, { status: 502 });

  return NextResponse.json({
    ok: true, file: path,
    sizeMb: Math.round((new TextEncoder().encode(body).length / 1048576) * 10) / 10,
    rows: Object.fromEntries(Object.entries(data).map(([t, x]) => [t, x.length])),
    skipped,
  });
}
