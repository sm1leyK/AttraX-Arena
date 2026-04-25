export function renderSupportBoard({
  container,
  items,
  seriesByKey,
  dataSource,
  supportBoardFilter,
  supportBoardStatusFilter = "live",
  expandedSupportPostId,
  helpers,
}) {
  const {
    defaults,
    trendIcon,
    rankClass,
    medal,
    escapeHtml,
    escapeAttribute,
    formatCompact,
    formatRelativeTime,
    trimText,
    clampNumber,
  } = helpers;

  if (!container || items.length === 0) {
    return;
  }

  const filterTabs = [
    { key: "all", label: "All" },
    { key: "high", label: "High" },
    { key: "swing", label: "Swing" },
  ];
  const statusTabs = [
    { key: "live", label: "正在开盘" },
    { key: "ended", label: "已结束" },
  ];
  const normalizedStatusFilter = supportBoardStatusFilter === "ended" ? "ended" : "live";

  const filteredItems = items.filter((item) => {
    if (getSupportBoardRenderStatus(item) !== normalizedStatusFilter) {
      return false;
    }

    const probability = Math.round(item.yes_rate || 0);
    if (supportBoardFilter === "high") {
      return probability >= 75;
    }
    if (supportBoardFilter === "swing") {
      return probability >= 45 && probability <= 65;
    }
    return true;
  });

  const boardItems = filteredItems.slice(0, defaults.limit);

  container.innerHTML = `
    <div class="sidebar-card-title">
      ${trendIcon()}
      Live Support Board
      <span class="support-board-live-dot"></span>
    </div>
    <div class="support-board-tabs">
      ${statusTabs.map((tab) => `
        <button
          type="button"
          class="support-board-tab ${normalizedStatusFilter === tab.key ? "active" : ""}"
          onclick="event.stopPropagation(); setSupportBoardStatusFilter('${tab.key}')"
        >${escapeHtml(tab.label)}</button>
      `).join("")}
    </div>
    <div class="support-board-tabs">
      ${filterTabs.map((tab) => `
        <button
          type="button"
          class="support-board-tab ${supportBoardFilter === tab.key ? "active" : ""}"
          onclick="event.stopPropagation(); setSupportBoardFilter('${tab.key}')"
        >${escapeHtml(tab.label)}</button>
      `).join("")}
    </div>
    ${boardItems.length > 0 ? boardItems.map((item, index) => {
      const probability = Math.round(item.yes_rate || 0);
      const yesWidth = clampNumber(probability, 6, 94);
      const isExpanded = expandedSupportPostId === item.post_id;
      const sparklineSeries = seriesByKey[getSupportBoardSeriesKey(item.post_id, item.market_type, defaults)] ?? [];
      const updatedAt = item.latest_bet_at || item.latest_bucket_ts;
      const detailTrend = renderSupportBoardDetailTrend({
        series: sparklineSeries,
        item,
        fallbackRate: probability,
        clampNumber,
        formatCompact,
        escapeHtml,
      });
      return `
      <div
        class="rank-item support-rank-item ${isExpanded ? "expanded" : ""}"
        data-support-post-id="${escapeAttribute(item.post_id)}"
        data-support-market-type="${escapeAttribute(item.market_type || defaults.marketType)}"
        data-support-source="${escapeAttribute(dataSource || "unknown")}"
        onclick="openDetailById('${item.post_id}')"
      >
        <span class="rank-num ${rankClass(index)}">${index < 3 ? medal(index) : index + 1}</span>
        <div class="rank-info">
          <div class="rank-title">${escapeHtml(item.post_title || item.headline || "Untitled")}</div>
          <div class="rank-heat">${escapeHtml(item.market_label || "Support Rate")} · ${escapeHtml(item.author_name || "Arena Pulse")}</div>
          <div class="support-board-meter">
            <div class="support-board-meter-fill" style="width:${yesWidth}%"></div>
          </div>
          <div class="support-board-sparkline" data-support-chart>
            ${renderSupportBoardSparkline(sparklineSeries, probability, clampNumber)}
          </div>
        </div>
        <div class="support-board-actions">
          <div class="agent-mini-rate" data-support-rate>${probability}%</div>
          <button
            type="button"
            class="support-board-toggle ${isExpanded ? "active" : ""}"
            onclick="event.stopPropagation(); toggleSupportBoardItem('${item.post_id}')"
          >${isExpanded ? "Hide" : "Detail"}</button>
        </div>
      </div>
      <div class="support-board-detail ${isExpanded ? "show" : ""}">
        <div class="support-board-detail-row">
          <span>Support</span>
          <strong>${probability}%</strong>
        </div>
        <div class="support-board-detail-row">
          <span>Total stance</span>
          <strong>${formatCompact(item.total_amount_total || 0)}</strong>
        </div>
        <div class="support-board-detail-row">
          <span>Updated</span>
          <strong data-support-updated-at>${updatedAt ? escapeHtml(formatRelativeTime(updatedAt)) : "Just now"}</strong>
        </div>
        ${detailTrend}
        <div class="support-board-detail-copy">${escapeHtml(trimText(item.author_disclosure || item.headline || "Open the post to view the full discussion.", 96))}</div>
      </div>
    `;
    }).join("") : `
      <div class="support-board-detail show" style="margin-top:10px">
        当前筛选下暂无帖子。
      </div>
    `}
  `;
}

