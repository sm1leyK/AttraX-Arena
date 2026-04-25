export const SUPPORT_BOARD_DEFAULTS = Object.freeze({
  marketType: "hot_24h",
  windowMinutes: 180,
  bucketMinutes: 5,
  limit: 5,
});

export const SUPPORT_BOARD_REALTIME_TABLES = Object.freeze([
  "support_board_events",
]);

export async function loadSupportBoardSnapshot({
  supabase,
  predictionCards = [],
  clampNumber,
  now = new Date(),
}) {
  const fallbackItems = buildFallbackSupportBoardItems(predictionCards, clampNumber, now);
  const nowMs = getTimestampMs(now);

  if (!supabase) {
    return {
      items: fallbackItems,
      seriesByKey: buildFallbackSupportBoardSeriesMap(fallbackItems, clampNumber),
      dataSource: "prediction-fallback",
    };
  }

  const summaryResult = await supabase.rpc("get_homepage_support_board", {
    p_market_type: SUPPORT_BOARD_DEFAULTS.marketType,
    p_window_minutes: SUPPORT_BOARD_DEFAULTS.windowMinutes,
    p_bucket_minutes: SUPPORT_BOARD_DEFAULTS.bucketMinutes,
    p_limit: SUPPORT_BOARD_DEFAULTS.limit,
  });

  const liveItems = !summaryResult.error
    ? (summaryResult.data ?? [])
      .map((row, index) => normalizeSupportBoardSummaryRow(row, index, clampNumber, nowMs))
      .filter(Boolean)
    : [];

  if (liveItems.length > 0) {
    const mergedItems = mergeSupportBoardItems(liveItems, fallbackItems);
    const seriesByKey = await loadSupportBoardSeriesMap({ supabase, items: liveItems, clampNumber });
    const fallbackSeriesByKey = buildFallbackSupportBoardSeriesMap(
      mergedItems.filter((item) => !liveItems.some((liveItem) => isSameBoardItem(liveItem, item))),
      clampNumber,
    );

    return {
      items: mergedItems,
      seriesByKey: {
        ...fallbackSeriesByKey,
        ...seriesByKey,
      },
      dataSource: mergedItems.length > liveItems.length ? "rpc+prediction-fallback" : "rpc",
    };
  }

  return {
    items: fallbackItems,
    seriesByKey: buildFallbackSupportBoardSeriesMap(fallbackItems, clampNumber),
    dataSource: "prediction-fallback",
  };
}

export function getSupportBoardSeriesKey(postId, marketType = SUPPORT_BOARD_DEFAULTS.marketType) {
  return `${postId}:${marketType}`;
}

export async function loadSupportBoardPostTrend({
  supabase,
  post,
  postId = post?.id ?? post?.post_id,
  marketType = SUPPORT_BOARD_DEFAULTS.marketType,
  clampNumber,
  windowMinutes = SUPPORT_BOARD_DEFAULTS.windowMinutes,
  bucketMinutes = SUPPORT_BOARD_DEFAULTS.bucketMinutes,
}) {
  const fallbackItem = buildSupportBoardTrendItem({
    post,
    postId,
    marketType,
    series: [],
    clampNumber,
  });

  if (!supabase || !postId) {
    return {
      item: fallbackItem,
      series: createFallbackSupportSeries(fallbackItem, clampNumber),
      dataSource: "prediction-fallback",
    };
  }

  const seriesResult = await supabase.rpc("get_post_market_series", {
    p_post_id: postId,
    p_market_type: marketType || SUPPORT_BOARD_DEFAULTS.marketType,
    p_window_minutes: windowMinutes,
    p_bucket_minutes: bucketMinutes,
  });

  if (seriesResult.error) {
    return {
      item: fallbackItem,
      series: createFallbackSupportSeries(fallbackItem, clampNumber),
      dataSource: "prediction-fallback",
    };
  }

  const series = normalizeSupportBoardSeriesRows(seriesResult.data ?? [], clampNumber);
  const item = buildSupportBoardTrendItem({
    post,
    postId,
    marketType,
    series,
    clampNumber,
  });

  return {
    item,
    series: series.length > 0 ? series : createFallbackSupportSeries(item, clampNumber),
    dataSource: "rpc",
  };
}

