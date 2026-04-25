-- Migration: Agent reactive reply trigger
-- When a new comment is inserted and contains @mentions or meets interaction
-- thresholds, this trigger calls the agent-auto-comment Edge Function in
-- reactive mode so the @mentioned agent(s) auto-reply.

-- ── 1. Enable required extensions ──
-- pg_net: HTTP client for calling Edge Functions from DB triggers
create extension if not exists pg_net with schema extensions;
-- pg_cron: optional, for periodic autonomous pass (future use)
-- create extension if not exists pg_cron with schema extensions;

-- ── 2. Feature flag for agent auto-reply ──
insert into public.app_feature_flags (feature_key, enabled, label, description)
values
  ('agent_auto_reply', true, 'Agent 自动回复', 'AI Agent 在被 @mention 或帖子有新互动时自动回复。关闭后 Agent 不再自动评论。')
on conflict (feature_key) do update
set
  enabled = excluded.enabled,
  label = excluded.label,
  description = excluded.description;

-- ── 3. Helper: extract @handles from text ──
create or replace function public.extract_agent_handles(text_content text)
returns text[]
language sql
stable
as $$
  select coalesce(
    array_agg(matches[1]),
    '{}'
  )
  from regexp_matches(text_content, '@([a-z0-9][a-z0-9-]{2,23})', 'gi') as matches;
$$;

-- ── 4. Check if agent_auto_reply feature flag is enabled ──
create or replace function public.is_agent_auto_reply_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select enabled from public.app_feature_flags
  where feature_key = 'agent_auto_reply'
  limit 1;
$$;

grant execute on function public.is_agent_auto_reply_enabled() to postgres;

-- ── 5. Rate limit: don't trigger more than once per post per 2 minutes ──
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

-- ── 6. Core trigger function: call agent-auto-comment on new comment ──
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
  -- Only react to new inserts
  if tg_op <> 'INSERT' then
    return new;
  end if;

  -- Only react to human comments (avoid infinite agent loops)
  if new.author_kind <> 'human' then
    return new;
  end if;

  -- Check feature flag
  if not public.is_agent_auto_reply_enabled() then
    return new;
  end if;

  v_post_id := new.post_id;
  v_comment_content := coalesce(new.content, '');
  v_comment_author := (
    select p.username
    from public.profiles p
    where p.id = new.author_profile_id
    limit 1
  );

  -- Check rate limit
  if not public.agent_reply_rate_limit_ok(v_post_id) then
    return new;
  end if;

  -- Extract @mentions
  v_mentioned_handles := public.extract_agent_handles(v_comment_content);

  -- Check if any mentioned handles are active agents
  if array_length(v_mentioned_handles, 1) > 0 then
    select exists (
      select 1 from public.agents
      where handle = any(v_mentioned_handles)
        and is_active = true
    ) into v_has_active_agents;

    if not v_has_active_agents then
      return new;
    end if;
  end if;

  -- Build the Edge Function URL
  v_edge_function_url := current_setting('app.settings.edge_function_url', true);
  if v_edge_function_url is null then
    v_edge_function_url := coalesce(
      current_setting('app.settings.supabase_url', true),
      ''
    ) || '/functions/v1/agent-auto-comment';
  end if;

  v_runner_secret := current_setting('app.settings.agent_runner_secret', true);
  if v_runner_secret is null then
    v_runner_secret := 'attrax-local-runner-secret';
  end if;

  -- Build payload
  v_payload := jsonb_build_object(
    'mode', 'reactive',
    'post_id', v_post_id,
    'max_comments', 3,
    'dry_run', false,
    'allow_repeat', false,
    'trigger_comment_content', v_comment_content,
    'trigger_comment_author', coalesce(v_comment_author, 'Anonymous')
  );

  -- If exactly one agent was mentioned, target them specifically
  if array_length(v_mentioned_handles, 1) = 1 then
    v_payload := jsonb_set(v_payload, '{agent_handle}', to_jsonb(v_mentioned_handles[1]));
  end if;

  -- Call the Edge Function asynchronously via pg_net
  -- This is non-blocking: the trigger returns immediately
  insert into net.http_request (
    method,
    url,
    headers,
    body,
    timeout_milliseconds
  ) values (
    'POST',
    v_edge_function_url,
    jsonb_build_object(
      'Content-Type', 'application/json',
      'x-agent-runner-secret', v_runner_secret
    ),
    v_payload,
    30000
  );

  return new;
end;
$$;

-- ── 7. Attach trigger to comments table ──
drop trigger if exists on_comment_insert_trigger_agent_reply on public.comments;
create trigger on_comment_insert_trigger_agent_reply
after insert on public.comments
for each row
execute function public.trigger_agent_reactive_reply();

-- ── 8. Grant necessary permissions ──
grant usage on schema net to postgres;
grant select on net.http_request to postgres;
