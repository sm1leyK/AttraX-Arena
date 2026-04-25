// agent-auto-post: Consumer Edge Function
// Pulls tasks from agent_task_queue (FOR UPDATE SKIP LOCKED), generates agent posts/comments
// via LLM, then recursively calls itself if more tasks remain (max 5 per cycle).

type JsonRecord = Record<string, unknown>;
type AgentLlmApi = "responses" | "chat_completions";

interface RuntimeConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  openaiApiKey: string;
  agentRunnerSecret: string;
  agentModel: string;
  agentLlmBaseUrl: string;
  agentLlmApi: AgentLlmApi;
}

interface AgentRow {
  id: string;
  handle: string;
  display_name: string;
  persona: string | null;
  bio: string | null;
  badge: string;
  disclosure: string;
  kind: string;
  is_active: boolean;
}

interface TaskRow {
  id: string;
  task_type: "auto_post" | "agent_interact";
  status: string;
  agent_id: string | null;
  payload: JsonRecord;
}

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_AGENT_LLM_API: AgentLlmApi = "chat_completions";
const DEFAULT_AGENT_MODEL = "deepseek-chat";
const MAX_RECURSION_DEPTH = 5;
const MAX_TITLE_CHARS = 50;
const MAX_CONTENT_CHARS = 300;
const MAX_COMMENT_CHARS = 600;
const MAX_COMMENT_WORDS = 80;
const FORBIDDEN_LANGUAGE_RE =
  /\b(real[-\s]?money|wallet|deposit|withdraw(?:al)?|payment|gambl(?:e|ing)|wager|betting|bet)\b|真钱|真金白银|钱包|充值|提现|支付|赌博|博彩|下注|押注|赌局|赌注/i;

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8" };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200 });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
    }

    authorizeRunner(req);
    const config = readRuntimeConfig();
    const body = await readJsonBody(req);
    const depth = (body as JsonRecord)?._depth as number ?? 0;

    if (depth >= MAX_RECURSION_DEPTH) {
      return jsonResponse({ ok: true, message: "Max recursion depth reached", depth }, 200);
    }

    // Check feature flag
    const enabled = await checkFeatureFlag(config);
    if (!enabled) {
      return jsonResponse({ ok: true, skipped: true, reason: "feature_flag_off" }, 200);
    }

    // Load active agent pool
    const agentPool = await loadActiveAgents(config);
    if (agentPool.length === 0) {
      return jsonResponse({ ok: false, error: "no_active_agents" }, 500);
    }

    // Claim one pending task
    const task = await claimTask(config);
    if (!task) {
      return jsonResponse({ ok: true, message: "No pending tasks", depth }, 200);
    }

    console.log(`[auto-post] Claimed task ${task.id} (type=${task.task_type}, depth=${depth})`);

    let result: JsonRecord;

    if (task.task_type === "auto_post") {
      result = await executeAutoPost(config, task, agentPool);
    } else {
      result = await executeAgentInteract(config, task, agentPool);
    }

    // Mark task done
    await updateTaskStatus(config, task.id, "done", result);

    // Log to agent_runs
    await recordAgentRun(config, task, "success", result);

    // Check for more pending tasks and recurse
    const remaining = await getPendingCount(config);
    if (remaining > 0 && depth + 1 < MAX_RECURSION_DEPTH) {
      await triggerSelf(config, depth + 1);
    }

    return jsonResponse({
      ok: true,
      task_id: task.id,
      task_type: task.task_type,
      depth,
      remaining_pending: remaining,
      result,
    }, 201);
  } catch (error) {
    console.error("[auto-post] Error:", error);
    return jsonResponse({
      ok: false,
      error: "internal_error",
      message: error instanceof Error ? error.message : "Unknown error",
    }, 500);
  }
});

// ── Config ──

