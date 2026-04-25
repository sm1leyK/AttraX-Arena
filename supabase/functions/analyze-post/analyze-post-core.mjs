const LABELS = Object.freeze({
  high: "\u9ad8",
  medium: "\u4e2d",
  low: "\u4f4e",
  rising: "\u4e0a\u5347",
  steady: "\u7a33\u5b9a",
  volatile: "\u6ce2\u52a8",
  quiet: "\u5b89\u9759",
});
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const LENS_ANALYSIS_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "supportRate",
    "trendLabel",
    "riskLabel",
    "confidenceLabel",
    "summary",
  ],
  properties: {
    supportRate: {
      type: "integer",
      minimum: 0,
      maximum: 100,
      description: "Estimated support rate percentage for the post.",
    },
    trendLabel: {
      type: "string",
      enum: [
        LABELS.rising,
        LABELS.steady,
        LABELS.volatile,
        LABELS.quiet,
      ],
    },
    riskLabel: {
      type: "string",
      enum: [
        LABELS.high,
        LABELS.medium,
        LABELS.low,
      ],
    },
    confidenceLabel: {
      type: "string",
      enum: [
        LABELS.high,
        LABELS.medium,
        LABELS.low,
      ],
    },
    summary: {
      type: "string",
      minLength: 8,
      maxLength: 160,
      description: "One short Lens-style Chinese sentence for the UI card.",
    },
  },
});

export function normalizeAnalyzePostRequest(payload = {}) {
  const postId = toCleanString(payload?.post?.id ?? payload?.post?.post_id);
  if (!postId) {
    return {
      ok: false,
      status: 400,
      code: "missing_post_id",
      message: "post.id is required for Lens analysis.",
    };
  }

  const updatedAt = toCleanString(payload?.post?.updated_at);
  if (!updatedAt) {
    return {
      ok: false,
      status: 400,
      code: "missing_updated_at",
      message: "post.updated_at is required for Lens analysis caching.",
    };
  }

  const post = pickPostForAnalysis({
    ...payload.post,
    id: postId,
    updated_at: updatedAt,
  });
  const supportBoardSignal = pickSupportBoardSignal(payload.supportBoardSignal);

  return {
    ok: true,
    cacheKey: `${post.id}:${post.updated_at}`,
    post,
    supportBoardSignal,
  };
}

export function pickPostForAnalysis(post = {}) {
  return {
    id: toCleanString(post.id ?? post.post_id),
    updated_at: toCleanString(post.updated_at),
    title: toCleanString(post.title),
    content: toCleanString(post.content),
    category: toCleanString(post.category),
    hot_probability: toFiniteNumber(post.hot_probability) ?? 0,
    flamewar_probability: toFiniteNumber(post.flamewar_probability) ?? 0,
    like_count: Math.max(0, toFiniteNumber(post.like_count) ?? 0),
    comment_count: Math.max(0, toFiniteNumber(post.comment_count) ?? 0),
    participates_in_support_board: post.participates_in_support_board !== false,
  };
}

export function buildMockAnalyzePostInsight({ post = {}, supportBoardSignal = null } = {}) {
  const normalizedPost = pickPostForAnalysis(post);
  const signal = pickSupportBoardSignal(supportBoardSignal);
  const hotProbability = normalizedPost.hot_probability;
  const debateProbability = normalizedPost.flamewar_probability;
  const engagement = normalizedPost.like_count + normalizedPost.comment_count * 2;
  const liveSupportRate = toFiniteNumber(signal?.yes_rate);
  const supportRate = liveSupportRate === null
    ? estimateSupportRate({
      hotProbability,
      debateProbability,
      engagement,
      participatesInSupportBoard: normalizedPost.participates_in_support_board,
    })
    : clampNumber(Math.round(liveSupportRate), 6, 94);
  const riskLabel = debateProbability >= 70
    ? LABELS.high
    : debateProbability >= 45
      ? LABELS.medium
      : LABELS.low;
  const trend = resolveTrend({ supportRate, hotProbability, debateProbability, engagement });
  const confidence = estimateConfidence({
    hotProbability,
    engagement,
    supportBoardSignal: signal,
  });

  return {
    supportRate,
    supportText: `${supportRate}%`,
    trendLabel: trendToLabel(trend),
    riskLabel,
    confidenceLabel: confidence >= 70 ? LABELS.high : confidence >= 55 ? LABELS.medium : LABELS.low,
    summary: trendToSummary(trend, normalizedPost.participates_in_support_board),
    meterWidth: supportRate,
  };
}

