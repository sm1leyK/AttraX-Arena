# Support Deadline Odds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make support-board post countdowns user-configurable and make odds rewards use wallet-backed, bet-time locked odds.

**Architecture:** Extract deadline and odds UI calculations from `front/app.mjs` into small browser-safe ES modules with Node tests. Keep Supabase as the source of truth for deadline validation, wallet debit, odds snapshots, and settlement rewards.

**Tech Stack:** Static HTML, browser ES modules, Supabase RPC/Postgres SQL, Node's built-in `node:test` runner.

---

## File Structure

- Create `front/support-deadline.mjs`: support-board deadline constants, datetime-local parsing/formatting, validation, countdown snapshot helpers.
- Create `front/odds-rewards.mjs`: post-market RPC payload builder, position summary, settlement result message, and error classification helpers.
- Create `front/support-deadline.test.mjs`: Node tests for deadline validation and countdown snapshots.
- Create `front/odds-rewards.test.mjs`: Node tests for locked-odds summaries and RPC payload behavior.
- Modify `front/app.mjs`: import helpers, remove unsafe legacy fallback writes from the active `submitPostBet` path, and update UI copy to describe locked odds.
- Modify `supabase/query_checks.sql`: add read checks that expose locked odds snapshots and settlement wallet transaction metadata.

## Task 1: Deadline Utility Tests

**Files:**
- Create: `front/support-deadline.test.mjs`
- Create after red: `front/support-deadline.mjs`
- Modify after green: `front/app.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  SUPPORT_BOARD_MAX_DEADLINE_ISO,
  buildSupportDeadlineValidation,
  formatCountdownDuration,
  formatForDateTimeLocal,
  getMarketCountdownSnapshot,
  parseLocalDateTimeInput,
} from "./support-deadline.mjs";

test("validates support-board deadline bounds", () => {
  const now = new Date("2026-04-25T03:00:00.000Z");
  const tooSoon = new Date(now.getTime() + 14 * 60_000);
  const valid = new Date(now.getTime() + 15 * 60_000);
  const tooLate = new Date(new Date(SUPPORT_BOARD_MAX_DEADLINE_ISO).getTime() + 60_000);

  assert.equal(buildSupportDeadlineValidation(tooSoon, { now }).ok, false);
  assert.equal(buildSupportDeadlineValidation(valid, { now }).ok, true);
  assert.equal(buildSupportDeadlineValidation(tooLate, { now }).ok, false);
});

test("formats and parses datetime-local values", () => {
  const date = new Date("2026-04-26T10:00:00.000Z");
  assert.match(formatForDateTimeLocal(date), /^2026-04-26T\d\d:00$/);
  assert.equal(parseLocalDateTimeInput("bad-value"), null);
  assert.ok(parseLocalDateTimeInput("2026-04-26T18:00") instanceof Date);
});

test("returns countdown snapshots with injected now", () => {
  const deadline = "2026-04-25T04:00:00.000Z";

  assert.deepEqual(getMarketCountdownSnapshot(deadline, { now: new Date("2026-04-25T03:59:59.000Z") }), {
    expired: false,
    live: true,
    pending: false,
    valueText: "00:00:01",
    statusText: "进行中",
  });

  assert.equal(getMarketCountdownSnapshot(deadline, { now: new Date("2026-04-25T04:00:00.000Z") }).expired, true);
  assert.equal(getMarketCountdownSnapshot("", { now: new Date("2026-04-25T04:00:00.000Z") }).pending, true);
  assert.equal(formatCountdownDuration(90_000), "00:01:30");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test front/support-deadline.test.mjs`

Expected: FAIL with module-not-found for `front/support-deadline.mjs`.

- [ ] **Step 3: Write minimal implementation**

Create `front/support-deadline.mjs` with exported constants and pure helper functions used by both tests and `app.mjs`.

- [ ] **Step 4: Wire `app.mjs` to the module**

