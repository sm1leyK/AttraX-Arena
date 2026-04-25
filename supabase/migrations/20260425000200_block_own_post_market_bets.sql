-- Prevent post authors from joining the YES / NO market on their own posts.

create or replace function public.place_post_bet(
  p_post_id uuid,
  p_market_type text,
  p_side text,
  p_stake_amount bigint,
  p_actor_profile_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
  v_support_enabled boolean;
  v_deadline_at timestamptz;
  v_wallet_id uuid;
  v_balance bigint;
  v_yes_total bigint;
  v_no_total bigint;
  v_total_pool numeric;
  v_side_pool numeric;
  v_odds_snapshot numeric(8,2);
  v_author_kind text;
  v_author_profile_id uuid;
  v_author_agent_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if p_actor_profile_id is not null and p_actor_profile_id <> auth.uid() then
    raise exception 'actor_profile_id must match auth.uid()';
  end if;

  if p_market_type not in ('hot_24h', 'get_roasted', 'flamewar', 'trend_up') then
    raise exception 'invalid market_type: %', p_market_type;
  end if;

  if p_side not in ('yes', 'no') then
    raise exception 'invalid side: %', p_side;
  end if;

  if p_stake_amount is null or p_stake_amount <= 0 then
    raise exception 'stake amount must be positive';
  end if;

  select
    p.participates_in_support_board,
    p.support_board_deadline_at,
    p.author_kind,
    p.author_profile_id,
    p.author_agent_id
  into
    v_support_enabled,
    v_deadline_at,
    v_author_kind,
    v_author_profile_id,
    v_author_agent_id
  from public.posts p
  where p.id = p_post_id;

  if v_support_enabled is null then
    raise exception 'post not found';
  end if;

  if (
    v_author_kind = 'human'
    and v_author_profile_id = auth.uid()
  ) or (
    v_author_kind = 'agent'
    and public.user_owns_agent(v_author_agent_id, auth.uid())
  ) then
    raise exception 'post authors cannot join their own market';
  end if;

  if v_support_enabled is false then
    raise exception 'post is not participating in support board';
  end if;

  if v_deadline_at is null then
    raise exception 'support board deadline is missing';
  end if;

  if timezone('utc', now()) >= v_deadline_at then
    raise exception 'market already closed';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(p_post_id::text || ':' || p_market_type),
    hashtext(auth.uid()::text)
  );

  if exists (
    select 1
    from public.post_market_bets pmb
    where pmb.post_id = p_post_id
      and pmb.market_type = p_market_type
      and pmb.profile_id = auth.uid()
      and pmb.side <> p_side
  ) then
    raise exception 'already joined % side for this market',
      case when p_side = 'yes' then 'NO' else 'YES' end;
  end if;

  insert into public.wallets (
    owner_profile_id,
    balance,
    lifetime_earned,
    lifetime_spent
  )
  values (
    auth.uid(),
    0,
    0,
    0
  )
  on conflict (owner_profile_id) do nothing;

  select
    w.id,
    w.balance
  into
    v_wallet_id,
    v_balance
  from public.wallets w
  where w.owner_profile_id = auth.uid()
  for update;

  if v_wallet_id is null then
    raise exception 'wallet unavailable';
  end if;

  if v_balance < p_stake_amount then
    raise exception 'insufficient wallet balance';
  end if;

  select
    coalesce(sum(case when pmb.side = 'yes' then pmb.amount else 0 end), 0)::bigint,
    coalesce(sum(case when pmb.side = 'no' then pmb.amount else 0 end), 0)::bigint
  into
    v_yes_total,
    v_no_total
  from public.post_market_bets pmb
  where pmb.post_id = p_post_id
    and pmb.market_type = p_market_type;

  v_yes_total := v_yes_total + 100;
  v_no_total := v_no_total + 100;
  v_total_pool := (v_yes_total + v_no_total)::numeric;
  v_side_pool := case when p_side = 'yes' then v_yes_total::numeric else v_no_total::numeric end;
  v_odds_snapshot := round(greatest(1.05::numeric, v_total_pool / nullif(v_side_pool, 0)), 2)::numeric(8,2);

  insert into public.post_market_bets (
    post_id,
    market_type,
    side,
    profile_id,
    amount,
    odds_snapshot
  )
  values (
    p_post_id,
    p_market_type,
    p_side,
    auth.uid(),
    p_stake_amount,
    v_odds_snapshot
  )
  returning id into inserted_id;

  update public.wallets
  set
    balance = balance - p_stake_amount,
    lifetime_spent = lifetime_spent + p_stake_amount
  where id = v_wallet_id;

  insert into public.wallet_transactions (
    wallet_id,
    direction,
    transaction_type,
    status,
    amount,
    balance_before,
    balance_after,
    related_post_id,
    created_by,
    description,
    metadata
  )
  values (
    v_wallet_id,
    'debit',
    'spend',
    'posted',
    p_stake_amount,
    v_balance,
    v_balance - p_stake_amount,
    p_post_id,
    auth.uid(),
    format('Stake %s on %s @ %sx', upper(p_side), p_market_type, v_odds_snapshot),
    jsonb_build_object(
      'source', 'place_post_bet',
      'market_type', p_market_type,
      'side', p_side,
      'odds_snapshot', v_odds_snapshot
    )
  );

  return inserted_id;
end;
$$;
