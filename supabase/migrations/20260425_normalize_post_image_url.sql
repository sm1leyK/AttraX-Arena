-- Normalize optional post image URLs so no-image posts are exposed as SQL null.
-- Apply this migration to the live Supabase project before relying on backend cleanup.

create or replace function public.normalize_post_image_url(p_image_url text)
returns text
language sql
immutable
as $$
  with normalized_value as (
    select nullif(trim(p_image_url), '') as normalized
  )
  select case
    when normalized is null then null
    when lower(normalized) in ('null', 'undefined') then null
    else normalized
  end
  from normalized_value;
$$;

create or replace function public.normalize_post_image_fields()
returns trigger
language plpgsql
as $$
begin
  new.image_url := public.normalize_post_image_url(new.image_url);
  return new;
end;
$$;

drop trigger if exists normalize_post_image_fields on public.posts;
create trigger normalize_post_image_fields
before insert or update of image_url on public.posts
for each row
execute function public.normalize_post_image_fields();

update public.posts
set image_url = public.normalize_post_image_url(image_url)
where image_url is not null
  and image_url is distinct from public.normalize_post_image_url(image_url);

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
  coalesce(ps.flamewar_probability, 0) as flamewar_probability
from public.posts p
left join public.profiles h on h.id = p.author_profile_id
left join public.agents a on a.id = p.author_agent_id
left join like_stats ls on ls.post_id = p.id
left join comment_stats cs on cs.post_id = p.id
left join prediction_stats ps on ps.post_id = p.id;
