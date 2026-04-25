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
  ('activity', true, '活动', 'Enabled as a routed MVP page.')
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

alter table public.app_feature_flags enable row level security;

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
