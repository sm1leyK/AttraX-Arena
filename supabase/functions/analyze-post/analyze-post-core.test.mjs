import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzePostWithOpenAI,
  buildOpenAIAnalyzePostRequest,
  buildMockAnalyzePostInsight,
  normalizeAnalyzePostRequest,
  pickPostForAnalysis,
} from "./analyze-post-core.mjs";

test("normalizes analyze-post requests around post id and updated_at", () => {
  const normalized = normalizeAnalyzePostRequest({
    post: {
      id: "post-1",
      updated_at: "2026-04-25T03:00:00.000Z",
      title: "A hot topic",
      content: "Short post body",
      ignored_field: "not sent to the model",
    },
    supportBoardSignal: {
      yes_rate: 71,
      sample_count_total: 11,
    },
  });

  assert.equal(normalized.ok, true);
  assert.equal(normalized.cacheKey, "post-1:2026-04-25T03:00:00.000Z");
  assert.deepEqual(normalized.post, {
    id: "post-1",
    updated_at: "2026-04-25T03:00:00.000Z",
    title: "A hot topic",
    content: "Short post body",
    category: "",
    hot_probability: 0,
    flamewar_probability: 0,
    like_count: 0,
    comment_count: 0,
    participates_in_support_board: true,
  });
  assert.deepEqual(normalized.supportBoardSignal, {
    yes_rate: 71,
    sample_count_total: 11,
  });
});

test("rejects requests that cannot be cached by post id and updated_at", () => {
  assert.deepEqual(
    normalizeAnalyzePostRequest({ post: { id: "post-1" } }),
    {
      ok: false,
      status: 400,
      code: "missing_updated_at",
      message: "post.updated_at is required for Lens analysis caching.",
    },
  );

  assert.deepEqual(
    normalizeAnalyzePostRequest({ post: { updated_at: "2026-04-25T03:00:00.000Z" } }),
    {
      ok: false,
      status: 400,
      code: "missing_post_id",
      message: "post.id is required for Lens analysis.",
    },
  );
});

test("picks a compact post payload for analysis", () => {
  assert.deepEqual(
    pickPostForAnalysis({
      id: "post-1",
      updated_at: "2026-04-25T03:00:00.000Z",
      title: "Title",
      content: "Body",
      category: "arena",
      hot_probability: 82,
      flamewar_probability: 19,
      like_count: 12,
      comment_count: 4,
      participates_in_support_board: false,
      author_email: "private@example.com",
    }),
    {
      id: "post-1",
      updated_at: "2026-04-25T03:00:00.000Z",
      title: "Title",
      content: "Body",
      category: "arena",
      hot_probability: 82,
      flamewar_probability: 19,
      like_count: 12,
      comment_count: 4,
      participates_in_support_board: false,
    },
  );
});

test("mock analysis returns the same Lens JSON shape as the future AI result", () => {
  const insight = buildMockAnalyzePostInsight({
    post: {
      id: "post-1",
      updated_at: "2026-04-25T03:00:00.000Z",
      title: "A hot topic",
      content: "Short post body",
      hot_probability: 84,
      flamewar_probability: 18,
      like_count: 120,
      comment_count: 23,
      participates_in_support_board: true,
    },
    supportBoardSignal: {
      yes_rate: 69,
      sample_count_total: 8,
      total_amount_total: 640,
    },
  });

  assert.deepEqual(Object.keys(insight).sort(), [
    "confidenceLabel",
    "meterWidth",
    "riskLabel",
    "summary",
    "supportRate",
    "supportText",
    "trendLabel",
  ]);
  assert.equal(insight.supportRate, 69);
  assert.equal(insight.supportText, "69%");
  assert.equal(insight.meterWidth, 69);
  assert.match(insight.summary, /Lens/);
});

test("builds a Responses API request with a strict Lens JSON schema", () => {
  const request = buildOpenAIAnalyzePostRequest({
    model: "gpt-5.4-mini",
    post: {
      id: "post-1",
      updated_at: "2026-04-25T03:00:00.000Z",
      title: "A hot topic",
      content: "Short post body",
      category: "arena",
      hot_probability: 82,
      flamewar_probability: 19,
      like_count: 12,
      comment_count: 4,
      participates_in_support_board: true,
      author_email: "private@example.com",
    },
    supportBoardSignal: {
      yes_rate: 71,
      total_amount_total: 640,
    },
  });

  assert.equal(request.model, "gpt-5.4-mini");
  assert.equal(request.store, false);
  assert.equal(request.text.format.type, "json_schema");
  assert.equal(request.text.format.name, "lens_post_analysis");
  assert.equal(request.text.format.strict, true);
  assert.deepEqual(request.text.format.schema.required, [
    "supportRate",
    "trendLabel",
    "riskLabel",
    "confidenceLabel",
    "summary",
  ]);

  const inputText = request.input[0].content[0].text;
  assert.match(inputText, /Short post body/);
  assert.match(inputText, /"yes_rate":71/);
  assert.doesNotMatch(inputText, /author_email/);
});

