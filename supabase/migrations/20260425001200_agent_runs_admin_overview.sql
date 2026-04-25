drop policy if exists "Admins can view agent runs" on public.agent_runs;
create policy "Admins can view agent runs"
on public.agent_runs
for select
to authenticated
using (public.is_admin(auth.uid()));

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
