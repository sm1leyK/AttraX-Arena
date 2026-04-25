const DEFAULT_MARKET_TYPE = "hot_24h";

export function findSupportBoardSignal(items = [], postId, marketType = DEFAULT_MARKET_TYPE) {
  if (!postId) {
    return null;
  }

  const normalizedMarketType = marketType || DEFAULT_MARKET_TYPE;
  return (items ?? []).find((item) => (
    item?.post_id === postId
    && (item.market_type || DEFAULT_MARKET_TYPE) === normalizedMarketType
  )) ?? null;
}

export function buildLensAgentInsight(post = {}, { supportBoardSignal = null } = {}) {
  const liveSupportRate = toFiniteNumber(supportBoardSignal?.yes_rate);
  const hotProbability = toFiniteNumber(post.hot_probability) ?? 0;
  const debateProbability = toFiniteNumber(post.flamewar_probability) ?? 0;
  const likeCount = Math.max(0, toFiniteNumber(post.like_count) ?? 0);
  const commentCount = Math.max(0, toFiniteNumber(post.comment_count) ?? 0);
  const participatesInSupportBoard = post?.participates_in_support_board !== false;
  const engagement = likeCount + commentCount * 2;

  const supportRate = liveSupportRate === null
    ? estimateSupportRate({
      hotProbability,
      debateProbability,
      engagement,
      participatesInSupportBoard,
    })
    : clampNumber(Math.round(liveSupportRate), 6, 94);

  const riskLabel = debateProbability >= 70
    ? "高"
    : debateProbability >= 45
      ? "中"
      : "低";
  const trend = resolveTrend({ supportRate, hotProbability, debateProbability, engagement });
  const confidence = estimateConfidence({
    hotProbability,
    engagement,
    liveSignal: supportBoardSignal,
    hotOdds: post.hot_odds,
  });
  const confidenceLabel = confidence >= 70 ? "高" : confidence >= 55 ? "中" : "低";

  return {
    supportRate,
    supportText: `${supportRate}%`,
    confidence,
    confidenceLabel,
    riskLabel,
    trend,
    trendLabel: toTrendLabel(trend),
    summary: buildSummary({ trend, participatesInSupportBoard }),
    sourceLabel: "本地信号",
    meterWidth: clampNumber(supportRate, 6, 94),
  };
}

function estimateSupportRate({
  hotProbability,
  debateProbability,
  engagement,
  participatesInSupportBoard,
}) {
  const baseRate = hotProbability > 0 ? hotProbability : 50;
  const engagementLift = participatesInSupportBoard
    ? clampNumber((Math.log10(engagement + 1) - 1) * 5, 0, 12)
    : 0;
  const debatePenalty = debateProbability >= 70
    ? clampNumber((debateProbability - 65) * 0.2, 0, 10)
    : 0;

  return clampNumber(Math.round(baseRate + engagementLift - debatePenalty), 6, 94);
}

function estimateConfidence({ hotProbability, engagement, liveSignal, hotOdds }) {
  if (liveSignal) {
    const sampleCount = Math.max(0, toFiniteNumber(liveSignal.sample_count_total) ?? 0);
    const totalAmount = Math.max(0, toFiniteNumber(liveSignal.total_amount_total) ?? 0);
    return clampNumber(Math.round(62 + sampleCount * 1.5 + Math.log10(totalAmount + 1) * 3), 55, 92);
  }

  const predictionBoost = hotProbability > 0 ? 12 : 0;
  const engagementBoost = clampNumber(Math.log10(engagement + 1) * 7, 0, 18);
  const oddsBoost = hotOdds ? 6 : 0;
  return clampNumber(Math.round(42 + predictionBoost + engagementBoost + oddsBoost), 38, 88);
}

function resolveTrend({ supportRate, hotProbability, debateProbability, engagement }) {
  if (debateProbability >= 70 && engagement >= 30) {
    return "volatile";
  }

  if (supportRate >= 64 || hotProbability >= 70 || engagement >= 50) {
    return "rising";
  }

  if (supportRate >= 54 || engagement >= 10) {
    return "steady";
  }

  return "quiet";
}

function buildSummary({ trend, participatesInSupportBoard }) {
  if (trend === "volatile") {
    return "讨论有点烫，Lens 建议先看风向再站队。";
  }

  if (trend === "rising") {
    return "Lens 看见支持正在聚拢，热度比背景噪声更亮一点。";
  }

  if (trend === "steady") {
    return "Lens 觉得信号很稳，大家在慢慢靠近同一边。";
  }

  return participatesInSupportBoard
    ? "Lens 还在眨眼读取，需要再来几条互动信号。"
    : "Lens 先按互动温度轻轻估算，这篇不进支持率排行。";
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toTrendLabel(value) {
  return {
    rising: "上升",
    steady: "稳定",
    volatile: "波动",
    quiet: "安静",
  }[value] ?? "观察中";
}
