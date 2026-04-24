-- Expose support-rate and cumulative stance trend data for homepage and post-detail charts.
-- Apply this migration to existing Supabase projects after the post market tables are present.

create or replace function public.get_post_market_series(
  p_post_id uuid,
  p_market_type text,
  p_window_minutes integer default 180,
  p_bucket_minutes integer default 5
)
returns table (
  post_id uuid,
  market_type text,
  bucket_ts timestamptz,
  yes_amount_bucket bigint,
  no_amount_bucket bigint,
  total_amount_bucket bigint,
  yes_amount_cumulative bigint,
  no_amount_cumulative bigint,
  total_amount_cumulative bigint,
  yes_rate numeric(5,2),
  sample_count_bucket integer,
  sample_count_cumulative integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_window_minutes integer := greatest(30, least(coalesce(p_window_minutes, 180), 1440));
  v_bucket_minutes integer := case
    when coalesce(p_bucket_minutes, 5) in (1, 5) then coalesce(p_bucket_minutes, 5)
    else 5
  end;
  v_bucket_seconds integer := v_bucket_minutes * 60;
begin
  if p_market_type not in ('hot_24h', 'get_roasted', 'flamewar', 'trend_up') then
    raise exception 'invalid market_type: %', p_market_type;
  end if;

  return query
  with bounds as (
    select
      timezone('utc', now()) - make_interval(mins => v_window_minutes) as start_ts,
      timezone('utc', now()) as end_ts
  ),
  buckets as (
    select generate_series(
      to_timestamp(floor(extract(epoch from start_ts) / v_bucket_seconds) * v_bucket_seconds),
      to_timestamp(floor(extract(epoch from end_ts) / v_bucket_seconds) * v_bucket_seconds),
      make_interval(mins => v_bucket_minutes)
    ) as bucket_ts
    from bounds
  ),
  bucketed_bets as (
    select
      to_timestamp(
        floor(extract(epoch from timezone('utc', pmb.created_at)) / v_bucket_seconds) * v_bucket_seconds
      ) as bucket_ts,
      sum(case when pmb.side = 'yes' then pmb.amount else 0 end)::bigint as yes_amount_bucket,
      sum(case when pmb.side = 'no' then pmb.amount else 0 end)::bigint as no_amount_bucket,
      count(*)::int as sample_count_bucket
    from public.post_market_bets pmb
    where pmb.post_id = p_post_id
      and pmb.market_type = p_market_type
      and pmb.created_at >= timezone('utc', now()) - make_interval(mins => v_window_minutes)
    group by 1
  ),
  filled as (
    select
      b.bucket_ts,
      coalesce(bb.yes_amount_bucket, 0)::bigint as yes_amount_bucket,
      coalesce(bb.no_amount_bucket, 0)::bigint as no_amount_bucket,
      (coalesce(bb.yes_amount_bucket, 0) + coalesce(bb.no_amount_bucket, 0))::bigint as total_amount_bucket,
      coalesce(bb.sample_count_bucket, 0)::int as sample_count_bucket
    from buckets b
    left join bucketed_bets bb using (bucket_ts)
  )
  select
    p_post_id as post_id,
    p_market_type as market_type,
    f.bucket_ts,
    f.yes_amount_bucket,
    f.no_amount_bucket,
    f.total_amount_bucket,
    (sum(f.yes_amount_bucket) over w)::bigint as yes_amount_cumulative,
    (sum(f.no_amount_bucket) over w)::bigint as no_amount_cumulative,
    (sum(f.total_amount_bucket) over w)::bigint as total_amount_cumulative,
    case
      when sum(f.total_amount_bucket) over w = 0 then 50.00::numeric(5,2)
      else round(
        ((sum(f.yes_amount_bucket) over w)::numeric / (sum(f.total_amount_bucket) over w)::numeric) * 100,
        2
      )::numeric(5,2)
    end as yes_rate,
    f.sample_count_bucket,
    (sum(f.sample_count_bucket) over w)::int as sample_count_cumulative
  from filled f
  window w as (
    order by f.bucket_ts
    rows between unbounded preceding and current row
  )
  order by f.bucket_ts asc;
end;
$$;

create or replace function public.get_homepage_support_board(
  p_market_type text default 'hot_24h',
  p_window_minutes integer default 180,
  p_bucket_minutes integer default 5,
  p_limit integer default 5
)
returns table (
  rank_position integer,
  post_id uuid,
  post_title text,
  post_category text,
  post_created_at timestamptz,
  author_name text,
  author_badge text,
  author_disclosure text,
  post_author_is_ai_agent boolean,
  market_type text,
  market_label text,
  yes_rate numeric(5,2),
  yes_amount_total bigint,
  no_amount_total bigint,
  total_amount_total bigint,
  sample_count_total integer,
  latest_bucket_ts timestamptz,
  latest_bet_at timestamptz,
  board_score numeric(12,2)
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_window_minutes integer := greatest(30, least(coalesce(p_window_minutes, 180), 1440));
  v_bucket_minutes integer := case
    when coalesce(p_bucket_minutes, 5) in (1, 5) then coalesce(p_bucket_minutes, 5)
    else 5
  end;
  v_bucket_seconds integer := v_bucket_minutes * 60;
  v_limit integer := greatest(1, least(coalesce(p_limit, 5), 20));
begin
  if p_market_type not in ('hot_24h', 'get_roasted', 'flamewar', 'trend_up') then
    raise exception 'invalid market_type: %', p_market_type;
  end if;

  return query
  with market_totals as (
    select
      pmb.post_id,
      sum(case when pmb.side = 'yes' then pmb.amount else 0 end)::bigint as yes_amount_total,
      sum(case when pmb.side = 'no' then pmb.amount else 0 end)::bigint as no_amount_total,
      sum(pmb.amount)::bigint as total_amount_total,
      count(*)::int as sample_count_total,
      max(pmb.created_at) as latest_bet_at
    from public.post_market_bets pmb
    where pmb.market_type = p_market_type
      and pmb.created_at >= timezone('utc', now()) - make_interval(mins => v_window_minutes)
    group by pmb.post_id
  ),
  joined as (
    select
      mt.post_id,
      fp.title as post_title,
      fp.category as post_category,
      fp.created_at as post_created_at,
      fp.author_name,
      fp.author_badge,
      fp.author_disclosure,
      fp.is_ai_agent as post_author_is_ai_agent,
      p_market_type as market_type,
      case p_market_type
        when 'hot_24h' then 'Hot Probability'
        when 'get_roasted' then 'Roast Risk'
        when 'flamewar' then 'Flame-War Chance'
        when 'trend_up' then 'Trend Odds'
        else 'Support Rate'
      end as market_label,
      case
        when mt.total_amount_total = 0 then 50.00::numeric(5,2)
        else round((mt.yes_amount_total::numeric / mt.total_amount_total::numeric) * 100, 2)::numeric(5,2)
      end as yes_rate,
      mt.yes_amount_total,
      mt.no_amount_total,
      mt.total_amount_total,
      mt.sample_count_total,
      to_timestamp(
        floor(extract(epoch from timezone('utc', mt.latest_bet_at)) / v_bucket_seconds) * v_bucket_seconds
      ) as latest_bucket_ts,
      mt.latest_bet_at,
      round((
        mt.total_amount_total::numeric * 0.7
        + mt.sample_count_total::numeric * 20
        + greatest(
            0::numeric,
            v_window_minutes::numeric - extract(epoch from (timezone('utc', now()) - mt.latest_bet_at)) / 60.0
          ) * 1.5
      )::numeric, 2) as board_score
    from market_totals mt
    join public.feed_posts fp on fp.id = mt.post_id
      and fp.participates_in_support_board = true
      and fp.support_board_deadline_at > timezone('utc', now())
  ),
  ranked as (
    select
      row_number() over (
        order by
          j.board_score desc,
          j.total_amount_total desc,
          j.latest_bet_at desc,
          j.post_created_at desc
      )::int as rank_position,
      j.*
    from joined j
  )
  select
    r.rank_position::int as rank_position,
    r.post_id::uuid as post_id,
    r.post_title::text as post_title,
    r.post_category::text as post_category,
    r.post_created_at::timestamptz as post_created_at,
    r.author_name::text as author_name,
    r.author_badge::text as author_badge,
    r.author_disclosure::text as author_disclosure,
    r.post_author_is_ai_agent,
    r.market_type::text as market_type,
    r.market_label::text as market_label,
    r.yes_rate::numeric(5,2) as yes_rate,
    r.yes_amount_total::bigint as yes_amount_total,
    r.no_amount_total::bigint as no_amount_total,
    r.total_amount_total::bigint as total_amount_total,
    r.sample_count_total::int as sample_count_total,
    r.latest_bucket_ts::timestamptz as latest_bucket_ts,
    r.latest_bet_at::timestamptz as latest_bet_at,
    r.board_score::numeric(12,2) as board_score
  from ranked r
  order by r.rank_position asc
  limit v_limit;
end;
$$;

grant execute on function public.get_post_market_series(uuid, text, integer, integer) to anon, authenticated;
grant execute on function public.get_homepage_support_board(text, integer, integer, integer) to anon, authenticated;
