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
      <main className="flex-1 ml-[190px] p-5 overflow-auto">
        {children}
      </main>
    </div>
  );
}
