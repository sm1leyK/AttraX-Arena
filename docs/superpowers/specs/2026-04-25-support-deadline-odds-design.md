# Support Board Deadline And Odds Rewards Design

## Scope

Implement two connected behaviors:

- Users who opt into the support-rate ranking when creating a post can choose a custom countdown deadline.
- The odds reward system uses real wallet points, locks odds at bet time, and settles rewards after the post market closes.

## Support-Rate Countdown

The create-post form exposes a "participates in support board" toggle. When enabled, the user must choose a deadline with these constraints:

- Minimum deadline: current backend time plus 15 minutes.
- Maximum deadline: 2026-04-26 18:00 Asia/Shanghai, stored as 2026-04-26T10:00:00.000Z.
- The frontend computes and displays the remaining time from the selected deadline.
- The backend validates the same limits before insert or update.

If the user disables support-board participation, the post stores `participates_in_support_board = false` and `support_board_deadline_at = null`. Those posts do not enter the support-rate board or YES/NO market.

## Odds Reward Rules

The odds system uses locked bet-time odds:

- A user stakes wallet points on `yes` or `no` before the support-board deadline.
- `place_post_bet` debits the stake from the user's wallet.
- The backend calculates the current odds from existing YES/NO pool totals plus seed liquidity.
- The bet row stores that value in `post_market_bets.odds_snapshot`.
- Later pool movement does not change already placed bets.

After the deadline, `claim_post_market_rewards` settles the user's unclaimed bets:

- YES wins if total YES stake is greater than total NO stake.
- NO wins if total NO stake is greater than total YES stake.
- A tie refunds each unsettled stake.
- Winning bets pay `round(amount * odds_snapshot)` into the wallet.
- Losing bets pay `0`.
- Settled rows record `payout_claimed`, `payout_amount`, `settled_at`, and `settled_side`.

## Frontend Behavior

The detail and feed market controls must:

- Disable staking when the user is logged out, the post is not in the support board, or the deadline has passed.
- Show the selected deadline countdown where market controls appear.
- Submit YES/NO stakes through `place_post_bet`.
- Show a settlement action after the countdown expires when the user has unclaimed market positions.
- Refresh wallet, post details, and support-board data after staking or settlement.

## Error Handling

Frontend messages should map backend failures into user-facing copy for:

- Missing login.
- Invalid or expired support-board deadline.
- Non-support-board post.
- Insufficient wallet balance.
- RLS or permission mismatch.
- Already-settled or no-unsettled reward state.

## Testing And Verification

Add focused checks for:

- Deadline validation minimum, maximum, missing value, and opt-out.
- Date formatting for `datetime-local`.
- Bet-time odds snapshot behavior.
- Settlement payout, loss, and tie refund cases at the SQL/query-check level where practical.
- Existing frontend health check remains passing.
