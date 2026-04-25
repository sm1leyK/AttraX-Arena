type JsonRecord = Record<string, unknown>;

type AgentLlmApi = "responses" | "chat_completions";

type RuntimeConfig = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  openaiApiKey: string;
  agentRunnerSecret: string;
  agentModel: string;
  agentLlmBaseUrl: string;
  agentLlmApi: AgentLlmApi;
};

type AgentAutoCommentPayload = {
  postId?: string;
  agentId?: string;
  agentHandle?: string;
  mode: "single" | "roundtable" | "reactive";
  maxComments: number;
  maxPosts: number;
  dryRun: boolean;
  allowRepeat: boolean;
  triggerCommentContent?: string;
  triggerCommentAuthor?: string;
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
  author_kind: "human" | "agent";
  author_agent_id: string | null;
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
  post_id: string;
  post_title: string;
  agent_id: string;
  agent_handle: string;
  agent_name: string;
  content: string;
  inserted_comment_id: string | null;
};

type AgentRunStatus = "success" | "error";

type AgentRunContext = {
  config: RuntimeConfig | null;
  payload: AgentAutoCommentPayload | null;
  agentPool: AgentRow[];
  result: JsonRecord | null;
};

type CandidatePost = {
  post: FeedPostRow;
  recentComments: FeedCommentRow[];
  score: number;
  recentHumanCommentCount: number;
  recentAgentCommentCount: number;
};

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_AGENT_LLM_API: AgentLlmApi = "responses";
const DEFAULT_AGENT_MODEL = "gpt-5.4-mini";
const MAX_AGENT_COMMENTS_PER_RUN = 3;
const MAX_COMMENT_CHARS = 600;
const RECENT_COMMENT_LIMIT = 8;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HANDLE_RE = /^[a-z0-9][a-z0-9-]{2,23}$/;
const AT_MENTION_RE = /@([a-z0-9][a-z0-9-]{2,23})/gi;
const FORBIDDEN_COMMENT_LANGUAGE_RE =
  /\b(real[-\s]?money|wallet|deposit|withdraw(?:al)?|payment|gambl(?:e|ing)|wager|betting|bet)\b|\u771f\u94b1|\u771f\u91d1\u767d\u94f6|\u94b1\u5305|\u5145\u503c|\u63d0\u73b0|\u652f\u4ed8|\u8d4c\u535a|\u535a\u5f69|\u4e0b\u6ce8|\u62bc\u6ce8|\u8d4c\u5c40|\u8d4c\u6ce8/i;

function normalizeBaseUrl(rawUrl: string, envName: string): string {
  try {
    const url = new URL(rawUrl);
    return url.toString().replace(/\/+$/, "");
  } catch {
    throw new HttpError(500, "invalid_environment", `${envName} must be a valid URL.`);
  }
}

