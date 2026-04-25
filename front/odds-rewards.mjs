export function buildPlacePostBetPayload({
  postId,
  marketType,
  side,
  stakeAmount,
  actorProfileId,
}) {
  return {
    p_post_id: postId,
    p_market_type: marketType,
    p_side: side,
    p_stake_amount: stakeAmount,
    p_actor_profile_id: actorProfileId,
  };
}

export function summarizeMarketPosition(bets, marketType) {
  const marketBets = (bets ?? []).filter((item) => item.market_type === marketType);

  return marketBets.reduce((summary, item) => {
    const amount = Number(item.amount || 0);
    const oddsSnapshot = Number(item.odds_snapshot || 1);
    const payoutAmount = Number(item.payout_amount || 0);

    summary.count += 1;
    summary.totalStaked += amount;
    summary.potentialPayout += Math.max(0, Math.round(amount * oddsSnapshot));
    summary.claimedPayout += payoutAmount;

    if (!item.payout_claimed) {
      summary.unsettledCount += 1;
    }

    if (item.side === "yes") {
      summary.yesStake += amount;
    }

    if (item.side === "no") {
      summary.noStake += amount;
    }

    return summary;
  }, {
    count: 0,
    totalStaked: 0,
    potentialPayout: 0,
    unsettledCount: 0,
    claimedPayout: 0,
    yesStake: 0,
    noStake: 0,
  });
}

export function getMarketPositionSide(bets, marketType) {
  const sides = new Set();

  (bets ?? []).forEach((item) => {
    if (item?.market_type !== marketType) {
      return;
    }

    if (item.side === "yes" || item.side === "no") {
      sides.add(item.side);
    }
  });

  if (sides.size === 0) {
    return null;
  }

  if (sides.size > 1) {
    return "mixed";
  }

  return [...sides][0];
}

export function getOppositeSideLockMessage(lockedSide) {
  if (lockedSide === "mixed") {
    return "你在这个 market 已有双边站队记录，请联系管理员处理后再追加。";
  }

  if (lockedSide !== "yes" && lockedSide !== "no") {
    return "";
  }

  const lockedLabel = lockedSide.toUpperCase();
  const oppositeLabel = lockedSide === "yes" ? "NO" : "YES";

  return `你已站队 ${lockedLabel}，可继续追加 ${lockedLabel}，不能改站 ${oppositeLabel}。`;
}

export function toPostBetSuccessMessage({ side, marketType, stakeAmount }) {
  return `Joined ${String(side).toUpperCase()} on ${marketType} with ${stakeAmount} MOB. Odds locked at bet time.`;
}

export function toSettlementStatusMessage(result) {
  if (result?.message) {
    return result.message;
  }

  const payoutAmount = Number(result?.total_payout ?? 0);
  if (payoutAmount > 0) {
    return `Settled ${payoutAmount} MOB into wallet.`;
  }

  return "本次结算没有新增 MOB。";
}

export function classifyPostBetError(message) {
  if (isMissingBackendFeatureError(message)) {
    return "missing";
  }

  const text = String(message || "");

  if (
    text.includes("row-level security")
    || text.includes("permission denied")
    || text.includes("violates row-level security")
  ) {
    return "forbidden";
  }

  return "other";
}

export function mapPostBetError(message) {
  const text = String(message || "");

  if (
    text.includes("row-level security")
    || text.includes("violates row-level security")
  ) {
    return "The backend bet interface exists, but current RLS permissions are still blocking frontend users.";
  }

  if (text.includes("permission denied")) {
    return "The backend bet interface exists, but this account does not have write permission.";
  }

  if (text.includes("insufficient wallet balance")) {
    return "你的 MOB 余额不足，无法完成这次站队。";
  }

  if (text.includes("market already closed")) {
    return "这个市场已经截止，不能继续站队了。";
  }

  if (text.includes("already joined")) {
    const upperText = text.toUpperCase();
    const side = upperText.includes("YES") ? "yes" : upperText.includes("NO") ? "no" : null;
    return getOppositeSideLockMessage(side) || "你已经站过另一边，不能切换方向。";
  }

  if (text.includes("post authors cannot join their own market")) {
    return "Post authors cannot join the stance market for their own posts.";
  }

  if (text.includes("support board deadline")) {
    return "参与支持率排行的帖子必须设置合法的截止时间。";
  }

  if (text.includes("post is not participating in support board")) {
    return "该帖子没有参与支持率排行，无法站队。";
  }

  return text || "Submitting the post bet failed. Please try again later.";
}

function isMissingBackendFeatureError(message) {
  const text = String(message || "").toLowerCase();

  return (
    text.includes("could not find the function")
    || text.includes("schema cache")
    || (text.includes("relation") && text.includes("does not exist"))
    || (text.includes("column") && text.includes("does not exist"))
    || (text.includes("function") && text.includes("does not exist"))
  );
}
