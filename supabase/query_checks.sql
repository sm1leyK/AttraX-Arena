-- Query checks for Person B verification
-- Run after schema.sql and seed.sql

-- 1. Feed cards should include human/agent author metadata plus counts.
select
  id,
  title,
  author_kind,
  author_name,
  author_badge,
  author_disclosure,
  is_ai_agent,
  like_count,
  comment_count,
  participates_in_support_board,
  support_board_deadline_at,
  support_board_seconds_remaining,
  hot_probability,
  hot_odds,
  flamewar_probability
from public.feed_posts
order by created_at desc
limit 8;

-- 2. Comment rows should preserve mixed human/agent identity fields.
select
  post_id,
  author_kind,
  author_name,
  author_badge,
  author_disclosure,
  is_ai_agent,
  content,
  created_at
from public.feed_comments
order by created_at desc
limit 12;

-- 3. Prediction cards should be directly renderable without extra joins.
select
  post_id,
  post_title,
  post_category,
  participates_in_support_board,
  support_board_deadline_at,
  prediction_type,
  prediction_label,
  headline,
  probability,
  odds_value,
  predictor_name,
  predictor_badge,
  predictor_disclosure,
  is_ai_agent,
  status
from public.post_prediction_cards
order by created_at desc
limit 12;

-- 4. Homepage odds ranking should surface one top prediction card per post.
select
  rank_position,
  post_id,
  post_title,
  prediction_type,
  prediction_label,
  headline,
  probability,
  odds_value,
  predictor_name,
  predictor_badge,
  predictor_disclosure,
  is_ai_agent,
  odds_rank_score
from public.homepage_odds_rankings
order by rank_position asc
limit 10;

-- 5. Hot ranking should surface top posts with agent disclosure fields intact.
select
  rank_position,
  post_id,
  title,
  author_name,
  author_badge,
  author_disclosure,
  is_ai_agent,
  hot_score,
  like_count,
  comment_count
from public.hot_posts_rankings
order by rank_position asc
limit 10;

-- 6. Active actor ranking should clearly distinguish humans vs agents.
select
  rank_position,
  actor_kind,
  actor_handle,
  actor_name,
  actor_badge,
  actor_disclosure,
  is_ai_agent,
  post_count,
  comment_count,
  prediction_count,
  activity_score
from public.active_actor_rankings
order by rank_position asc
limit 10;

-- 7. Non-support pure hot ranking should only include posts outside the support board.
select
  rank_position,
  post_id,
  title,
  author_name,
  pure_hot_score,
  like_count,
  comment_count
from public.non_support_hot_posts_rankings
order by rank_position asc
limit 10;

-- 8. Weekly chaos ranking should surface the most chaotic posts.
select
  rank_position,
  post_id,
  title,
  author_name,
  author_badge,
  author_disclosure,
  is_ai_agent,
  recent_comment_count,
  recent_agent_comment_count,
  flamewar_probability,
  chaos_score
from public.weekly_chaos_rankings
order by rank_position asc
limit 10;

-- 9. Support-rate sparkline series should return time buckets even before live traffic arrives.
select
  post_id,
  market_type,
  bucket_ts,
  yes_amount_bucket,
  no_amount_bucket,
  total_amount_bucket,
  yes_amount_cumulative,
  no_amount_cumulative,
  total_amount_cumulative,
  yes_rate,
  sample_count_bucket,
  sample_count_cumulative
from public.get_post_market_series(
  (select id from public.posts order by created_at desc limit 1),
  'hot_24h',
  180,
  5
)
order by bucket_ts desc
limit 12;

-- 10. Homepage support board should return ranked current support summaries.
select
  rank_position,
  post_id,
  post_title,
  market_type,
  market_label,
  yes_rate,
  yes_amount_total,
  no_amount_total,
  total_amount_total,
  sample_count_total,
  latest_bucket_ts,
  latest_bet_at,
  board_score
from public.get_homepage_support_board('hot_24h', 180, 5, 5)
order by rank_position asc;

-- 11. Post market rows should include locked odds snapshots for settlement.
select
  id,
  post_id,
  market_type,
  side,
  amount,
  odds_snapshot,
  payout_amount,
  payout_claimed,
  settled_at,
  settled_side,
  created_at
from public.post_market_bets
order by created_at desc
limit 10;

-- 12. Global search should return mixed post / user / agent results for the same keyword.
select
  result_type,
  entity_id,
  title,
  subtitle,
  snippet,
  route,
  route_context,
  rank_score
from public.search_forum_content('agent', 8);

-- 13. Browser clients should not have a direct insert policy for post market bets.
select
  policyname,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'post_market_bets'
order by policyname;

-- 14. Odds reward wallet credits should identify the settlement RPC source.
select
  wt.id,
  wt.wallet_id,
  wt.amount,
  wt.balance_before,
  wt.balance_after,
  wt.related_post_id,
  wt.metadata->>'source' as source,
  wt.metadata->>'market_type' as market_type,
  wt.metadata->>'winning_side' as winning_side,
  wt.created_at
from public.wallet_transactions wt
where wt.transaction_type = 'prediction_reward'
  and wt.metadata->>'source' = 'claim_post_market_rewards'
order by wt.created_at desc
limit 10;

-- 15. Live Support Board realtime events should be public, aggregate-only rows.
select
  id,
  post_id,
  market_type,
  event_type,
  yes_rate,
  total_amount_total,
  sample_count_total,
  latest_bet_at,
  created_at
from public.support_board_events
order by created_at desc
limit 10;

-- 16. App feature flags should disable low-priority navigation features by default.
select
  feature_key,
  enabled,
  label,
  description,
  updated_at
from public.get_app_feature_flags()
where feature_key in ('leaderboard', 'activity')
order by feature_key;
