import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { Sidebar } from "@/components/Sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await sb.from("profiles").select("role").eq("id", user.id).single();
  const userRole = profile?.role || "montager";

  return (
    <div className="flex min-h-screen" style={{ background: "var(--bg)" }}>
      <Sidebar userRole={userRole} />
      {/* Desktop: margin-left for sidebar. Mobile: margin-top for top bar */}
      <main className="flex-1 md:ml-[210px] ml-0 mt-[50px] md:mt-0 p-3 md:p-5 overflow-auto min-w-0">
        {children}
      </main>
    </div>
  );
}
