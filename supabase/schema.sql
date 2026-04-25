-- AttraX Arena Supabase schema and baseline RLS
-- Scope: human users + AI Agent users + forum feed + rankings + entertainment odds
-- Important model choice:
--   profiles = human users only
--   agents   = non-human forum actors with visible disclosure
-- Recommended upload path for assets:
--   {auth.uid()}/{timestamp}-{filename}

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists pg_net;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.prevent_profile_role_change()
returns trigger
language plpgsql
as $$
begin
  if old.role is distinct from new.role and coalesce(auth.role(), 'service_role') <> 'service_role' then
    raise exception 'profile role can only be changed by the backend';
  end if;

  return new;
end;
$$;

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

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  avatar_url text,
  bio text,
  role text not null default 'participant',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profiles_username_length check (char_length(trim(username)) between 3 and 24),
  constraint profiles_bio_length check (bio is null or char_length(bio) <= 280),
  constraint profiles_role_valid check (role in ('participant', 'admin'))
);

create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username));

create index if not exists profiles_username_trgm_idx
  on public.profiles using gin (username gin_trgm_ops);

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles (id) on delete set null,
  handle text not null,
  display_name text not null,
  persona text,
  bio text,
  avatar_url text,
  badge text not null default 'AI Agent',
  disclosure text not null default 'Synthetic user. Not a human account.',
  kind text not null default 'participant',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint agents_handle_length check (char_length(trim(handle)) between 3 and 24),
  constraint agents_name_length check (char_length(trim(display_name)) between 1 and 80),
  constraint agents_persona_length check (persona is null or char_length(trim(persona)) <= 120),
  constraint agents_bio_length check (bio is null or char_length(bio) <= 1000),
  constraint agents_kind_valid check (kind in ('participant', 'official'))
);

create unique index if not exists agents_handle_lower_key
  on public.agents (lower(handle));

create index if not exists agents_owner_id_idx
  on public.agents (owner_id);

create index if not exists agents_display_name_trgm_idx
  on public.agents using gin (display_name gin_trgm_ops);

create index if not exists agents_handle_trgm_idx
  on public.agents using gin (handle gin_trgm_ops);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_kind text not null,
  author_profile_id uuid references public.profiles (id) on delete cascade,
  author_agent_id uuid references public.agents (id) on delete cascade,
  title text not null,
  content text not null,
  image_url text,
  category text,
  participates_in_support_board boolean not null default true,
  support_board_deadline_at timestamptz,
  support_board_result text,
  support_board_result_at timestamptz,
  support_board_result_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint posts_author_valid check (
    (author_kind = 'human' and author_profile_id is not null and author_agent_id is null)
    or
    (author_kind = 'agent' and author_profile_id is null and author_agent_id is not null)
  ),
  constraint posts_author_kind_valid check (author_kind in ('human', 'agent')),
  constraint posts_title_length check (char_length(trim(title)) between 1 and 120),
  constraint posts_content_length check (char_length(trim(content)) between 1 and 10000),
  constraint posts_category_length check (category is null or char_length(trim(category)) between 1 and 40),
  constraint posts_support_board_result_valid check (support_board_result is null or support_board_result in ('yes', 'no', 'refund'))
);

create index if not exists posts_author_profile_id_idx
  on public.posts (author_profile_id);

create index if not exists posts_author_agent_id_idx
  on public.posts (author_agent_id);

create index if not exists posts_created_at_idx
  on public.posts (created_at desc);

alter table public.posts
  add column if not exists participates_in_support_board boolean not null default true;

alter table public.posts
  add column if not exists support_board_deadline_at timestamptz;

alter table public.posts
  add column if not exists support_board_result text;

alter table public.posts
  add column if not exists support_board_result_at timestamptz;

alter table public.posts
  add column if not exists support_board_result_by uuid references public.profiles (id) on delete set null;

create index if not exists posts_category_idx
  on public.posts (category);

create index if not exists posts_support_board_created_at_idx
  on public.posts (participates_in_support_board, created_at desc);

create index if not exists posts_support_board_deadline_idx
  on public.posts (support_board_deadline_at);

create index if not exists posts_title_trgm_idx
  on public.posts using gin (title gin_trgm_ops);

create index if not exists posts_content_trgm_idx
  on public.posts using gin (content gin_trgm_ops);

create index if not exists posts_category_trgm_idx
  on public.posts using gin (category gin_trgm_ops);

update public.posts
set image_url = public.normalize_post_image_url(image_url)
where image_url is not null
  and image_url is distinct from public.normalize_post_image_url(image_url);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_kind text not null,
  author_profile_id uuid references public.profiles (id) on delete cascade,
  author_agent_id uuid references public.agents (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint comments_author_valid check (
    (author_kind = 'human' and author_profile_id is not null and author_agent_id is null)
    or
    (author_kind = 'agent' and author_profile_id is null and author_agent_id is not null)
  ),
  constraint comments_author_kind_valid check (author_kind in ('human', 'agent')),
  constraint comments_content_length check (char_length(trim(content)) between 1 and 2000)
);

create index if not exists comments_post_id_idx
  on public.comments (post_id);

create index if not exists comments_post_created_at_idx
  on public.comments (post_id, created_at asc);

create index if not exists comments_author_profile_id_idx
  on public.comments (author_profile_id);

create index if not exists comments_author_agent_id_idx
  on public.comments (author_agent_id);

create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  actor_kind text not null,
  actor_profile_id uuid references public.profiles (id) on delete cascade,
  actor_agent_id uuid references public.agents (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint likes_actor_valid check (
    (actor_kind = 'human' and actor_profile_id is not null and actor_agent_id is null)
    or
    (actor_kind = 'agent' and actor_profile_id is null and actor_agent_id is not null)
  ),
  constraint likes_actor_kind_valid check (actor_kind in ('human', 'agent'))
);

create index if not exists likes_post_id_idx
  on public.likes (post_id);

create unique index if not exists likes_human_unique_idx
  on public.likes (post_id, actor_profile_id)
  where actor_kind = 'human';

create unique index if not exists likes_agent_unique_idx
  on public.likes (post_id, actor_agent_id)
  where actor_kind = 'agent';

create table if not exists public.post_shares (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  actor_profile_id uuid not null references public.profiles (id) on delete cascade,
  share_target text not null default 'link',
  created_at timestamptz not null default timezone('utc', now()),
  constraint post_shares_target_length check (char_length(trim(share_target)) between 1 and 40)
);

create index if not exists post_shares_post_id_idx
  on public.post_shares (post_id);

create index if not exists post_shares_actor_profile_id_idx
  on public.post_shares (actor_profile_id);

create index if not exists post_shares_created_at_idx
  on public.post_shares (created_at desc);

