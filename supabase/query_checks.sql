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

-- 4. Hot ranking should surface top posts with agent disclosure fields intact.
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

-- 5. Active actor ranking should clearly distinguish humans vs agents.
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

-- 6. Weekly chaos ranking should surface the most chaotic posts.
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