export function bindSupportBoardInteractions({
  container,
  openDetailById,
}) {
  container?.querySelectorAll(".support-board-detail").forEach((detail) => {
    const postId = detail.previousElementSibling?.dataset?.supportPostId
      || detail.previousElementSibling?.getAttribute("onclick")?.match(/openDetailById\('([^']+)'\)/)?.[1];
    if (!postId) {
      return;
    }

    detail.style.cursor = "pointer";
    detail.addEventListener("click", () => {
      openDetailById(postId);
    });

    let actionWrap = detail.querySelector(".support-board-detail-actions");
    if (!actionWrap) {
      actionWrap = document.createElement("div");
      actionWrap.className = "support-board-detail-actions";
      actionWrap.innerHTML = `<button type="button" class="support-board-open">Open post</button>`;
      detail.appendChild(actionWrap);
    }

    const openButton = actionWrap.querySelector(".support-board-open");
    openButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      openDetailById(postId);
    });
  });
}

function getSupportBoardSeriesKey(postId, marketType, defaults) {
  return `${postId}:${marketType || defaults.marketType}`;
}

function getSupportBoardRenderStatus(item) {
  return item?.support_board_status === "ended" ? "ended" : "live";
}

function renderSupportBoardSparkline(series, fallbackRate, clampNumber) {
  const points = series.length > 0 ? series : createFallbackSeries(fallbackRate);
  const lastPoint = points[points.length - 1] ?? { yes_rate: fallbackRate };
  const polyline = points.map((point, index) => {
    const x = points.length === 1 ? 56 : (index / (points.length - 1)) * 112;
    const y = 26 - (clampNumber(Number(point.yes_rate ?? fallbackRate), 0, 100) / 100) * 20;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
  const lastX = points.length === 1 ? 56 : 112;
  const lastY = 26 - (clampNumber(Number(lastPoint.yes_rate ?? fallbackRate), 0, 100) / 100) * 20;

  return `
    <svg viewBox="0 0 112 28" width="112" height="28" aria-hidden="true" focusable="false">
      <path d="M0 26.5 H112" stroke="rgba(255,255,255,0.12)" stroke-width="1" fill="none"></path>
      <polyline
        points="${polyline}"
        fill="none"
        stroke="rgba(124, 255, 203, 0.95)"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      ></polyline>
      <circle cx="${lastX}" cy="${lastY.toFixed(2)}" r="2.5" fill="rgba(124, 255, 203, 1)"></circle>
    </svg>
  `;
}

export function renderSupportBoardDetailTrend({
  series,
  item,
  fallbackRate,
  className = "",
  clampNumber,
  formatCompact,
  escapeHtml,
}) {
  const points = normalizeDetailTrendPoints(series, item, fallbackRate, clampNumber);
  const lastPoint = points[points.length - 1] ?? { supportRate: fallbackRate, totalStance: 0 };
  const supportPolyline = buildNormalizedPolyline(points.map((point) => point.supportRate));
  const stancePolyline = buildNormalizedPolyline(points.map((point) => point.totalStance));
  const lastSupportPoint = getPolylineLastPoint(supportPolyline);
  const lastStancePoint = getPolylineLastPoint(stancePolyline);
  const supportLabel = `${Math.round(lastPoint.supportRate)}%`;
  const stanceLabel = formatCompact(lastPoint.totalStance || item.total_amount_total || 0);
  const trendClassName = ["support-board-detail-trend", className].filter(Boolean).join(" ");

  return `
        <div class="${trendClassName}">
          <div class="support-board-detail-trend-head">
            <span>Trend</span>
            <div class="support-board-detail-legend" aria-hidden="true">
              <span><i class="support-board-detail-dot support-board-detail-dot-rate"></i>Support ${escapeHtml(supportLabel)}</span>
              <span><i class="support-board-detail-dot support-board-detail-dot-volume"></i>Stance ${escapeHtml(stanceLabel)}</span>
            </div>
          </div>
          <svg
            class="support-board-detail-chart"
            viewBox="0 0 176 64"
            role="img"
            aria-label="Support and total stance trend"
            focusable="false"
          >
            <path class="support-board-detail-grid" d="M0 12.5 H176 M0 32.5 H176 M0 52.5 H176"></path>
            <polyline
              class="support-board-detail-line support-board-detail-line-volume"
              points="${stancePolyline}"
            ></polyline>
            <polyline
              class="support-board-detail-line support-board-detail-line-rate"
              points="${supportPolyline}"
            ></polyline>
            <circle class="support-board-detail-end support-board-detail-end-volume" cx="${lastStancePoint.x}" cy="${lastStancePoint.y}" r="3"></circle>
            <circle class="support-board-detail-end support-board-detail-end-rate" cx="${lastSupportPoint.x}" cy="${lastSupportPoint.y}" r="3"></circle>
          </svg>
        </div>`;
}

function normalizeDetailTrendPoints(series, item, fallbackRate, clampNumber) {
  const sourcePoints = series.length > 0 ? series : createFallbackSeries(fallbackRate);
  const fallbackTotal = Number(item.total_amount_total ?? 0);

  return sourcePoints.map((point) => ({
    supportRate: clampNumber(Number(point.yes_rate ?? fallbackRate), 0, 100),
    totalStance: Math.max(0, Number(
      point.total_amount_cumulative
        ?? point.total_amount_total
        ?? point.total_amount_bucket
        ?? fallbackTotal,
    )),
  }));
}

function buildNormalizedPolyline(values) {
  const width = 176;
  const top = 8;
  const bottom = 56;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  return values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const normalized = range === 0 ? 0.5 : (value - min) / range;
    const y = bottom - normalized * (bottom - top);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

function getPolylineLastPoint(polyline) {
  const last = polyline.trim().split(/\s+/).at(-1) || "176.00,32.00";
  const [x, y] = last.split(",");
  return {
    x,
    y,
  };
}

function createFallbackSeries(fallbackRate) {
  return Array.from({ length: 6 }, () => ({
    yes_rate: fallbackRate,
  }));
}