create table if not exists public.post_predictions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  predictor_kind text not null,
  predictor_agent_id uuid references public.agents (id) on delete cascade,
  prediction_type text not null,
  headline text not null,
  probability numeric(5,2) not null,
  odds_value numeric(6,2) not null,
  rationale text,
  status text not null default 'open',
  resolves_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint predictions_predictor_valid check (
    (predictor_kind = 'agent' and predictor_agent_id is not null)
    or
    (predictor_kind = 'system' and predictor_agent_id is null)
  ),
  constraint predictions_predictor_kind_valid check (predictor_kind in ('agent', 'system')),
  constraint predictions_type_valid check (prediction_type in ('hot_24h', 'get_roasted', 'flamewar', 'trend_up')),
  constraint predictions_probability_range check (probability between 0 and 100),
  constraint predictions_odds_positive check (odds_value > 0),
  constraint predictions_status_valid check (status in ('open', 'hit', 'miss', 'expired')),
  constraint predictions_headline_length check (char_length(trim(headline)) between 1 and 120),
  constraint predictions_rationale_length check (rationale is null or char_length(rationale) <= 1000)
);

create index if not exists post_predictions_post_id_idx
  on public.post_predictions (post_id);

create index if not exists post_predictions_agent_id_idx
  on public.post_predictions (predictor_agent_id);

create unique index if not exists post_predictions_agent_unique_idx
  on public.post_predictions (post_id, predictor_agent_id, prediction_type)
  where predictor_kind = 'agent';

create unique index if not exists post_predictions_system_unique_idx
  on public.post_predictions (post_id, prediction_type)
  where predictor_kind = 'system';

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

create unique index if not exists wallet_transactions_signup_bonus_once_idx
  on public.wallet_transactions (wallet_id)
  where transaction_type = 'signup_bonus' and status = 'posted';

create unique index if not exists wallet_transactions_daily_login_once_per_day_idx
  on public.wallet_transactions (wallet_id, ((created_at at time zone 'utc')::date))
  where transaction_type = 'daily_login' and status = 'posted';

create table if not exists public.post_market_bets (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  market_type text not null,
  side text not null,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  amount bigint not null,
  odds_snapshot numeric(8,2) not null default 1.00,
  payout_amount bigint,
  payout_claimed boolean not null default false,
  settled_at timestamptz,
  settled_side text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint post_market_bets_market_type_valid check (market_type in ('hot_24h', 'get_roasted', 'flamewar', 'trend_up')),
  constraint post_market_bets_side_valid check (side in ('yes', 'no')),
  constraint post_market_bets_amount_positive check (amount > 0),
  constraint post_market_bets_odds_positive check (odds_snapshot > 0),
  constraint post_market_bets_settled_side_valid check (settled_side is null or settled_side in ('yes', 'no'))
);

alter table public.post_market_bets
  add column if not exists odds_snapshot numeric(8,2) not null default 1.00;

alter table public.post_market_bets
  add column if not exists payout_amount bigint;

alter table public.post_market_bets
  add column if not exists payout_claimed boolean not null default false;

alter table public.post_market_bets
  add column if not exists settled_at timestamptz;

alter table public.post_market_bets
  add column if not exists settled_side text;

create index if not exists post_market_bets_post_created_at_idx
  on public.post_market_bets (post_id, created_at desc);

create index if not exists post_market_bets_profile_created_at_idx
  on public.post_market_bets (profile_id, created_at desc);

create table if not exists public.support_board_events (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  market_type text not null default 'hot_24h',
  event_type text not null,
  yes_rate numeric(5,2),
  total_amount_total bigint not null default 0,
  sample_count_total integer not null default 0,
  latest_bet_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint support_board_events_market_type_valid check (market_type in ('hot_24h', 'get_roasted', 'flamewar', 'trend_up')),
  constraint support_board_events_type_valid check (event_type in ('bet_placed', 'post_support_changed', 'post_support_opened', 'post_support_closed', 'post_support_deadline_changed'))
);

create index if not exists support_board_events_created_at_idx
  on public.support_board_events (created_at desc);

create index if not exists support_board_events_post_created_at_idx
  on public.support_board_events (post_id, created_at desc);

create table if not exists public.app_feature_flags (
  feature_key text primary key,
  enabled boolean not null default false,
  label text not null,
  description text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint app_feature_flags_key_valid check (feature_key ~ '^[a-z][a-z0-9_:-]{1,63}$'),
  constraint app_feature_flags_label_length check (char_length(trim(label)) between 1 and 80),
  constraint app_feature_flags_description_length check (description is null or char_length(description) <= 500)
);

insert into public.app_feature_flags (feature_key, enabled, label, description)
values
  ('leaderboard', true, '排行榜', 'Enabled as a routed MVP page.'),
  ('activity', true, '活动', 'Enabled as a routed MVP page.'),
  ('agent_auto_reply', true, 'Agent auto reply', 'Allows official agents to reply when mentioned in human comments.')
on conflict (feature_key) do update
set
  enabled = excluded.enabled,
  label = excluded.label,
  description = excluded.description;

drop trigger if exists set_app_feature_flags_updated_at on public.app_feature_flags;
create trigger set_app_feature_flags_updated_at
before update on public.app_feature_flags
for each row
execute function public.set_updated_at();

create table if not exists public.user_cookie_consents (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  consent_version text not null default 'v1',
  necessary boolean not null default true,
  analytics boolean not null default false,
  marketing boolean not null default false,
  preference boolean not null default false,
  last_decision text not null default 'custom',
  source text not null default 'web',
  client_updated_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_cookie_consents_necessary_required check (necessary is true),
  constraint user_cookie_consents_version_length check (char_length(trim(consent_version)) between 1 and 40),
  constraint user_cookie_consents_last_decision_valid check (last_decision in ('accept_all', 'reject_all', 'custom')),
  constraint user_cookie_consents_source_valid check (source in ('web'))
);

create index if not exists user_cookie_consents_updated_at_idx
  on public.user_cookie_consents (updated_at desc);

drop trigger if exists set_user_cookie_consents_updated_at on public.user_cookie_consents;
create trigger set_user_cookie_consents_updated_at
before update on public.user_cookie_consents
for each row
execute function public.set_updated_at();

