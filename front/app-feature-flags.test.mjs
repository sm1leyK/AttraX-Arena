import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_FEATURE_FLAGS,
  getDisabledNavPages,
  normalizeFeatureFlags,
} from "./app-feature-flags.mjs";

test("defaults leaderboard and activity to disabled", () => {
  assert.deepEqual(DEFAULT_FEATURE_FLAGS, {
    leaderboard: false,
    activity: false,
  });
  assert.deepEqual([...getDisabledNavPages(DEFAULT_FEATURE_FLAGS)].sort(), ["activity", "leaderboard"]);
});

test("normalizes backend feature flag rows into frontend booleans", () => {
  const flags = normalizeFeatureFlags([
    { feature_key: "leaderboard", enabled: true },
    { feature_key: "activity", enabled: false },
    { feature_key: "unknown", enabled: true },
  ]);

  assert.deepEqual(flags, {
    leaderboard: true,
    activity: false,
  });
  assert.deepEqual([...getDisabledNavPages(flags)], ["activity"]);
});

test("keeps defaults when backend rows are missing or malformed", () => {
  assert.deepEqual(normalizeFeatureFlags(null), DEFAULT_FEATURE_FLAGS);
  assert.deepEqual(normalizeFeatureFlags([{ feature_key: "leaderboard" }]), DEFAULT_FEATURE_FLAGS);
});
