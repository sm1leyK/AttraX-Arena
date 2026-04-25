const DEFAULT_MARKET_TYPE = "hot_24h";
const DEFAULT_FALLBACK_RATE = 52;

export function resolvePostMarketRate({
  post = {},
  marketType = DEFAULT_MARKET_TYPE,
  supportBoardSignal = null,
  detailSupportBoardItem = null,
  fallbackProbability = null,
  clampNumber = defaultClampNumber,
} = {}) {
  const normalizedMarketType = marketType || DEFAULT_MARKET_TYPE;
  const postId = post?.id ?? post?.post_id ?? null;
  const liveAggregate = [detailSupportBoardItem, supportBoardSignal]
    .find((item) => isLiveMarketAggregate(item, postId, normalizedMarketType));

  if (liveAggregate) {
    const liveRate = resolveLiveYesRate(liveAggregate, clampNumber);

    if (liveRate !== null) {
      return buildMarketRate({
        yesRate: liveRate,
        source: "market",
        sourceLabel: "真实站队池",
        aggregate: liveAggregate,
        clampNumber,
      });
    }
  }

  return buildMarketRate({
    yesRate: resolveFallbackRate({
      post,
      marketType: normalizedMarketType,
      fallbackProbability,
      clampNumber,
    }),
    source: "prediction",
    sourceLabel: "预测参考",
    aggregate: null,
    clampNumber,
  });
}

function isLiveMarketAggregate(item, postId, marketType) {
  if (!item) {
    return false;
  }

  if (postId && item.post_id && item.post_id !== postId) {
    return false;
  }

  if ((item.market_type || DEFAULT_MARKET_TYPE) !== marketType) {
    return false;
  }

  const yesAmount = readFiniteNumber(item, ["yes_amount_total", "yes_amount_cumulative"]) ?? 0;
  const noAmount = readFiniteNumber(item, ["no_amount_total", "no_amount_cumulative"]) ?? 0;
  const totalAmount = readFiniteNumber(item, ["total_amount_total", "total_amount_cumulative"]) ?? yesAmount + noAmount;
  const sampleCount = readFiniteNumber(item, ["sample_count_total", "sample_count_cumulative"]) ?? 0;

  return totalAmount > 0 || yesAmount + noAmount > 0 || sampleCount > 0;
}

function resolveLiveYesRate(item, clampNumber) {
  const explicitRate = readFiniteNumber(item, ["yes_rate"]);
  if (explicitRate !== null) {
    return normalizeRate(explicitRate, clampNumber);
  }

  const yesAmount = readFiniteNumber(item, ["yes_amount_total", "yes_amount_cumulative"]) ?? 0;
  const noAmount = readFiniteNumber(item, ["no_amount_total", "no_amount_cumulative"]) ?? 0;
  const totalAmount = readFiniteNumber(item, ["total_amount_total", "total_amount_cumulative"]) ?? yesAmount + noAmount;

  if (totalAmount <= 0) {
    return null;
  }

  return normalizeRate((yesAmount / totalAmount) * 100, clampNumber);
}

function resolveFallbackRate({
  post,
  marketType,
  fallbackProbability,
  clampNumber,
}) {
  const fallbackRate = readSingleFiniteNumber(fallbackProbability)
    ?? readPostFallbackProbability(post, marketType)
    ?? DEFAULT_FALLBACK_RATE;

  return normalizeRate(fallbackRate, clampNumber);
}

function readPostFallbackProbability(post, marketType) {
  if (marketType === "flamewar") {
    return readFiniteNumber(post, ["flamewar_probability"]);
  }

  if (marketType === "get_roasted") {
    return readFiniteNumber(post, ["roast_probability", "get_roasted_probability"]);
  }

  return readFiniteNumber(post, ["hot_probability", "probability", "yes_rate"]);
}

function buildMarketRate({
  yesRate,
  source,
  sourceLabel,
  aggregate,
  clampNumber,
}) {
  const normalizedYesRate = normalizeRate(yesRate, clampNumber);
  const normalizedNoRate = 100 - normalizedYesRate;

  return {
    source,
    sourceLabel,
    yesRate: normalizedYesRate,
    noRate: normalizedNoRate,
    yesWidth: normalizeVisualWidth(normalizedYesRate, clampNumber),
    noWidth: normalizeVisualWidth(normalizedNoRate, clampNumber),
    yesAmount: Math.max(0, readFiniteNumber(aggregate, ["yes_amount_total", "yes_amount_cumulative"]) ?? 0),
    noAmount: Math.max(0, readFiniteNumber(aggregate, ["no_amount_total", "no_amount_cumulative"]) ?? 0),
    totalAmount: Math.max(0, readFiniteNumber(aggregate, ["total_amount_total", "total_amount_cumulative"]) ?? 0),
    sampleCount: Math.max(0, readFiniteNumber(aggregate, ["sample_count_total", "sample_count_cumulative"]) ?? 0),
  };
}

function normalizeRate(value, clampNumber) {
  return clampNumber(Math.round(Number(value)), 0, 100);
}

function normalizeVisualWidth(value, clampNumber) {
  return clampNumber(Number(value), 6, 94);
}

function readFiniteNumber(source, keys) {
  if (!source) {
    return null;
  }

  for (const key of keys) {
    const value = source[key];
    const number = readSingleFiniteNumber(value);
    if (number !== null) {
      return number;
    }
  }

  return null;
}

function readSingleFiniteNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function defaultClampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