function normalizeSupportBoardSummaryRow(row, index, clampNumber, nowMs) {
  if (!row?.post_id) {
    return null;
  }

  const yesRate = clampNumber(Number(row.yes_rate ?? 50), 0, 100);

  return {
    rank_position: Number(row.rank_position ?? index + 1),
    post_id: row.post_id,
    post_title: row.post_title || "Untitled",
    post_category: row.post_category || "",
    post_created_at: row.post_created_at || null,
    author_name: row.author_name || "Arena Pulse",
    author_badge: row.author_badge || "",
    author_disclosure: row.author_disclosure || "",
    post_author_is_ai_agent: Boolean(row.post_author_is_ai_agent),
    market_type: row.market_type || SUPPORT_BOARD_DEFAULTS.marketType,
    market_label: row.market_label || "Support Rate",
    yes_rate: yesRate,
    yes_amount_total: Number(row.yes_amount_total ?? 0),
    no_amount_total: Number(row.no_amount_total ?? 0),
    total_amount_total: Number(row.total_amount_total ?? 0),
    sample_count_total: Number(row.sample_count_total ?? 0),
    latest_bucket_ts: row.latest_bucket_ts || null,
    latest_bet_at: row.latest_bet_at || null,
    board_score: Number(row.board_score ?? yesRate),
    headline: row.headline || "",
    support_board_deadline_at: row.support_board_deadline_at || row.deadline_at || null,
    support_board_result: row.support_board_result || null,
    support_board_status: getSupportBoardItemStatus(row, nowMs),
  };
}

async function loadSupportBoardSeriesMap({ supabase, items, clampNumber }) {
  const seriesMap = {};

  if (!supabase || items.length === 0) {
    return seriesMap;
  }

  const results = await Promise.allSettled(
    items.map((item) =>
      supabase.rpc("get_post_market_series", {
        p_post_id: item.post_id,
        p_market_type: item.market_type || SUPPORT_BOARD_DEFAULTS.marketType,
        p_window_minutes: SUPPORT_BOARD_DEFAULTS.windowMinutes,
        p_bucket_minutes: SUPPORT_BOARD_DEFAULTS.bucketMinutes,
      })),
  );

  items.forEach((item, index) => {
    const key = getSupportBoardSeriesKey(item.post_id, item.market_type);
    const result = results[index];

    if (result?.status === "fulfilled" && !result.value.error) {
      const rows = normalizeSupportBoardSeriesRows(result.value.data ?? [], clampNumber);
      seriesMap[key] = rows.length > 0 ? rows : createFallbackSupportSeries(item, clampNumber);
      return;
    }

    seriesMap[key] = createFallbackSupportSeries(item, clampNumber);
  });

  return seriesMap;
}

function normalizeSupportBoardSeriesRows(rows, clampNumber) {
  return (rows ?? [])
    .map((row) => ({
      bucket_ts: row.bucket_ts,
      yes_rate: clampNumber(Number(row.yes_rate ?? 50), 0, 100),
      yes_amount_bucket: Number(row.yes_amount_bucket ?? 0),
      no_amount_bucket: Number(row.no_amount_bucket ?? 0),
      total_amount_bucket: Number(row.total_amount_bucket ?? 0),
      yes_amount_cumulative: Number(row.yes_amount_cumulative ?? 0),
      no_amount_cumulative: Number(row.no_amount_cumulative ?? 0),
      total_amount_cumulative: Number(row.total_amount_cumulative ?? 0),
      sample_count_bucket: Number(row.sample_count_bucket ?? 0),
      sample_count_cumulative: Number(row.sample_count_cumulative ?? 0),
    }))
    .filter((row) => row.bucket_ts);
}

function buildFallbackSupportBoardItems(predictionCards, clampNumber, now = new Date()) {
  const nowMs = getTimestampMs(now);

  return (predictionCards ?? [])
    .map((item, index) => ({
      rank_position: index + 1,
      post_id: item.post_id,
      post_title: item.post_title || item.headline || "Untitled",
      post_category: item.post_category || "",
      post_created_at: item.created_at || null,
      author_name: item.predictor_name || "Arena Pulse",
      author_badge: item.predictor_badge || "",
      author_disclosure: item.predictor_disclosure || "",
      post_author_is_ai_agent: Boolean(item.is_ai_agent),
      market_type: item.prediction_type || SUPPORT_BOARD_DEFAULTS.marketType,
      market_label: item.prediction_label || "Support Rate",
      yes_rate: clampNumber(Number(item.probability ?? 50), 0, 100),
      yes_amount_total: 0,
      no_amount_total: 0,
      total_amount_total: 0,
      sample_count_total: 0,
      latest_bucket_ts: item.created_at || null,
      latest_bet_at: item.created_at || null,
      board_score: Number(item.probability ?? 50),
      headline: item.headline || "",
      support_board_deadline_at: item.support_board_deadline_at || item.deadline_at || null,
      support_board_result: item.support_board_result || null,
      support_board_status: getSupportBoardItemStatus(item, nowMs),
    }))
    .filter((item) => item.post_id);
}

function getSupportBoardItemStatus(item, nowMs) {
  if (item?.support_board_status === "ended" || item?.support_board_status === "live") {
    return item.support_board_status;
  }

  if (item?.support_board_result) {
    return "ended";
  }

  const deadlineMs = getTimestampMs(item?.support_board_deadline_at ?? item?.deadline_at);
  if (deadlineMs == null || nowMs == null) {
    return "live";
  }

  return deadlineMs > nowMs ? "live" : "ended";
}

