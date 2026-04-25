const STORAGE_PREFIX = "attrax:lens-agent-insight:";
export const LENS_AGENT_DEFAULT_TIMEOUT_MS = 25000;
const DEFAULT_SUMMARY = "Lens is reading this post signal.";
const DEFAULT_TREND_LABEL = "\u5b89\u9759";
const DEFAULT_RISK_LABEL = "\u4f4e";
const DEFAULT_CONFIDENCE_LABEL = "\u4f4e";

export function buildLensAgentCacheKey(post = {}) {
  const postId = toCleanString(post?.id ?? post?.post_id);
  const updatedAt = toCleanString(post?.updated_at);

  if (!postId || !updatedAt) {
    return null;
  }

  return `${postId}:${updatedAt}`;
}

export function normalizeLensAgentInsight(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const supportRate = toClampedPercent(value.supportRate);
  if (supportRate === null) {
    return null;
  }

  return {
    supportRate,
    supportText: `${supportRate}%`,
    trendLabel: toCleanString(value.trendLabel) || DEFAULT_TREND_LABEL,
    riskLabel: toCleanString(value.riskLabel) || DEFAULT_RISK_LABEL,
    confidenceLabel: toCleanString(value.confidenceLabel) || DEFAULT_CONFIDENCE_LABEL,
    summary: toCleanString(value.summary) || DEFAULT_SUMMARY,
    sourceLabel: toCleanString(value.sourceLabel) || "AI 分析",
    meterWidth: supportRate,
  };
}

export function createLensAgentInsightClient({
  supabase = null,
  storage,
  invokeAnalyzePost,
  timeoutMs = LENS_AGENT_DEFAULT_TIMEOUT_MS,
} = {}) {
  const resolvedStorage = resolveStorage(storage);
  const memoryCache = new Map();
  const pendingRequests = new Map();
  const invoke = invokeAnalyzePost ?? ((payload) => {
    if (!supabase?.functions?.invoke) {
      throw new Error("Supabase functions client is not available.");
    }

    return supabase.functions.invoke("analyze-post", {
      body: payload,
    });
  });

  function getCached(post) {
    const cacheKey = buildLensAgentCacheKey(post);
    if (!cacheKey) {
      return null;
    }

    if (memoryCache.has(cacheKey)) {
      return memoryCache.get(cacheKey);
    }

    const stored = readStoredInsight(resolvedStorage, cacheKey);
    if (stored) {
      memoryCache.set(cacheKey, stored);
      return stored;
    }

    return null;
  }

  function writeCached(cacheKey, insight) {
    memoryCache.set(cacheKey, insight);
    writeStoredInsight(resolvedStorage, cacheKey, insight);
  }

  async function loadInsight({
    post,
    supportBoardSignal = null,
    fallbackInsight = null,
    forceRefresh = false,
  } = {}) {
    const cacheKey = buildLensAgentCacheKey(post);
    if (!cacheKey) {
      return {
        source: "fallback",
        insight: fallbackInsight,
        cacheKey: null,
      };
    }

    if (!forceRefresh) {
      const cached = getCached(post);
      if (cached) {
        return {
          source: "cache",
          insight: cached,
          cacheKey,
        };
      }
    }

    if (pendingRequests.has(cacheKey)) {
      return pendingRequests.get(cacheKey);
    }

    const request = (async () => {
      try {
        const result = await withTimeout(
          Promise.resolve(invoke({ post, supportBoardSignal })),
          timeoutMs,
        );

        if (result?.error) {
          throw new Error(result.error.message || "analyze-post failed");
        }

        const insight = normalizeLensAgentInsight(result?.data ?? result);
        if (!insight) {
          throw new Error("analyze-post returned an invalid Lens insight.");
        }

        writeCached(cacheKey, insight);

        return {
          source: "remote",
          insight,
          cacheKey,
        };
      } catch (error) {
        return {
          source: "fallback",
          insight: fallbackInsight,
          cacheKey,
          error,
        };
      } finally {
        pendingRequests.delete(cacheKey);
      }
    })();

    pendingRequests.set(cacheKey, request);
    return request;
  }

  return {
    getCached,
    loadInsight,
  };
}

function readStoredInsight(storage, cacheKey) {
  if (!storage || !cacheKey) {
    return null;
  }

  try {
    const raw = storage.getItem(`${STORAGE_PREFIX}${cacheKey}`);
    if (!raw) {
      return null;
    }

    const insight = normalizeLensAgentInsight(JSON.parse(raw));
    if (!insight) {
      storage.removeItem?.(`${STORAGE_PREFIX}${cacheKey}`);
      return null;
    }

    return insight;
  } catch (_error) {
    storage.removeItem?.(`${STORAGE_PREFIX}${cacheKey}`);
    return null;
  }
}

function writeStoredInsight(storage, cacheKey, insight) {
  if (!storage || !cacheKey) {
    return;
  }

  try {
    storage.setItem(`${STORAGE_PREFIX}${cacheKey}`, JSON.stringify(insight));
  } catch (_error) {
    // Storage can be unavailable or full; in-memory cache still protects this session.
  }
}

function resolveStorage(storage) {
  if (storage !== undefined) {
    return storage;
  }

  try {
    return globalThis.localStorage ?? null;
  } catch (_error) {
    return null;
  }
}

function withTimeout(promise, timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = globalThis.setTimeout(() => {
      reject(new Error("analyze-post timed out"));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== null) {
      globalThis.clearTimeout(timer);
    }
  });
}

function toClampedPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return null;
  }

  return Math.min(Math.max(Math.round(number), 6), 94);
}

function toCleanString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}
