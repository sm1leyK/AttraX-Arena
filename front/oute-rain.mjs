export const OUTE_RAIN_DEFAULTS = Object.freeze({
  iconSrc: "./assets/mob-token.png?v=round",
  mobileBreakpoint: 720,
  mobileCount: 18,
  desktopCount: 34,
  minSize: 22,
  maxSize: 38,
  minDuration: 4.8,
  maxDuration: 8.2,
  maxDelay: 1.8,
  minDrift: -36,
  maxDrift: 36,
  minSpin: -70,
  maxSpin: 70,
  minLeftPercent: 2,
  maxLeftPercent: 98,
  minOpacity: 0.72,
  maxOpacity: 0.96,
  supportBoardSignatureLimit: 5,
});

function numberOrFallback(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function randomBetween(min, max, random) {
  const safeMin = numberOrFallback(min, 0);
  const safeMax = numberOrFallback(max, safeMin);
  const low = Math.min(safeMin, safeMax);
  const high = Math.max(safeMin, safeMax);
  return low + random() * (high - low);
}

function toFixedNumber(value, decimals = 2) {
  return Number(value.toFixed(decimals));
}

export function getOuteRainCount(viewportWidth, options = OUTE_RAIN_DEFAULTS) {
  const width = numberOrFallback(viewportWidth, 1024);
  return width <= options.mobileBreakpoint ? options.mobileCount : options.desktopCount;
}

export function buildOuteRainDrops({
  viewportWidth = 1024,
  random = Math.random,
  options = OUTE_RAIN_DEFAULTS,
} = {}) {
  const count = Math.max(0, Math.floor(options.count ?? getOuteRainCount(viewportWidth, options)));

  return Array.from({ length: count }, (_unused, index) => ({
    id: `oute-rain-${Date.now()}-${index}`,
    leftPercent: toFixedNumber(randomBetween(options.minLeftPercent, options.maxLeftPercent, random)),
    size: toFixedNumber(randomBetween(options.minSize, options.maxSize, random)),
    duration: toFixedNumber(randomBetween(options.minDuration, options.maxDuration, random)),
    delay: toFixedNumber(randomBetween(0, options.maxDelay, random)),
    drift: toFixedNumber(randomBetween(options.minDrift, options.maxDrift, random)),
    spin: toFixedNumber(randomBetween(options.minSpin, options.maxSpin, random)),
    opacity: toFixedNumber(randomBetween(options.minOpacity, options.maxOpacity, random)),
  }));
}

export function shouldStartOuteRain({ reducedMotion = false, hidden = false } = {}) {
  return !reducedMotion && !hidden;
}

function normalizeSignatureValue(value) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (typeof value === "number") {
    return String(Number(value.toFixed(2)));
  }

  return String(value);
}

export function buildSupportBoardRainSignature(items = []) {
  return (items ?? [])
    .slice(0, OUTE_RAIN_DEFAULTS.supportBoardSignatureLimit ?? 5)
    .map((item, index) => [
      index + 1,
      normalizeSignatureValue(item?.post_id),
      normalizeSignatureValue(item?.market_type),
      normalizeSignatureValue(Number(item?.yes_rate ?? 0)),
      normalizeSignatureValue(Number(item?.total_amount_total ?? 0)),
      normalizeSignatureValue(Number(item?.sample_count_total ?? 0)),
      normalizeSignatureValue(item?.latest_bet_at ?? item?.latest_bucket_ts),
    ].join(":"))
    .join("|");
}

export function shouldTriggerSupportBoardRain({
  previousSignature,
  nextSignature,
  reason = "poll",
} = {}) {
  if (!previousSignature || !nextSignature || previousSignature === nextSignature) {
    return false;
  }

  return reason === "live-update" || reason === "poll";
}
