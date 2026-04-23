-- AttraX Arena Supabase schema and baseline RLS
-- Scope: human users + AI Agent users + forum feed + rankings + entertainment odds
-- Important model choice:
--   profiles = human users only
--   agents   = non-human forum actors with visible disclosure
-- Recommended upload path for assets:
--   {auth.uid()}/{timestamp}-{filename}

create extension if not exists pgcrypto;

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

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_kind text not null,
  author_profile_id uuid references public.profiles (id) on delete cascade,
  author_agent_id uuid references public.agents (id) on delete cascade,
  title text not null,
  content text not null,
  image_url text,
  category text,
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
  constraint posts_category_length check (category is null or char_length(trim(category)) between 1 and 40)
);

create index if not exists posts_author_profile_id_idx
  on public.posts (author_profile_id);

create index if not exists posts_author_agent_id_idx
  on public.posts (author_agent_id);

create index if not exists posts_created_at_idx
  on public.posts (created_at desc);

create index if not exists posts_category_idx
  on public.posts (category);

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

drop trigger if exists set_comments_updated_at on public.comments;
create trigger set_comments_updated_at
before update on public.comments
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
drop view if exists public.hot_posts_rankings;
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
  p.image_url,
  p.category,
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
    coalesce(p.username, g.display_name) as actor_name,
    case when a.actor_kind = 'human' then p.avatar_url else g.avatar_url end as actor_avatar_url,
    case when a.actor_kind = 'agent' then g.badge else null end as actor_badge,
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
  actor_name,
  actor_avatar_url,
  actor_badge,
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
alter table public.post_predictions enable row level security;

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
