import test from "node:test";
import assert from "node:assert/strict";
import {
  renderSupportBoard,
  renderSupportBoardDetailTrend,
} from "./support-board-render.mjs";

const helpers = {
  defaults: {
    marketType: "hot_24h",
    limit: 5,
  },
  trendIcon: () => "",
  rankClass: () => "",
  medal: (index) => String(index + 1),
  escapeHtml: (value) => String(value ?? ""),
  escapeAttribute: (value) => String(value ?? ""),
  formatCompact: (value) => String(value ?? 0),
  formatRelativeTime: () => "Just now",
  trimText: (value) => String(value ?? ""),
  clampNumber: (value, min, max) => Math.min(Math.max(value, min), max),
};

test("renders a dual-line trend chart in expanded support board details", () => {
  const container = { innerHTML: "" };

  renderSupportBoard({
    container,
    items: [{
      post_id: "post-1",
      market_type: "hot_24h",
      post_title: "Support tracking post",
      market_label: "Support Rate",
      author_name: "Arena Pulse",
      yes_rate: 71,
      total_amount_total: 1480,
      latest_bucket_ts: "2026-04-25T04:00:00.000Z",
      headline: "Track both support and stance",
    }],
    seriesByKey: {
      "post-1:hot_24h": [
        { bucket_ts: "2026-04-25T03:45:00.000Z", yes_rate: 54, total_amount_cumulative: 300 },
        { bucket_ts: "2026-04-25T03:50:00.000Z", yes_rate: 63, total_amount_cumulative: 720 },
        { bucket_ts: "2026-04-25T03:55:00.000Z", yes_rate: 59, total_amount_cumulative: 980 },
        { bucket_ts: "2026-04-25T04:00:00.000Z", yes_rate: 71, total_amount_cumulative: 1480 },
      ],
    },
    dataSource: "rpc",
    supportBoardFilter: "all",
    expandedSupportPostId: "post-1",
    helpers,
  });

  assert.match(container.innerHTML, /class="support-board-detail-trend"/);
  assert.match(container.innerHTML, /aria-label="Support and total stance trend"/);
  assert.match(container.innerHTML, /class="support-board-detail-line support-board-detail-line-rate"/);
  assert.match(container.innerHTML, /class="support-board-detail-line support-board-detail-line-volume"/);
  assert.match(container.innerHTML, /Support 71%/);
  assert.match(container.innerHTML, /Stance 1480/);
});

test("filters live support board items by opening status", () => {
  const container = { innerHTML: "" };

  renderSupportBoard({
    container,
    items: [
      {
        post_id: "live-post",
        market_type: "hot_24h",
        post_title: "Live support post",
        market_label: "Support Rate",
        author_name: "Arena Pulse",
        yes_rate: 67,
        support_board_status: "live",
      },
      {
        post_id: "ended-post",
        market_type: "hot_24h",
        post_title: "Ended support post",
        market_label: "Support Rate",
        author_name: "Arena Pulse",
        yes_rate: 81,
        support_board_status: "ended",
      },
    ],
    seriesByKey: {},
    dataSource: "prediction-fallback",
    supportBoardFilter: "all",
    supportBoardStatusFilter: "ended",
    expandedSupportPostId: null,
    helpers,
  });

  assert.match(container.innerHTML, /正在开盘/);
  assert.match(container.innerHTML, /已结束/);
  assert.doesNotMatch(container.innerHTML, /Live support post/);
  assert.match(container.innerHTML, /Ended support post/);
});

test("renders the same dual-line trend chart for post detail market modules", () => {
  const html = renderSupportBoardDetailTrend({
    series: [
      { bucket_ts: "2026-04-25T03:50:00.000Z", yes_rate: 58, total_amount_cumulative: 440 },
      { bucket_ts: "2026-04-25T03:55:00.000Z", yes_rate: 66, total_amount_cumulative: 860 },
      { bucket_ts: "2026-04-25T04:00:00.000Z", yes_rate: 73, total_amount_cumulative: 1360 },
    ],
    item: {
      post_id: "post-2",
      market_type: "hot_24h",
      yes_rate: 73,
      total_amount_total: 1360,
    },
    fallbackRate: 73,
    className: "post-market-trend",
    clampNumber: helpers.clampNumber,
    formatCompact: helpers.formatCompact,
    escapeHtml: helpers.escapeHtml,
  });

  assert.match(html, /class="support-board-detail-trend post-market-trend"/);
  assert.match(html, /Support 73%/);
  assert.match(html, /Stance 1360/);
  assert.match(html, /support-board-detail-line-rate/);
  assert.match(html, /support-board-detail-line-volume/);
});
