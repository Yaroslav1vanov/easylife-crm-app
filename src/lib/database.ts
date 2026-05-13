import { SupabaseClient } from "@supabase/supabase-js";

export type Profile = { id: string; email: string; name: string; role: string; avatar_url: string | null };
export type TeamMember = { id: number; profile_id: string | null; name: string; role_title: string; member_type: string };
export type Client = {
  id: number; name: string; surname: string; niche: string; product: string; phone: string;
  avg_check: string; instagram: string; tiktok: string; youtube: string; avatar_url: string;
  package: number; montager_id: number | null; teamlead_id: number | null; priority: string;
  stage: string; start_date: string; pub_date: string | null; scripts_deadline: string | null;
  videos_deadline: string | null; first_pub_date: string | null; target_audience: string;
  problem: string; system_idea: string; global_result: string; top5_pains: string[];
  montager?: TeamMember; teamlead?: TeamMember;
};
export type Script = {
  id: number; client_id: number; month_number: number; order_num: number; hook: string;
  ref_url: string; transcription: string; hook_text: string; body_text: string; cta: string;
  description: string; script_status: string; video_status: string; pub_date: string | null;
};
export type ChecklistTask = {
  id: number; client_id: number; phase: string; task_name: string; task_order: number;
  status: string; responsible_id: number | null; deadline: string | null;
  responsible?: TeamMember;
};
export type ClientMonth = {
  id: number;
  client_id: number;
  month_number: number;
  start_date: string;
  end_date: string;
  package: number;
  status: "active" | "closed" | "cancelled";
  closed_at: string | null;
  note: string | null;
  calendar_split: Record<string, number> | null;
};

const db = {
  // Profile
  async getProfile(sb: SupabaseClient) {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;
    const { data } = await sb.from("profiles").select("*").eq("id", user.id).single();
    return data as Profile | null;
  },

  // Team
  async getTeam(sb: SupabaseClient) {
    const { data } = await sb.from("team_members").select("*").order("id");
    return (data || []) as TeamMember[];
  },
  async addTeamMember(sb: SupabaseClient, member: { name: string; role_title: string; member_type: string }) {
    const { data, error } = await sb.from("team_members").insert(member).select().single();
    return { data, error };
  },
  async deleteTeamMember(sb: SupabaseClient, id: number) {
    return sb.from("team_members").delete().eq("id", id);
  },

  // Clients
  async getClients(sb: SupabaseClient) {
    const { data } = await sb.from("clients").select("*, montager:team_members!montager_id(*), teamlead:team_members!teamlead_id(*)").order("id");
    return (data || []) as Client[];
  },
  async getClient(sb: SupabaseClient, id: number) {
    const { data } = await sb.from("clients").select("*, montager:team_members!montager_id(*), teamlead:team_members!teamlead_id(*)").eq("id", id).single();
    return data as Client | null;
  },
  async createClient(sb: SupabaseClient, params: {
    name: string; surname?: string; niche?: string; package?: number;
    montager_id?: number; teamlead_id?: number; start_date?: string; pub_date?: string;
  }) {
    const { data, error } = await sb.rpc("create_client_full", {
      p_name: params.name,
      p_surname: params.surname || "",
      p_niche: params.niche || "",
      p_package: params.package || 30,
      p_montager_id: params.montager_id || null,
      p_teamlead_id: params.teamlead_id || null,
      p_start_date: params.start_date || new Date().toISOString().split("T")[0],
      p_pub_date: params.pub_date || null,
    });
    return { clientId: data, error };
  },
  async updateClient(sb: SupabaseClient, id: number, updates: Partial<Client>) {
    const { error } = await sb.from("clients").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id);
    return { error };
  },
  async deleteClient(sb: SupabaseClient, id: number) {
    return sb.from("clients").delete().eq("id", id);
  },

  // Scripts
  async getScripts(sb: SupabaseClient, clientId: number) {
    const { data } = await sb.from("scripts").select("*").eq("client_id", clientId).order("order_num");
    return (data || []) as Script[];
  },
  async getAllScripts(sb: SupabaseClient) {
    const { data } = await sb.from("scripts").select("*, client:clients(name, surname)").order("client_id").order("order_num");
    return (data || []) as (Script & { client: { name: string; surname: string } })[];
  },
  async updateScript(sb: SupabaseClient, id: number, updates: Partial<Script>) {
    const { error } = await sb.from("scripts").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id);
    return { error };
  },
  async addMonthScripts(sb: SupabaseClient, clientId: number) {
    const { error } = await sb.rpc("add_month_scripts", { p_client_id: clientId });
    return { error };
  },

  // Checklist
  async getChecklist(sb: SupabaseClient, clientId: number) {
    const { data } = await sb.from("checklist_tasks").select("*, responsible:team_members(*)").eq("client_id", clientId).order("task_order");
    return (data || []) as ChecklistTask[];
  },
  async updateTask(sb: SupabaseClient, id: number, updates: Partial<ChecklistTask>) {
    const { error } = await sb.from("checklist_tasks").update(updates).eq("id", id);
    return { error };
  },
  async getAllOverdueTasks(sb: SupabaseClient) {
    const today = new Date().toISOString().split("T")[0];
    const { data } = await sb.from("checklist_tasks")
      .select("*, responsible:team_members(*), client:clients(name, surname)")
      .neq("status", "done")
      .lt("deadline", today)
      .order("deadline");
    return (data || []) as (ChecklistTask & { client: { name: string; surname: string } })[];
  },

  // Client contractual months — one row per (client, month_number)
  async getClientMonths(sb: SupabaseClient) {
    const { data, error } = await sb.from("client_months").select("*").order("client_id").order("month_number");
    if (error) {
      // Soft fail when migration not yet applied — dashboard then shows fallback.
      return { data: [] as ClientMonth[], missing: true as boolean, error };
    }
    return { data: (data || []) as ClientMonth[], missing: false as boolean, error: null as any };
  },
  async upsertClientMonth(sb: SupabaseClient, row: Partial<ClientMonth> & { client_id: number; month_number: number }) {
    const { error } = await sb
      .from("client_months")
      .upsert(row, { onConflict: "client_id,month_number" });
    return { error };
  },
  async closeClientMonth(sb: SupabaseClient, id: number) {
    const today = new Date().toISOString().split("T")[0];
    const { error } = await sb
      .from("client_months")
      .update({ status: "closed", closed_at: today })
      .eq("id", id);
    return { error };
  },
  async reopenClientMonth(sb: SupabaseClient, id: number) {
    const { error } = await sb
      .from("client_months")
      .update({ status: "active", closed_at: null })
      .eq("id", id);
    return { error };
  },
};

export default db;