test("calls OpenAI Responses API and normalizes the Lens JSON result", async () => {
  const calls = [];
  const insight = await analyzePostWithOpenAI({
    apiKey: "test-key",
    model: "gpt-5.4-mini",
    post: {
      id: "post-1",
      updated_at: "2026-04-25T03:00:00.000Z",
      title: "A hot topic",
      content: "Short post body",
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          output: [
            {
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    supportRate: 73.7,
                    trendLabel: "\u4e0a\u5347",
                    riskLabel: "\u4f4e",
                    confidenceLabel: "\u9ad8",
                    summary: "Lens sees support warming up.",
                  }),
                },
              ],
            },
          ],
        }),
      };
    },
  });

  assert.deepEqual(insight, {
    supportRate: 74,
    trendLabel: "\u4e0a\u5347",
    riskLabel: "\u4f4e",
    confidenceLabel: "\u9ad8",
    summary: "Lens sees support warming up.",
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.openai.com/v1/responses");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers.Authorization, "Bearer test-key");
  assert.equal(JSON.parse(calls[0].options.body).model, "gpt-5.4-mini");
});

test("calls a configured OpenAI-compatible Responses API base URL", async () => {
  const calls = [];
  const insight = await analyzePostWithOpenAI({
    apiKey: "test-key",
    model: "gpt-5.4",
    baseUrl: "https://aiapi.orbitai.global/v1/",
    post: {
      id: "post-1",
      updated_at: "2026-04-25T03:00:00.000Z",
      title: "A hot topic",
      content: "Short post body",
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            supportRate: 67,
            trendLabel: "\u7a33\u5b9a",
            riskLabel: "\u4f4e",
            confidenceLabel: "\u4e2d",
            summary: "Lens sees a stable signal.",
          }),
        }),
      };
    },
  });

  assert.equal(calls[0].url, "https://aiapi.orbitai.global/v1/responses");
  assert.equal(JSON.parse(calls[0].options.body).model, "gpt-5.4");
  assert.equal(insight.supportRate, 67);
});

test("calls an OpenAI-compatible Chat Completions API when configured", async () => {
  const calls = [];
  const insight = await analyzePostWithOpenAI({
    apiKey: "test-key",
    model: "deepseek-chat",
    baseUrl: "https://api.deepseek.com/v1",
    api: "chat_completions",
    post: {
      id: "post-1",
      updated_at: "2026-04-25T03:00:00.000Z",
      title: "A hot topic",
      content: "Short post body",
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  supportRate: 62,
                  trendLabel: "\u7a33\u5b9a",
                  riskLabel: "\u4f4e",
                  confidenceLabel: "\u4e2d",
                  summary: "Lens sees a cautious signal.",
                }),
              },
            },
          ],
        }),
      };
    },
  });

  assert.equal(calls[0].url, "https://api.deepseek.com/v1/chat/completions");
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.model, "deepseek-chat");
  assert.equal(body.response_format.type, "json_object");
  assert.equal(insight.supportRate, 62);
});

test("surfaces OpenAI API errors without exposing the API key", async () => {
  await assert.rejects(
    () => analyzePostWithOpenAI({
      apiKey: "secret-value",
      model: "gpt-5.4-mini",
      post: {
        id: "post-1",
        updated_at: "2026-04-25T03:00:00.000Z",
      },
      fetchImpl: async () => ({
        ok: false,
        status: 429,
        text: async () => "rate limit for secret-value",
      }),
    }),
    (error) => {
      assert.match(error.message, /openai_request_failed:429/);
      assert.doesNotMatch(error.message, /secret-value/);
      return true;
    },
  );
});

test("redacts masked OpenAI key fragments from API errors", async () => {
  await assert.rejects(
    () => analyzePostWithOpenAI({
      apiKey: "sk-proj-secret-value",
      model: "gpt-5.4-mini",
      post: {
        id: "post-1",
        updated_at: "2026-04-25T03:00:00.000Z",
      },
      fetchImpl: async () => ({
        ok: false,
        status: 401,
        text: async () => "Incorrect API key provided: sk-proj-abc************************************************xyz.",
      }),
    }),
    (error) => {
      assert.match(error.message, /openai_request_failed:401/);
      assert.doesNotMatch(error.message, /sk-proj-abc/);
      assert.doesNotMatch(error.message, /xyz/);
      assert.match(error.message, /\[redacted_openai_key\]/);
      return true;
    },
  );
});
