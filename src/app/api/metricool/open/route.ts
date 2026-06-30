import { NextResponse } from "next/server";

// Перекидывает на аналитику конкретного бренда в Metricool.
// URL-шаблон настраивается через env METRICOOL_ANALYTICS_URL (плейсхолдеры {userId} {blogId}),
// чтобы поправить точный адрес без передеплоя кода. По умолчанию — сводка бренда.
const DEFAULT_TPL = "https://app.metricool.com/evolution/instagram?blogId={blogId}&userId={userId}";

export async function GET(req: Request) {
  const userId = process.env.METRICOOL_USER_ID || "";
  const tpl = process.env.METRICOOL_ANALYTICS_URL || DEFAULT_TPL;
  const blogId = new URL(req.url).searchParams.get("blogId");
  if (!blogId) return NextResponse.json({ error: "blogId не задан" }, { status: 400 });

  const url = tpl.replace("{userId}", encodeURIComponent(userId)).replace("{blogId}", encodeURIComponent(blogId));
  return NextResponse.redirect(url);
}