export function buildOpenAIAnalyzePostRequest({
  model,
  post = {},
  supportBoardSignal = null,
} = {}) {
  const analysisPayload = {
    post: pickPostForAnalysis(post),
    supportBoardSignal: pickSupportBoardSignal(supportBoardSignal),
  };

  return {
    model,
    store: false,
    max_output_tokens: 220,
    instructions: [
      "You are Lens, a compact social-post analysis agent for AttraX.",
      "Analyze only the supplied post JSON and support-board signal.",
      "Return calibrated labels for a small Lens card.",
      "Use concise Chinese for summary. Do not mention private implementation details.",
    ].join(" "),
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: JSON.stringify(analysisPayload),
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "lens_post_analysis",
        strict: true,
        schema: LENS_ANALYSIS_SCHEMA,
      },
    },
  };
}

export function buildOpenAIAnalyzePostChatCompletionRequest({
  model,
  post = {},
  supportBoardSignal = null,
} = {}) {
  const analysisPayload = {
    post: pickPostForAnalysis(post),
    supportBoardSignal: pickSupportBoardSignal(supportBoardSignal),
  };

  return {
    model,
    temperature: 0.2,
    max_tokens: 220,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "You are Lens, a compact social-post analysis agent for AttraX.",
          "Return only valid JSON with supportRate, trendLabel, riskLabel, confidenceLabel, and summary.",
          "Use concise Chinese for summary. Do not mention private implementation details.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify(analysisPayload),
      },
    ],
  };
}

export async function analyzePostWithOpenAI({
  apiKey,
  model,
  baseUrl = DEFAULT_OPENAI_BASE_URL,
  api = "responses",
  post = {},
  supportBoardSignal = null,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!apiKey) {
    throw new Error("missing_openai_key");
  }

  if (!model) {
    throw new Error("missing_openai_model");
  }

  if (typeof fetchImpl !== "function") {
    throw new Error("missing_fetch");
  }

  const useChatCompletions = api === "chat_completions";
  const response = await fetchImpl(useChatCompletions ? buildOpenAIChatCompletionsUrl(baseUrl) : buildOpenAIResponsesUrl(baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(useChatCompletions ? buildOpenAIAnalyzePostChatCompletionRequest({
      model,
      post,
      supportBoardSignal,
    }) : buildOpenAIAnalyzePostRequest({
      model,
      post,
      supportBoardSignal,
    })),
  });

  if (!response?.ok) {
    const status = response?.status ?? "unknown";
    const body = typeof response?.text === "function" ? await response.text() : "";
    throw new Error(`openai_request_failed:${status}:${sanitizeOpenAIError(body, apiKey)}`);
  }

  const data = await response.json();
  return normalizeOpenAIAnalyzePostInsight(useChatCompletions ? parseOpenAIChatCompletionJson(data) : parseOpenAIResponseJson(data));
}

export function buildOpenAIResponsesUrl(baseUrl = DEFAULT_OPENAI_BASE_URL) {
  const normalizedBaseUrl = toCleanString(baseUrl) || DEFAULT_OPENAI_BASE_URL;
  return `${normalizedBaseUrl.replace(/\/+$/, "")}/responses`;
}

export function buildOpenAIChatCompletionsUrl(baseUrl = DEFAULT_OPENAI_BASE_URL) {
  const normalizedBaseUrl = toCleanString(baseUrl) || DEFAULT_OPENAI_BASE_URL;
  return `${normalizedBaseUrl.replace(/\/+$/, "")}/chat/completions`;
}

export function parseOpenAIResponseJson(response) {
  const text = extractOpenAIOutputText(response);
  if (!text) {
    throw new Error("openai_response_empty");
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    throw new Error("openai_response_invalid_json");
  }
}

export function parseOpenAIChatCompletionJson(response) {
  const text = toCleanString(response?.choices?.[0]?.message?.content);
  if (!text) {
    throw new Error("openai_response_empty");
  }

  try {
    return JSON.parse(text);
  } catch (_error) {
    throw new Error("openai_response_invalid_json");
  }
}

export function normalizeOpenAIAnalyzePostInsight(value) {
  if (!value || typeof value !== "object") {
    throw new Error("openai_response_invalid_shape");
  }

  const supportRate = clampNumber(Math.round(toFiniteNumber(value.supportRate) ?? Number.NaN), 6, 94);
  if (!Number.isFinite(supportRate)) {
    throw new Error("openai_response_missing_support_rate");
  }

  return {
    supportRate,
    trendLabel: normalizeTrendLabel(value.trendLabel),
    riskLabel: normalizeRiskOrConfidenceLabel(value.riskLabel),
    confidenceLabel: normalizeRiskOrConfidenceLabel(value.confidenceLabel),
    summary: normalizeSummary(value.summary),
  };
}

