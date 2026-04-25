-- AttraX Arena virtual coin seed draft
-- Apply after:
--   1. schema.sql
--   2. schema_virtual_coin_draft.sql
--
-- This seed is draft/demo-only.
-- It targets up to 3 existing human participant profiles from public.profiles.
-- It does not create auth users.
-- It is designed to be repeatable:
-- - it removes its own previous draft transactions first
-- - it removes its own previous draft reward cycles first
-- - it then recreates demo reward data for the same environment

begin;

-- 1. Remove the last draft seed impact from wallet balances.
with prior_seed as (
  select
    wallet_id,
    coalesce(sum(case when direction = 'credit' then amount else 0 end), 0)::bigint as prior_earned,
    coalesce(sum(case when direction = 'debit' then amount else 0 end), 0)::bigint as prior_spent,
    coalesce(sum(case when direction = 'credit' then amount else -amount end), 0)::bigint as prior_net
  from public.wallet_transactions
  where coalesce(metadata ->> 'seed_key', '') = 'virtual_coin_draft_v1'
  group by wallet_id
)
update public.wallets w
set
  balance = greatest(0, w.balance - ps.prior_net),
  lifetime_earned = greatest(0, w.lifetime_earned - ps.prior_earned),
  lifetime_spent = greatest(0, w.lifetime_spent - ps.prior_spent),
  updated_at = timezone('utc', now())
from prior_seed ps
where w.id = ps.wallet_id;

-- 2. Remove the last draft seed rows.
delete from public.wallet_transactions
where coalesce(metadata ->> 'seed_key', '') = 'virtual_coin_draft_v1';

delete from public.reward_cycles
where rule_key in (
  'draft_seed_signup_bonus',
  'draft_seed_daily_login',
  'draft_seed_top_post_30m',
  'draft_seed_manual_campaign'
);

-- 3. Pick up to 3 existing human participant profiles as demo wallet targets.
create temporary table temp_virtual_coin_targets on commit drop as
select
  p.id as profile_id,
  p.username,
  row_number() over (order by p.created_at asc, p.username asc) as profile_rank
from public.profiles p
where p.role = 'participant'
order by p.created_at asc, p.username asc
limit 3;

-- 4. Ensure those profiles have wallets.
insert into public.wallets (
  owner_profile_id,
  balance,
  lifetime_earned,
  lifetime_spent
)
select
  t.profile_id,
  0,
  0,
  0
from temp_virtual_coin_targets t
on conflict (owner_profile_id) do nothing;

-- 5. Seed a few reward cycles only when demo human profiles exist.
insert into public.reward_cycles (
  id,
  cycle_type,
  status,
  rule_key,
  reward_amount,
  max_winners,
  window_start,
  window_end,
  processed_at,
  created_by,
  notes,
  metadata
)
select *
from (
  values
    (
      '61000000-0000-4000-8000-000000000001'::uuid,
      'signup_bonus'::text,
      'completed'::text,
      'draft_seed_signup_bonus'::text,
      1500::bigint,
      null::integer,
      timezone('utc', now()) - interval '7 days',
      timezone('utc', now()) + interval '7 days',
      timezone('utc', now()) - interval '6 days',
      null::uuid,
      'Draft seed: starter reward for demo human wallets.'::text,
      jsonb_build_object('seed_key', 'virtual_coin_draft_v1', 'seed_type', 'reward_cycle')
    ),
    (
      '61000000-0000-4000-8000-000000000002'::uuid,
      'daily_login'::text,
      'completed'::text,
      'draft_seed_daily_login'::text,
      30::bigint,
      null::integer,
      date_trunc('day', timezone('utc', now())),
      date_trunc('day', timezone('utc', now())) + interval '1 day',
      timezone('utc', now()) - interval '2 hours',
      null::uuid,
      'Draft seed: simulate one claimed daily login reward.'::text,
      jsonb_build_object('seed_key', 'virtual_coin_draft_v1', 'seed_type', 'reward_cycle')
    ),
    (
      '61000000-0000-4000-8000-000000000003'::uuid,
      'top_post_30m'::text,
      'completed'::text,
      'draft_seed_top_post_30m'::text,
      120::bigint,
      1::integer,
      timezone('utc', now()) - interval '30 minutes',
      timezone('utc', now()),
      timezone('utc', now()) - interval '5 minutes',
      null::uuid,
      'Draft seed: reward the strongest recent human-authored post.'::text,
      jsonb_build_object('seed_key', 'virtual_coin_draft_v1', 'seed_type', 'reward_cycle')
    ),
    (
      '61000000-0000-4000-8000-000000000004'::uuid,
      'manual_campaign'::text,
      'completed'::text,
      'draft_seed_manual_campaign'::text,
      75::bigint,
      null::integer,
      timezone('utc', now()) - interval '1 day',
      timezone('utc', now()) + interval '1 day',
      timezone('utc', now()) - interval '10 minutes',
      null::uuid,
      'Draft seed: manual engagement bonus for demo data.'::text,
      jsonb_build_object('seed_key', 'virtual_coin_draft_v1', 'seed_type', 'reward_cycle')
    )
) as cycles (
  id,
  cycle_type,
  status,
  rule_key,
  reward_amount,
  max_winners,
  window_start,
  window_end,
  processed_at,
  created_by,
  notes,
  metadata
)
where exists (
  select 1
  from temp_virtual_coin_targets
);

