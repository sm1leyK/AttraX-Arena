import {
  analyzePostWithOpenAI,
  buildMockAnalyzePostInsight,
  normalizeAnalyzePostRequest,
} from "./analyze-post-core.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const ANALYZE_POST_MODE = Deno.env.get("ANALYZE_POST_MODE") ?? "mock";
const ACTIVE_LLM_PROVIDER = (Deno.env.get("ACTIVE_LLM_PROVIDER") ?? "openai").toLowerCase();

function resolveLensConfig(): { apiKey: string; baseUrl: string; model: string; api: "responses" | "chat_completions" } {
  if (ACTIVE_LLM_PROVIDER === "orbitai") {
    return {
      apiKey: Deno.env.get("ORBITAI_API_KEY") ?? Deno.env.get("OPENAI_API_KEY") ?? "",
      baseUrl: Deno.env.get("ORBITAI_BASE_URL") ?? Deno.env.get("OPENAI_BASE_URL") ?? "https://aiapi.orbitai.global/v1",
      model: Deno.env.get("OPENAI_LENS_MODEL") ?? "gpt-4o-mini",
      api: "chat_completions",
    };
  }

  if (ACTIVE_LLM_PROVIDER === "deepseek") {
    return {
      apiKey: Deno.env.get("DEEPSEEK_API_KEY") ?? Deno.env.get("OPENAI_API_KEY") ?? "",
      baseUrl: Deno.env.get("DEEPSEEK_BASE_URL") ?? Deno.env.get("OPENAI_BASE_URL") ?? "https://api.deepseek.com/v1",
      model: Deno.env.get("OPENAI_LENS_MODEL") ?? "deepseek-chat",
      api: "chat_completions",
    };
  }

  return {
    apiKey: Deno.env.get("OPENAI_API_KEY") ?? "",
    baseUrl: Deno.env.get("OPENAI_BASE_URL") ?? "https://api.openai.com/v1",
    model: Deno.env.get("OPENAI_LENS_MODEL") ?? "gpt-5.4-mini",
    api: (Deno.env.get("ANALYZE_POST_LLM_API") === "chat_completions" ? "chat_completions" : "responses"),
  };
}

const LENS = resolveLensConfig();

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

function fail(status: number, code: string, message: string) {
  return json({ ok: false, code, message }, status);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return fail(405, "method_not_allowed", "Use POST for this endpoint.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (_error) {
    return fail(400, "invalid_json", "Request body must be valid JSON.");
  }

  const normalized = normalizeAnalyzePostRequest(body);
  if (!normalized.ok) {
    return fail(normalized.status, normalized.code, normalized.message);
  }

  if (ANALYZE_POST_MODE === "openai") {
    if (!LENS.apiKey) {
      return fail(500, "missing_openai_key", `API key for provider "${ACTIVE_LLM_PROVIDER}" is not configured.`);
    }

    try {
      return json(await analyzePostWithOpenAI({
        apiKey: LENS.apiKey,
        model: LENS.model,
        baseUrl: LENS.baseUrl,
        api: LENS.api,
        post: normalized.post,
        supportBoardSignal: normalized.supportBoardSignal,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "LLM analysis failed.";
      return fail(502, "openai_request_failed", message);
    }
  }

  return json(buildMockAnalyzePostInsight({
    post: normalized.post,
    supportBoardSignal: normalized.supportBoardSignal,
  }));
});