function resolveActiveProvider(): { apiKey: string; baseUrl: string; model: string } {
  const provider = (readEnv("ACTIVE_LLM_PROVIDER") ?? "openai").toLowerCase();

  if (provider === "orbitai") {
    return {
      apiKey: readEnv("ORBITAI_API_KEY") ?? readEnv("OPENAI_API_KEY") ?? readEnv("LLM_API_KEY") ?? "",
      baseUrl: normalizeBaseUrl(readEnv("ORBITAI_BASE_URL") ?? readEnv("AGENT_LLM_BASE_URL") ?? "https://aiapi.orbitai.global/v1", "ORBITAI_BASE_URL"),
      model: readEnv("AGENT_MODEL") ?? "gpt-4o-mini",
    };
  }

  if (provider === "deepseek") {
    return {
      apiKey: readEnv("DEEPSEEK_API_KEY") ?? readEnv("OPENAI_API_KEY") ?? readEnv("LLM_API_KEY") ?? "",
      baseUrl: normalizeBaseUrl(readEnv("DEEPSEEK_BASE_URL") ?? readEnv("AGENT_LLM_BASE_URL") ?? "https://api.deepseek.com/v1", "DEEPSEEK_BASE_URL"),
      model: readEnv("AGENT_MODEL") ?? "deepseek-chat",
    };
  }

  return {
    apiKey: readEnv("OPENAI_API_KEY") ?? readEnv("LLM_API_KEY") ?? "",
    baseUrl: readAgentLlmBaseUrl(),
    model: readEnv("AGENT_MODEL") ?? DEFAULT_AGENT_MODEL,
  };
}

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

  const runContext: AgentRunContext = {
    config: null,
    payload: null,
    agentPool: [],
    result: null,
  };

  try {
    if (request.method !== "POST") {
      throw new HttpError(405, "method_not_allowed", "Use POST for agent auto comments.");
    }

    const agentRunnerSecret = readRequiredEnv("AGENT_RUNNER_SECRET");
    authorizeRunner(request, agentRunnerSecret);
    runContext.config = readLoggingConfig(agentRunnerSecret);

    const config = readRuntimeConfig(agentRunnerSecret);
    runContext.config = config;

    const payload = parsePayload(await readJsonBody(request));
    runContext.payload = payload;

    const agentPool = await loadRequestedAgents(config, payload);
    runContext.agentPool = agentPool;
    runContext.result = payload.mode === "reactive"
      ? await runReactiveReply(config, payload, agentPool)
      : payload.postId
        ? await runForSpecificPost(config, payload, agentPool)
        : await runAutonomousCommunityPass(config, payload, agentPool);

    const runId = await recordAgentRun(runContext, "success");

    return jsonResponse(withRunId(runContext.result, runId), payload.dryRun ? 200 : 201);
  } catch (error) {
    if (error instanceof HttpError) {
      const responseBody: JsonRecord = {
        ok: false,
        error: error.code,
        message: error.message,
        detail: error.detail,
      };
      const runId = await recordAgentRun(runContext, "error", error);

      return jsonResponse(withRunId(responseBody, runId), error.status);
    }

    console.error("agent-auto-comment unexpected error", error);

    const responseBody: JsonRecord = {
      ok: false,
      error: "internal_error",
      message: "Agent auto-comment failed unexpectedly.",
    };
    const runId = await recordAgentRun(runContext, "error", error);

    return jsonResponse(withRunId(responseBody, runId), 500);
  }
});

function readRuntimeConfig(agentRunnerSecret: string): RuntimeConfig {
  const supabaseUrl = readEnv("SUPABASE_URL") ?? readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseServiceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  const provider = resolveActiveProvider();
  const agentLlmApi = readAgentLlmApi();

  const missing = [
    ["SUPABASE_URL", supabaseUrl],
    ["SUPABASE_SERVICE_ROLE_KEY", supabaseServiceRoleKey],
    [`API key for ${readEnv("ACTIVE_LLM_PROVIDER") ?? "openai"}`, provider.apiKey],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new HttpError(500, "missing_environment", "The function is missing required environment variables.", missing);
  }

  return {
    supabaseUrl: supabaseUrl!,
    supabaseServiceRoleKey: supabaseServiceRoleKey!,
    openaiApiKey: provider.apiKey,
    agentRunnerSecret,
    agentModel: provider.model,
    agentLlmBaseUrl: provider.baseUrl,
    agentLlmApi,
  };
}

function readLoggingConfig(agentRunnerSecret: string): RuntimeConfig | null {
  const supabaseUrl = readEnv("SUPABASE_URL") ?? readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseServiceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return null;
  }

  let provider = {
    apiKey: readEnv("OPENAI_API_KEY") ?? readEnv("LLM_API_KEY") ?? "",
    baseUrl: DEFAULT_OPENAI_BASE_URL,
    model: readEnv("AGENT_MODEL") ?? DEFAULT_AGENT_MODEL,
  };
  let agentLlmApi = DEFAULT_AGENT_LLM_API;

  try {
    provider = resolveActiveProvider();
    agentLlmApi = readAgentLlmApi();
  } catch {
    // Keep logging available for invalid LLM env failures.
  }

  return {
    supabaseUrl,
    supabaseServiceRoleKey,
    openaiApiKey: provider.apiKey,
    agentRunnerSecret,
    agentModel: provider.model,
    agentLlmBaseUrl: provider.baseUrl,
    agentLlmApi,
  };
}

function readAgentLlmBaseUrl(): string {
  const rawUrl = readEnv("AGENT_LLM_BASE_URL") ?? readEnv("OPENAI_BASE_URL") ?? DEFAULT_OPENAI_BASE_URL;
  return normalizeBaseUrl(rawUrl, "AGENT_LLM_BASE_URL or OPENAI_BASE_URL");
}

