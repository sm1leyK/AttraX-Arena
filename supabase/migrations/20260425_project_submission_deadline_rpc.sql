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
