import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
export default async function Home() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  redirect(user ? "/dashboard" : "/login");
}
