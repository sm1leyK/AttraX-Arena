import test from "node:test";
import assert from "node:assert/strict";
import {
  SUPPORT_BOARD_REALTIME_TABLES,
  loadSupportBoardPostTrend,
  loadSupportBoardSnapshot,
} from "./support-board-data.mjs";

const clampNumber = (value, min, max) => Math.min(Math.max(value, min), max);

test("keeps expired fallback prediction cards and marks support board status", async () => {
  const snapshot = await loadSupportBoardSnapshot({
    supabase: null,
    clampNumber,
    now: new Date("2026-04-25T04:00:00.000Z"),
    predictionCards: [
      {
        post_id: "expired-post",
        post_title: "Expired support board post",
        participates_in_support_board: true,
        support_board_deadline_at: "2026-04-25T03:59:59.000Z",
        probability: 91,
      },
      {
        post_id: "live-post",
        post_title: "Live support board post",
        participates_in_support_board: true,
        support_board_deadline_at: "2026-04-25T04:00:01.000Z",
        probability: 64,
      },
    ],
  });

  assert.deepEqual(snapshot.items.map((item) => item.post_id), ["expired-post", "live-post"]);
  assert.equal(snapshot.items[0].support_board_status, "ended");
  assert.equal(snapshot.items[1].support_board_status, "live");
});

test("uses the public support board event stream for realtime refreshes", () => {
  assert.deepEqual(SUPPORT_BOARD_REALTIME_TABLES, ["support_board_events"]);
});

test("loads a post detail support trend from the backend series RPC", async () => {
  const calls = [];
  const supabase = {
    async rpc(name, params) {
      calls.push({ name, params });
      return {
        error: null,
        data: [
          {
            bucket_ts: "2026-04-25T03:55:00.000Z",
            yes_rate: 62.5,
            yes_amount_cumulative: 500,
            no_amount_cumulative: 300,
            total_amount_cumulative: 800,
            sample_count_cumulative: 2,
          },
          {
            bucket_ts: "2026-04-25T04:00:00.000Z",
            yes_rate: 72,
            yes_amount_cumulative: 1080,
            no_amount_cumulative: 420,
            total_amount_cumulative: 1500,
            sample_count_cumulative: 4,
          },
        ],
      };
    },
  };

  const trend = await loadSupportBoardPostTrend({
    supabase,
    post: {
      id: "post-42",
      title: "Detail-only support post",
      category: "Agent",
      created_at: "2026-04-25T03:00:00.000Z",
      author_name: "Arena Pulse",
      author_badge: "AI Agent",
      author_disclosure: "Backend detail trend",
      is_ai_agent: true,
    },
    marketType: "hot_24h",
    clampNumber,
  });

  assert.deepEqual(calls, [{
    name: "get_post_market_series",
    params: {
      p_post_id: "post-42",
      p_market_type: "hot_24h",
      p_window_minutes: 180,
      p_bucket_minutes: 5,
    },
  }]);
  assert.equal(trend.dataSource, "rpc");
  assert.equal(trend.item.post_id, "post-42");
  assert.equal(trend.item.yes_rate, 72);
  assert.equal(trend.item.total_amount_total, 1500);
  assert.equal(trend.item.sample_count_total, 4);
  assert.equal(trend.series.length, 2);
  assert.equal(trend.series[1].total_amount_cumulative, 1500);
});