create or replace function public.emit_support_board_event(
  p_post_id uuid,
  p_market_type text default 'hot_24h',
  p_event_type text default 'post_support_changed',
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
  v_yes_total bigint;
  v_total_amount bigint;
  v_sample_count integer;
  v_latest_bet_at timestamptz;
  v_yes_rate numeric(5,2);
begin
  if p_post_id is null then
    raise exception 'post_id is required';
  end if;

  if p_market_type not in ('hot_24h', 'get_roasted', 'flamewar', 'trend_up') then
    raise exception 'invalid market_type: %', p_market_type;
  end if;

  select
    coalesce(sum(case when pmb.side = 'yes' then pmb.amount else 0 end), 0)::bigint,
    coalesce(sum(pmb.amount), 0)::bigint,
    count(*)::int,
    max(pmb.created_at)
  into
    v_yes_total,
    v_total_amount,
    v_sample_count,
    v_latest_bet_at
  from public.post_market_bets pmb
  where pmb.post_id = p_post_id
    and pmb.market_type = p_market_type;

  v_yes_rate := case
    when v_total_amount = 0 then 50.00::numeric(5,2)
    else round((v_yes_total::numeric / v_total_amount::numeric) * 100, 2)::numeric(5,2)
  end;

  insert into public.support_board_events (
    post_id,
    market_type,
    event_type,
    yes_rate,
    total_amount_total,
    sample_count_total,
    latest_bet_at,
    metadata
  )
  values (
    p_post_id,
    p_market_type,
    p_event_type,
    v_yes_rate,
    v_total_amount,
    v_sample_count,
    v_latest_bet_at,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into inserted_id;

  return inserted_id;
end;
$$;

create or replace function public.emit_support_board_event_after_bet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.emit_support_board_event(
    new.post_id,
    new.market_type,
    'bet_placed',
    jsonb_build_object('source', 'post_market_bets')
  );

  return new;
end;
$$;

drop trigger if exists emit_support_board_event_after_bet on public.post_market_bets;
create trigger emit_support_board_event_after_bet
after insert on public.post_market_bets
for each row
execute function public.emit_support_board_event_after_bet();

create or replace function public.emit_support_board_event_after_post_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_type text;
begin
  v_event_type := case
    when old.participates_in_support_board is distinct from new.participates_in_support_board
      and new.participates_in_support_board = true then 'post_support_opened'
    when old.participates_in_support_board is distinct from new.participates_in_support_board
      and new.participates_in_support_board = false then 'post_support_closed'
    when old.support_board_deadline_at is distinct from new.support_board_deadline_at then 'post_support_deadline_changed'
    else 'post_support_changed'
  end;

  perform public.emit_support_board_event(
    new.id,
    'hot_24h',
    v_event_type,
    jsonb_build_object(
      'source', 'posts',
      'participates_in_support_board', new.participates_in_support_board,
      'support_board_deadline_at', new.support_board_deadline_at,
      'support_board_result', new.support_board_result
    )
  );

  return new;
end;
$$;

drop trigger if exists emit_support_board_event_after_post_update on public.posts;
create trigger emit_support_board_event_after_post_update
after update of participates_in_support_board, support_board_deadline_at, support_board_result on public.posts
for each row
when (
  old.participates_in_support_board is distinct from new.participates_in_support_board
  or old.support_board_deadline_at is distinct from new.support_board_deadline_at
  or old.support_board_result is distinct from new.support_board_result
)
execute function public.emit_support_board_event_after_post_update();

do $$
begin
  alter publication supabase_realtime add table public.support_board_events;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'post_market_bets'
  ) then
    alter publication supabase_realtime drop table public.post_market_bets;
  end if;
exception
  when undefined_object then null;
end;
$$;

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  run_mode text not null default 'unknown',
  post_id uuid references public.posts (id) on delete set null,
  agent_id uuid references public.agents (id) on delete set null,
  dry_run boolean not null default false,
  status text not null,
  error text,
  model text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint agent_runs_run_mode_valid check (run_mode in ('post', 'autonomous', 'reactive', 'unknown')),
  constraint agent_runs_status_valid check (status in ('success', 'error')),
  constraint agent_runs_error_required check (
    (status = 'success' and error is null)
    or
    (status = 'error' and error is not null)
  )
);

create index if not exists agent_runs_created_at_idx
  on public.agent_runs (created_at desc);

create index if not exists agent_runs_post_id_idx
  on public.agent_runs (post_id);

create index if not exists agent_runs_agent_id_idx
  on public.agent_runs (agent_id);

create index if not exists agent_runs_status_mode_idx
  on public.agent_runs (status, run_mode, created_at desc);

create or replace function public.is_admin(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = user_id
      and role = 'admin'
  );
$$;

create or replace function public.user_owns_agent(target_agent_id uuid, user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.agents
    where id = target_agent_id
      and owner_id = user_id
  );
$$;

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

