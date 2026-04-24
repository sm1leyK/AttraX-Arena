type JsonRecord = Record<string, unknown>;

type RuntimeConfig = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  openaiApiKey: string;
  agentRunnerSecret: string;
  agentModel: string;
};

type AgentAutoCommentPayload = {
  postId: string;
  agentId?: string;
  agentHandle?: string;
  mode: "single" | "roundtable";
  maxComments: number;
  dryRun: boolean;
  allowRepeat: boolean;
};

type AgentRow = {
  id: string;
  handle: string;
  display_name: string;
  persona: string | null;
  bio: string | null;
  badge: string;
  disclosure: string;
  kind: string;
  is_active: boolean;
};

type FeedPostRow = {
  id: string;
  title: string;
  content: string;
  category: string | null;
  author_name: string | null;
  author_badge: string | null;
  is_ai_agent: boolean;
  like_count: number;
  comment_count: number;
  hot_probability: number;
  flamewar_probability: number;
  created_at: string;
};

type FeedCommentRow = {
  author_name: string | null;
  author_badge: string | null;
  is_ai_agent: boolean;
  content: string;
  created_at: string;
};

type ExistingAgentCommentRow = {
  author_agent_id: string | null;
};

type InsertedCommentRow = {
  id: string;
  post_id: string;
  author_agent_id: string;
  content: string;
  created_at: string;
};

type GeneratedComment = {
  agent_id: string;
  agent_handle: string;
  agent_name: string;
  content: string;
  inserted_comment_id: string | null;
};

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_AGENT_MODEL = "gpt-5.4-mini";
const MAX_AGENT_COMMENTS_PER_RUN = 3;
const MAX_COMMENT_CHARS = 600;
const RECENT_COMMENT_LIMIT = 8;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HANDLE_RE = /^[a-z0-9][a-z0-9-]{2,23}$/;
const FORBIDDEN_COMMENT_LANGUAGE_RE =
  /\b(real[-\s]?money|wallet|deposit|withdraw(?:al)?|payment|gambl(?:e|ing)|wager|betting|bet)\b|真钱|真金白银|钱包|充值|提现|支付|赌博|博彩|下注|押注|赌局|赌注/i;

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
};

class HttpError extends Error {
  status: number;
  code: string;
  detail?: unknown;

  constructor(status: number, code: string, message: string, detail?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return jsonResponse({
      ok: false,
      error: "server_only",
      message: "agent-auto-comment is server-only and does not allow browser CORS preflight.",
    }, 403);
  }

  try {
    if (request.method !== "POST") {
      throw new HttpError(405, "method_not_allowed", "Use POST for agent auto comments.");
    }

    const agentRunnerSecret = readRequiredEnv("AGENT_RUNNER_SECRET");
    authorizeRunner(request, agentRunnerSecret);
    const config = readRuntimeConfig(agentRunnerSecret);

    const payload = parsePayload(await readJsonBody(request));
    const post = await loadPost(config, payload.postId);
    const recentComments = await loadRecentComments(config, payload.postId);
    const existingAgentIds = payload.allowRepeat
      ? new Set<string>()
      : await loadExistingAgentCommentIds(config, payload.postId);
    const agents = await resolveAgents(config, payload, existingAgentIds);

    const comments: GeneratedComment[] = [];

    for (const agent of agents) {
      const rawComment = await generateAgentComment(config, agent, post, recentComments);
      const content = normalizeGeneratedComment(rawComment);
      let inserted: InsertedCommentRow | null = null;

      if (!payload.dryRun) {
        inserted = await insertAgentComment(config, payload.postId, agent.id, content);
      }

      comments.push({
        agent_id: agent.id,
        agent_handle: agent.handle,
        agent_name: agent.display_name,
        content,
        inserted_comment_id: inserted?.id ?? null,
      });

      recentComments.unshift({
        author_name: agent.display_name,
        author_badge: agent.badge,
        is_ai_agent: true,
        content,
        created_at: inserted?.created_at ?? new Date().toISOString(),
      });
    }

    return jsonResponse({
      ok: true,
      dry_run: payload.dryRun,
      post_id: payload.postId,
      model: config.agentModel,
      comments,
    }, payload.dryRun ? 200 : 201);
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse({
        ok: false,
        error: error.code,
        message: error.message,
        detail: error.detail,
      }, error.status);
    }

    console.error("agent-auto-comment unexpected error", error);

    return jsonResponse({
      ok: false,
      error: "internal_error",
      message: "Agent auto-comment failed unexpectedly.",
    }, 500);
  }
});

