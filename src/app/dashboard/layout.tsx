import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { Sidebar } from "@/components/Sidebar";
import { RoleProvider } from "@/components/RoleContext";
import RoleGuard from "@/components/RoleGuard";
import NoticeHost from "@/components/NoticeHost";
import ConnectionGuard from "@/components/ConnectionGuard";
import GlobalSearch from "@/components/GlobalSearch";
import "@/styles/crm.css";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const sb = createClient();
  // getSession читает токен из cookie локально, без сетевого запроса к Supabase Auth
  // (быстрее; доступ к данным всё равно защищён RLS на стороне БД)
  const { data: { session } } = await sb.auth.getSession();
  const user = session?.user;
  if (!user) redirect("/login");

  // Раньше при любой осечке чтения роль молча становилась «монтажёр» — и владелец
  // видел урезанную CRM, думая, что что-то сломалось. Теперь честно говорим, в чём дело.
  const { data: profile, error: profileErr } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profileErr || !profile?.role) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "var(--bg)" }}>
        <div style={{ maxWidth: 520, border: "1px solid rgba(var(--or-rgb),0.4)", background: "rgba(var(--or-rgb),0.08)", borderRadius: 16, padding: 22, color: "var(--t1)" }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Не удалось определить вашу роль</div>
          <div style={{ fontSize: 13, color: "var(--t2)", lineHeight: 1.6 }}>
            CRM не смогла прочитать вашу учётную запись, поэтому не показывает разделы — чтобы не выдать вам чужой уровень доступа.
            Обновите страницу; если повторится, напишите владельцу.
            {profileErr ? <div style={{ marginTop: 10, fontSize: 11.5, color: "var(--t3)" }}>Причина: {profileErr.message}</div> : null}
          </div>
        </div>
      </div>
    );
  }
  const userRole = profile.role;

  return (
    <RoleProvider role={userRole}>
      <RoleGuard role={userRole} />
      <NoticeHost />
      <ConnectionGuard />
      <GlobalSearch />
      <div className="crm-shell">
        <Sidebar userRole={userRole} />
        {/* Десктоп: отступ слева под меню. Телефон: отступ сверху под верхнюю полосу. */}
        <main className="v2-main crm-main">
          {children}
        </main>
      </div>
    </RoleProvider>
  );
}
