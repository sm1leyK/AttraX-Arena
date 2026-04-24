-- AttraX Arena virtual coin schema draft
-- Draft-only file. Keep separate from the current production MVP schema.
-- Intended apply order:
--   1. public.schema.sql
--   2. this file
--
-- Assumptions:
-- - profiles / posts / comments / likes / post_predictions already exist
-- - public.set_updated_at() and public.is_admin() already exist
-- - coin balances are integer-based, not floating-point
-- - wallet mutations should be backend-controlled, not client-controlled
-- - agents are intentionally excluded from this virtual coin module

create extension if not exists pgcrypto;

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles (id) on delete cascade,
  balance bigint not null default 0,
  lifetime_earned bigint not null default 0,
  lifetime_spent bigint not null default 0,
  last_rewarded_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint wallets_balance_nonnegative check (balance >= 0),
  constraint wallets_lifetime_earned_nonnegative check (lifetime_earned >= 0),
  constraint wallets_lifetime_spent_nonnegative check (lifetime_spent >= 0)
);

create unique index if not exists wallets_owner_unique_idx
  on public.wallets (owner_profile_id);

create table if not exists public.reward_cycles (
  id uuid primary key default gen_random_uuid(),
  cycle_type text not null,
  status text not null default 'scheduled',
  rule_key text not null,
  reward_amount bigint not null,
  max_winners integer,
  window_start timestamptz not null,
  window_end timestamptz not null,
  processed_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint reward_cycles_type_valid check (
    cycle_type in ('signup_bonus', 'daily_login', 'top_post_30m', 'manual_campaign', 'weekly_settlement')
  ),
  constraint reward_cycles_status_valid check (
    status in ('scheduled', 'running', 'completed', 'cancelled', 'failed')
  ),
  constraint reward_cycles_reward_amount_positive check (reward_amount > 0),
  constraint reward_cycles_max_winners_positive check (max_winners is null or max_winners > 0),
  constraint reward_cycles_window_valid check (window_end > window_start),
  constraint reward_cycles_notes_length check (notes is null or char_length(notes) <= 1000)
);

create unique index if not exists reward_cycles_window_unique_idx
  on public.reward_cycles (cycle_type, window_start, window_end);

create index if not exists reward_cycles_status_idx
  on public.reward_cycles (status, window_start desc);

create index if not exists reward_cycles_rule_key_idx
  on public.reward_cycles (rule_key);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets (id) on delete cascade,
  reward_cycle_id uuid references public.reward_cycles (id) on delete set null,
  direction text not null,
  transaction_type text not null,
  status text not null default 'posted',
  amount bigint not null,
  balance_before bigint not null,
  balance_after bigint not null,
  related_post_id uuid references public.posts (id) on delete set null,
  related_comment_id uuid references public.comments (id) on delete set null,
  related_like_id uuid references public.likes (id) on delete set null,
  related_prediction_id uuid references public.post_predictions (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint wallet_transactions_direction_valid check (direction in ('credit', 'debit')),
  constraint wallet_transactions_type_valid check (
    transaction_type in (
      'signup_bonus',
      'daily_login',
      'post_reward',
      'comment_reward',
      'like_reward',
      'prediction_reward',
      'manual_adjustment',
      'admin_grant',
      'admin_deduction',
      'spend'
    )
  ),
  constraint wallet_transactions_status_valid check (status in ('pending', 'posted', 'voided')),
  constraint wallet_transactions_amount_positive check (amount > 0),
  constraint wallet_transactions_balance_before_nonnegative check (balance_before >= 0),
  constraint wallet_transactions_balance_after_nonnegative check (balance_after >= 0),
  constraint wallet_transactions_balance_math_valid check (
    (direction = 'credit' and balance_after = balance_before + amount)
    or
    (direction = 'debit' and balance_before >= amount and balance_after = balance_before - amount)
  ),
  constraint wallet_transactions_description_length check (
    description is null or char_length(description) <= 280
  )
);

create index if not exists wallet_transactions_wallet_created_at_idx
  on public.wallet_transactions (wallet_id, created_at desc);

create index if not exists wallet_transactions_type_idx
  on public.wallet_transactions (transaction_type, created_at desc);

create index if not exists wallet_transactions_reward_cycle_idx
  on public.wallet_transactions (reward_cycle_id);

create index if not exists wallet_transactions_related_post_idx
  on public.wallet_transactions (related_post_id);

create index if not exists wallet_transactions_related_comment_idx
  on public.wallet_transactions (related_comment_id);

create index if not exists wallet_transactions_related_like_idx
  on public.wallet_transactions (related_like_id);

create index if not exists wallet_transactions_related_prediction_idx
  on public.wallet_transactions (related_prediction_id);

create or replace function public.user_owns_wallet(target_wallet_id uuid, user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.wallets w
    where w.id = target_wallet_id
      and w.owner_profile_id = user_id
  );
$$;

drop trigger if exists set_wallets_updated_at on public.wallets;
create trigger set_wallets_updated_at
before update on public.wallets
for each row
execute function public.set_updated_at();

drop trigger if exists set_reward_cycles_updated_at on public.reward_cycles;
create trigger set_reward_cycles_updated_at
before update on public.reward_cycles
for each row
execute function public.set_updated_at();

alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.reward_cycles enable row level security;

drop policy if exists "Owners can view their own wallets" on public.wallets;
create policy "Owners can view their own wallets"
on public.wallets
for select
to authenticated
using (
  public.user_owns_wallet(id, auth.uid())
  or public.is_admin(auth.uid())
);

drop policy if exists "Admins can create wallets" on public.wallets;
create policy "Admins can create wallets"
on public.wallets
for insert
to authenticated
with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can update wallets" on public.wallets;
create policy "Admins can update wallets"
on public.wallets
for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "Owners can view their own wallet transactions" on public.wallet_transactions;
create policy "Owners can view their own wallet transactions"
on public.wallet_transactions
for select
to authenticated
using (
  public.user_owns_wallet(wallet_id, auth.uid())
  or public.is_admin(auth.uid())
);

drop policy if exists "Admins can create wallet transactions" on public.wallet_transactions;
create policy "Admins can create wallet transactions"
on public.wallet_transactions
for insert
to authenticated
with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can update wallet transactions" on public.wallet_transactions;
create policy "Admins can update wallet transactions"
on public.wallet_transactions
for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "Reward cycles are viewable by everyone" on public.reward_cycles;
create policy "Reward cycles are viewable by everyone"
on public.reward_cycles
for select
using (true);

drop policy if exists "Admins can create reward cycles" on public.reward_cycles;
create policy "Admins can create reward cycles"
on public.reward_cycles
for insert
to authenticated
with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can update reward cycles" on public.reward_cycles;
create policy "Admins can update reward cycles"
on public.reward_cycles
for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));
