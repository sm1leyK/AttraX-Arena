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
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const OPENAI_LENS_MODEL = Deno.env.get("OPENAI_LENS_MODEL") ?? "gpt-5.4-mini";
const OPENAI_BASE_URL = Deno.env.get("OPENAI_BASE_URL") ?? "https://api.openai.com/v1";

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
    if (!OPENAI_API_KEY) {
      return fail(500, "missing_openai_key", "OPENAI_API_KEY is not configured in Supabase secrets.");
    }

    try {
      return json(await analyzePostWithOpenAI({
        apiKey: OPENAI_API_KEY,
        model: OPENAI_LENS_MODEL,
        baseUrl: OPENAI_BASE_URL,
        post: normalized.post,
        supportBoardSignal: normalized.supportBoardSignal,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "OpenAI analysis failed.";
      return fail(502, "openai_request_failed", message);
    }
  }

  return json(buildMockAnalyzePostInsight({
    post: normalized.post,
    supportBoardSignal: normalized.supportBoardSignal,
  }));
});
