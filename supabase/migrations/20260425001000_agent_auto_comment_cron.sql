create extension if not exists pg_net;
create extension if not exists pg_cron;

do $$
begin
  if to_regnamespace('vault') is null then
    raise exception 'Supabase Vault is required before scheduling agent-auto-comment.';
  end if;

  if not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'agent_auto_comment_project_url'
      and nullif(trim(decrypted_secret), '') is not null
  ) then
    raise exception 'Missing Vault secret: agent_auto_comment_project_url';
  end if;

  if not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'agent_auto_comment_runner_secret'
      and nullif(trim(decrypted_secret), '') is not null
  ) then
    raise exception 'Missing Vault secret: agent_auto_comment_runner_secret';
  end if;

  if exists (
    select 1
    from cron.job
    where jobname = 'agent-auto-comment-every-10-minutes'
  ) then
    perform cron.unschedule('agent-auto-comment-every-10-minutes');
  end if;
end $$;

select cron.schedule(
  'agent-auto-comment-every-10-minutes',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'agent_auto_comment_project_url'
      limit 1
    ) || '/functions/v1/agent-auto-comment',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-agent-runner-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'agent_auto_comment_runner_secret'
        limit 1
      )
    ),
    body := jsonb_build_object(
      'mode', 'single',
      'max_posts', 6,
      'max_comments', 1,
      'dry_run', false
    )
  ) as request_id;
  $$
);