create or replace function public.publish_post_market_result(
  p_post_id uuid,
  p_result text,
  p_actor_profile_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_post record;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if p_actor_profile_id is not null and p_actor_profile_id <> auth.uid() then
    raise exception 'actor_profile_id must match auth.uid()';
  end if;

  if p_result not in ('yes', 'no', 'refund') then
    raise exception 'invalid support board result: %', p_result;
  end if;

  select
    p.id,
    p.author_kind,
    p.author_profile_id,
    p.author_agent_id,
    p.participates_in_support_board,
    p.support_board_deadline_at,
    p.support_board_result
  into v_post
  from public.posts p
  where p.id = p_post_id
  for update;

  if v_post.id is null then
    raise exception 'post not found';
  end if;

  if not (
    (v_post.author_kind = 'human' and v_post.author_profile_id = auth.uid())
    or
    (v_post.author_kind = 'agent' and public.user_owns_agent(v_post.author_agent_id, auth.uid()))
  ) then
    raise exception 'only post author can publish market result';
  end if;

  if v_post.participates_in_support_board is false then
    raise exception 'post is not participating in support board';
  end if;

  if v_post.support_board_deadline_at is null then
    raise exception 'support board deadline is missing';
  end if;

  if v_now < v_post.support_board_deadline_at then
    raise exception 'market is still live';
  end if;

  if v_post.support_board_result is not null then
    raise exception 'support board result has already been published';
  end if;

  update public.posts
  set support_board_result = p_result
  where id = p_post_id;

  return jsonb_build_object(
    'ok', true,
    'result', p_result,
    'message', case
      when p_result = 'refund' then 'Published result: invalid, refund principal.'
      else format('Published result: %s wins.', upper(p_result))
    end
  );
end;
$$;

create or replace function public.claim_post_market_rewards(
  p_post_id uuid,
  p_market_type text,
  p_actor_profile_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deadline_at timestamptz;
  v_result text;
  v_wallet_id uuid;
  v_balance bigint;
  v_winning_side text;
  v_total_payout bigint := 0;
  v_claimed_count integer := 0;
  v_lost_count integer := 0;
  v_refund_count integer := 0;
  v_has_unsettled boolean := false;
  v_now timestamptz := timezone('utc', now());
  v_payout bigint;
  rec record;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if p_actor_profile_id is not null and p_actor_profile_id <> auth.uid() then
    raise exception 'actor_profile_id must match auth.uid()';
  end if;

  select
    p.support_board_deadline_at,
    p.support_board_result
  into
    v_deadline_at,
    v_result
  from public.posts p
  where p.id = p_post_id
    and p.participates_in_support_board = true;

  if v_deadline_at is null then
    raise exception 'support board deadline is missing';
  end if;

  if v_now < v_deadline_at then
    raise exception 'market is still live';
  end if;

  if v_result is null then
    raise exception 'market result has not been published';
  end if;

  if v_result not in ('yes', 'no', 'refund') then
    raise exception 'invalid support board result: %', v_result;
  end if;

  v_winning_side := case when v_result in ('yes', 'no') then v_result else null end;

  for rec in
    select
      pmb.id,
      pmb.side,
      pmb.amount,
      pmb.odds_snapshot
    from public.post_market_bets pmb
    where pmb.post_id = p_post_id
      and pmb.market_type = p_market_type
      and pmb.profile_id = auth.uid()
      and coalesce(pmb.payout_claimed, false) = false
    order by pmb.created_at asc
  loop
    v_has_unsettled := true;

    if v_result = 'refund' then
      v_payout := rec.amount;
      v_refund_count := v_refund_count + 1;
    elsif rec.side = v_winning_side then
      v_payout := greatest(0, round(rec.amount * coalesce(rec.odds_snapshot, 1))::bigint);
      v_claimed_count := v_claimed_count + 1;
    else
      v_payout := 0;
      v_lost_count := v_lost_count + 1;
    end if;

    v_total_payout := v_total_payout + v_payout;

    update public.post_market_bets
    set
      payout_claimed = true,
      payout_amount = v_payout,
      settled_at = v_now,
      settled_side = v_winning_side
    where id = rec.id;
  end loop;

  if not v_has_unsettled then
    return jsonb_build_object(
      'ok', true,
      'message', 'No unsettled odds positions found.',
      'result', v_result,
      'winning_side', v_winning_side,
      'total_payout', 0,
      'claimed_bet_count', 0,
      'lost_bet_count', 0,
      'refund_count', 0
    );
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

  if v_total_payout > 0 then
    update public.wallets
    set
      balance = balance + v_total_payout,
      lifetime_earned = lifetime_earned + v_total_payout,
      last_rewarded_at = v_now
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
      'credit',
      'prediction_reward',
      'posted',
      v_total_payout,
      v_balance,
      v_balance + v_total_payout,
      p_post_id,
      auth.uid(),
      format('Post market settlement on %s', p_market_type),
      jsonb_build_object(
        'source', 'claim_post_market_rewards',
        'market_type', p_market_type,
        'result', v_result,
        'winning_side', v_winning_side,
        'claimed_bet_count', v_claimed_count,
        'lost_bet_count', v_lost_count,
        'refund_count', v_refund_count
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'message', case
      when v_result = 'refund' and v_total_payout > 0 then format('Refunded %s MOB into wallet.', v_total_payout)
      when v_total_payout > 0 then format('Settled %s MOB into wallet.', v_total_payout)
      else 'No new MOB added in this settlement.'
    end,
    'result', v_result,
    'winning_side', v_winning_side,
    'total_payout', v_total_payout,
    'claimed_bet_count', v_claimed_count,
    'lost_bet_count', v_lost_count,
    'refund_count', v_refund_count
  );
end;
$$;

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

grant execute on function public.get_post_market_series(uuid, text, integer, integer) to anon, authenticated;
grant execute on function public.get_homepage_support_board(text, integer, integer, integer) to anon, authenticated;

create or replace function public.get_project_submission_deadline()
returns table (
  deadline_at timestamptz,
  deadline_local text,
  timezone text,
  label text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    '2026-04-25T16:00:00.000Z'::timestamptz as deadline_at,
    '2026-04-26T00:00:00+08:00'::text as deadline_local,
    'Asia/Shanghai'::text as timezone,
    '2026年4月25日24时'::text as label;
$$;

grant execute on function public.get_project_submission_deadline() to anon, authenticated;

create or replace function public.get_app_feature_flags()
returns table (
  feature_key text,
  enabled boolean,
  label text,
  description text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    aff.feature_key,
    aff.enabled,
    aff.label,
    aff.description,
    aff.updated_at
  from public.app_feature_flags aff
  order by aff.feature_key asc;
$$;

grant execute on function public.get_app_feature_flags() to anon, authenticated;

create or replace function public.extract_agent_handles(text_content text)
returns text[]
language sql
stable
as $$
  select coalesce(array_agg(lower(matches[1])), '{}')
  from regexp_matches(coalesce(text_content, ''), '@([a-z0-9][a-z0-9-]{2,23})', 'gi') as matches;
$$;

create or replace function public.is_agent_auto_reply_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select enabled
    from public.app_feature_flags
    where feature_key = 'agent_auto_reply'
    limit 1
  ), false);
$$;

grant execute on function public.is_agent_auto_reply_enabled() to postgres;

create or replace function public.agent_reply_rate_limit_ok(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.agent_runs
    where post_id = p_post_id
      and run_mode = 'reactive'
      and status = 'success'
      and created_at > timezone('utc', now()) - interval '2 minutes'
    limit 1
  );
$$;

create or replace function public.trigger_agent_reactive_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_edge_function_url text;
  v_runner_secret text;
  v_post_id uuid;
  v_comment_content text;
  v_comment_author text;
  v_mentioned_handles text[];
  v_has_active_agents boolean;
  v_payload jsonb;
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;

  if new.author_kind <> 'human' then
    return new;
  end if;

  if not public.is_agent_auto_reply_enabled() then
    return new;
  end if;

  v_post_id := new.post_id;
  v_comment_content := coalesce(new.content, '');
  v_mentioned_handles := public.extract_agent_handles(v_comment_content);

  if array_length(v_mentioned_handles, 1) is null then
    return new;
  end if;

  if not public.agent_reply_rate_limit_ok(v_post_id) then
    return new;
  end if;

  select exists (
    select 1
    from public.agents
    where lower(handle) = any(v_mentioned_handles)
      and is_active = true
  ) into v_has_active_agents;

  if not v_has_active_agents then
    return new;
  end if;

  v_comment_author := (
    select p.username
    from public.profiles p
    where p.id = new.author_profile_id
    limit 1
  );

  v_edge_function_url := nullif(trim(current_setting('app.settings.edge_function_url', true)), '');
  v_runner_secret := nullif(trim(current_setting('app.settings.agent_runner_secret', true)), '');

  if v_edge_function_url is null and to_regnamespace('vault') is not null then
    select nullif(trim(decrypted_secret), '') || '/functions/v1/agent-auto-comment'
    into v_edge_function_url
    from vault.decrypted_secrets
    where name = 'agent_auto_comment_project_url'
    limit 1;
  end if;

  if v_runner_secret is null and to_regnamespace('vault') is not null then
    select nullif(trim(decrypted_secret), '')
    into v_runner_secret
    from vault.decrypted_secrets
    where name = 'agent_auto_comment_runner_secret'
    limit 1;
  end if;

  if v_edge_function_url is null or v_runner_secret is null then
    return new;
  end if;

  v_payload := jsonb_build_object(
    'mode', 'reactive',
    'post_id', v_post_id,
    'max_comments', least(array_length(v_mentioned_handles, 1), 3),
    'dry_run', false,
    'allow_repeat', false,
    'trigger_comment_content', v_comment_content,
    'trigger_comment_author', coalesce(v_comment_author, 'Anonymous')
  );

  if array_length(v_mentioned_handles, 1) = 1 then
    v_payload := jsonb_set(v_payload, '{agent_handle}', to_jsonb(v_mentioned_handles[1]));
  end if;

  perform net.http_post(
    url := v_edge_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-agent-runner-secret', v_runner_secret
    ),
    body := v_payload,
    timeout_milliseconds := 30000
  );

  return new;
end;
$$;

create or replace function public.get_agent_dashboard(
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  total_runs bigint,
  success_runs bigint,
  error_runs bigint,
  runs_today bigint,
  active_agents bigint,
  recent_run_id uuid,
  recent_run_mode text,
  recent_status text,
  recent_model text,
  recent_post_id uuid,
  recent_error text,
  recent_created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with stats as (
    select
      count(*) as total,
      count(*) filter (where status = 'success') as success_count,
      count(*) filter (where status = 'error') as error_count,
      count(*) filter (where created_at > timezone('utc', now()) - interval '24 hours') as today_count
    from public.agent_runs
  ),
  agent_stats as (
    select count(*) as active_count
    from public.agents
    where is_active = true
  )
  select
    s.total,
    s.success_count,
    s.error_count,
    s.today_count,
    a.active_count,
    r.id,
    r.run_mode,
    r.status,
    r.model,
    r.post_id,
    r.error,
    r.created_at
  from stats s
  cross join agent_stats a
  left join lateral (
    select *
    from public.agent_runs
    order by created_at desc
    limit p_limit
    offset p_offset
  ) r on true
  where public.is_admin(auth.uid())
  order by r.created_at desc nulls last;
$$;

grant execute on function public.get_agent_dashboard(int, int) to authenticated;

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

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role
before update on public.profiles
for each row
execute function public.prevent_profile_role_change();

drop trigger if exists set_agents_updated_at on public.agents;
create trigger set_agents_updated_at
before update on public.agents
for each row
execute function public.set_updated_at();

drop trigger if exists set_posts_updated_at on public.posts;
create trigger set_posts_updated_at
before update on public.posts
for each row
execute function public.set_updated_at();

drop trigger if exists normalize_post_image_fields on public.posts;
create trigger normalize_post_image_fields
before insert or update of image_url on public.posts
for each row
execute function public.normalize_post_image_fields();

drop trigger if exists validate_support_board_deadline on public.posts;
create trigger validate_support_board_deadline
before insert or update on public.posts
for each row
execute function public.validate_support_board_post_deadline();

drop trigger if exists set_comments_updated_at on public.comments;
create trigger set_comments_updated_at
before update on public.comments
for each row
execute function public.set_updated_at();

drop trigger if exists on_comment_insert_trigger_agent_reply on public.comments;
create trigger on_comment_insert_trigger_agent_reply
after insert on public.comments
for each row
execute function public.trigger_agent_reactive_reply();

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

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
      'user_' || left(new.id::text, 8)
    )
  );

  return new;
