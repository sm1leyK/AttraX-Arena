import test from "node:test";
import assert from "node:assert/strict";
import {
  OUTE_RAIN_DEFAULTS,
  buildSupportBoardRainSignature,
  buildOuteRainDrops,
  getOuteRainCount,
  shouldTriggerSupportBoardRain,
  shouldStartOuteRain,
} from "./oute-rain.mjs";

function sequenceRandom(values) {
  let index = 0;
  return () => {
    const value = values[index % values.length];
    index += 1;
    return value;
  };
}

test("builds responsive MOB rain drops within animation bounds", () => {
  const drops = buildOuteRainDrops({
    viewportWidth: 1280,
    random: sequenceRandom([0, 0.25, 0.5, 0.75, 1]),
  });

  assert.equal(drops.length, OUTE_RAIN_DEFAULTS.desktopCount);
  assert.equal(getOuteRainCount(390), OUTE_RAIN_DEFAULTS.mobileCount);
  assert.equal(getOuteRainCount(960), OUTE_RAIN_DEFAULTS.desktopCount);

  for (const drop of drops) {
    assert.ok(drop.leftPercent >= 2 && drop.leftPercent <= 98);
    assert.ok(drop.size >= OUTE_RAIN_DEFAULTS.minSize && drop.size <= OUTE_RAIN_DEFAULTS.maxSize);
    assert.ok(drop.duration >= OUTE_RAIN_DEFAULTS.minDuration && drop.duration <= OUTE_RAIN_DEFAULTS.maxDuration);
    assert.ok(drop.delay >= 0 && drop.delay <= OUTE_RAIN_DEFAULTS.maxDelay);
    assert.ok(drop.drift >= OUTE_RAIN_DEFAULTS.minDrift && drop.drift <= OUTE_RAIN_DEFAULTS.maxDrift);
    assert.ok(drop.spin >= OUTE_RAIN_DEFAULTS.minSpin && drop.spin <= OUTE_RAIN_DEFAULTS.maxSpin);
  }
});

test("skips ambient MOB rain for reduced motion or hidden documents", () => {
  assert.equal(shouldStartOuteRain({ reducedMotion: false, hidden: false }), true);
  assert.equal(shouldStartOuteRain({ reducedMotion: true, hidden: false }), false);
  assert.equal(shouldStartOuteRain({ reducedMotion: false, hidden: true }), false);
});

test("detects real Live Support Board updates before raining", () => {
  const firstSignature = buildSupportBoardRainSignature([
    {
      post_id: "post-1",
      market_type: "hot_24h",
      yes_rate: 61.2,
      total_amount_total: 120,
      sample_count_total: 3,
      latest_bet_at: "2026-04-25T04:00:00.000Z",
    },
  ]);
  const sameSignature = buildSupportBoardRainSignature([
    {
      post_id: "post-1",
      market_type: "hot_24h",
      yes_rate: 61.2,
      total_amount_total: 120,
      sample_count_total: 3,
      latest_bet_at: "2026-04-25T04:00:00.000Z",
    },
  ]);
  const updatedSignature = buildSupportBoardRainSignature([
    {
      post_id: "post-1",
      market_type: "hot_24h",
      yes_rate: 67.9,
      total_amount_total: 180,
      sample_count_total: 4,
      latest_bet_at: "2026-04-25T04:05:00.000Z",
    },
  ]);

  assert.equal(shouldTriggerSupportBoardRain({
    previousSignature: null,
    nextSignature: firstSignature,
    reason: "initial-load",
  }), false);
  assert.equal(shouldTriggerSupportBoardRain({
    previousSignature: firstSignature,
    nextSignature: sameSignature,
    reason: "poll",
  }), false);
  assert.equal(shouldTriggerSupportBoardRain({
    previousSignature: firstSignature,
    nextSignature: updatedSignature,
    reason: "live-update",
  }), true);
  assert.equal(shouldTriggerSupportBoardRain({
    previousSignature: firstSignature,
    nextSignature: updatedSignature,
    reason: "manual-filter",
  }), false);
});
