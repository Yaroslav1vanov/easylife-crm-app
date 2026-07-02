import { SupabaseClient } from "@supabase/supabase-js";

export type Profile = { id: string; email: string; name: string; role: string; avatar_url: string | null };
export type TeamMember = { id: number; profile_id: string | null; name: string; role_title: string; member_type: string; avatar_url?: string | null };
export type Client = {
  id: number; name: string; surname: string; niche: string; product: string; phone: string;
  avg_check: string; instagram: string; tiktok: string; youtube: string; avatar_url: string;
  metricool_blog_id?: number | null; platforms?: string[] | null;
  brand_voice?: string | null; timezone?: string | null; default_post_time?: string | null;
  telegram_topic_id?: number | null;
  package: number; montager_id: number | null; teamlead_id: number | null; priority: string;
  stage: string; start_date: string; pub_date: string | null; scripts_deadline: string | null;
  videos_deadline: string | null; first_pub_date: string | null; onboarding_deadline?: string | null; target_audience: string;
  problem: string; system_idea: string; global_result: string; top5_pains: string[];
  sheet_url?: string | null;
  montager?: TeamMember; teamlead?: TeamMember;
};
export type Script = {
  id: number; client_id: number; month_number: number; order_num: number; hook: string;
  ref_url: string; ref_text?: string | null; transcription: string; hook_text: string; body_text: string; cta: string;
  description: string; script_status: string; video_status: string; pub_date: string | null;
  ready_at: string | null; video_url?: string | null; content_type?: string | null;
};
export type ChecklistTask = {
  id: number; client_id: number; phase: string; task_name: string; task_order: number;
  status: string; responsible_id: number | null; deadline: string | null;
  responsible?: TeamMember;
  template_task_num?: string | null;
  template_stage_id?: number | null;
  template_day_end?: number | null;
};
export type OnboardingTemplateRow = {
  id: number; stage_id: number; stage_title: string;
  day_start: number; day_end: number;
  task_num: string; task_title: string; task_order: number;
  instruction: string | null;
};
export type OnboardingProgress = {
  client_id: number;
  total_tasks: number; done_tasks: number; skipped_tasks: number;
  pending_tasks: number; overdue_tasks: number; progress_pct: number;
};
export type ClientMonth = {
  id: number;
  client_id: number;
  month_number: number;
  start_date: string;
  end_date: string;
  package: number;
  status: "onboarding" | "active" | "planned" | "closed" | "cancelled";
  closed_at: string | null;
  note: string | null;
  calendar_split: Record<string, number> | null;
};
export type SocialSnapshot = {
  id: number;
  client_id: number;
  platform: "ig" | "tt" | "yt";
  snapshot_date: string;
  followers: number | null;
  reach_30d: number | null;
  engagement_rate: number | null;
  created_at: string;
};
export type RefStatus = "new" | "selected" | "review" | "approved";
export type Reference = {
  id: number; client_id: number; url: string; platform: string | null;
  author: string | null; caption: string | null; transcript: string | null;
  views: number | null; likes: number | null; comments: number | null;
  thumbnail_url: string | null; note: string | null; fetched_at: string | null; created_at: string;
  status: RefStatus; analysis: string | null; analyzed_at: string | null; script_id: number | null;
};
export type PubStatus = "adapting" | "review" | "queued" | "scheduled" | "published" | "error";
export type ContentType = "reel" | "carousel";
export type Publication = {
  id: number;
  script_id: number | null;
  client_id: number;
  content_type: ContentType;
  media_urls: string[] | null;
  video_url: string | null;
  video_thumbnail_url: string | null;
  publish_at: string | null;
  target_channels: string[] | null;
  base_text: string | null;
  caption_ig: string | null;
  caption_tt: string | null;
  yt_title: string | null;
  yt_description: string | null;
  yt_tags: string[] | null;
  threads_post: string | null;
  ai_generated_at: string | null;
  ai_model: string | null;
  approved_by: number | null;
  approved_at: string | null;
  pub_status: PubStatus;
  metricool_post_id: string | null;
  published_urls: Record<string, string> | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type AnalyticsDaily = {
  id: number; client_id: number; blog_id: number | null; network: string; snap_date: string;
  followers: number | null; reach: number | null; views: number | null; accounts_engaged: number | null;
  raw: any; created_at: string;
};
export type AnalyticsPost = {
  id: number; client_id: number; blog_id: number | null; network: string; post_id: string;
  post_type: string | null; published_at: string | null; url: string | null; thumbnail_url: string | null;
  content: string | null; views: number | null; likes: number | null; comments: number | null;
  shares: number | null; saved: number | null; reach: number | null; engagement: number | null;
  raw: any; fetched_at: string;
};

const db = {
  // Profile
  async getProfile(sb: SupabaseClient) {
    const { data: { session } } = await sb.auth.getSession();
    const user = session?.user;
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
  async updateTeamMember(sb: SupabaseClient, id: number, patch: Partial<Pick<TeamMember, "name" | "role_title" | "member_type" | "avatar_url">>) {
    return sb.from("team_members").update(patch).eq("id", id);
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
    const startDate = params.start_date || new Date().toISOString().split("T")[0];
    const { data, error } = await sb.rpc("create_client_full", {
      p_name: params.name,
      p_surname: params.surname || "",
      p_niche: params.niche || "",
      p_package: params.package || 30,
      p_montager_id: params.montager_id || null,
      p_teamlead_id: params.teamlead_id || null,
      p_start_date: startDate,
      p_pub_date: params.pub_date || null,
    });
    if (error || !data) return { clientId: data, error };
    // Auto-set the onboarding deadlines: 10 days after start (unboxing phase).
    const start = new Date(startDate);
    const plus10 = new Date(start.getTime() + 10 * 86400000).toISOString().slice(0, 10);
    await sb.from("clients").update({
      first_pub_date: params.pub_date || plus10,
      scripts_deadline: plus10,
      videos_deadline: plus10,
      onboarding_deadline: plus10, // фиксированная дата окончания онбординга (редактируется в карточке)
    }).eq("id", data);
    // Подстраховка: гарантируем контрактный месяц M1 (онбординг) — иначе клиент
    // «проваливается» с дашборда (он строится по месяцам). RPC иногда его не создаёт.
    const { data: m1 } = await sb.from("client_months").select("id").eq("client_id", data).eq("month_number", 1).maybeSingle();
    if (m1) {
      await sb.from("client_months").update({ status: "onboarding" }).eq("id", m1.id);
    } else {
      const monthEnd = new Date(start.getTime() + 30 * 86400000).toISOString().slice(0, 10);
      await sb.from("client_months").insert({
        client_id: data, month_number: 1, status: "onboarding",
        package: params.package || 30, start_date: startDate, end_date: monthEnd,
      });
    }
    // RPC по старой логике сидирует пустые карточки под пакет — удаляем их:
    // сценарии теперь рождаются из референсов, пакет = цель.
    await sb.from("scripts").delete().eq("client_id", data)
      .or("script_status.is.null,script_status.eq.notStarted")
      .or("hook_text.is.null,hook_text.eq.")
      .or("body_text.is.null,body_text.eq.")
      .or("ref_url.is.null,ref_url.eq.");
    return { clientId: data, error };
  },
  async updateClient(sb: SupabaseClient, id: number, updates: Partial<Client>) {
    const { error } = await sb.from("clients").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id);
    return { error };
  },
  async getSocialSnapshots(sb: SupabaseClient, clientIds: number[]) {
    if (clientIds.length === 0) return [] as SocialSnapshot[];
    const { data, error } = await sb
      .from("social_snapshots")
      .select("*")
      .in("client_id", clientIds)
      .order("snapshot_date", { ascending: false });
    // Soft fail until the Metricool migration is applied.
    if (error) return [] as SocialSnapshot[];
    return (data || []) as SocialSnapshot[];
  },
  async deleteClient(sb: SupabaseClient, id: number) {
    return sb.from("clients").delete().eq("id", id);
  },

  // Scripts
  async getScripts(sb: SupabaseClient, clientId: number) {
    const { data } = await sb.from("scripts").select("*").eq("client_id", clientId).order("order_num");
    return (data || []) as Script[];
  },
  async getScriptsForClients(sb: SupabaseClient, clientIds: number[]) {
    if (clientIds.length === 0) return [] as Script[];
    const { data } = await sb
      .from("scripts")
      .select("*")
      .in("client_id", clientIds)
      .order("client_id")
      .order("order_num");
    return (data || []) as Script[];
  },
  async getAllScripts(sb: SupabaseClient) {
    const { data } = await sb.from("scripts").select("*, client:clients(name, surname)").order("client_id").order("order_num");
    return (data || []) as (Script & { client: { name: string; surname: string } })[];
  },
  async updateScript(sb: SupabaseClient, id: number, updates: Partial<Script>) {
    // Auto-stamp ready_at when video transitions into 'ready' (and ready_at not explicitly set).
    const merged: any = { ...updates, updated_at: new Date().toISOString() };
    if (updates.video_status === "ready" && updates.ready_at === undefined) {
      merged.ready_at = new Date().toISOString().slice(0, 10);
    }
    // Нумерация: при ПЕРВОМ переходе в «Взято в работу» присваиваем следующий номер
    // по этому клиенту+месяцу (#1, #2…), если у карточки номера ещё нет (order_num = 0).
    if (updates.script_status === "inProgress") {
      const { data: cur } = await sb.from("scripts").select("client_id, month_number, order_num").eq("id", id).maybeSingle();
      if (cur && (!cur.order_num || cur.order_num <= 0)) {
        const { data: mx } = await sb.from("scripts").select("order_num")
          .eq("client_id", cur.client_id).eq("month_number", cur.month_number)
          .order("order_num", { ascending: false }).limit(1);
        merged.order_num = ((mx?.[0]?.order_num as number) || 0) + 1;
      }
    }
    // When moving into 'published' — keep ready_at as-is (the day it became ready remains historical).
    // If pub_date is being set and there's no ready_at yet on the row, set ready_at = pub_date as a fallback.
    if (updates.video_status === "published" && updates.ready_at === undefined && updates.pub_date) {
      // Only fills if NULL — Supabase update can't conditionally coalesce, so we'd need a separate read; skip for now.
    }
    const { error } = await sb.from("scripts").update(merged).eq("id", id);
    return { error, patch: merged as Partial<Script> };
  },
  async addMonthScripts(sb: SupabaseClient, clientId: number) {
    const { error } = await sb.rpc("add_month_scripts", { p_client_id: clientId });
    return { error };
  },
  async deleteScript(sb: SupabaseClient, id: number) {
    const { error } = await sb.from("scripts").delete().eq("id", id);
    return { error };
  },
  // Insert ONE empty script (idea card) into a (client, month_number). order_num = max+1.
  // Used by the "+ Добавить" button in the kanban "Идея" column.
  async createScript(sb: SupabaseClient, clientId: number, monthNumber: number) {
    // order_num = 0 → «Идея» без номера; номер присвоится при «Взято в работу»
    const { data, error } = await sb.from("scripts").insert({
      client_id: clientId,
      month_number: monthNumber,
      order_num: 0,
      hook: "", ref_url: "", transcription: "", hook_text: "", body_text: "", cta: "",
      description: "", script_status: "notStarted", video_status: "notStarted",
      pub_date: null as string | null, ready_at: null as string | null,
    }).select().single();
    return { data, error };
  },
  // Insert N empty scripts for a (client, month_number) with given count. Used when
  // opening a new contractual month with a package size different from clients.package.
  async addScriptsForMonth(sb: SupabaseClient, clientId: number, monthNumber: number, count: number) {
    if (count <= 0) return { error: null };
    const rows = Array.from({ length: count }, (_, i) => ({
      client_id: clientId,
      month_number: monthNumber,
      order_num: i + 1,
      hook: "",
      ref_url: "",
      transcription: "",
      hook_text: "",
      body_text: "",
      cta: "",
      description: "",
      script_status: "notStarted",
      video_status: "notStarted",
      pub_date: null as string | null,
      ready_at: null as string | null,
    }));
    const { error } = await sb.from("scripts").insert(rows);
    return { error };
  },

  // Checklist
  async getChecklist(sb: SupabaseClient, clientId: number) {
    const { data } = await sb.from("checklist_tasks").select("*, responsible:team_members(*)").eq("client_id", clientId).order("task_order");
    return (data || []) as ChecklistTask[];
  },

  // ===== ОНБОРДИНГ =====
  async getOnboardingTemplate(sb: SupabaseClient) {
    const { data } = await sb.from("onboarding_template").select("*").order("task_order");
    return (data || []) as OnboardingTemplateRow[];
  },
  async getOnboardingTasks(sb: SupabaseClient, clientId: number) {
    const { data } = await sb
      .from("checklist_tasks")
      .select("*")
      .eq("client_id", clientId)
      .like("phase", "onboarding-%")
      .order("task_order");
    return (data || []) as ChecklistTask[];
  },
  async getOnboardingProgress(sb: SupabaseClient, clientId: number) {
    const { data } = await sb
      .from("onboarding_progress")
      .select("*")
      .eq("client_id", clientId)
      .maybeSingle();
    return data as OnboardingProgress | null;
  },
  async getAllOnboardingProgress(sb: SupabaseClient) {
    const { data, error } = await sb.from("onboarding_progress").select("*");
    if (error) return [];
    return (data || []) as OnboardingProgress[];
  },
  async setOnboardingTaskStatus(sb: SupabaseClient, taskId: number, status: "pending" | "done" | "skipped") {
    const { error } = await sb.from("checklist_tasks").update({ status }).eq("id", taskId);
    return { error };
  },
  async completeOnboarding(sb: SupabaseClient, clientId: number) {
    // Все pending → skipped (онбординг помечается как завершённый)
    const { error } = await sb
      .from("checklist_tasks")
      .update({ status: "skipped" })
      .eq("client_id", clientId)
      .like("phase", "onboarding-%")
      .eq("status", "pending");
    return { error };
  },
  async updateTask(sb: SupabaseClient, id: number, updates: Partial<ChecklistTask>) {
    const { error } = await sb.from("checklist_tasks").update(updates).eq("id", id);
    return { error };
  },
  // Все задачи с проставленным дедлайном — для Календаря.
  async getDatedTasks(sb: SupabaseClient) {
    const { data } = await sb
      .from("checklist_tasks")
      .select("id, client_id, task_name, phase, status, deadline")
      .not("deadline", "is", null);
    return (data || []) as { id: number; client_id: number; task_name: string; phase: string; status: string; deadline: string }[];
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
  async getClientMonthsForClient(sb: SupabaseClient, clientId: number) {
    const { data, error } = await sb
      .from("client_months")
      .select("*")
      .eq("client_id", clientId)
      .order("month_number");
    if (error) {
      return { data: [] as ClientMonth[], missing: true as boolean, error };
    }
    return { data: (data || []) as ClientMonth[], missing: false as boolean, error: null as any };
  },
  // Plain insert of a new contractual month. Use for renew (month_number is always new) —
  // avoids upsert's onConflict which needs a unique constraint that isn't set in the DB.
  async insertClientMonth(sb: SupabaseClient, row: Partial<ClientMonth> & { client_id: number; month_number: number }) {
    const { data, error } = await sb.from("client_months").insert(row).select().single();
    return { data: data as ClientMonth | null, error };
  },
  async upsertClientMonth(sb: SupabaseClient, row: Partial<ClientMonth> & { client_id: number; month_number: number }) {
    const { error } = await sb
      .from("client_months")
      .upsert(row, { onConflict: "client_id,month_number" });
    return { error };
  },
  async updateClientMonth(sb: SupabaseClient, id: number, fields: Partial<ClientMonth>) {
    const { error } = await sb.from("client_months").update(fields).eq("id", id);
    return { error };
  },
  // Перевести онбординг-месяц клиента в производство (active). Опционально задать даты.
  async startProductionForClient(sb: SupabaseClient, clientId: number, opts?: { start?: string; end?: string }) {
    const { data } = await sb.from("client_months").select("id").eq("client_id", clientId).eq("status", "onboarding").order("month_number").limit(1);
    const id = (data && data[0]?.id) as number | undefined;
    if (!id) return { error: null };
    const patch: any = { status: "active" };
    if (opts?.start) patch.start_date = opts.start;
    if (opts?.end) patch.end_date = opts.end;
    const { error } = await sb.from("client_months").update(patch).eq("id", id);
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

  // ===== Публикации =====
  async getPublications(sb: SupabaseClient) {
    const { data } = await sb.from("publications").select("*").order("created_at", { ascending: false });
    return (data || []) as Publication[];
  },
  async getPublicationByScript(sb: SupabaseClient, scriptId: number) {
    const { data } = await sb.from("publications").select("*").eq("script_id", scriptId).maybeSingle();
    return (data || null) as Publication | null;
  },
  // Создаёт карточку публикации для сценария, если её ещё нет (вызывается при переходе видео в «Готово к публикации»).
  async ensurePublicationForScript(sb: SupabaseClient, script: Script, client?: Client) {
    const row = {
      script_id: script.id,
      client_id: script.client_id,
      video_url: script.video_url ?? null,
      publish_at: script.pub_date ?? null,
      target_channels: client?.platforms ?? [],
      base_text: script.body_text || null,
      pub_status: "adapting" as PubStatus,
    };
    const { error } = await sb.from("publications").upsert(row, { onConflict: "script_id", ignoreDuplicates: true });
    return { error };
  },
  // Создаёт пустую карусель (без сценария) — слайды и текст заполняются вручную в карточке.
  async createCarouselPublication(sb: SupabaseClient, clientId: number, client?: Client) {
    const row = {
      script_id: null,
      client_id: clientId,
      content_type: "carousel" as ContentType,
      media_urls: [] as string[],
      target_channels: (client?.platforms || []).filter(p => p === "ig" || p === "threads"),
      pub_status: "adapting" as PubStatus,
    };
    const { data, error } = await sb.from("publications").insert(row).select("*").single();
    return { data: (data || null) as Publication | null, error };
  },
  async updatePublication(sb: SupabaseClient, id: number, patch: Partial<Publication>) {
    const { error } = await sb.from("publications").update(patch).eq("id", id);
    return { error };
  },
  async approvePublication(sb: SupabaseClient, id: number, teamMemberId: number) {
    const { error } = await sb.from("publications")
      .update({ pub_status: "queued", approved_by: teamMemberId, approved_at: new Date().toISOString() })
      .eq("id", id);
    return { error };
  },

  // ===== Аналитика (снапшоты из Metricool) =====
  async getAnalyticsDaily(sb: SupabaseClient) {
    const { data } = await sb.from("analytics_daily").select("*").order("snap_date", { ascending: true });
    return (data || []) as AnalyticsDaily[];
  },
  async getAnalyticsPosts(sb: SupabaseClient) {
    const { data } = await sb.from("analytics_posts").select("*").order("published_at", { ascending: false });
    return (data || []) as AnalyticsPost[];
  },

  // ===== Референсы (залётные ролики) =====
  async getReferences(sb: SupabaseClient) {
    const { data } = await sb.from("reference_videos").select("*").order("created_at", { ascending: false });
    return (data || []) as Reference[];
  },
  async updateReference(sb: SupabaseClient, id: number, patch: Partial<Reference>) {
    const { error } = await sb.from("reference_videos").update(patch).eq("id", id);
    return { error };
  },
  async deleteReference(sb: SupabaseClient, id: number) {
    const { error } = await sb.from("reference_videos").delete().eq("id", id);
    return { error };
  },
};

export default db;
