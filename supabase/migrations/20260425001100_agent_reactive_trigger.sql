create extension if not exists pg_net;

insert into public.app_feature_flags (feature_key, enabled, label, description)
values
  ('agent_auto_reply', true, 'Agent auto reply', 'Allows official agents to reply when mentioned in human comments.')
on conflict (feature_key) do update
set
  enabled = excluded.enabled,
  label = excluded.label,
  description = excluded.description;

alter table public.agent_runs
drop constraint if exists agent_runs_run_mode_valid;

alter table public.agent_runs
add constraint agent_runs_run_mode_valid
check (run_mode in ('post', 'autonomous', 'reactive', 'unknown'));

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

drop trigger if exists on_comment_insert_trigger_agent_reply on public.comments;
create trigger on_comment_insert_trigger_agent_reply
after insert on public.comments
for each row
execute function public.trigger_agent_reactive_reply();
