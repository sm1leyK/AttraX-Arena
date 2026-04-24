import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLensAgentInsight,
  findSupportBoardSignal,
} from "./agent-insights.mjs";

test("uses live support-board signal as the primary support rate", () => {
  const insight = buildLensAgentInsight({
    id: "post-1",
    hot_probability: 82,
    flamewar_probability: 18,
    like_count: 120,
    comment_count: 34,
    hot_odds: 1.35,
    participates_in_support_board: true,
  }, {
    supportBoardSignal: {
      post_id: "post-1",
      market_type: "hot_24h",
      yes_rate: 68,
      total_amount_total: 920,
      sample_count_total: 12,
    },
  });

  assert.equal(insight.supportRate, 68);
  assert.equal(insight.trend, "rising");
  assert.equal(insight.trendLabel, "上升");
  assert.equal(insight.riskLabel, "低");
  assert.equal(insight.confidenceLabel, "高");
  assert.ok(insight.confidence >= 70);
  assert.match(insight.summary, /Lens 看见支持正在聚拢/);
});

test("returns a quiet neutral insight for sparse non-support posts", () => {
  const insight = buildLensAgentInsight({
    id: "post-2",
    hot_probability: 0,
    flamewar_probability: 0,
    like_count: 0,
    comment_count: 0,
    participates_in_support_board: false,
  });

  assert.equal(insight.supportRate, 50);
  assert.equal(insight.trend, "quiet");
  assert.equal(insight.trendLabel, "安静");
  assert.equal(insight.riskLabel, "低");
  assert.equal(insight.confidenceLabel, "低");
  assert.ok(insight.confidence <= 55);
  assert.match(insight.summary, /Lens 先按互动温度轻轻估算/);
});

test("marks high debate risk without inflating support rate", () => {
  const insight = buildLensAgentInsight({
    id: "post-3",
    hot_probability: 44,
    flamewar_probability: 81,
    like_count: 18,
    comment_count: 96,
    hot_odds: 2.1,
    participates_in_support_board: true,
  });

  assert.ok(insight.supportRate >= 40 && insight.supportRate <= 60);
  assert.equal(insight.trend, "volatile");
  assert.equal(insight.trendLabel, "波动");
  assert.equal(insight.riskLabel, "高");
  assert.match(insight.summary, /讨论有点烫/);
});

test("finds matching support board items by post id and market type", () => {
  const items = [
    { post_id: "post-1", market_type: "flamewar", yes_rate: 33 },
    { post_id: "post-2", market_type: "hot_24h", yes_rate: 74 },
    { post_id: "post-1", market_type: "hot_24h", yes_rate: 61 },
  ];

  assert.deepEqual(findSupportBoardSignal(items, "post-1"), items[2]);
  assert.deepEqual(findSupportBoardSignal(items, "post-1", "flamewar"), items[0]);
  assert.equal(findSupportBoardSignal(items, "missing"), null);
});