exception
  when unique_violation then
    insert into public.profiles (id, username)
    values (new.id, 'user_' || left(new.id::text, 12));
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

drop view if exists public.weekly_chaos_rankings;
drop view if exists public.active_actor_rankings;
drop view if exists public.non_support_hot_posts_rankings;
drop view if exists public.hot_posts_rankings;
drop view if exists public.homepage_odds_rankings;
drop view if exists public.post_prediction_cards;
drop view if exists public.feed_comments;
drop view if exists public.feed_posts;
create view public.feed_posts
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
  p.support_board_result,
  p.support_board_result_at,
  p.support_board_result_by,
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
  coalesce(ss.share_count, 0) as share_count
from public.posts p
left join public.profiles h on h.id = p.author_profile_id
left join public.agents a on a.id = p.author_agent_id
left join like_stats ls on ls.post_id = p.id
left join comment_stats cs on cs.post_id = p.id
left join share_stats ss on ss.post_id = p.id
left join prediction_stats ps on ps.post_id = p.id;

create or replace function public.search_forum_content(
  p_query text,
  p_limit int default 8
)
returns table (
  result_type text,
  entity_id uuid,
  title text,
  subtitle text,
  snippet text,
  route text,
  route_context text,
  rank_score numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select
      nullif(trim(p_query), '') as q,
      greatest(1, least(coalesce(p_limit, 8), 20)) as lim
  ),
  post_matches as (
    select
      'post'::text as result_type,
      fp.id as entity_id,
      fp.title as title,
      concat_ws(' · ', fp.author_name, coalesce(fp.category, '帖子')) as subtitle,
      left(regexp_replace(coalesce(fp.content, ''), '\s+', ' ', 'g'), 180) as snippet,
      'detail'::text as route,
      fp.id::text as route_context,
      (
        case
          when lower(fp.title) = lower(params.q) then 140
          when lower(fp.title) like lower(params.q) || '%' then 110
          when lower(fp.title) like '%' || lower(params.q) || '%' then 90
          else 0
        end
        + case
          when lower(fp.author_name) like '%' || lower(params.q) || '%' then 40
          else 0
        end
        + case
          when lower(coalesce(fp.category, '')) like '%' || lower(params.q) || '%' then 24
          else 0
        end
        + case
          when lower(fp.content) like '%' || lower(params.q) || '%' then 16
          else 0
        end
      )::numeric as rank_score
    from public.feed_posts fp
    cross join params
    where params.q is not null
      and (
        fp.title ilike '%' || params.q || '%'
        or fp.content ilike '%' || params.q || '%'
        or coalesce(fp.category, '') ilike '%' || params.q || '%'
        or coalesce(fp.author_name, '') ilike '%' || params.q || '%'
      )
  ),
  profile_matches as (
    select
      'profile'::text as result_type,
      p.id as entity_id,
      p.username as title,
      '用户'::text as subtitle,
      left(regexp_replace(coalesce(p.bio, '点击查看该用户发布的相关帖子'), '\s+', ' ', 'g'), 180) as snippet,
      'home'::text as route,
      p.username as route_context,
      (
        case
          when lower(p.username) = lower(params.q) then 130
          when lower(p.username) like lower(params.q) || '%' then 100
          when lower(p.username) like '%' || lower(params.q) || '%' then 82
          else 0
        end
        + case
          when lower(coalesce(p.bio, '')) like '%' || lower(params.q) || '%' then 18
          else 0
        end
      )::numeric as rank_score
    from public.profiles p
    cross join params
    where params.q is not null
      and (
        p.username ilike '%' || params.q || '%'
        or coalesce(p.bio, '') ilike '%' || params.q || '%'
      )
  ),
  agent_matches as (
    select
      'agent'::text as result_type,
      a.id as entity_id,
      a.display_name as title,
      coalesce(a.badge, 'AI Agent') as subtitle,
      left(regexp_replace(coalesce(a.bio, a.disclosure, 'Open this AI Agent profile to view related posts.'), '\s+', ' ', 'g'), 180) as snippet,
      'home'::text as route,
      a.display_name as route_context,
      (
        case
          when lower(a.display_name) = lower(params.q) then 130
          when lower(a.display_name) like lower(params.q) || '%' then 100
          when lower(a.display_name) like '%' || lower(params.q) || '%' then 84
          else 0
        end
        + case
          when lower(a.handle) like '%' || lower(params.q) || '%' then 42
          else 0
        end
        + case
          when lower(coalesce(a.bio, '')) like '%' || lower(params.q) || '%' then 18
          else 0
        end
      )::numeric as rank_score
    from public.agents a
    cross join params
    where params.q is not null
      and (
        a.display_name ilike '%' || params.q || '%'
        or a.handle ilike '%' || params.q || '%'
        or coalesce(a.bio, '') ilike '%' || params.q || '%'
        or coalesce(a.disclosure, '') ilike '%' || params.q || '%'
      )
  ),
  merged as (
    select * from post_matches
    union all
    select * from profile_matches
    union all
    select * from agent_matches
  )
  select
    merged.result_type,
    merged.entity_id,
    merged.title,
    merged.subtitle,
    merged.snippet,
    merged.route,
    merged.route_context,
    merged.rank_score
  from merged
  where merged.rank_score > 0
  order by
    merged.rank_score desc,
    merged.result_type asc,
    merged.title asc
  limit (select lim from params);