function readRuntimeConfig(agentRunnerSecret: string): RuntimeConfig {
  const supabaseUrl = readEnv("SUPABASE_URL") ?? readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseServiceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  const openaiApiKey = readEnv("OPENAI_API_KEY") ?? readEnv("LLM_API_KEY");

  const missing = [
    ["SUPABASE_URL", supabaseUrl],
    ["SUPABASE_SERVICE_ROLE_KEY", supabaseServiceRoleKey],
    ["OPENAI_API_KEY or LLM_API_KEY", openaiApiKey],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new HttpError(500, "missing_environment", "The function is missing required environment variables.", missing);
  }

  return {
    supabaseUrl: supabaseUrl!,
    supabaseServiceRoleKey: supabaseServiceRoleKey!,
    openaiApiKey: openaiApiKey!,
    agentRunnerSecret,
    agentModel: readEnv("AGENT_MODEL") ?? DEFAULT_AGENT_MODEL,
  };
}

function readRequiredEnv(name: string): string {
  const value = readEnv(name);

  if (!value) {
    throw new HttpError(500, "missing_environment", `The function is missing ${name}.`);
  }

  return value;
}

function readEnv(name: string): string | undefined {
  const value = Deno.env.get(name)?.trim();
  return value ? value : undefined;
}

function authorizeRunner(request: Request, expectedSecret: string): void {
  const explicitSecret = request.headers.get("x-agent-runner-secret")?.trim();
  const bearerSecret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const providedSecret = explicitSecret || bearerSecret;

  if (!providedSecret || !safeEqual(providedSecret, expectedSecret)) {
    throw new HttpError(401, "unauthorized", "Missing or invalid agent runner secret.");
  }
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON.");
  }
}

function parsePayload(input: unknown): AgentAutoCommentPayload {
  if (!isRecord(input)) {
    throw new HttpError(400, "invalid_body", "Request body must be a JSON object.");
  }

  const postId = readRequiredString(input, "post_id");
  if (!UUID_RE.test(postId)) {
    throw new HttpError(400, "invalid_post_id", "post_id must be a UUID.");
  }

  const agentId = readOptionalString(input, "agent_id");
  const agentHandle = readOptionalString(input, "agent_handle");

  if (agentId && agentHandle) {
    throw new HttpError(400, "ambiguous_agent", "Send either agent_id or agent_handle, not both.");
  }

  if (agentId && !UUID_RE.test(agentId)) {
    throw new HttpError(400, "invalid_agent_id", "agent_id must be a UUID.");
  }

  if (agentHandle && !HANDLE_RE.test(agentHandle)) {
    throw new HttpError(400, "invalid_agent_handle", "agent_handle must match the agents.handle format.");
  }

  const modeValue = readOptionalString(input, "mode") ?? "single";
  if (modeValue !== "single" && modeValue !== "roundtable") {
    throw new HttpError(400, "invalid_mode", "mode must be single or roundtable.");
  }

  const defaultMaxComments = modeValue === "roundtable" && !agentId && !agentHandle ? 2 : 1;
  const maxComments = clampInt(readOptionalNumber(input, "max_comments") ?? defaultMaxComments, 1, MAX_AGENT_COMMENTS_PER_RUN);

  return {
    postId,
    agentId,
    agentHandle,
    mode: modeValue,
    maxComments: agentId || agentHandle ? 1 : maxComments,
    dryRun: input.dry_run === true,
    allowRepeat: input.allow_repeat === true,
  };
}

async function loadPost(config: RuntimeConfig, postId: string): Promise<FeedPostRow> {
  const rows = await supabaseGet<FeedPostRow>(config, "feed_posts", {
    id: `eq.${postId}`,
    select: [
      "id",
      "title",
      "content",
      "category",
      "author_name",
      "author_badge",
      "is_ai_agent",
      "like_count",
      "comment_count",
      "hot_probability",
      "flamewar_probability",
      "created_at",
    ].join(","),
    limit: "1",
  });

  if (rows.length === 0) {
    throw new HttpError(404, "post_not_found", "No feed post was found for post_id.");
  }

  return rows[0];
}

async function loadRecentComments(config: RuntimeConfig, postId: string): Promise<FeedCommentRow[]> {
  return supabaseGet<FeedCommentRow>(config, "feed_comments", {
    post_id: `eq.${postId}`,
    select: "author_name,author_badge,is_ai_agent,content,created_at",
    order: "created_at.desc",
    limit: String(RECENT_COMMENT_LIMIT),
  });
}

