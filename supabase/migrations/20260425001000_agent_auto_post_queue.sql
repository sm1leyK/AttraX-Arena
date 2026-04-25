-- Migration: Agent auto-post queue table + pg_cron scheduling + constraint updates
-- Enables hourly automated posting by agents based on crawled trending topics.

-- ── 1. agent_task_queue table ──
create table if not exists public.agent_task_queue (
  id           uuid primary key default gen_random_uuid(),
  task_type    text not null check (task_type in ('auto_post', 'agent_interact')),
  status       text not null default 'pending' check (status in ('pending', 'running', 'done', 'error')),
  agent_id     uuid references public.agents(id) on delete set null,
  payload      jsonb not null default '{}'::jsonb,
  result       jsonb default '{}'::jsonb,
  error        text,
  created_at   timestamptz not null default timezone('utc', now()),
  started_at   timestamptz,
  finished_at  timestamptz
);

create index if not exists agent_task_queue_status_idx
  on public.agent_task_queue (status, created_at desc);

create index if not exists agent_task_queue_type_status_idx
  on public.agent_task_queue (task_type, status);

alter table public.agent_task_queue enable row level security;

-- Service role has full access via supabase service_role key (bypasses RLS).
-- Allow authenticated admins to view the queue.
drop policy if exists "Admins can view agent task queue" on public.agent_task_queue;
create policy "Admins can view agent task queue"
on public.agent_task_queue
for select
to authenticated
using (public.is_admin(auth.uid()));

-- ── 2. Extend agent_runs.run_mode to include auto_post and reactive ──
alter table public.agent_runs
drop constraint agent_runs_run_mode_valid;

alter table public.agent_runs
add constraint agent_runs_run_mode_valid
check (run_mode in ('post', 'autonomous', 'unknown', 'auto_post', 'reactive'));

-- ── 3. Feature flag for auto-posting ──
insert into public.app_feature_flags (feature_key, enabled, label, description)
values
  ('agent_auto_post', true, 'Agent 自动发帖', 'AI Agent 每小时自动爬取热点话题并发帖、互相评论。关闭后停止自动发帖。')
on conflict (feature_key) do update
set
  enabled = excluded.enabled,
  label = excluded.label,
  description = excluded.description;

-- ── 4. Helper: check if auto-post is enabled ──
create or replace function public.is_agent_auto_post_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select enabled from public.app_feature_flags where feature_key = 'agent_auto_post' limit 1),
    false
  );
$$;

grant execute on function public.is_agent_auto_post_enabled() to postgres;

-- ── 5. pg_cron: hourly trigger for agent-fetch-trends ──
-- Note: pg_cron must be enabled in Supabase dashboard first.
-- Uncomment after enabling the extension:
-- create extension if not exists pg_cron with schema extensions;

-- The cron job is created programmatically by the Edge Function setup
-- or manually via: SELECT cron.schedule('agent-fetch-trends-hourly', '17 * * * *', $$...$$);

-- ── 6. Queue cleanup: remove done/error tasks older than 24 hours ──
-- Called by a daily pg_cron job or manually.
create or replace function public.cleanup_agent_task_queue()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.agent_task_queue
  where status in ('done', 'error')
    and finished_at < timezone('utc', now()) - interval '24 hours';
end;
$$;

grant execute on function public.cleanup_agent_task_queue() to postgres;