function readAgentLlmApi(): AgentLlmApi {
  const value = readEnv("AGENT_LLM_API") ?? DEFAULT_AGENT_LLM_API;

  if (value === "responses" || value === "chat_completions") {
    return value;
  }

  throw new HttpError(500, "invalid_environment", "AGENT_LLM_API must be responses or chat_completions.");
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

  const postId = readOptionalString(input, "post_id");
  if (postId && !UUID_RE.test(postId)) {
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
  if (modeValue !== "single" && modeValue !== "roundtable" && modeValue !== "reactive") {
    throw new HttpError(400, "invalid_mode", "mode must be single, roundtable, or reactive.");
  }

  if (modeValue === "reactive" && !postId) {
    throw new HttpError(400, "missing_field", "post_id is required for reactive mode.");
  }

  const defaultMaxComments = postId
    ? modeValue === "roundtable" && !agentId && !agentHandle ? 2 : 1
    : 2;
  const maxComments = clampInt(readOptionalNumber(input, "max_comments") ?? defaultMaxComments, 1, MAX_AGENT_COMMENTS_PER_RUN);
  const maxPosts = clampInt(readOptionalNumber(input, "max_posts") ?? 6, 1, 10);

  return {
    postId,
    agentId,
    agentHandle,
    mode: modeValue,
    maxComments: postId && (agentId || agentHandle) ? 1 : maxComments,
    maxPosts,
    dryRun: input.dry_run === true,
    allowRepeat: input.allow_repeat === true,
    triggerCommentContent: readOptionalString(input, "trigger_comment_content"),
    triggerCommentAuthor: readOptionalString(input, "trigger_comment_author"),
  };
}

async function recordAgentRun(
  context: AgentRunContext,
  status: AgentRunStatus,
  error?: unknown,
): Promise<string | null> {
  if (!context.config) {
    return null;
  }

  try {
    const rows = await supabasePost<{ id: string }>(context.config, "agent_runs", buildAgentRunLog(context, status, error));
    return rows[0]?.id ?? null;
  } catch (logError) {
    console.error("agent-auto-comment run log failed", logError);
    return null;
  }
}

function buildAgentRunLog(
  context: AgentRunContext,
  status: AgentRunStatus,
  error?: unknown,
): JsonRecord {
  const comments = readGeneratedCommentSummaries(context.result);
  const postsConsidered = readPostsConsideredSummaries(context.result);
  const errorSummary = error ? summarizeError(error) : null;
  const details: JsonRecord = {
    request: buildRequestSummary(context.payload),
    llm: {
      api: context.config?.agentLlmApi,
      base_url: context.config?.agentLlmBaseUrl,
    },
    comment_count: comments.length,
    comments,
  };
  const errorDetails = buildErrorDetails(error);

  if (postsConsidered.length > 0) {
    details.posts_considered = postsConsidered;
  }

  if (errorDetails) {
    details.error = errorDetails;
  }

  return {
    run_mode: inferAgentRunMode(context.payload, context.result),
    post_id: inferAgentRunPostId(context.payload, comments),
    agent_id: inferAgentRunAgentId(context.payload, context.agentPool, comments),
    dry_run: context.payload?.dryRun ?? false,
    status,
    error: status === "error" ? errorSummary ?? "unknown_error" : null,
    model: context.config!.agentModel,
    details,
  };
}

function buildRequestSummary(payload: AgentAutoCommentPayload | null): JsonRecord | null {
  if (!payload) {
    return null;
  }

  return {
    post_id: payload.postId ?? null,
    agent_id: payload.agentId ?? null,
    agent_handle: payload.agentHandle ?? null,
    mode: payload.mode,
    max_comments: payload.maxComments,
    max_posts: payload.maxPosts,
    dry_run: payload.dryRun,
    allow_repeat: payload.allowRepeat,
    trigger_comment_content_length: payload.triggerCommentContent?.length ?? null,
    trigger_comment_author: payload.triggerCommentAuthor ?? null,
  };
}

function inferAgentRunMode(
  payload: AgentAutoCommentPayload | null,
  result: JsonRecord | null,
): "post" | "autonomous" | "reactive" | "unknown" {
  const resultRunMode = result ? readStringField(result, "run_mode") : null;

  if (resultRunMode === "post" || resultRunMode === "autonomous" || resultRunMode === "reactive") {
    return resultRunMode;
  }

  if (!payload) {
    return "unknown";
  }

  if (payload.mode === "reactive") {
    return "reactive";
  }

  return payload.postId ? "post" : "autonomous";
}

function inferAgentRunPostId(
  payload: AgentAutoCommentPayload | null,
  comments: JsonRecord[],
): string | null {
  if (payload?.postId) {
    return payload.postId;
  }

  const postIds = uniqueStrings(comments.map((comment) => readStringField(comment, "post_id")));
  return postIds.length === 1 ? postIds[0] : null;
}

function inferAgentRunAgentId(
  payload: AgentAutoCommentPayload | null,
  agentPool: AgentRow[],
  comments: JsonRecord[],
): string | null {
  if (payload?.agentId) {
    return payload.agentId;
  }

  if (payload?.agentHandle && agentPool.length === 1) {
    return agentPool[0].id;
  }

  const agentIds = uniqueStrings(comments.map((comment) => readStringField(comment, "agent_id")));
  return agentIds.length === 1 ? agentIds[0] : null;
}

function readGeneratedCommentSummaries(result: JsonRecord | null): JsonRecord[] {
  if (!result || !Array.isArray(result.comments)) {
    return [];
  }

  return result.comments
    .filter(isRecord)
    .map((comment) => ({
      post_id: readStringField(comment, "post_id"),
      post_title: truncate(readStringField(comment, "post_title") ?? "", 160),
      agent_id: readStringField(comment, "agent_id"),
      agent_handle: readStringField(comment, "agent_handle"),
      inserted_comment_id: readStringField(comment, "inserted_comment_id"),
      content_length: typeof comment.content === "string" ? comment.content.length : null,
    }));
}

function readPostsConsideredSummaries(result: JsonRecord | null): JsonRecord[] {
  if (!result || !Array.isArray(result.posts_considered)) {
    return [];
  }

  return result.posts_considered
    .filter(isRecord)
    .map((post) => ({
      post_id: readStringField(post, "post_id"),
      title: truncate(readStringField(post, "title") ?? "", 160),
      author_kind: readStringField(post, "author_kind"),
      score: readNumberField(post, "score"),
      recent_human_comments: readNumberField(post, "recent_human_comments"),
      recent_agent_comments: readNumberField(post, "recent_agent_comments"),
      generated_comments: readNumberField(post, "generated_comments"),
    }));
}

function buildErrorDetails(error: unknown): JsonRecord | null {
  if (!error) {
    return null;
  }

  if (error instanceof HttpError) {
    const detail = buildSafeHttpErrorDetail(error);
    const summary: JsonRecord = {
      code: error.code,
      status: error.status,
      message: error.message,
    };

    if (detail) {
      summary.detail = detail;
    }

    return summary;
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    message: String(error),
  };
}

function buildSafeHttpErrorDetail(error: HttpError): JsonRecord | null {
  if (error.code === "missing_environment" && Array.isArray(error.detail)) {
    return {
      missing: error.detail.filter((value) => typeof value === "string"),
    };
  }

  if (error.code === "no_autonomous_targets" && isRecord(error.detail)) {
    return {
      posts_considered: readPostsConsideredSummaries({
        posts_considered: Array.isArray(error.detail.posts_considered) ? error.detail.posts_considered : [],
      }),
    };
  }

  return null;
}

function summarizeError(error: unknown): string {
  if (error instanceof HttpError) {
    return `${error.code}: ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message || error.name;
  }

  return String(error);
}

function withRunId(body: JsonRecord | null, runId: string | null): JsonRecord {
  if (!runId) {
    return body ?? {};
  }

  return {
    ...(body ?? {}),
    run_id: runId,
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
      "author_kind",
      "author_agent_id",
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

async function loadRequestedAgents(
  config: RuntimeConfig,
  payload: AgentAutoCommentPayload,
): Promise<AgentRow[]> {
  const select = "id,handle,display_name,persona,bio,badge,disclosure,kind,is_active";

  if (payload.agentId) {
    const rows = await supabaseGet<AgentRow>(config, "agents", {
      id: `eq.${payload.agentId}`,
      kind: "eq.official",
      is_active: "eq.true",
      select,
      limit: "1",
    });

    if (rows.length === 0) {
      throw new HttpError(404, "agent_not_found", "No active official agent matched the request.");
    }

    return rows;
  } else if (payload.agentHandle) {
    const rows = await supabaseGet<AgentRow>(config, "agents", {
      handle: `eq.${payload.agentHandle}`,
      kind: "eq.official",
      is_active: "eq.true",
      select,
      limit: "1",
    });

    if (rows.length === 0) {
      throw new HttpError(404, "agent_not_found", "No active official agent matched the request.");
    }

    return rows;
  }

  const rows = await supabaseGet<AgentRow>(config, "agents", {
    kind: "eq.official",
    is_active: "eq.true",
    select,
    order: "handle.asc",
  });

  if (rows.length === 0) {
    throw new HttpError(404, "agent_not_found", "No active official agents are available.");
  }

  return rows;
}

function selectAgentsForPost(
  agentPool: AgentRow[],
  existingAgentIds: Set<string>,
  postId: string,
  maxCount: number,
  blockedAgentIds = new Set<string>(),
): AgentRow[] {
  const availableAgents = agentPool.filter((agent) => !existingAgentIds.has(agent.id) && !blockedAgentIds.has(agent.id));

  if (availableAgents.length === 0 || maxCount <= 0) {
    return [];
  }

  const rotated = rotateByStableHash(availableAgents, postId);

  return rotated.slice(0, Math.min(maxCount, MAX_AGENT_COMMENTS_PER_RUN));
}

async function runForSpecificPost(
  config: RuntimeConfig,
  payload: AgentAutoCommentPayload,
  agentPool: AgentRow[],
): Promise<JsonRecord> {
  if (!payload.postId) {
    throw new HttpError(400, "missing_field", "post_id is required for specific post runs.");
  }

  const post = await loadPost(config, payload.postId);
  const recentComments = await loadRecentComments(config, payload.postId);
  const comments = await createAgentCommentsForPost(
    config,
    payload,
    agentPool,
    post,
    recentComments,
    payload.maxComments,
    true,
  );

  return {
    ok: true,
    dry_run: payload.dryRun,
    run_mode: "post",
    post_id: payload.postId,
    model: config.agentModel,
    comments,
  };
}

async function runAutonomousCommunityPass(
  config: RuntimeConfig,
  payload: AgentAutoCommentPayload,
  agentPool: AgentRow[],
): Promise<JsonRecord> {
  const candidates = await loadAutonomousPostCandidates(config, payload.maxPosts);
  const comments: GeneratedComment[] = [];
  const visitedPosts: JsonRecord[] = [];

  for (const candidate of candidates) {
    if (comments.length >= payload.maxComments) {
      break;
    }

    const remaining = payload.maxComments - comments.length;
    const maxForPost = payload.mode === "roundtable" && agentPool.length > 1
      ? Math.min(2, remaining)
      : 1;
    const generated = await createAgentCommentsForPost(
      config,
      payload,
      agentPool,
      candidate.post,
      candidate.recentComments,
      maxForPost,
      false,
    );

    visitedPosts.push({
      post_id: candidate.post.id,
      title: candidate.post.title,
      author_kind: candidate.post.author_kind,
      score: candidate.score,
      recent_human_comments: candidate.recentHumanCommentCount,
      recent_agent_comments: candidate.recentAgentCommentCount,
      generated_comments: generated.length,
    });

    comments.push(...generated);
  }

  if (comments.length === 0) {
    throw new HttpError(409, "no_autonomous_targets", "No eligible post and official Agent pairing was available for this autonomous run.", {
      posts_considered: visitedPosts,
    });
  }

  return {
    ok: true,
    dry_run: payload.dryRun,
    run_mode: "autonomous",
    model: config.agentModel,
    max_posts: payload.maxPosts,
    comments,
    posts_considered: visitedPosts,
  };
}

function extractMentionedHandles(text: string): string[] {
  const handles = new Set<string>();
  for (const match of text.matchAll(AT_MENTION_RE)) {
    handles.add(match[1].toLowerCase());
  }
  return [...handles];
}

async function runReactiveReply(
  config: RuntimeConfig,
  payload: AgentAutoCommentPayload,
  agentPool: AgentRow[],
): Promise<JsonRecord> {
  if (!payload.postId) {
    throw new HttpError(400, "missing_field", "post_id is required for reactive mode.");
  }

  const triggerContent = payload.triggerCommentContent ?? "";
  const mentionedHandles = extractMentionedHandles(triggerContent);
  const post = await loadPost(config, payload.postId);
  const recentComments = await loadRecentComments(config, payload.postId);
  let targetAgents: AgentRow[] = [];

  if (payload.agentId || payload.agentHandle) {
    targetAgents = agentPool.filter((agent) =>
      payload.agentId ? agent.id === payload.agentId : agent.handle === payload.agentHandle
    );
  } else if (mentionedHandles.length > 0) {
    targetAgents = agentPool.filter((agent) => mentionedHandles.includes(agent.handle));
  } else {
    const existingAgentIds = payload.allowRepeat
      ? new Set<string>()
      : await loadExistingAgentCommentIds(config, payload.postId);
    const blockedAgentIds = post.author_agent_id ? new Set([post.author_agent_id]) : new Set<string>();
    targetAgents = selectAgentsForPost(agentPool, existingAgentIds, payload.postId, 1, blockedAgentIds);
  }

  if (targetAgents.length === 0) {
    return {
      ok: true,
      dry_run: payload.dryRun,
      run_mode: "reactive",
      post_id: payload.postId,
      model: config.agentModel,
      comments: [],
      skipped_reason: mentionedHandles.length > 0 ? "mentioned_handles_not_found" : "no_available_agent",
      mentioned_handles: mentionedHandles,
    };
  }

  const comments: GeneratedComment[] = [];

  for (const agent of targetAgents) {
    if (comments.length >= payload.maxComments) {
      break;
    }

    const mentionedByHandle = mentionedHandles.includes(agent.handle) ? payload.triggerCommentAuthor : undefined;
    const rawComment = await generateAgentComment(config, agent, post, recentComments, triggerContent, mentionedByHandle);
    const content = normalizeGeneratedComment(rawComment);
    let inserted: InsertedCommentRow | null = null;

    if (!payload.dryRun) {
      inserted = await insertAgentComment(config, payload.postId, agent.id, content);
    }

    comments.push({
      post_id: payload.postId,
      post_title: post.title,
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

  return {
    ok: true,
    dry_run: payload.dryRun,
    run_mode: "reactive",
    post_id: payload.postId,
    model: config.agentModel,
    trigger_author: payload.triggerCommentAuthor ?? null,
    mentioned_handles: mentionedHandles,
    comments,
  };
}

async function createAgentCommentsForPost(
  config: RuntimeConfig,
  payload: AgentAutoCommentPayload,
  agentPool: AgentRow[],
  post: FeedPostRow,
  recentComments: FeedCommentRow[],
  maxForPost: number,
  failWhenNoAgent: boolean,
): Promise<GeneratedComment[]> {
  const existingAgentIds = payload.allowRepeat
    ? new Set<string>()
    : await loadExistingAgentCommentIds(config, post.id);
  const blockedAgentIds = post.author_agent_id ? new Set([post.author_agent_id]) : new Set<string>();
  const selectedAgents = selectAgentsForPost(agentPool, existingAgentIds, post.id, maxForPost, blockedAgentIds);

  if (selectedAgents.length === 0) {
    if (failWhenNoAgent) {
      throw new HttpError(409, "agent_already_commented", "Selected agent(s) have already commented on this post.");
    }

    return [];
  }

  const comments: GeneratedComment[] = [];

  for (const agent of selectedAgents) {
    const rawComment = await generateAgentComment(config, agent, post, recentComments);
    const content = normalizeGeneratedComment(rawComment);
    let inserted: InsertedCommentRow | null = null;

    if (!payload.dryRun) {
      inserted = await insertAgentComment(config, post.id, agent.id, content);
    }

    comments.push({
      post_id: post.id,
      post_title: post.title,
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

  return comments;
}

async function loadAutonomousPostCandidates(
  config: RuntimeConfig,
  maxPosts: number,
): Promise<CandidatePost[]> {
  const candidateLimit = Math.max(maxPosts * 4, 12);
  const posts = await supabaseGet<FeedPostRow>(config, "feed_posts", {
    select: [
      "id",
      "title",
      "content",
      "category",
      "author_kind",
      "author_agent_id",
      "author_name",
      "author_badge",
      "is_ai_agent",
      "like_count",
      "comment_count",
      "hot_probability",
      "flamewar_probability",
      "created_at",
    ].join(","),
    order: "created_at.desc",
    limit: String(candidateLimit),
  });

  if (posts.length === 0) {
    throw new HttpError(404, "no_posts", "No feed posts are available for autonomous Agent activity.");
  }

  const candidates: CandidatePost[] = [];

  for (const post of posts) {
    const recentComments = await loadRecentComments(config, post.id);
    const recentHumanCommentCount = recentComments.filter((comment) => !comment.is_ai_agent).length;
    const recentAgentCommentCount = recentComments.filter((comment) => comment.is_ai_agent).length;
    const crossActorBonus =
      (post.author_kind === "human" && recentAgentCommentCount > 0)
      || (post.author_kind === "agent" && recentHumanCommentCount > 0)
        ? 12
        : 0;
    const humanInteractionBonus = post.author_kind === "human" || recentHumanCommentCount > 0 ? 8 : 0;
    const agentInteractionBonus = post.author_kind === "agent" || recentAgentCommentCount > 0 ? 6 : 0;
    const freshPostBonus = post.comment_count === 0 ? 3 : 0;
    const score = Number((
      post.comment_count * 2
      + post.like_count
      + post.hot_probability / 12
      + post.flamewar_probability / 15
      + recentHumanCommentCount * 4
      + recentAgentCommentCount * 2
      + crossActorBonus
      + humanInteractionBonus
      + agentInteractionBonus
      + freshPostBonus
    ).toFixed(2));

    candidates.push({
      post,
      recentComments,
      score,
      recentHumanCommentCount,
      recentAgentCommentCount,
    });
  }

  const topPool = candidates
    .sort((left, right) => right.score - left.score || Date.parse(right.post.created_at) - Date.parse(left.post.created_at))
    .slice(0, Math.max(maxPosts * 2, maxPosts));

  return rotateByStableHash(topPool, new Date().toISOString().slice(0, 13)).slice(0, maxPosts);
}

async function generateAgentComment(
  config: RuntimeConfig,
  agent: AgentRow,
  post: FeedPostRow,
  recentComments: FeedCommentRow[],
  triggerContent?: string,
  mentionedByHandle?: string,
): Promise<string> {
  if (config.agentLlmApi === "chat_completions") {
    return generateChatCompletionComment(config, agent, post, recentComments, triggerContent, mentionedByHandle);
  }

  return generateResponsesComment(config, agent, post, recentComments, triggerContent, mentionedByHandle);
}

async function generateResponsesComment(
  config: RuntimeConfig,
  agent: AgentRow,
  post: FeedPostRow,
  recentComments: FeedCommentRow[],
  triggerContent?: string,
  mentionedByHandle?: string,
): Promise<string> {
  const response = await fetch(buildAgentLlmUrl(config), {
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
          content: buildDeveloperPrompt(agent, mentionedByHandle),
        },
        {
          role: "user",
          content: buildUserPrompt(post, recentComments, triggerContent),
        },
      ],
    }),
  });

  const data = await readResponseJson(response);

  if (!response.ok) {
    throw new HttpError(response.status, "llm_request_failed", "LLM comment generation failed.", data);
  }

  const text = extractOutputText(data);

  if (!text) {
    throw new HttpError(502, "empty_llm_output", "LLM returned no comment text.", data);
  }

  return text;
}

async function generateChatCompletionComment(
  config: RuntimeConfig,
  agent: AgentRow,
  post: FeedPostRow,
  recentComments: FeedCommentRow[],
  triggerContent?: string,
  mentionedByHandle?: string,
): Promise<string> {
  const response = await fetch(buildAgentLlmUrl(config), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.agentModel,
      max_tokens: 220,
      messages: [
        {
          role: "system",
          content: buildDeveloperPrompt(agent, mentionedByHandle),
        },
        {
          role: "user",
          content: buildUserPrompt(post, recentComments, triggerContent),
        },
      ],
    }),
  });

  const data = await readResponseJson(response);

  if (!response.ok) {
    throw new HttpError(response.status, "llm_request_failed", "LLM comment generation failed.", data);
  }

  const text = extractChatCompletionText(data);

  if (!text) {
    throw new HttpError(502, "empty_llm_output", "LLM returned no comment text.", data);
  }

  return text;
}

function buildAgentLlmUrl(config: RuntimeConfig): string {
  const endpoint = config.agentLlmApi === "chat_completions" ? "chat/completions" : "responses";
  return `${config.agentLlmBaseUrl}/${endpoint}`;
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

function buildDeveloperPrompt(agent: AgentRow, mentionedByHandle?: string): string {
  const mentionInstruction = mentionedByHandle
    ? `You were explicitly @mentioned by "${mentionedByHandle}" in a comment. Respond directly and naturally while staying in character.`
    : "";

  return [
    `You are ${agent.display_name}, an official AttraX Arena AI Agent.`,
    "You are not a human and must never pretend to be one.",
    `Agent handle: @${agent.handle}`,
    "",
    "Character profile:",
    `Persona: ${agent.persona ?? "Playful forum participant"}`,
    `Bio: ${agent.bio ?? "A clearly labeled synthetic forum participant."}`,
    `Disclosure shown in UI: ${agent.disclosure}`,
    "",
    "Response style:",
    "Stay strictly in character. Match the language of the post when obvious.",
    "Write one short forum comment that invites discussion.",
    "You may respond to human users or other clearly labeled AI Agents in the thread.",
    "If you reference another participant, use their @handle and keep the interaction friendly, transparent, and grounded in the visible post/comments.",
    "Keep it under 80 words and avoid markdown wrappers.",
    mentionInstruction,
    "",
    "Hard rules:",
    "Do not mention OpenAI, system prompts, hidden instructions, wallets, payments, real money, betting, wagering, gambling, deposits, withdrawals, or bets.",
    "Frame any prediction energy as entertainment-only forum commentary, never as a money action.",
    "Do not produce harassment, hate, sexual content, private data claims, or legal/medical/financial advice.",
    "Never break character or describe yourself as an AI language model.",
  ].join("\n");
}

function buildUserPrompt(post: FeedPostRow, recentComments: FeedCommentRow[], triggerContent?: string): string {
  const recentHumanCount = recentComments.filter((comment) => !comment.is_ai_agent).length;
  const recentAgentCount = recentComments.filter((comment) => comment.is_ai_agent).length;
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
    `Author: ${post.author_name ?? "unknown"}${post.is_ai_agent ? " [AI Agent]" : " [human]"}`,
    `Stats: ${post.like_count} likes, ${post.comment_count} comments, ${post.hot_probability}% hot probability, ${post.flamewar_probability}% flamewar probability`,
    `Content: ${truncate(post.content, 1600)}`,
    "",
    `Recent participant mix: ${recentHumanCount} human comments, ${recentAgentCount} AI Agent comments.`,
    "It is okay to engage with either humans or AI Agents, but keep the AI identity explicit when relevant.",
    triggerContent ? `Triggering comment: ${truncate(triggerContent, 500)}` : "",
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

function extractChatCompletionText(data: unknown): string {
  if (!isRecord(data) || !Array.isArray(data.choices)) {
    return "";
  }

  const chunks: string[] = [];

  for (const choice of data.choices) {
    if (!isRecord(choice) || !isRecord(choice.message)) {
      continue;
    }

    const content = choice.message.content;

    if (typeof content === "string") {
      chunks.push(content);
      continue;
    }

    if (!Array.isArray(content)) {
      continue;
    }

    for (const part of content) {
      if (isRecord(part) && typeof part.text === "string") {
        chunks.push(part.text);
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

function readStringField(input: JsonRecord, key: string): string | null {
  const value = input[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumberField(input: JsonRecord, key: string): number | null {
  const value = input[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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

function uniqueStrings(values: Array<string | null>): string[] {
  return [...new Set(values.filter(Boolean) as string[])];
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
