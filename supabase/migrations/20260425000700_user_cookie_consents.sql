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

alter table public.user_cookie_consents enable row level security;

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
