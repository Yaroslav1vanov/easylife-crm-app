/** @type {import('next').NextConfig} */
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;

module.exports = {
  reactStrictMode: true,
  // src/instrumentation.ts — защита от данных «чужого» бренда Metricool (05.11.2026)
  experimental: { instrumentationHook: true },
  // Запасной путь к Supabase через наш домен: помогает сотрудникам, у которых
  // провайдер режет *.supabase.co (браузер отдаёт «Failed to fetch»).
  async rewrites() {
    return SB ? [{ source: "/sb/:path*", destination: `${SB}/:path*` }] : [];
  },
};