Import the helpers from `./support-deadline.mjs` and remove duplicate local definitions for deadline constants, parsing, validation, countdown snapshots, and duration formatting.

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test front/support-deadline.test.mjs`

Expected: PASS.

## Task 2: Odds Reward Utility Tests

**Files:**
- Create: `front/odds-rewards.test.mjs`
- Create after red: `front/odds-rewards.mjs`
- Modify after green: `front/app.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPlacePostBetPayload,
  mapPostBetError,
  summarizeMarketPosition,
  toPostBetSuccessMessage,
  toSettlementStatusMessage,
} from "./odds-rewards.mjs";

test("builds the wallet-backed place_post_bet payload", () => {
  assert.deepEqual(buildPlacePostBetPayload({
    postId: "post-1",
    marketType: "hot_24h",
    side: "yes",
    stakeAmount: 50,
    actorProfileId: "user-1",
  }), {
    p_post_id: "post-1",
    p_market_type: "hot_24h",
    p_side: "yes",
    p_stake_amount: 50,
    p_actor_profile_id: "user-1",
  });
});

test("summarizes locked-odds positions without changing old snapshots", () => {
  const summary = summarizeMarketPosition([
    { market_type: "hot_24h", side: "yes", amount: 50, odds_snapshot: 1.8, payout_claimed: false },
    { market_type: "hot_24h", side: "no", amount: 20, odds_snapshot: 2.25, payout_claimed: true, payout_amount: 45 },
    { market_type: "flamewar", side: "yes", amount: 99, odds_snapshot: 9.99, payout_claimed: false },
  ], "hot_24h");

  assert.equal(summary.totalStaked, 70);
  assert.equal(summary.yesStake, 50);
  assert.equal(summary.noStake, 20);
  assert.equal(summary.potentialPayout, 135);
  assert.equal(summary.unsettledCount, 1);
  assert.equal(summary.claimedPayout, 45);
});

test("formats odds success, settlement, and backend error messages", () => {
  assert.equal(toPostBetSuccessMessage({ side: "yes", marketType: "hot_24h", stakeAmount: 50 }), "Joined YES on hot_24h with 50 oute. Odds locked at bet time.");
  assert.equal(toSettlementStatusMessage({ total_payout: 90 }), "Settled 90 oute into wallet.");
  assert.equal(mapPostBetError("insufficient wallet balance"), "你的 oute 余额不足，无法完成这次下注。");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test front/odds-rewards.test.mjs`

Expected: FAIL with module-not-found for `front/odds-rewards.mjs`.

- [ ] **Step 3: Write minimal implementation**

Create `front/odds-rewards.mjs` with the pure helper functions in the test.

- [ ] **Step 4: Wire `app.mjs` to the module**

Use `buildPlacePostBetPayload` in `submitPostBet`, call only `place_post_bet`, update the success message to mention bet-time locked odds, and use `summarizeMarketPosition` in `renderDetailMarketPosition`.

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test front/odds-rewards.test.mjs`

Expected: PASS.

## Task 3: SQL And Health Verification

**Files:**
- Modify: `supabase/query_checks.sql`
- Verify: `front/health-check.mjs`

- [ ] **Step 1: Extend SQL checks**

Add checks that show `wallet_transactions.metadata->>'source' = 'claim_post_market_rewards'` rows and unsettled `post_market_bets` rows with `odds_snapshot`.

- [ ] **Step 2: Run all local frontend checks**

Run: `node --test front/support-deadline.test.mjs front/odds-rewards.test.mjs`

Expected: PASS.

Run: `node front/health-check.mjs`

Expected: exit code 0 and `OK: frontend file health passed.`

- [ ] **Step 3: Git checkpoint**

If `_git/index.lock` is gone and no unrelated files need staging, stage only the files touched by this plan and commit. If the lock remains, report that implementation is verified but commit is blocked by the active git lock.
