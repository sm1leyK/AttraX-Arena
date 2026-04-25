export function renderLensAgentStrip(insight) {
  const meterWidth = normalizePercent(insight?.meterWidth ?? insight?.supportRate ?? 50);

  return `
    <div class="lens-agent-strip" aria-label="Lens 小助手信号">
      <div class="lens-agent-avatar" aria-hidden="true">
        ${renderLensAgentMark()}
      </div>
      <div class="lens-agent-strip-main">
        <div class="lens-agent-strip-top">
          <span class="lens-agent-name">Lens 信号</span>
          <span class="lens-agent-rate">${escapeHtml(insight?.supportText || "50%")}</span>
        </div>
        <div class="lens-agent-meter" aria-hidden="true">
          <span style="width:${meterWidth}%"></span>
        </div>
        <div class="lens-agent-strip-summary">${escapeHtml(insight?.summary || "Lens 还在读取这篇帖子的信号。")}</div>
      </div>
      <span class="lens-agent-state">${escapeHtml(insight?.trendLabel || "安静")}</span>
    </div>
  `;
}

export function renderLensAgentDetailCard(insight) {
  const meterWidth = normalizePercent(insight?.meterWidth ?? insight?.supportRate ?? 50);
  const sourceLabel = escapeHtml(insight?.sourceLabel || "本地信号");

  return `
    <div class="lens-agent-card" aria-label="Lens 小助手帖子分析">
      <div class="lens-agent-card-head">
        <div class="lens-agent-avatar large" aria-hidden="true">
          ${renderLensAgentMark()}
        </div>
        <div>
          <div class="lens-agent-title">Lens 小助手</div>
          <div class="lens-agent-subtitle">${sourceLabel}</div>
        </div>
        <span class="lens-agent-ai-chip">${sourceLabel}</span>
      </div>
      <div class="lens-agent-card-grid">
        <div class="lens-agent-metric">
          <span>支持率</span>
          <strong>${escapeHtml(insight?.supportText || "50%")}</strong>
        </div>
        <div class="lens-agent-metric">
          <span>把握</span>
          <strong>${escapeHtml(insight?.confidenceLabel || "低")}</strong>
        </div>
        <div class="lens-agent-metric">
          <span>争议风险</span>
          <strong>${escapeHtml(insight?.riskLabel || "低")}</strong>
        </div>
      </div>
      <div class="lens-agent-wide-meter" aria-hidden="true">
        <span style="width:${meterWidth}%"></span>
      </div>
      <div class="lens-agent-summary">${escapeHtml(insight?.summary || "Lens 还在读取这篇帖子的信号。")}</div>
    </div>
  `;
}

function renderLensAgentMark() {
  return `
    <svg viewBox="0 0 28 28" fill="none" aria-hidden="true" focusable="false">
      <circle class="lens-agent-face-ring outer" cx="14" cy="14" r="11.1"></circle>
      <circle class="lens-agent-face-ring inner" cx="14" cy="14" r="8.2"></circle>
      <path class="lens-agent-face-glint" d="M14 2.9V1.2M19.4 4.7l1-1.35"></path>
      <circle class="lens-agent-face-eye" cx="10.5" cy="13.1" r="1.25"></circle>
      <circle class="lens-agent-face-eye" cx="17.1" cy="13.1" r="1.25"></circle>
      <path class="lens-agent-face-smile" d="M11.4 17.1c1.45 1.2 3.7 1.2 5.1 0"></path>
      <circle class="lens-agent-face-dot" cx="20.4" cy="18.6" r="1.05"></circle>
    </svg>
  `;
}

function normalizePercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 50;
  }

  return Math.min(Math.max(Math.round(number), 6), 94);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
