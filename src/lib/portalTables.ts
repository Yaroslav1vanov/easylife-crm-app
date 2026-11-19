/* Что кабинет клиента вообще может прочитать из базы. Всё, чего здесь нет, клиенту не уходит.
   scope — колонка, по которой запрос всегда ограничивается этим клиентом.
   НЕ добавлять сюда: референсы и их тексты, рекомендацию монтажёру, стоп-проверку, «пробный»,
   ЗП, команду, чат, стратегию, переписку и любые таблицы других клиентов. */

export const SCRIPT_COLS = [
  "id", "client_id", "month_number", "order_num", "hook", "hook_text", "body_text", "cta", "post_caption",
  "script_status", "video_status", "pub_date", "ready_at", "video_url", "published_url", "content_type",
  "our_views", "our_likes", "our_comments", "our_stats_at", "our_retention_pct", "our_skip_rate",
];

export const CLIENT_COLS = [
  "id", "name", "surname", "instagram", "tiktok", "youtube", "avatar_url", "timezone", "platforms",
  "package", "stage", "metricool_blog_id", "start_date",
];

export const PORTAL_TABLES: Record<string, { scope: string; cols: string[] | "*" }> = {
  scripts: { scope: "client_id", cols: SCRIPT_COLS },
  clients: { scope: "id", cols: CLIENT_COLS },
  client_months: { scope: "client_id", cols: ["id", "client_id", "month_number", "status", "package", "start_date", "end_date"] },
  publications: { scope: "client_id", cols: ["id", "script_id", "client_id", "content_type", "publish_at", "pub_status", "base_text", "media_urls", "video_url", "video_thumbnail_url"] },
  client_monthly_stats: { scope: "client_id", cols: "*" },
  client_weekly_stats: { scope: "client_id", cols: "*" },
};