-- 6. Build demo transaction plan from existing human users and their existing content.
with target_wallets as (
  select
    w.id as wallet_id,
    w.owner_profile_id,
    w.balance as starting_balance,
    t.username,
    t.profile_rank
  from public.wallets w
  join temp_virtual_coin_targets t on t.profile_id = w.owner_profile_id
),
latest_target_post as (
  select
    p.id as post_id,
    p.author_profile_id
  from public.posts p
  join temp_virtual_coin_targets t on t.profile_id = p.author_profile_id
  where p.author_kind = 'human'
  order by p.created_at desc
  limit 1
),
latest_target_comment as (
  select
    c.id as comment_id,
    c.author_profile_id
  from public.comments c
  join temp_virtual_coin_targets t on t.profile_id = c.author_profile_id
  where c.author_kind = 'human'
  order by c.created_at desc
  limit 1
),
latest_target_like as (
  select
    l.id as like_id,
    l.actor_profile_id
  from public.likes l
  join temp_virtual_coin_targets t on t.profile_id = l.actor_profile_id
  where l.actor_kind = 'human'
  order by l.created_at desc
  limit 1
),
transaction_plan as (
  select
    tw.wallet_id,
    tw.owner_profile_id,
    tw.username,
    tw.profile_rank,
    tw.starting_balance,
    10 as sort_order,
    '61000000-0000-4000-8000-000000000001'::uuid as reward_cycle_id,
    'credit'::text as direction,
    'signup_bonus'::text as transaction_type,
    1500::bigint as amount,
    null::uuid as related_post_id,
    null::uuid as related_comment_id,
    null::uuid as related_like_id,
    null::uuid as related_prediction_id,
    'Draft seed: starter coin bonus.'::text as description
  from target_wallets tw

  union all

  select
    tw.wallet_id,
    tw.owner_profile_id,
    tw.username,
    tw.profile_rank,
    tw.starting_balance,
    20 as sort_order,
    '61000000-0000-4000-8000-000000000002'::uuid as reward_cycle_id,
    'credit'::text as direction,
    'daily_login'::text as transaction_type,
    30::bigint as amount,
    null::uuid as related_post_id,
    null::uuid as related_comment_id,
    null::uuid as related_like_id,
    null::uuid as related_prediction_id,
    'Draft seed: claimed one daily login reward.'::text as description
  from target_wallets tw

  union all

  select
    tw.wallet_id,
    tw.owner_profile_id,
    tw.username,
    tw.profile_rank,
    tw.starting_balance,
    30 as sort_order,
    '61000000-0000-4000-8000-000000000003'::uuid as reward_cycle_id,
    'credit'::text as direction,
    'post_reward'::text as transaction_type,
    120::bigint as amount,
    lp.post_id as related_post_id,
    null::uuid as related_comment_id,
    null::uuid as related_like_id,
    null::uuid as related_prediction_id,
    'Draft seed: recent top post reward.'::text as description
  from target_wallets tw
  join latest_target_post lp on lp.author_profile_id = tw.owner_profile_id

  union all

  select
    tw.wallet_id,
    tw.owner_profile_id,
    tw.username,
    tw.profile_rank,
    tw.starting_balance,
    40 as sort_order,
    '61000000-0000-4000-8000-000000000004'::uuid as reward_cycle_id,
    'credit'::text as direction,
    'comment_reward'::text as transaction_type,
    20::bigint as amount,
    null::uuid as related_post_id,
    lc.comment_id as related_comment_id,
    null::uuid as related_like_id,
    null::uuid as related_prediction_id,
    'Draft seed: recent comment engagement bonus.'::text as description
  from target_wallets tw
  join latest_target_comment lc on lc.author_profile_id = tw.owner_profile_id

  union all

  select
    tw.wallet_id,
    tw.owner_profile_id,
    tw.username,
    tw.profile_rank,
    tw.starting_balance,
    50 as sort_order,
    '61000000-0000-4000-8000-000000000004'::uuid as reward_cycle_id,
    'credit'::text as direction,
    'like_reward'::text as transaction_type,
    10::bigint as amount,
    null::uuid as related_post_id,
    null::uuid as related_comment_id,
    ll.like_id as related_like_id,
    null::uuid as related_prediction_id,
    'Draft seed: recent like engagement bonus.'::text as description
  from target_wallets tw
  join latest_target_like ll on ll.actor_profile_id = tw.owner_profile_id

  union all

  select
    tw.wallet_id,
    tw.owner_profile_id,
    tw.username,
    tw.profile_rank,
    tw.starting_balance,
    60 as sort_order,
    null::uuid as reward_cycle_id,
    'debit'::text as direction,
    'spend'::text as transaction_type,
    60::bigint as amount,
    null::uuid as related_post_id,
    null::uuid as related_comment_id,
    null::uuid as related_like_id,
    null::uuid as related_prediction_id,
    'Draft seed: sample cosmetic spend to demonstrate debit flow.'::text as description
  from target_wallets tw
  where tw.profile_rank = 1
),
sequenced_plan as (
  select
    tp.*,
    coalesce(
      sum(
        case when tp.direction = 'credit' then tp.amount else -tp.amount end
      ) over (
        partition by tp.wallet_id
        order by tp.sort_order
        rows between unbounded preceding and 1 preceding
      ),
      0
    )::bigint as prior_delta
  from transaction_plan tp
),
final_plan as (
  select
    wallet_id,
    reward_cycle_id,
    direction,
    transaction_type,
    amount,
    (starting_balance + prior_delta)::bigint as balance_before,
    (
      starting_balance
      + prior_delta
      + case when direction = 'credit' then amount else -amount end
    )::bigint as balance_after,
    related_post_id,
    related_comment_id,
    related_like_id,
    related_prediction_id,
    description,
    username
  from sequenced_plan
)
insert into public.wallet_transactions (
  id,
  wallet_id,
  reward_cycle_id,
  direction,
  transaction_type,
  status,
  amount,
  balance_before,
  balance_after,
  related_post_id,
  related_comment_id,
  related_like_id,
  related_prediction_id,
  created_by,
  description,
  metadata
)
select
  gen_random_uuid(),
  fp.wallet_id,
  fp.reward_cycle_id,
  fp.direction,
  fp.transaction_type,
  'posted',
  fp.amount,
  fp.balance_before,
  fp.balance_after,
  fp.related_post_id,
  fp.related_comment_id,
  fp.related_like_id,
  fp.related_prediction_id,
  null::uuid,
  fp.description,
  jsonb_build_object(
    'seed_key', 'virtual_coin_draft_v1',
    'seed_source', 'seed_virtual_coin_draft.sql',
    'target_username', fp.username
  )
from final_plan fp;

-- 7. Recalculate seeded wallet totals for the targeted human users.
with seeded_totals as (
  select
    wt.wallet_id,
    coalesce(sum(case when wt.direction = 'credit' then wt.amount else 0 end), 0)::bigint as seeded_earned,
    coalesce(sum(case when wt.direction = 'debit' then wt.amount else 0 end), 0)::bigint as seeded_spent,
    max(wt.created_at) as last_rewarded_at
  from public.wallet_transactions wt
  where coalesce(wt.metadata ->> 'seed_key', '') = 'virtual_coin_draft_v1'
  group by wt.wallet_id
)
update public.wallets w
set
  balance = w.balance + st.seeded_earned - st.seeded_spent,
  lifetime_earned = w.lifetime_earned + st.seeded_earned,
  lifetime_spent = w.lifetime_spent + st.seeded_spent,
  last_rewarded_at = st.last_rewarded_at,
  updated_at = timezone('utc', now())
from seeded_totals st
where w.id = st.wallet_id;

commit;

-- Suggested verification after running this draft seed:
-- select * from public.wallets order by updated_at desc;
-- select * from public.wallet_transactions order by created_at desc;
-- select * from public.reward_cycles order by created_at desc;