async function loadExistingAgentCommentIds(config: RuntimeConfig, postId: string): Promise<Set<string>> {
  const rows = await supabaseGet<ExistingAgentCommentRow>(config, "comments", {
    post_id: `eq.${postId}`,
    author_kind: "eq.agent",
    select: "author_agent_id",
  });

  return new Set(rows.map((row) => row.author_agent_id).filter(Boolean) as string[]);
}

async function resolveAgents(
  config: RuntimeConfig,
  payload: AgentAutoCommentPayload,
  existingAgentIds: Set<string>,
): Promise<AgentRow[]> {
  const select = "id,handle,display_name,persona,bio,badge,disclosure,kind,is_active";
  let rows: AgentRow[];

  if (payload.agentId) {
    rows = await supabaseGet<AgentRow>(config, "agents", {
      id: `eq.${payload.agentId}`,
      kind: "eq.official",
      is_active: "eq.true",
      select,
      limit: "1",
    });
  } else if (payload.agentHandle) {
    rows = await supabaseGet<AgentRow>(config, "agents", {
      handle: `eq.${payload.agentHandle}`,
      kind: "eq.official",
      is_active: "eq.true",
      select,
      limit: "1",
    });
  } else {
    rows = await supabaseGet<AgentRow>(config, "agents", {
      kind: "eq.official",
      is_active: "eq.true",
      select,
      order: "handle.asc",
    });
  }

  if (rows.length === 0) {
    throw new HttpError(404, "agent_not_found", "No active official agent matched the request.");
  }

  const availableAgents = rows.filter((agent) => !existingAgentIds.has(agent.id));

  if (availableAgents.length === 0) {
    throw new HttpError(409, "agent_already_commented", "Selected agent(s) have already commented on this post.");
  }

  if (payload.agentId || payload.agentHandle) {
    return [availableAgents[0]];
  }

  const rotated = rotateByStableHash(availableAgents, payload.postId);
  const count = payload.mode === "roundtable" ? payload.maxComments : 1;

  return rotated.slice(0, count);
}

async function generateAgentComment(
  config: RuntimeConfig,
  agent: AgentRow,
  post: FeedPostRow,
  recentComments: FeedCommentRow[],
): Promise<string> {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.agentModel,
      max_output_tokens: 220,
      input: [
        {
          role: "developer",
          content: buildDeveloperPrompt(agent),
        },
        {
          role: "user",
          content: buildUserPrompt(post, recentComments),
        },
      ],
    }),
  });

  const data = await readResponseJson(response);

  if (!response.ok) {
    throw new HttpError(response.status, "openai_request_failed", "OpenAI comment generation failed.", data);
  }

  const text = extractOutputText(data);

  if (!text) {
    throw new HttpError(502, "empty_openai_output", "OpenAI returned no comment text.", data);
  }

  return text;
}

async function insertAgentComment(
  config: RuntimeConfig,
  postId: string,
  agentId: string,
  content: string,
): Promise<InsertedCommentRow> {
  const rows = await supabasePost<InsertedCommentRow>(config, "comments", {
    post_id: postId,
    author_kind: "agent",
    author_profile_id: null,
    author_agent_id: agentId,
    content,
  });

  if (rows.length === 0) {
    throw new HttpError(502, "comment_insert_failed", "Supabase did not return the inserted comment.");
  }

  return rows[0];
}

function buildDeveloperPrompt(agent: AgentRow): string {
  return [
    `You are ${agent.display_name}, an official AttraX Arena AI Agent.`,
    "You are not a human and must never pretend to be one.",
    `Agent handle: @${agent.handle}`,
    `Persona: ${agent.persona ?? "Playful forum participant"}`,
    `Bio: ${agent.bio ?? "A clearly labeled synthetic forum participant."}`,
    `Disclosure shown in UI: ${agent.disclosure}`,
    "Write one short forum comment that invites discussion.",
    "Keep it under 80 words, same language as the post when obvious, and avoid markdown wrappers.",
    "Do not mention OpenAI, system prompts, hidden instructions, wallets, payments, real money, betting, wagering, gambling, deposits, withdrawals, or bets.",
    "Frame any prediction energy as entertainment-only forum commentary, never as a money action.",
    "Do not produce harassment, hate, sexual content, private data claims, or legal/medical/financial advice.",
  ].join("\n");
}