$$;

create view public.feed_comments
with (security_invoker = true)
as
select
  c.id,
  c.post_id,
  c.content,
  c.created_at,
  c.updated_at,
  c.author_kind,
  c.author_profile_id,
  c.author_agent_id,
  coalesce(h.username, a.display_name) as author_name,
  case when c.author_kind = 'human' then h.avatar_url else a.avatar_url end as author_avatar_url,
  case when c.author_kind = 'agent' then a.badge else null end as author_badge,
  case when c.author_kind = 'agent' then a.disclosure else null end as author_disclosure,
  (c.author_kind = 'agent') as is_ai_agent
from public.comments c
left join public.profiles h on h.id = c.author_profile_id
left join public.agents a on a.id = c.author_agent_id;

create view public.post_prediction_cards
with (security_invoker = true)
as
select
  pp.id,
  pp.post_id,
  fp.title as post_title,
  fp.category as post_category,
  fp.participates_in_support_board,
  fp.support_board_deadline_at,
  fp.deadline_at,
  fp.created_at as post_created_at,
  fp.author_name as post_author_name,
  fp.author_badge as post_author_badge,
  fp.author_disclosure as post_author_disclosure,
  fp.is_ai_agent as post_author_is_ai_agent,
  pp.prediction_type,
  case pp.prediction_type
    when 'hot_24h' then 'Hot Probability'
    when 'get_roasted' then 'Roast Risk'
    when 'flamewar' then 'Flame-War Chance'
    when 'trend_up' then 'Trend Odds'
    else 'Community Prediction'
  end as prediction_label,
  pp.headline,
  pp.probability,
  pp.odds_value,
  pp.rationale,
  pp.status,
  pp.resolves_at,
  pp.created_at,
  pp.predictor_kind,
  pp.predictor_agent_id,
  a.handle as predictor_handle,
  coalesce(a.display_name, 'Arena Pulse') as predictor_name,
  a.avatar_url as predictor_avatar_url,
  case
    when pp.predictor_kind = 'agent' then a.badge
    else 'System Forecast'
  end as predictor_badge,
  case
    when pp.predictor_kind = 'agent' then a.disclosure
    else 'System-generated entertainment forecast.'
  end as predictor_disclosure,
  (pp.predictor_kind = 'agent') as is_ai_agent
from public.post_predictions pp
left join public.feed_posts fp on fp.id = pp.post_id
left join public.agents a on a.id = pp.predictor_agent_id;

create view public.homepage_odds_rankings
with (security_invoker = true)
as
with ranked_cards as (
  select
    ppc.*,
    row_number() over (
      partition by ppc.post_id
      order by ppc.probability desc, ppc.odds_value asc, ppc.created_at desc
    ) as post_prediction_rank,
    round((
      ppc.probability * 0.7
      + greatest(0::numeric, 4.0 - least(ppc.odds_value, 4.0)) * 12
      + greatest(
          0::numeric,
          24.0 - extract(epoch from (timezone('utc', now()) - ppc.created_at)) / 3600.0
        ) * 0.4
    )::numeric, 2) as odds_rank_score
  from public.post_prediction_cards ppc
  where ppc.status = 'open'
)
select
  id,
  post_id,
  post_title,
  post_category,
  post_created_at,
  post_author_name,
  post_author_badge,
  post_author_disclosure,
  post_author_is_ai_agent,
  prediction_type,
  prediction_label,
  headline,
  probability,
  odds_value,
  rationale,
  status,
  resolves_at,
  created_at,
  predictor_kind,
  predictor_agent_id,
  predictor_handle,
  predictor_name,
  predictor_avatar_url,
  predictor_badge,
  predictor_disclosure,
  is_ai_agent,
  odds_rank_score,
  rank() over (
    order by odds_rank_score desc, probability desc, odds_value asc, post_created_at desc
  ) as rank_position
from ranked_cards
where post_prediction_rank = 1;

create view public.hot_posts_rankings
with (security_invoker = true)
as
with scored as (
  select
    fp.*,
    round((fp.like_count + fp.comment_count * 2 + fp.hot_probability / 20.0)::numeric, 2) as hot_score
  from public.feed_posts fp
)
select
  id as post_id,
  title,
  author_kind,
  author_profile_id,
  author_agent_id,
  author_name,
  author_avatar_url,
  author_badge,
  author_disclosure,
  is_ai_agent,
  like_count,
  comment_count,
  hot_probability,
  hot_odds,
  hot_score,
  created_at,
  rank() over (order by hot_score desc, created_at desc) as rank_position
from scored;

create view public.non_support_hot_posts_rankings
with (security_invoker = true)
as
with scored as (
  select
    fp.*,
    round((fp.like_count + fp.comment_count * 2)::numeric, 2) as pure_hot_score
  from public.feed_posts fp
  where fp.participates_in_support_board = false
)
select
  id as post_id,
  title,
  author_kind,
  author_profile_id,
  author_agent_id,
  author_name,
  author_avatar_url,
  author_badge,
  author_disclosure,
  is_ai_agent,
  like_count,
  comment_count,
  pure_hot_score,
  created_at,
  rank() over (order by pure_hot_score desc, created_at desc) as rank_position
from scored;

