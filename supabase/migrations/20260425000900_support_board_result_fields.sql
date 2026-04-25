-- Add support-board result fields before trigger functions and board RPCs read them.

alter table public.posts
  add column if not exists support_board_result text;

alter table public.posts
  add column if not exists support_board_result_at timestamptz;

alter table public.posts
  add column if not exists support_board_result_by uuid references public.profiles (id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'posts_support_board_result_valid'
      and conrelid = 'public.posts'::regclass
  ) then
    alter table public.posts
      add constraint posts_support_board_result_valid
      check (support_board_result is null or support_board_result in ('yes', 'no', 'refund'));
  end if;
end;
$$;

create or replace view public.feed_posts
with (security_invoker = true)
as
with like_stats as (
  select post_id, count(*)::int as like_count
  from public.likes
  group by post_id
),
comment_stats as (
  select post_id, count(*)::int as comment_count
  from public.comments
  group by post_id
),
share_stats as (
  select post_id, count(*)::int as share_count
  from public.post_shares
  group by post_id
),
prediction_stats as (
  select
    post_id,
    max(probability) filter (where prediction_type = 'hot_24h' and status = 'open') as hot_probability,
    max(odds_value) filter (where prediction_type = 'hot_24h' and status = 'open') as hot_odds,
    max(probability) filter (where prediction_type = 'flamewar' and status = 'open') as flamewar_probability
  from public.post_predictions
  group by post_id
)
select
  p.id,
  p.title,
  p.content,
  public.normalize_post_image_url(p.image_url) as image_url,
  p.category,
  p.participates_in_support_board,
  p.support_board_deadline_at,
  p.support_board_deadline_at as deadline_at,
  case
    when p.support_board_deadline_at is null then null::bigint
    else greatest(
      0,
      floor(extract(epoch from (p.support_board_deadline_at - timezone('utc', now()))))
    )::bigint
  end as support_board_seconds_remaining,
  p.created_at,
  p.updated_at,
  p.author_kind,
  p.author_profile_id,
  p.author_agent_id,
  coalesce(h.username, a.display_name) as author_name,
  case when p.author_kind = 'human' then h.avatar_url else a.avatar_url end as author_avatar_url,
  case when p.author_kind = 'agent' then a.badge else null end as author_badge,
  case when p.author_kind = 'agent' then a.disclosure else null end as author_disclosure,
  (p.author_kind = 'agent') as is_ai_agent,
  coalesce(ls.like_count, 0) as like_count,
  coalesce(cs.comment_count, 0) as comment_count,
  coalesce(ps.hot_probability, 0) as hot_probability,
  ps.hot_odds,
  coalesce(ps.flamewar_probability, 0) as flamewar_probability,
  coalesce(ss.share_count, 0) as share_count,
  p.support_board_result,
  p.support_board_result_at,
  p.support_board_result_by
from public.posts p
left join public.profiles h on h.id = p.author_profile_id
left join public.agents a on a.id = p.author_agent_id
left join like_stats ls on ls.post_id = p.id
left join comment_stats cs on cs.post_id = p.id
left join share_stats ss on ss.post_id = p.id
left join prediction_stats ps on ps.post_id = p.id;
