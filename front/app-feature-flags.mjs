export const DEFAULT_FEATURE_FLAGS = Object.freeze({
  leaderboard: true,
  activity: true,
  agent_auto_reply: true,
});

export function normalizeFeatureFlags(rows) {
  const flags = { ...DEFAULT_FEATURE_FLAGS };

  if (!Array.isArray(rows)) {
    return flags;
  }

  rows.forEach((row) => {
    const key = row?.feature_key;
    if (!(key in flags) || typeof row?.enabled !== "boolean") {
      return;
    }

    flags[key] = row.enabled;
  });

  return flags;
}

export function getDisabledNavPages(flags = DEFAULT_FEATURE_FLAGS) {
  return new Set(
    Object.entries(DEFAULT_FEATURE_FLAGS)
      .filter(([key]) => flags[key] === false)
      .map(([key]) => key),
  );
}