create view public.active_actor_rankings
with (security_invoker = true)
as
with activity as (
  select
    'human'::text as actor_kind,
    author_profile_id as profile_id,
    null::uuid as agent_id,
    count(*)::int as post_count,
    0::int as comment_count,
    0::int as prediction_count
  from public.posts
  where author_kind = 'human'
    and created_at >= timezone('utc', now()) - interval '7 days'
  group by author_profile_id

  union all

  select
    'agent'::text as actor_kind,
    null::uuid as profile_id,
    author_agent_id as agent_id,
    count(*)::int as post_count,
    0::int as comment_count,
    0::int as prediction_count
  from public.posts
  where author_kind = 'agent'
    and created_at >= timezone('utc', now()) - interval '7 days'
  group by author_agent_id

  union all

  select
    'human'::text as actor_kind,
    author_profile_id as profile_id,
    null::uuid as agent_id,
    0::int as post_count,
    count(*)::int as comment_count,
    0::int as prediction_count
  from public.comments
  where author_kind = 'human'
    and created_at >= timezone('utc', now()) - interval '7 days'
  group by author_profile_id

  union all

  select
    'agent'::text as actor_kind,
    null::uuid as profile_id,
    author_agent_id as agent_id,
    0::int as post_count,
    count(*)::int as comment_count,
    0::int as prediction_count
  from public.comments
  where author_kind = 'agent'
    and created_at >= timezone('utc', now()) - interval '7 days'
  group by author_agent_id

  union all

  select
    'agent'::text as actor_kind,
    null::uuid as profile_id,
    predictor_agent_id as agent_id,
    0::int as post_count,
    0::int as comment_count,
    count(*)::int as prediction_count
  from public.post_predictions
  where predictor_kind = 'agent'
    and created_at >= timezone('utc', now()) - interval '7 days'
  group by predictor_agent_id
),
aggregated as (
  select
    actor_kind,
    profile_id,
    agent_id,
    sum(post_count)::int as post_count,
    sum(comment_count)::int as comment_count,
    sum(prediction_count)::int as prediction_count
  from activity
  group by actor_kind, profile_id, agent_id
),
scored as (
  select
    a.actor_kind,
    case when a.actor_kind = 'human' then a.profile_id else a.agent_id end as actor_id,
    a.profile_id,
    a.agent_id,
    case when a.actor_kind = 'human' then p.username else g.handle end as actor_handle,
    coalesce(p.username, g.display_name) as actor_name,
    case when a.actor_kind = 'human' then p.avatar_url else g.avatar_url end as actor_avatar_url,
    case when a.actor_kind = 'agent' then g.badge else null end as actor_badge,
    case when a.actor_kind = 'agent' then g.disclosure else null end as actor_disclosure,
    (a.actor_kind = 'agent') as is_ai_agent,
    a.post_count,
    a.comment_count,
    a.prediction_count,
    round((a.post_count * 3 + a.comment_count + a.prediction_count * 2)::numeric, 2) as activity_score
  from aggregated a
  left join public.profiles p on p.id = a.profile_id
  left join public.agents g on g.id = a.agent_id
)
select
  actor_kind,
  actor_id,
  profile_id,
  agent_id,
  actor_handle,
  actor_name,
  actor_avatar_url,
  actor_badge,
  actor_disclosure,
  is_ai_agent,
  post_count,
  comment_count,
  prediction_count,
  activity_score,
  rank() over (order by activity_score desc, actor_name asc) as rank_position
from scored;

create view public.weekly_chaos_rankings
with (security_invoker = true)
as
with recent_comment_stats as (
  select
    post_id,
    count(*)::int as recent_comment_count,
    count(*) filter (where author_kind = 'agent')::int as recent_agent_comment_count
  from public.comments
  where created_at >= timezone('utc', now()) - interval '7 days'
  group by post_id
),
recent_prediction_stats as (
  select
    post_id,
    max(probability) filter (where prediction_type = 'flamewar' and status = 'open') as flamewar_probability
  from public.post_predictions
  where created_at >= timezone('utc', now()) - interval '7 days'
  group by post_id
),
scored as (
  select
    fp.id as post_id,
    fp.title,
    fp.author_kind,
    fp.author_profile_id,
    fp.author_agent_id,
    fp.author_name,
    fp.author_avatar_url,
    fp.author_badge,
    fp.author_disclosure,
    fp.is_ai_agent,
    coalesce(rcs.recent_comment_count, 0) as recent_comment_count,
    coalesce(rcs.recent_agent_comment_count, 0) as recent_agent_comment_count,
    coalesce(rps.flamewar_probability, fp.flamewar_probability, 0) as flamewar_probability,
    round((
      coalesce(rcs.recent_comment_count, 0) * 2
      + coalesce(rcs.recent_agent_comment_count, 0) * 3
      + coalesce(rps.flamewar_probability, fp.flamewar_probability, 0) / 10.0
    )::numeric, 2) as chaos_score,
    fp.created_at
  from public.feed_posts fp
  left join recent_comment_stats rcs on rcs.post_id = fp.id
  left join recent_prediction_stats rps on rps.post_id = fp.id
  where fp.created_at >= timezone('utc', now()) - interval '7 days'
)
select
  post_id,
  title,
  author_kind,
  author_profile_id,
  author_agent_id,
  author_name,
  author_avatar_url,
  author_badge,
  author_disclosure,
  is_ai_agent,
  recent_comment_count,
  recent_agent_comment_count,
  flamewar_probability,
  chaos_score,
  created_at,
  rank() over (order by chaos_score desc, created_at desc) as rank_position
from scored;

alter table public.profiles enable row level security;
alter table public.agents enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.likes enable row level security;
alter table public.post_shares enable row level security;
alter table public.post_predictions enable row level security;
alter table public.wallets enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.reward_cycles enable row level security;
alter table public.post_market_bets enable row level security;
alter table public.support_board_events enable row level security;
alter table public.app_feature_flags enable row level security;
alter table public.user_cookie_consents enable row level security;
alter table public.agent_runs enable row level security;

drop policy if exists "Profiles are viewable by everyone" on public.profiles;
create policy "Profiles are viewable by everyone"
on public.profiles
for select
using (true);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id or public.is_admin(auth.uid()))
with check (auth.uid() = id or public.is_admin(auth.uid()));

drop policy if exists "Agents are viewable by everyone" on public.agents;
create policy "Agents are viewable by everyone"
on public.agents
for select
using (true);

drop policy if exists "Users can create their own participant agents" on public.agents;
create policy "Users can create their own participant agents"
on public.agents
for insert
to authenticated
with check (
  owner_id = auth.uid()
  and kind = 'participant'
);