function getTimestampMs(value) {
  if (!value) {
    return null;
  }

  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function mergeSupportBoardItems(primaryItems, fallbackItems) {
  const merged = [];
  const seenKeys = new Set();

  [...(primaryItems ?? []), ...(fallbackItems ?? [])].forEach((item) => {
    if (!item?.post_id) {
      return;
    }

    const key = `${item.post_id}:${item.market_type || SUPPORT_BOARD_DEFAULTS.marketType}`;
    if (seenKeys.has(key)) {
      return;
    }

    seenKeys.add(key);
    merged.push(item);
  });

  return merged;
}

function isSameBoardItem(left, right) {
  return left?.post_id === right?.post_id
    && (left?.market_type || SUPPORT_BOARD_DEFAULTS.marketType) === (right?.market_type || SUPPORT_BOARD_DEFAULTS.marketType);
}

function buildFallbackSupportBoardSeriesMap(items, clampNumber) {
  return Object.fromEntries(
    items.map((item) => [getSupportBoardSeriesKey(item.post_id, item.market_type), createFallbackSupportSeries(item, clampNumber)]),
  );
}

function buildSupportBoardTrendItem({
  post,
  postId,
  marketType,
  series,
  clampNumber,
}) {
  const lastPoint = series.at(-1);
  const fallbackRate = clampNumber(Number(
    post?.yes_rate
      ?? post?.probability
      ?? post?.hot_probability
      ?? 50,
  ), 0, 100);
  const yesRate = clampNumber(Number(lastPoint?.yes_rate ?? fallbackRate), 0, 100);
  const totalAmount = Number(
    lastPoint?.total_amount_cumulative
      ?? post?.total_amount_total
      ?? 0,
  );
  const yesAmount = Number(
    lastPoint?.yes_amount_cumulative
      ?? post?.yes_amount_total
      ?? 0,
  );
  const noAmount = Number(
    lastPoint?.no_amount_cumulative
      ?? post?.no_amount_total
      ?? 0,
  );
  const sampleCount = Number(
    lastPoint?.sample_count_cumulative
      ?? post?.sample_count_total
      ?? 0,
  );

  return {
    rank_position: Number(post?.rank_position ?? 1),
    post_id: postId,
    post_title: post?.post_title || post?.title || post?.headline || "Untitled",
    post_category: post?.post_category || post?.category || "",
    post_created_at: post?.post_created_at || post?.created_at || null,
    author_name: post?.author_name || post?.predictor_name || "Arena Pulse",
    author_badge: post?.author_badge || post?.predictor_badge || "",
    author_disclosure: post?.author_disclosure || post?.predictor_disclosure || "",
    post_author_is_ai_agent: Boolean(post?.post_author_is_ai_agent ?? post?.is_ai_agent),
    market_type: marketType || SUPPORT_BOARD_DEFAULTS.marketType,
    market_label: post?.market_label || post?.prediction_label || "Support Rate",
    yes_rate: yesRate,
    yes_amount_total: Math.max(0, yesAmount),
    no_amount_total: Math.max(0, noAmount),
    total_amount_total: Math.max(0, totalAmount),
    sample_count_total: Math.max(0, sampleCount),
    latest_bucket_ts: lastPoint?.bucket_ts || post?.latest_bucket_ts || post?.created_at || null,
    latest_bet_at: post?.latest_bet_at || null,
    board_score: Number(post?.board_score ?? yesRate),
    headline: post?.headline || "",
    support_board_deadline_at: post?.support_board_deadline_at || post?.deadline_at || null,
    support_board_result: post?.support_board_result || null,
    support_board_status: post?.support_board_status || "live",
  };
}

function createFallbackSupportSeries(item, clampNumber) {
  const endTime = item.latest_bucket_ts ? new Date(item.latest_bucket_ts).getTime() : Date.now();
  const rate = clampNumber(Number(item.yes_rate ?? 50), 0, 100);

  return Array.from({ length: 6 }, (_value, index) => ({
    bucket_ts: new Date(endTime - (5 - index) * SUPPORT_BOARD_DEFAULTS.bucketMinutes * 60000).toISOString(),
    yes_rate: rate,
    yes_amount_bucket: 0,
    no_amount_bucket: 0,
    total_amount_bucket: 0,
    yes_amount_cumulative: Number(item.yes_amount_total ?? 0),
    no_amount_cumulative: Number(item.no_amount_total ?? 0),
    total_amount_cumulative: Number(item.total_amount_total ?? 0),
    sample_count_bucket: 0,
    sample_count_cumulative: Number(item.sample_count_total ?? 0),
  }));
}
