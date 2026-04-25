import test from "node:test";
import assert from "node:assert/strict";
import { resolvePostMarketRate } from "./post-market-rates.mjs";

const clampNumber = (value, min, max) => Math.min(Math.max(value, min), max);

test("post market display uses live support board aggregate when money has been staked", () => {
  const rate = resolvePostMarketRate({
    post: { id: "post-1", hot_probability: 52 },
    marketType: "hot_24h",
    supportBoardSignal: {
      post_id: "post-1",
      market_type: "hot_24h",
      yes_rate: 73.4,
      yes_amount_total: 734,
      no_amount_total: 266,
      total_amount_total: 1000,
      sample_count_total: 4,
    },
    fallbackProbability: 52,
    clampNumber,
  });

  assert.equal(rate.source, "market");
  assert.equal(rate.sourceLabel, "真实站队池");
  assert.equal(rate.yesRate, 73);
  assert.equal(rate.noRate, 27);
  assert.equal(rate.totalAmount, 1000);
});

test("post market display derives live rate from staked side amounts when yes_rate is missing", () => {
  const rate = resolvePostMarketRate({
    post: { id: "post-2" },
    marketType: "hot_24h",
    supportBoardSignal: {
      post_id: "post-2",
      market_type: "hot_24h",
      yes_amount_total: 150,
      no_amount_total: 50,
      total_amount_total: 200,
    },
    fallbackProbability: 51,
    clampNumber,
  });

  assert.equal(rate.source, "market");
  assert.equal(rate.yesRate, 75);
  assert.equal(rate.noRate, 25);
});

test("post market display falls back to prediction when the aggregate has no stake yet", () => {
  const rate = resolvePostMarketRate({
    post: { id: "post-3", hot_probability: 88 },
    marketType: "hot_24h",
    supportBoardSignal: {
      post_id: "post-3",
      market_type: "hot_24h",
      yes_rate: 12,
      yes_amount_total: 0,
      no_amount_total: 0,
      total_amount_total: 0,
      sample_count_total: 0,
    },
    fallbackProbability: 88,
    clampNumber,
  });

  assert.equal(rate.source, "prediction");
  assert.equal(rate.sourceLabel, "预测参考");
  assert.equal(rate.yesRate, 88);
  assert.equal(rate.noRate, 12);
});

test("detail post market display prefers the detail trend aggregate for the active market", () => {
  const rate = resolvePostMarketRate({
    post: { id: "post-4", hot_probability: 60 },
    marketType: "hot_24h",
    supportBoardSignal: {
      post_id: "post-4",
      market_type: "hot_24h",
      yes_rate: 55,
      total_amount_total: 400,
    },
    detailSupportBoardItem: {
      post_id: "post-4",
      market_type: "hot_24h",
      yes_rate: 64.7,
      total_amount_total: 900,
      sample_count_total: 5,
    },
    fallbackProbability: 60,
    clampNumber,
  });

  assert.equal(rate.source, "market");
  assert.equal(rate.yesRate, 65);
  assert.equal(rate.noRate, 35);
  assert.equal(rate.totalAmount, 900);
});

test("post market display keeps exact rates while clamping only the visual bar widths", () => {
  const rate = resolvePostMarketRate({
    post: { id: "post-5", hot_probability: 2 },
    marketType: "hot_24h",
    fallbackProbability: 2,
    clampNumber,
  });

  assert.equal(rate.yesRate, 2);
  assert.equal(rate.noRate, 98);
  assert.equal(rate.yesWidth, 6);
  assert.equal(rate.noWidth, 94);
});
