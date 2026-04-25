-- Query checks for virtual coin draft
-- Run after:
--   1. schema.sql
--   2. schema_virtual_coin_draft.sql
--   3. seed_virtual_coin_draft.sql

-- 1. Wallets should exist only for human profiles.
select
  w.id,
  w.owner_profile_id,
  p.username,
  p.role,
  w.balance,
  w.lifetime_earned,
  w.lifetime_spent,
  w.last_rewarded_at,
  w.created_at,
  w.updated_at
from public.wallets w
left join public.profiles p on p.id = w.owner_profile_id
order by w.updated_at desc;

-- 2. Wallet count summary.
select
  count(*) as wallet_count,
  count(*) filter (where owner_profile_id is not null) as human_wallet_count
from public.wallets;

-- 3. Transaction type coverage.
select
  transaction_type,
  count(*) as row_count
from public.wallet_transactions
group by transaction_type
order by transaction_type asc;

-- 4. Core seeded transactions should exist and preserve balance math.
select
  id,
  wallet_id,
  direction,
  transaction_type,
  amount,
  balance_before,
  balance_after,
  reward_cycle_id,
  related_post_id,
  related_comment_id,
  related_like_id,
  created_at
from public.wallet_transactions
where transaction_type in ('signup_bonus', 'daily_login', 'spend')
order by created_at desc;

-- 5. Reward cycle coverage.
select
  cycle_type,
  count(*) as row_count
from public.reward_cycles
group by cycle_type
order by cycle_type asc;

-- 6. Reward cycle details.
select
  id,
  cycle_type,
  status,
  rule_key,
  reward_amount,
  max_winners,
  window_start,
  window_end,
  processed_at,
  created_at
from public.reward_cycles
order by created_at desc;

-- 7. Draft seed rows only.
select
  id,
  wallet_id,
  direction,
  transaction_type,
  amount,
  balance_before,
  balance_after,
  metadata
from public.wallet_transactions
where coalesce(metadata ->> 'seed_key', '') = 'virtual_coin_draft_v1'
order by created_at desc;

-- 8. Agent exclusion check:
-- wallets should only reference profiles and should all join successfully.
select
  w.id,
  w.owner_profile_id,
  p.username,
  p.role
from public.wallets w
left join public.profiles p on p.id = w.owner_profile_id
where p.id is null
order by w.created_at desc;

-- 9. Negative balance guard check:
-- this result should be empty.
select
  id,
  owner_profile_id,
  balance,
  lifetime_earned,
  lifetime_spent
from public.wallets
where balance < 0
   or lifetime_earned < 0
   or lifetime_spent < 0;

-- 10. Transaction balance math guard check:
-- this result should be empty.
select
  id,
  wallet_id,
  direction,
  amount,
  balance_before,
  balance_after
from public.wallet_transactions
where not (
  (direction = 'credit' and balance_after = balance_before + amount)
  or
  (direction = 'debit' and balance_before >= amount and balance_after = balance_before - amount)
);