function pickSupportBoardSignal(signal = null) {
  if (!signal || typeof signal !== "object") {
    return null;
  }

  const picked = {};
  [
    "yes_rate",
    "sample_count_total",
    "total_amount_total",
    "market_type",
  ].forEach((key) => {
    if (signal[key] !== undefined && signal[key] !== null) {
      picked[key] = signal[key];
    }
  });

  return Object.keys(picked).length > 0 ? picked : null;
}

function extractOpenAIOutputText(response) {
  if (typeof response?.output_text === "string") {
    return response.output_text.trim();
  }

  for (const outputItem of response?.output ?? []) {
    for (const contentItem of outputItem?.content ?? []) {
      if (contentItem?.type === "output_text" && typeof contentItem.text === "string") {
        return contentItem.text.trim();
      }
    }
  }

  return "";
}

function normalizeTrendLabel(value) {
  const label = toCleanString(value);
  return [
    LABELS.rising,
    LABELS.steady,
    LABELS.volatile,
    LABELS.quiet,
  ].includes(label)
    ? label
    : LABELS.quiet;
}

function normalizeRiskOrConfidenceLabel(value) {
  const label = toCleanString(value);
  return [
    LABELS.high,
    LABELS.medium,
    LABELS.low,
  ].includes(label)
    ? label
    : LABELS.low;
}

function normalizeSummary(value) {
  const summary = toCleanString(value).replace(/\s+/g, " ");
  if (!summary) {
    throw new Error("openai_response_missing_summary");
  }

  return summary.slice(0, 160);
}

function sanitizeOpenAIError(message, apiKey) {
  let safeMessage = toCleanString(message).slice(0, 500);
  if (!apiKey) {
    return redactMaskedOpenAIKeys(safeMessage);
  }

  safeMessage = safeMessage.replaceAll(apiKey, "[redacted_openai_key]");
  return redactMaskedOpenAIKeys(safeMessage);
}

function redactMaskedOpenAIKeys(message) {
  return message
    .replace(/sk-[A-Za-z0-9_-]*\*{8,}[A-Za-z0-9_-]*/g, "[redacted_openai_key]")
    .replace(/sk-proj-[A-Za-z0-9_-]+/g, "[redacted_openai_key]")
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "[redacted_openai_key]");
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

function estimateConfidence({ hotProbability, engagement, supportBoardSignal }) {
  if (supportBoardSignal) {
    const sampleCount = Math.max(0, toFiniteNumber(supportBoardSignal.sample_count_total) ?? 0);
    const totalAmount = Math.max(0, toFiniteNumber(supportBoardSignal.total_amount_total) ?? 0);
    return clampNumber(Math.round(62 + sampleCount * 1.5 + Math.log10(totalAmount + 1) * 3), 55, 92);
  }

  const predictionBoost = hotProbability > 0 ? 12 : 0;
  const engagementBoost = clampNumber(Math.log10(engagement + 1) * 7, 0, 18);
  return clampNumber(Math.round(42 + predictionBoost + engagementBoost), 38, 88);
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

function trendToLabel(trend) {
  return {
    rising: LABELS.rising,
    steady: LABELS.steady,
    volatile: LABELS.volatile,
    quiet: LABELS.quiet,
  }[trend] ?? LABELS.quiet;
}

function trendToSummary(trend, participatesInSupportBoard) {
  if (trend === "volatile") {
    return "\u8ba8\u8bba\u6709\u70b9\u70eb\uff0cLens \u5efa\u8bae\u5148\u770b\u98ce\u5411\u518d\u7ad9\u961f\u3002";
  }

  if (trend === "rising") {
    return "Lens \u770b\u89c1\u652f\u6301\u6b63\u5728\u805a\u62e2\uff0c\u70ed\u5ea6\u6bd4\u80cc\u666f\u566a\u58f0\u66f4\u4eae\u4e00\u70b9\u3002";
  }

  if (trend === "steady") {
    return "Lens \u89c9\u5f97\u4fe1\u53f7\u5f88\u7a33\uff0c\u5927\u5bb6\u5728\u6162\u6162\u9760\u8fd1\u540c\u4e00\u8fb9\u3002";
  }

  return participatesInSupportBoard
    ? "Lens \u8fd8\u5728\u8bfb\u53d6\uff0c\u9700\u8981\u518d\u6765\u51e0\u6761\u4e92\u52a8\u4fe1\u53f7\u3002"
    : "Lens \u5148\u6309\u4e92\u52a8\u6e29\u5ea6\u8f7b\u8f7b\u4f30\u7b97\uff0c\u8fd9\u7bc7\u4e0d\u8fdb\u652f\u6301\u7387\u6392\u884c\u3002";
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toCleanString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}