drop policy if exists "Owners can update their own agents" on public.agents;
create policy "Owners can update their own agents"
on public.agents
for update
to authenticated
using (owner_id = auth.uid() or public.is_admin(auth.uid()))
with check (owner_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "Owners can delete their own agents" on public.agents;
create policy "Owners can delete their own agents"
on public.agents
for delete
to authenticated
using (owner_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "Posts are viewable by everyone" on public.posts;
create policy "Posts are viewable by everyone"
on public.posts
for select
using (true);

drop policy if exists "Authenticated users can create posts" on public.posts;
create policy "Authenticated users can create posts"
on public.posts
for insert
to authenticated
with check (
  (author_kind = 'human' and author_profile_id = auth.uid())
  or
  (author_kind = 'agent' and public.user_owns_agent(author_agent_id, auth.uid()))
);

drop policy if exists "Authors can update their own posts" on public.posts;
create policy "Authors can update their own posts"
on public.posts
for update
to authenticated
using (
  (author_kind = 'human' and author_profile_id = auth.uid())
  or
  (author_kind = 'agent' and public.user_owns_agent(author_agent_id, auth.uid()))
  or
  public.is_admin(auth.uid())
)
with check (
  (author_kind = 'human' and author_profile_id = auth.uid())
  or
  (author_kind = 'agent' and public.user_owns_agent(author_agent_id, auth.uid()))
  or
  public.is_admin(auth.uid())
);

drop policy if exists "Authors can delete their own posts" on public.posts;
create policy "Authors can delete their own posts"
on public.posts
for delete
to authenticated
using (
  (author_kind = 'human' and author_profile_id = auth.uid())
  or
  (author_kind = 'agent' and public.user_owns_agent(author_agent_id, auth.uid()))
  or
  public.is_admin(auth.uid())
);

drop policy if exists "Comments are viewable by everyone" on public.comments;
create policy "Comments are viewable by everyone"
on public.comments
for select
using (true);

drop policy if exists "Authenticated users can create comments" on public.comments;
create policy "Authenticated users can create comments"
on public.comments
for insert
to authenticated
with check (
  (author_kind = 'human' and author_profile_id = auth.uid())
  or
  (author_kind = 'agent' and public.user_owns_agent(author_agent_id, auth.uid()))
);

drop policy if exists "Authors can update their own comments" on public.comments;
create policy "Authors can update their own comments"
on public.comments
for update
to authenticated
using (
  (author_kind = 'human' and author_profile_id = auth.uid())
  or
  (author_kind = 'agent' and public.user_owns_agent(author_agent_id, auth.uid()))
  or
  public.is_admin(auth.uid())
)
with check (
  (author_kind = 'human' and author_profile_id = auth.uid())
  or
  (author_kind = 'agent' and public.user_owns_agent(author_agent_id, auth.uid()))
  or
  public.is_admin(auth.uid())
);

drop policy if exists "Authors can delete their own comments" on public.comments;
create policy "Authors can delete their own comments"
on public.comments
for delete
to authenticated
using (
  (author_kind = 'human' and author_profile_id = auth.uid())
  or
  (author_kind = 'agent' and public.user_owns_agent(author_agent_id, auth.uid()))
  or
  public.is_admin(auth.uid())
);

drop policy if exists "Likes are viewable by everyone" on public.likes;
create policy "Likes are viewable by everyone"
on public.likes
for select
using (true);

drop policy if exists "Authenticated users can create likes" on public.likes;
create policy "Authenticated users can create likes"
on public.likes
for insert
to authenticated
with check (
  (actor_kind = 'human' and actor_profile_id = auth.uid())
  or
  (actor_kind = 'agent' and public.user_owns_agent(actor_agent_id, auth.uid()))
);

drop policy if exists "Actors can delete their own likes" on public.likes;
create policy "Actors can delete their own likes"
on public.likes
for delete
to authenticated
using (
  (actor_kind = 'human' and actor_profile_id = auth.uid())
  or
  (actor_kind = 'agent' and public.user_owns_agent(actor_agent_id, auth.uid()))
  or
  public.is_admin(auth.uid())
);

drop policy if exists "Post shares are viewable by everyone" on public.post_shares;
create policy "Post shares are viewable by everyone"
on public.post_shares
for select
using (true);

drop policy if exists "Authenticated users can record post shares" on public.post_shares;
create policy "Authenticated users can record post shares"
on public.post_shares
for insert
to authenticated
with check (
  actor_profile_id = auth.uid()
);

drop policy if exists "Predictions are viewable by everyone" on public.post_predictions;
create policy "Predictions are viewable by everyone"
on public.post_predictions
for select
using (true);

drop policy if exists "Owners can create predictions for their own agents" on public.post_predictions;
create policy "Owners can create predictions for their own agents"
on public.post_predictions
for insert
to authenticated
with check (
  predictor_kind = 'agent'
  and public.user_owns_agent(predictor_agent_id, auth.uid())
);

drop policy if exists "Owners can update predictions for their own agents" on public.post_predictions;
create policy "Owners can update predictions for their own agents"
on public.post_predictions
for update
to authenticated
using (
  (predictor_kind = 'agent' and public.user_owns_agent(predictor_agent_id, auth.uid()))
  or
  public.is_admin(auth.uid())
)
with check (
  (predictor_kind = 'agent' and public.user_owns_agent(predictor_agent_id, auth.uid()))
  or
  public.is_admin(auth.uid())
);

drop policy if exists "Owners can delete predictions for their own agents" on public.post_predictions;
create policy "Owners can delete predictions for their own agents"
on public.post_predictions
for delete
to authenticated
using (
  (predictor_kind = 'agent' and public.user_owns_agent(predictor_agent_id, auth.uid()))
  or
  public.is_admin(auth.uid())
);

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

drop policy if exists "Owners can view their own post market bets" on public.post_market_bets;
create policy "Owners can view their own post market bets"
on public.post_market_bets
for select
to authenticated
using (
  profile_id = auth.uid()
  or public.is_admin(auth.uid())
);

drop policy if exists "Authenticated users can create their own post market bets" on public.post_market_bets;
drop policy if exists "Post market bets are inserted through place_post_bet" on public.post_market_bets;
create policy "Post market bets are inserted through place_post_bet"
on public.post_market_bets
for insert
to authenticated
with check (false);

drop policy if exists "Support board events are viewable by everyone" on public.support_board_events;
create policy "Support board events are viewable by everyone"
on public.support_board_events
for select
using (true);

drop policy if exists "Support board events are backend inserted" on public.support_board_events;
create policy "Support board events are backend inserted"
on public.support_board_events
for insert
with check (false);

drop policy if exists "App feature flags are viewable by everyone" on public.app_feature_flags;
create policy "App feature flags are viewable by everyone"
on public.app_feature_flags
for select
using (true);

drop policy if exists "Admins can manage app feature flags" on public.app_feature_flags;
create policy "Admins can manage app feature flags"
on public.app_feature_flags
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "Admins can view agent runs" on public.agent_runs;
create policy "Admins can view agent runs"
on public.agent_runs
for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "Users can view their own cookie consent" on public.user_cookie_consents;
create policy "Users can view their own cookie consent"
on public.user_cookie_consents
for select
to authenticated
using (
  profile_id = auth.uid()
  or public.is_admin(auth.uid())
);

drop policy if exists "Users can upsert their own cookie consent" on public.user_cookie_consents;
create policy "Users can upsert their own cookie consent"
on public.user_cookie_consents
for insert
to authenticated
with check (
  profile_id = auth.uid()
);

drop policy if exists "Users can update their own cookie consent" on public.user_cookie_consents;
create policy "Users can update their own cookie consent"
on public.user_cookie_consents
for update
to authenticated
using (
  profile_id = auth.uid()
)
with check (
  profile_id = auth.uid()
);

grant select, insert, update on public.user_cookie_consents to authenticated;

drop policy if exists "Owners can delete their own post market bets" on public.post_market_bets;
drop policy if exists "Admins can delete post market bets" on public.post_market_bets;
create policy "Admins can delete post market bets"
on public.post_market_bets
for delete
to authenticated
using (public.is_admin(auth.uid()));

insert into storage.buckets (id, name, public)
values ('arena-assets', 'arena-assets', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "Arena assets are viewable by everyone" on storage.objects;
create policy "Arena assets are viewable by everyone"
on storage.objects
for select
using (bucket_id = 'arena-assets');

drop policy if exists "Authenticated users can upload their own arena assets" on storage.objects;
create policy "Authenticated users can upload their own arena assets"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'arena-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update their own arena assets" on storage.objects;
create policy "Users can update their own arena assets"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'arena-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'arena-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete their own arena assets" on storage.objects;
create policy "Users can delete their own arena assets"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'arena-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);
