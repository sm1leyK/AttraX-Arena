import test from "node:test";
import assert from "node:assert/strict";
import {
  LENS_AGENT_DEFAULT_TIMEOUT_MS,
  buildLensAgentCacheKey,
  createLensAgentInsightClient,
  normalizeLensAgentInsight,
} from "./lens-agent-remote.mjs";

function createMemoryStorage() {
  const items = new Map();

  return {
    getItem(key) {
      return items.has(key) ? items.get(key) : null;
    },
    setItem(key, value) {
      items.set(key, String(value));
    },
    removeItem(key) {
      items.delete(key);
    },
    get size() {
      return items.size;
    },
  };
}

const fallbackInsight = Object.freeze({
  supportRate: 50,
  supportText: "50%",
  confidenceLabel: "\u4f4e",
  riskLabel: "\u4f4e",
  trendLabel: "\u5b89\u9759",
  summary: "Local fallback",
  meterWidth: 50,
});

test("allows enough time for the deployed Lens Edge Function to call OpenAI", () => {
  assert.ok(LENS_AGENT_DEFAULT_TIMEOUT_MS >= 20000);
});

test("builds the Lens cache key from post id and updated_at", () => {
  assert.equal(
    buildLensAgentCacheKey({
      id: "post-1",
      updated_at: "2026-04-25T03:00:00.000Z",
      created_at: "2026-04-20T03:00:00.000Z",
    }),
    "post-1:2026-04-25T03:00:00.000Z",
  );

  assert.equal(buildLensAgentCacheKey({ id: "post-1" }), null);
  assert.equal(buildLensAgentCacheKey({ updated_at: "2026-04-25T03:00:00.000Z" }), null);
});

test("normalizes remote Lens JSON into the existing card contract", () => {
  assert.deepEqual(
    normalizeLensAgentInsight({
      supportRate: "73.6",
      trendLabel: "\u4e0a\u5347",
      riskLabel: "\u4e2d",
      confidenceLabel: "\u9ad8",
      summary: "Remote summary",
    }),
    {
      supportRate: 74,
      supportText: "74%",
      trendLabel: "\u4e0a\u5347",
      riskLabel: "\u4e2d",
      confidenceLabel: "\u9ad8",
      summary: "Remote summary",
      sourceLabel: "AI 分析",
      meterWidth: 74,
    },
  );
});

test("caches a successful Edge Function result by post id and updated_at", async () => {
  const calls = [];
  const client = createLensAgentInsightClient({
    storage: createMemoryStorage(),
    invokeAnalyzePost: async (payload) => {
      calls.push(payload);
      return {
        data: {
          supportRate: 72,
          trendLabel: "\u4e0a\u5347",
          riskLabel: "\u4f4e",
          confidenceLabel: "\u9ad8",
          summary: "Remote Lens says this post is warming up.",
        },
        error: null,
      };
    },
  });
  const post = {
    id: "post-1",
    updated_at: "2026-04-25T03:00:00.000Z",
    title: "Lens test",
  };

  const first = await client.loadInsight({ post, fallbackInsight });
  const second = await client.loadInsight({ post, fallbackInsight });

  assert.equal(first.source, "remote");
  assert.equal(first.insight.supportText, "72%");
  assert.equal(second.source, "cache");
  assert.equal(second.insight.summary, "Remote Lens says this post is warming up.");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].post, post);
});

test("falls back to the local insight when the Edge Function fails", async () => {
  const storage = createMemoryStorage();
  const client = createLensAgentInsightClient({
    storage,
    invokeAnalyzePost: async () => {
      throw new Error("timeout");
    },
  });

  const result = await client.loadInsight({
    post: {
      id: "post-2",
      updated_at: "2026-04-25T04:00:00.000Z",
    },
    fallbackInsight,
  });

  assert.equal(result.source, "fallback");
  assert.equal(result.insight, fallbackInsight);
  assert.equal(storage.size, 0);
});