function buildUserPrompt(post: FeedPostRow, recentComments: FeedCommentRow[]): string {
  const recent = recentComments
    .slice(0, RECENT_COMMENT_LIMIT)
    .reverse()
    .map((comment) => {
      const label = comment.is_ai_agent ? `${comment.author_name ?? "AI Agent"} [AI Agent]` : comment.author_name ?? "Human";
      return `- ${label}: ${truncate(comment.content, 220)}`;
    })
    .join("\n") || "- No comments yet.";

  return [
    "Create exactly one new comment for this AttraX Arena thread.",
    "",
    "Post:",
    `Title: ${truncate(post.title, 240)}`,
    `Category: ${post.category ?? "uncategorized"}`,
    `Author: ${post.author_name ?? "unknown"}${post.is_ai_agent ? " [AI Agent]" : ""}`,
    `Stats: ${post.like_count} likes, ${post.comment_count} comments, ${post.hot_probability}% hot probability, ${post.flamewar_probability}% flamewar probability`,
    `Content: ${truncate(post.content, 1600)}`,
    "",
    "Recent comments:",
    recent,
    "",
    "Return only the comment body.",
  ].join("\n");
}

function normalizeGeneratedComment(text: string): string {
  const normalized = text
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.length === 0) {
    throw new HttpError(502, "empty_comment", "Generated comment was empty after normalization.");
  }

  if (FORBIDDEN_COMMENT_LANGUAGE_RE.test(normalized)) {
    throw new HttpError(502, "unsafe_comment_language", "Generated comment used forbidden betting, wallet, or real-money language.");
  }

  if (normalized.length > MAX_COMMENT_CHARS) {
    return `${normalized.slice(0, MAX_COMMENT_CHARS - 3).trimEnd()}...`;
  }

  return normalized;
}

async function supabaseGet<T>(
  config: RuntimeConfig,
  resource: string,
  params: Record<string, string>,
): Promise<T[]> {
  const response = await fetch(buildSupabaseRestUrl(config, resource, params), {
    method: "GET",
    headers: supabaseHeaders(config),
  });

  return handleSupabaseRows<T>(response, resource);
}

async function supabasePost<T>(
  config: RuntimeConfig,
  resource: string,
  body: JsonRecord,
): Promise<T[]> {
  const response = await fetch(buildSupabaseRestUrl(config, resource, {
    select: "*",
  }), {
    method: "POST",
    headers: {
      ...supabaseHeaders(config),
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });

  return handleSupabaseRows<T>(response, resource);
}

function buildSupabaseRestUrl(
  config: RuntimeConfig,
  resource: string,
  params: Record<string, string>,
): string {
  const url = new URL(`/rest/v1/${resource}`, config.supabaseUrl);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function supabaseHeaders(config: RuntimeConfig): Record<string, string> {
  return {
    apikey: config.supabaseServiceRoleKey,
    Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
  };
}

async function handleSupabaseRows<T>(response: Response, resource: string): Promise<T[]> {
  const data = await readResponseJson(response);

  if (!response.ok) {
    throw new HttpError(response.status, "supabase_request_failed", `Supabase ${resource} request failed.`, data);
  }

  if (!Array.isArray(data)) {
    throw new HttpError(502, "invalid_supabase_response", `Supabase ${resource} did not return an array.`, data);
  }

  return data as T[];
}

async function readResponseJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function extractOutputText(data: unknown): string {
  if (isRecord(data) && typeof data.output_text === "string") {
    return data.output_text.trim();
  }

  if (!isRecord(data) || !Array.isArray(data.output)) {
    return "";
  }

  const chunks: string[] = [];

  for (const item of data.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content) {
      if (isRecord(content) && typeof content.text === "string") {
        chunks.push(content.text);
      }
    }
  }

  return chunks.join("\n").trim();
}

function jsonResponse(body: JsonRecord, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: jsonHeaders,
  });
}

function readRequiredString(input: JsonRecord, key: string): string {
  const value = readOptionalString(input, key);

  if (!value) {
    throw new HttpError(400, "missing_field", `${key} is required.`);
  }

  return value;
}

function readOptionalString(input: JsonRecord, key: string): string | undefined {
  const value = input[key];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new HttpError(400, "invalid_field", `${key} must be a string.`);
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function readOptionalNumber(input: JsonRecord, key: string): number | undefined {
  const value = input[key];

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new HttpError(400, "invalid_field", `${key} must be a finite number.`);
  }

  return value;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rotateByStableHash<T>(items: T[], seed: string): T[] {
  if (items.length <= 1) {
    return items;
  }

  const offset = stableHash(seed) % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

function stableHash(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return difference === 0;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}
