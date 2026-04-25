import test from "node:test";
import assert from "node:assert/strict";
import {
  renderLensAgentDetailCard,
  renderLensAgentStrip,
} from "./agent-insights-render.mjs";

const insight = Object.freeze({
  supportRate: 72,
  supportText: "72%",
  confidence: 76,
  confidenceLabel: "高",
  riskLabel: "低",
  trend: "rising",
  trendLabel: "上升",
  summary: "Lens 看见支持正在聚拢，热度比背景噪声更亮一点。",
  meterWidth: 72,
});

test("renders a compact lens strip for post cards", () => {
  const html = renderLensAgentStrip(insight);

  assert.match(html, /class="lens-agent-strip"/);
  assert.match(html, /Lens 信号/);
  assert.match(html, /72%/);
  assert.match(html, /width:72%/);
  assert.match(html, /上升/);
  assert.match(html, /Lens 看见支持正在聚拢/);
  assert.match(html, /class="[^"]*lens-agent-face-ring/);
  assert.match(html, /class="lens-agent-face-eye"/);
  assert.match(html, /class="lens-agent-face-glint"/);
});

test("renders a detail card with escaped summary copy", () => {
  const html = renderLensAgentDetailCard({
    ...insight,
    summary: "<script>alert(1)</script>",
    sourceLabel: "AI 分析",
  });

  assert.match(html, /class="lens-agent-card"/);
  assert.match(html, /Lens 小助手/);
  assert.match(html, /AI 分析/);
  assert.match(html, /支持率/);
  assert.match(html, /把握/);
  assert.match(html, /争议风险/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});
