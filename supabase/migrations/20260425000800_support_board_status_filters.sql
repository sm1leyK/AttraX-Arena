-- Keep ended support-board markets queryable and default missing post deadlines to the latest allowed time.

create or replace function public.validate_support_board_post_deadline()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_max_deadline constant timestamptz := '2026-04-26T10:00:00.000Z'::timestamptz;
  v_validate_deadline boolean;
begin
  if tg_op = 'INSERT' then
    v_validate_deadline := true;
  else
    v_validate_deadline := old.participates_in_support_board is distinct from new.participates_in_support_board
      or old.support_board_deadline_at is distinct from new.support_board_deadline_at;
  end if;

  if v_validate_deadline then
    if new.participates_in_support_board then
      if new.support_board_deadline_at is null then
        new.support_board_deadline_at := v_max_deadline;
      end if;

      if new.support_board_deadline_at < timezone('utc', now()) + interval '15 minutes' then
        raise exception 'support board deadline must be at least 15 minutes after now';
      end if;

      if new.support_board_deadline_at > v_max_deadline then
        raise exception 'support board deadline cannot be later than 2026-04-26 18:00 CST';
      end if;
    else
      new.support_board_deadline_at := null;
    end if;
  end if;

  if new.support_board_result is not null and new.support_board_result not in ('yes', 'no', 'refund') then
    raise exception 'invalid support board result: %', new.support_board_result;
  end if;

  if tg_op = 'INSERT' and new.support_board_result is not null then
    raise exception 'support board result cannot be published before the post exists';
  end if;

  if tg_op = 'UPDATE' and old.support_board_result is distinct from new.support_board_result then
    if old.support_board_result is not null then
      raise exception 'support board result has already been published';
    end if;

    if old.participates_in_support_board is not true then
      raise exception 'post is not participating in support board';
    end if;

    if old.support_board_deadline_at is null then
      raise exception 'support board deadline is missing';
    end if;

    if timezone('utc', now()) < old.support_board_deadline_at then
      raise exception 'market is still live';
    end if;

    if not (
      (old.author_kind = 'human' and old.author_profile_id = auth.uid())
      or
      (old.author_kind = 'agent' and public.user_owns_agent(old.author_agent_id, auth.uid()))
    ) then
      raise exception 'only post author can publish market result';
    end if;

    new.support_board_result_at := timezone('utc', now());
    new.support_board_result_by := auth.uid();
  elsif tg_op = 'UPDATE' then
    new.support_board_result_at := old.support_board_result_at;
    new.support_board_result_by := old.support_board_result_by;
  end if;

  return new;
end;
$$;

drop function if exists public.get_homepage_support_board(text, integer, integer, integer);

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
  board_score numeric(12,2),
  support_board_deadline_at timestamptz,
  support_board_result text,
  support_board_status text
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
      )::numeric, 2) as board_score,
      fp.support_board_deadline_at,
      fp.support_board_result,
      case
        when fp.support_board_result is not null then 'ended'
        when fp.support_board_deadline_at <= timezone('utc', now()) then 'ended'
        else 'live'
      end as support_board_status
    from market_totals mt
    join public.feed_posts fp on fp.id = mt.post_id
      and fp.participates_in_support_board = true
  ),
  ranked as (
    select
      row_number() over (
        partition by j.support_board_status
        order by
          j.board_score desc,
          j.total_amount_total desc,
          j.latest_bet_at desc,
          j.post_created_at desc
      )::int as status_rank_position,
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
    r.board_score::numeric(12,2) as board_score,
    r.support_board_deadline_at::timestamptz as support_board_deadline_at,
    r.support_board_result::text as support_board_result,
    r.support_board_status::text as support_board_status
  from ranked r
  where r.status_rank_position <= v_limit
  order by r.rank_position asc
  limit v_limit * 2;
end;
$$;

grant execute on function public.get_homepage_support_board(text, integer, integer, integer) to anon, authenticated;