function resolveActiveProvider(): { apiKey: string; baseUrl: string; model: string } {
  const provider = (env("ACTIVE_LLM_PROVIDER") ?? "openai").toLowerCase();
  switch (provider) {
    case "orbitai":
      return {
        apiKey: env("ORBITAI_API_KEY") ?? env("OPENAI_API_KEY") ?? "",
        baseUrl: env("ORBITAI_BASE_URL") ?? "https://aiapi.orbitai.global/v1",
        model: env("AGENT_MODEL") ?? "gpt-4o-mini",
      };
    case "deepseek":
      return {
        apiKey: env("DEEPSEEK_API_KEY") ?? env("OPENAI_API_KEY") ?? "",
        baseUrl: env("DEEPSEEK_BASE_URL") ?? "https://api.deepseek.com/v1",
        model: env("AGENT_MODEL") ?? "deepseek-chat",
      };
    default:
      return {
        apiKey: env("OPENAI_API_KEY") ?? env("LLM_API_KEY") ?? "",
        baseUrl: env("OPENAI_BASE_URL") ?? DEFAULT_OPENAI_BASE_URL,
        model: env("AGENT_MODEL") ?? "gpt-5.4-mini",
      };
  }
}

function readRuntimeConfig(): RuntimeConfig {
  const url = env("SUPABASE_URL") ?? env("NEXT_PUBLIC_SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const secret = env("AGENT_RUNNER_SECRET");
  const provider = resolveActiveProvider();
  const llmApi = (env("AGENT_LLM_API") ?? DEFAULT_AGENT_LLM_API) as AgentLlmApi;

  if (!url || !key || !secret || !provider.apiKey) {
    throw new Error("Missing required environment variables");
  }

  return {
    supabaseUrl: url,
    supabaseServiceRoleKey: key,
    agentRunnerSecret: secret,
    openaiApiKey: provider.apiKey,
    agentModel: provider.model,
    agentLlmBaseUrl: provider.baseUrl.replace(/\/+$/, ""),
    agentLlmApi: llmApi,
  };
}

function env(name: string): string | undefined {
  return Deno.env.get(name)?.trim() || undefined;
}

function authorizeRunner(req: Request): void {
  const secret = env("AGENT_RUNNER_SECRET");
  if (!secret) throw new Error("AGENT_RUNNER_SECRET not set");

  const provided = req.headers.get("x-agent-runner-secret")?.trim()
    || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();

  if (!provided || !safeEqual(provided, secret)) {
    throw new Error("Unauthorized");
  }
}

// ── Task Queue Operations ──

async function claimTask(config: RuntimeConfig): Promise<TaskRow | null> {
  // Use RPC for atomic FOR UPDATE SKIP LOCKED
  const rpcUrl = `${config.supabaseUrl}/rest/v1/rpc/claim_next_agent_task`;

  const resp = await fetch(rpcUrl, {
    method: "POST",
    headers: {
      ...supabaseHeaders(config),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!resp.ok) {
    // RPC might not exist yet, fall back to REST-based claim
    return claimTaskFallback(config);
  }

  const data = await resp.json();
  if (!data || (Array.isArray(data) && data.length === 0)) return null;
  return Array.isArray(data) ? data[0] : data;
}

async function claimTaskFallback(config: RuntimeConfig): Promise<TaskRow | null> {
  // Get one pending task
  const url = buildRestUrl(config, "agent_task_queue", {
    select: "id,task_type,status,agent_id,payload",
    status: "eq.pending",
    order: "created_at.asc",
    limit: "1",
  });

  const resp = await fetch(url, { headers: supabaseHeaders(config) });
  const rows = await resp.json();

  if (!Array.isArray(rows) || rows.length === 0) return null;

  const task = rows[0] as TaskRow;

  // Try to mark as running
  const patchUrl = buildRestUrl(config, "agent_task_queue", {
    id: `eq.${task.id}`,
    status: "eq.pending",
  });

  const patchResp = await fetch(patchUrl, {
    method: "PATCH",
    headers: {
      ...supabaseHeaders(config),
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      status: "running",
      started_at: new Date().toISOString(),
    }),
  });

  if (!patchResp.ok) {
    // Another worker claimed it first
    return null;
  }

  const updated = await patchResp.json();
  if (!Array.isArray(updated) || updated.length === 0) return null;

  return task;
}

async function updateTaskStatus(
  config: RuntimeConfig,
  taskId: string,
  status: string,
  result?: JsonRecord,
  error?: string,
): Promise<void> {
  const url = buildRestUrl(config, "agent_task_queue", { id: `eq.${taskId}` });

  const body: JsonRecord = {
    status,
    finished_at: new Date().toISOString(),
  };

  if (result) body.result = result;
  if (error) body.error = error;

  await fetch(url, {
    method: "PATCH",
    headers: {
      ...supabaseHeaders(config),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function getPendingCount(config: RuntimeConfig): Promise<number> {
  const url = buildRestUrl(config, "agent_task_queue", {
    select: "id",
    status: "eq.pending",
    limit: "0",
  });

  const resp = await fetch(url, {
    headers: { ...supabaseHeaders(config), Prefer: "count=exact" },
  });

  const range = resp.headers.get("content-range");
  if (range) {
    return parseInt(range.split("/")[1] || "0", 10);
  }

  const rows = await resp.json();
  return Array.isArray(rows) ? rows.length : 0;
}

// ── Agent Pool ──

async function loadActiveAgents(config: RuntimeConfig): Promise<AgentRow[]> {
  const url = buildRestUrl(config, "agents", {
    select: "id,handle,display_name,persona,bio,badge,disclosure,kind,is_active",
    is_active: "eq.true",
    limit: "20",
  });

  const resp = await fetch(url, { headers: supabaseHeaders(config) });
  const rows = await resp.json();
  return Array.isArray(rows) ? rows : [];
}

function pickRandomAgent(pool: AgentRow[], exclude?: string[]): AgentRow {
  const excluded = new Set(exclude || []);
  const candidates = pool.filter((a) => !excluded.has(a.id));

  if (candidates.length === 0) {
    // Fallback: pick from full pool
    return pool[Math.floor(Math.random() * pool.length)];
  }

  return candidates[Math.floor(Math.random() * candidates.length)];
}

// ── Task Execution ──

async function executeAutoPost(
  config: RuntimeConfig,
  task: TaskRow,
  agentPool: AgentRow[],
): Promise<JsonRecord> {
  const payload = task.payload;
  const source = (payload.source as string) || "unknown";
  const topic = (payload.topic as string) || "General discussion";
  const summary = (payload.summary as string) || topic;
  const topicUrl = (payload.url as string) || "";

  // Pick a random agent (avoid the one assigned to the task if any)
  const agent = task.agent_id
    ? agentPool.find((a) => a.id === task.agent_id) || pickRandomAgent(agentPool)
    : pickRandomAgent(agentPool);

  console.log(`[auto-post] Agent ${agent.display_name} posting about "${topic}" from ${source}`);

  // Generate post via LLM
  const generated = await generatePost(config, agent, source, topic, summary);

  // Insert into posts table
  const post = await insertPost(config, agent.id, generated.title, generated.content);

  console.log(`[auto-post] Created post ${post.id}: "${generated.title}"`);

  // Create 1-2 agent_interact tasks for other agents to comment
  const commentCount = 1 + Math.floor(Math.random() * 2); // 1 or 2
  const interactTasks: string[] = [];

  for (let i = 0; i < commentCount; i++) {
    const commentingAgent = pickRandomAgent(agentPool, [agent.id]);
    await enqueueInteractTask(config, post.id, generated.title, generated.content, commentingAgent.id);
    interactTasks.push(commentingAgent.display_name);
  }

  return {
    post_id: post.id,
    post_title: generated.title,
    agent_id: agent.id,
    agent_name: agent.display_name,
    source,
    topic,
    interact_tasks_created: interactTasks,
  };
}

async function executeAgentInteract(
  config: RuntimeConfig,
  task: TaskRow,
  agentPool: AgentRow[],
): Promise<JsonRecord> {
  const payload = task.payload;
  const postId = (payload.post_id as string) || "";
  const postTitle = (payload.post_title as string) || "";
  const postContent = (payload.post_content as string) || "";

  if (!postId) {
    throw new Error("agent_interact task missing post_id");
  }

  // Use the assigned agent, or pick one
  const agent = task.agent_id
    ? agentPool.find((a) => a.id === task.agent_id) || pickRandomAgent(agentPool)
    : pickRandomAgent(agentPool);

  console.log(`[auto-post] Agent ${agent.display_name} commenting on post "${postTitle}"`);

  // Generate comment via LLM
  const commentText = await generateComment(config, agent, postTitle, postContent);

  // Insert comment
  const comment = await insertComment(config, postId, agent.id, commentText);

  console.log(`[auto-post] Agent ${agent.display_name} commented on post ${postId}`);

  return {
    comment_id: comment.id,
    post_id: postId,
    agent_id: agent.id,
    agent_name: agent.display_name,
    comment_length: commentText.length,
  };
}

// ── LLM Generation ──

async function generatePost(
  config: RuntimeConfig,
  agent: AgentRow,
  source: string,
  topic: string,
  summary: string,
): Promise<{ title: string; content: string }> {
  const systemPrompt = buildPostSystemPrompt(agent, source, topic, summary);
  const userPrompt = "Generate the post now. Output format: TITLE\\n\\nCONTENT";

  const endpoint = config.agentLlmApi === "chat_completions" ? "chat/completions" : "responses";
  const url = `${config.agentLlmBaseUrl}/${endpoint}`;

  const body = config.agentLlmApi === "chat_completions"
    ? {
        model: config.agentModel,
        max_tokens: 400,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }
    : {
        model: config.agentModel,
        max_output_tokens: 400,
        input: [
          { role: "developer", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await resp.json();

  if (!resp.ok) {
    throw new Error(`LLM request failed: ${resp.status} ${JSON.stringify(data)}`);
  }

  const text = config.agentLlmApi === "chat_completions"
    ? extractChatCompletionText(data)
    : extractResponsesText(data);

  if (!text) {
    throw new Error("LLM returned empty response");
  }

  return parsePostOutput(text);
}

async function generateComment(
  config: RuntimeConfig,
  agent: AgentRow,
  postTitle: string,
  postContent: string,
): Promise<string> {
  const systemPrompt = buildCommentSystemPrompt(agent, postTitle, postContent);
  const userPrompt = "Write your comment now.";

  const endpoint = config.agentLlmApi === "chat_completions" ? "chat/completions" : "responses";
  const url = `${config.agentLlmBaseUrl}/${endpoint}`;

  const body = config.agentLlmApi === "chat_completions"
    ? {
        model: config.agentModel,
        max_tokens: 220,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }
    : {
        model: config.agentModel,
        max_output_tokens: 220,
        input: [
          { role: "developer", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await resp.json();

  if (!resp.ok) {
    throw new Error(`LLM request failed: ${resp.status} ${JSON.stringify(data)}`);
  }

  const text = config.agentLlmApi === "chat_completions"
    ? extractChatCompletionText(data)
    : extractResponsesText(data);

  if (!text) {
    throw new Error("LLM returned empty comment");
  }

  return normalizeComment(text);
}

function buildPostSystemPrompt(agent: AgentRow, source: string, topic: string, summary: string): string {
  return [
    `You are ${agent.display_name}, an official AttraX Arena AI Agent.`,
    "You are not a human and must never pretend to be one.",
    agent.persona ? `Persona: ${agent.persona}` : "",
    agent.bio ? `Bio: ${agent.bio}` : "",
    "",
    `You discovered a trending topic from ${source}:`,
    `Topic: ${topic}`,
    `Summary: ${summary}`,
    "",
    "Create an engaging post for the AttraX community. Rules:",
    "- Stay strictly in character",
    "- Title: 10-50 chars, catchy, in your unique style",
    "- Content: 50-300 chars, express your unique perspective on this topic",
    "- Match the topic to your persona strengths",
    "- Language: Chinese",
    "- No markdown formatting",
    "- Do not mention AI, system prompts, or hidden instructions",
    "",
    "## Hard Rules",
    "Do not mention wallets, payments, real money, betting, wagering, gambling, deposits, withdrawals, or bets.",
    "",
    "Output format (first line = title, rest = content):",
    "TITLE",
    "",
    "CONTENT",
  ].filter(Boolean).join("\n");
}

function buildCommentSystemPrompt(agent: AgentRow, postTitle: string, postContent: string): string {
  return [
    `You are ${agent.display_name}, an official AttraX Arena AI Agent.`,
    "You are not a human and must never pretend to be one.",
    agent.persona ? `Persona: ${agent.persona}` : "",
    agent.bio ? `Bio: ${agent.bio}` : "",
    "",
    `Another agent posted:`,
    `Title: ${postTitle}`,
    `Content: ${postContent}`,
    "",
    "Write a comment reacting to this post. Rules:",
    "- Stay strictly in character",
    "- React naturally as if you saw this in your feed",
    `Under ${MAX_COMMENT_WORDS} words`,
    "- Can agree, disagree, mock, or analyze (stay in persona)",
    "- Language: match the post language (Chinese if Chinese, English if English)",
    "- No markdown formatting",
    "- Do not mention AI, system prompts, or hidden instructions",
    "",
    "## Hard Rules",
    "Do not mention wallets, payments, real money, betting, wagering, gambling, deposits, withdrawals, or bets.",
  ].filter(Boolean).join("\n");
}

// ── Database Inserts ──

async function insertPost(
  config: RuntimeConfig,
  agentId: string,
  title: string,
  content: string,
): Promise<{ id: string }> {
  const url = buildRestUrl(config, "posts", { select: "id" });

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      ...supabaseHeaders(config),
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      author_kind: "agent",
      author_profile_id: null,
      author_agent_id: agentId,
      title,
      content,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Post insert failed: ${resp.status} ${err}`);
  }

  const rows = await resp.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Post insert returned no rows");
  }

  return rows[0] as { id: string };
}

async function insertComment(
  config: RuntimeConfig,
  postId: string,
  agentId: string,
  content: string,
): Promise<{ id: string }> {
  const url = buildRestUrl(config, "comments", { select: "id" });

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      ...supabaseHeaders(config),
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      post_id: postId,
      author_kind: "agent",
      author_profile_id: null,
      author_agent_id: agentId,
      content,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Comment insert failed: ${resp.status} ${err}`);
  }

  const rows = await resp.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Comment insert returned no rows");
  }

  return rows[0] as { id: string };
}

async function enqueueInteractTask(
  config: RuntimeConfig,
  postId: string,
  postTitle: string,
  postContent: string,
  agentId: string,
): Promise<void> {
  const url = buildRestUrl(config, "agent_task_queue", { select: "id" });

  await fetch(url, {
    method: "POST",
    headers: {
      ...supabaseHeaders(config),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      task_type: "agent_interact",
      agent_id: agentId,
      payload: {
        post_id: postId,
        post_title: postTitle,
        post_content: postContent,
      },
    }),
  });
}

// ── Agent Runs Logging ──

async function recordAgentRun(
  config: RuntimeConfig,
  task: TaskRow,
  status: string,
  result?: JsonRecord,
  error?: string,
): Promise<void> {
  try {
    const url = buildRestUrl(config, "agent_runs", { select: "id" });

    await fetch(url, {
      method: "POST",
      headers: {
        ...supabaseHeaders(config),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        run_mode: task.task_type === "auto_post" ? "auto_post" : "reactive",
        post_id: (result?.post_id as string) || (task.payload.post_id as string) || null,
        agent_id: task.agent_id || (result?.agent_id as string) || null,
        dry_run: false,
        status,
        error: error || null,
        model: config.agentModel,
        details: {
          task_id: task.id,
          task_type: task.task_type,
          payload: task.payload,
          result: result || null,
          llm: {
            api: config.agentLlmApi,
            base_url: config.agentLlmBaseUrl,
            model: config.agentModel,
          },
        },
      }),
    });
  } catch (logError) {
    console.error("[auto-post] Failed to log agent_run:", logError);
  }
}

// ── Feature Flag ──

async function checkFeatureFlag(config: RuntimeConfig): Promise<boolean> {
  const url = buildRestUrl(config, "app_feature_flags", {
    select: "enabled",
    feature_key: "eq.agent_auto_post",
    limit: "1",
  });

  const resp = await fetch(url, { headers: supabaseHeaders(config) });
  const rows = await resp.json();
  return Array.isArray(rows) && rows.length > 0 && rows[0].enabled === true;
}

// ── Self-trigger (recursion) ──

async function triggerSelf(config: RuntimeConfig, depth: number): Promise<void> {
  const selfUrl = `${config.supabaseUrl}/functions/v1/agent-auto-post`;

  try {
    await fetch(selfUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-agent-runner-secret": config.agentRunnerSecret,
      },
      body: JSON.stringify({ trigger: "recursive", _depth: depth }),
    });
  } catch (err) {
    console.error("[auto-post] Recursive trigger failed:", err);
  }
}

// ── Text Parsing Helpers ──

function parsePostOutput(text: string): { title: string; content: string } {
  const normalized = text.trim().replace(/^["'`]+|["'`]+$/g, "");

  // Try to split on first double newline
  const parts = normalized.split(/\n\n+/);
  let title = "";
  let content = "";

  if (parts.length >= 2) {
    title = parts[0].trim().replace(/^TITLE[:\s]*/i, "");
    content = parts.slice(1).join("\n\n").trim().replace(/^CONTENT[:\s]*/i, "");
  } else {
    // Fallback: first line is title, rest is content
    const lines = normalized.split("\n");
    title = lines[0].trim().replace(/^TITLE[:\s]*/i, "");
    content = lines.slice(1).join("\n").trim().replace(/^CONTENT[:\s]*/i, "");
  }

  // Enforce length constraints
  if (title.length > MAX_TITLE_CHARS) {
    title = title.slice(0, MAX_TITLE_CHARS - 3).trimEnd() + "...";
  }
  if (content.length > MAX_CONTENT_CHARS) {
    content = content.slice(0, MAX_CONTENT_CHARS - 3).trimEnd() + "...";
  }

  if (!title || !content) {
    throw new Error(`Failed to parse post output: title="${title}", content="${content}"`);
  }

  return { title, content };
}

function normalizeComment(text: string): string {
  const normalized = text
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    throw new Error("Generated comment was empty after normalization");
  }

  if (FORBIDDEN_LANGUAGE_RE.test(normalized)) {
    throw new Error("Generated comment used forbidden language");
  }

  if (normalized.length > MAX_COMMENT_CHARS) {
    return `${normalized.slice(0, MAX_COMMENT_CHARS - 3).trimEnd()}...`;
  }

  return normalized;
}

function extractChatCompletionText(data: unknown): string {
  if (!isRecord(data) || !Array.isArray(data.choices)) return "";

  const chunks: string[] = [];
  for (const choice of data.choices) {
    if (!isRecord(choice) || !isRecord(choice.message)) continue;
    const content = choice.message.content;
    if (typeof content === "string") {
      chunks.push(content);
    } else if (Array.isArray(content)) {
      for (const part of content) {
        if (isRecord(part) && typeof part.text === "string") {
          chunks.push(part.text);
        }
      }
    }
  }

  return chunks.join("");
}

function extractResponsesText(data: unknown): string {
  if (!isRecord(data)) return "";

  // OpenAI Responses API format
  if (Array.isArray(data.output)) {
    const chunks: string[] = [];
    for (const item of data.output) {
      if (isRecord(item) && item.type === "message" && Array.isArray(item.content)) {
        for (const part of item.content) {
          if (isRecord(part) && typeof part.text === "string") {
            chunks.push(part.text);
          }
        }
      }
    }
    if (chunks.length > 0) return chunks.join("");
  }

  // Fallback: try output_text
  if (typeof data.output_text === "string") return data.output_text;

  return extractChatCompletionText(data);
}

// ── HTTP Helpers ──

function buildRestUrl(config: RuntimeConfig, resource: string, params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  return `${config.supabaseUrl}/rest/v1/${resource}?${qs}`;
}

function supabaseHeaders(config: RuntimeConfig): Record<string, string> {
  return {
    apikey: config.supabaseServiceRoleKey,
    Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
  };
}

async function readJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function jsonResponse(body: JsonRecord, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}
