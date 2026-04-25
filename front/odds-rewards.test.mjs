import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPlacePostBetPayload,
  classifyPostBetError,
  getMarketPositionSide,
  getOppositeSideLockMessage,
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

test("detects locked market side while allowing same-side add-ons", () => {
  const bets = [
    { market_type: "hot_24h", side: "yes", amount: 50 },
    { market_type: "hot_24h", side: "yes", amount: 50 },
    { market_type: "flamewar", side: "no", amount: 50 },
  ];

  assert.equal(getMarketPositionSide(bets, "hot_24h"), "yes");
  assert.equal(getMarketPositionSide(bets, "flamewar"), "no");
  assert.equal(getMarketPositionSide(bets, "get_roasted"), null);
  assert.equal(
    getOppositeSideLockMessage("yes"),
    "你已站队 YES，可继续追加 YES，不能改站 NO。",
  );
});

test("formats odds success, settlement, and backend error messages", () => {
  assert.equal(
    toPostBetSuccessMessage({ side: "yes", marketType: "hot_24h", stakeAmount: 50 }),
    "Joined YES on hot_24h with 50 MOB. Odds locked at bet time.",
  );
  assert.equal(toSettlementStatusMessage({ total_payout: 90 }), "Settled 90 MOB into wallet.");
  assert.equal(toSettlementStatusMessage({ message: "No unsettled odds positions found." }), "No unsettled odds positions found.");
  assert.equal(mapPostBetError("insufficient wallet balance"), "你的 MOB 余额不足，无法完成这次站队。");
  assert.equal(mapPostBetError("already joined YES side for this market"), "你已站队 YES，可继续追加 YES，不能改站 NO。");
  assert.equal(mapPostBetError("post authors cannot join their own market"), "Post authors cannot join the stance market for their own posts.");
  assert.equal(classifyPostBetError("Could not find the function public.place_post_bet"), "missing");
});
