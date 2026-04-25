# Agent Auto-Comment Cron Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the existing backend-only AI Agent auto-comment function into production operation through Supabase Cron without exposing server secrets to the frontend.

**Architecture:** Keep `agent-auto-comment` as the only writer for official Agent comments. Store Edge Function runtime secrets in Supabase Function Secrets, store cron caller secrets in Supabase Vault, and schedule a `pg_cron + pg_net` job that calls the function every 10 minutes with a conservative autonomous payload.

**Tech Stack:** Supabase Edge Functions, Supabase CLI, Supabase Vault, Supabase Cron (`pg_cron`), `pg_net`, Postgres SQL, Node's built-in `node:test` runner.

---

## File Structure

- Create `supabase/migrations/20260425001000_agent_auto_comment_cron.sql`: enable required scheduler extensions, verify Vault secret names exist, and schedule the production cron job.
- Modify `supabase/schema-policy.test.mjs`: add static checks that the cron migration uses Vault, `pg_net`, the runner-secret header, and does not commit raw secrets.
- Modify `supabase/AGENT_API_CONTRACT.md`: add the production Supabase Cron rollout and rollback runbook.

## Task 1: Add Scheduler Migration Tests

**Files:**
- Modify: `supabase/schema-policy.test.mjs`
- Create after red: `supabase/migrations/20260425001000_agent_auto_comment_cron.sql`

- [ ] **Step 1: Add the migration fixture read**

Insert this block near the existing migration fixture reads at the top of `supabase/schema-policy.test.mjs`:

```js
const agentAutoCommentCronMigrationSql = readFileSync(
  new URL("./migrations/20260425001000_agent_auto_comment_cron.sql", import.meta.url),
  "utf8",
);
```

- [ ] **Step 2: Add the failing scheduler test**

Add this test near the other migration-policy tests in `supabase/schema-policy.test.mjs`:

```js
test("agent auto-comment cron is server-side and secret-backed", () => {
  assert.match(agentAutoCommentCronMigrationSql, /create extension if not exists pg_net/i);
  assert.match(agentAutoCommentCronMigrationSql, /create extension if not exists pg_cron/i);
  assert.match(agentAutoCommentCronMigrationSql, /cron\.schedule\(\s*'agent-auto-comment-every-10-minutes'/i);
  assert.match(agentAutoCommentCronMigrationSql, /'\*\/10 \* \* \* \*'/);
  assert.match(agentAutoCommentCronMigrationSql, /net\.http_post/i);
  assert.match(agentAutoCommentCronMigrationSql, /\/functions\/v1\/agent-auto-comment/i);
  assert.match(agentAutoCommentCronMigrationSql, /x-agent-runner-secret/i);
  assert.match(agentAutoCommentCronMigrationSql, /vault\.decrypted_secrets/i);
  assert.match(agentAutoCommentCronMigrationSql, /agent_auto_comment_project_url/i);
  assert.match(agentAutoCommentCronMigrationSql, /agent_auto_comment_runner_secret/i);
  assert.match(agentAutoCommentCronMigrationSql, /"max_comments",\s*1/i);
  assert.match(agentAutoCommentCronMigrationSql, /"dry_run",\s*false/i);
  assert.doesNotMatch(agentAutoCommentCronMigrationSql, /OPENAI_API_KEY\s*=/i);
  assert.doesNotMatch(agentAutoCommentCronMigrationSql, /SUPABASE_SERVICE_ROLE_KEY\s*=/i);
  assert.doesNotMatch(agentAutoCommentCronMigrationSql, /sk-[A-Za-z0-9_-]+/i);
});
```

- [ ] **Step 3: Run the test and confirm it fails because the migration does not exist**

Run:

```powershell
node --test supabase/schema-policy.test.mjs
```

Expected: fails with `ENOENT` for `20260425001000_agent_auto_comment_cron.sql`.

## Task 2: Create the Cron Migration

**Files:**
- Create: `supabase/migrations/20260425001000_agent_auto_comment_cron.sql`
- Test: `supabase/schema-policy.test.mjs`

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/20260425001000_agent_auto_comment_cron.sql` with this content:

```sql
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
```

- [ ] **Step 2: Run the focused test**

Run:

```powershell
node --test supabase/schema-policy.test.mjs
```

Expected: the new `agent auto-comment cron is server-side and secret-backed` test passes. Existing unrelated failures in this file should be recorded separately instead of fixed in this task.

- [ ] **Step 3: Commit the scheduler migration and test**

Run:

```powershell
git add supabase/schema-policy.test.mjs supabase/migrations/20260425001000_agent_auto_comment_cron.sql
git commit -m "feat: schedule agent auto comments with Supabase cron"
```

Expected: commit succeeds and includes only these two files.

## Task 3: Document the Production Runbook

**Files:**
- Modify: `supabase/AGENT_API_CONTRACT.md`

- [ ] **Step 1: Add the runbook section**

Append this section to `supabase/AGENT_API_CONTRACT.md`:

```markdown
## Production Supabase Cron Rollout

The production scheduler uses Supabase Cron (`pg_cron`) and `pg_net` to call `agent-auto-comment` every 10 minutes. The browser must never call this endpoint.

### 1. Set Edge Function secrets

Set these values in the operator shell before running the CLI command. The helper reads secret values without echoing them:

```powershell
$env:SUPABASE_URL="https://zlpzdokcyztvuiujgffs.supabase.co"

function Set-SecretEnv($Name) {
  $secureValue = Read-Host $Name -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
  try {
    [Environment]::SetEnvironmentVariable(
      $Name,
      [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr),
      "Process"
    )
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

Set-SecretEnv "SUPABASE_ACCESS_TOKEN"
Set-SecretEnv "SUPABASE_SERVICE_ROLE_KEY"
Set-SecretEnv "OPENAI_API_KEY"
Set-SecretEnv "AGENT_RUNNER_SECRET"
```

Then run:

```powershell
supabase secrets set --project-ref zlpzdokcyztvuiujgffs `
  SUPABASE_URL="$env:SUPABASE_URL" `
  SUPABASE_SERVICE_ROLE_KEY="$env:SUPABASE_SERVICE_ROLE_KEY" `
  OPENAI_API_KEY="$env:OPENAI_API_KEY" `
  AGENT_RUNNER_SECRET="$env:AGENT_RUNNER_SECRET" `
  AGENT_MODEL="gpt-5.4-mini" `
  AGENT_LLM_BASE_URL="https://api.openai.com/v1" `
  AGENT_LLM_API="responses"
```

Verify:

```powershell
supabase secrets list --project-ref zlpzdokcyztvuiujgffs
```

### 2. Deploy the function

```powershell
supabase functions deploy agent-auto-comment --project-ref zlpzdokcyztvuiujgffs
```

`supabase/config.toml` sets `verify_jwt = false`; the function still requires `AGENT_RUNNER_SECRET`.

### 3. Create Vault secrets for the cron caller

Use the Supabase Dashboard Vault UI or SQL editor to create:

- `agent_auto_comment_project_url` with value `https://zlpzdokcyztvuiujgffs.supabase.co`
- `agent_auto_comment_runner_secret` with the same value as `AGENT_RUNNER_SECRET`

Verify:

```sql
select name
from vault.decrypted_secrets
where name in (
  'agent_auto_comment_project_url',
  'agent_auto_comment_runner_secret'
)
order by name;
```

Expected: two rows.

### 4. Smoke test dry-run

```powershell
curl.exe -X POST "https://zlpzdokcyztvuiujgffs.supabase.co/functions/v1/agent-auto-comment" `
  -H "Content-Type: application/json" `
  -H "x-agent-runner-secret: $env:AGENT_RUNNER_SECRET" `
  --data '{"mode":"single","max_posts":6,"max_comments":1,"dry_run":true}'
```

Expected: `ok` is `true`, `dry_run` is `true`, and generated comments have no inserted comment id.

### 5. Smoke test one real insert

```powershell
curl.exe -X POST "https://zlpzdokcyztvuiujgffs.supabase.co/functions/v1/agent-auto-comment" `
  -H "Content-Type: application/json" `
  -H "x-agent-runner-secret: $env:AGENT_RUNNER_SECRET" `
  --data '{"mode":"single","max_posts":6,"max_comments":1,"dry_run":false}'
```

Expected: `ok` is `true`, `dry_run` is `false`, and the response includes `inserted_comment_id`.

Verify the comment:

```sql
select id, post_id, author_name, author_badge, author_disclosure, is_ai_agent, content, created_at
from public.feed_comments
where is_ai_agent = true
order by created_at desc
limit 5;
```

### 6. Apply the scheduler migration

```powershell
supabase db push --project-ref zlpzdokcyztvuiujgffs
```

Verify:

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname = 'agent-auto-comment-every-10-minutes';
```

### 7. Monitor the first run

```sql
select jobid, status, return_message, start_time, end_time
from cron.job_run_details
where jobid = (
  select jobid
  from cron.job
  where jobname = 'agent-auto-comment-every-10-minutes'
)
order by start_time desc
limit 5;
```

Also check:

```sql
select id, run_mode, status, error, model, created_at
from public.agent_runs
order by created_at desc
limit 10;
```

### Rollback

```sql
select cron.unschedule('agent-auto-comment-every-10-minutes');
```
```

- [ ] **Step 2: Commit the runbook update**

Run:

```powershell
git add supabase/AGENT_API_CONTRACT.md
git commit -m "docs: add agent auto-comment cron runbook"
```

Expected: commit succeeds and includes only `supabase/AGENT_API_CONTRACT.md`.

## Task 4: Configure Production Secrets

**Files:**
- No repo files modified.

- [ ] **Step 1: Set operator shell variables**

Run in PowerShell. The helper reads secret values without echoing them:

```powershell
$env:SUPABASE_URL="https://zlpzdokcyztvuiujgffs.supabase.co"

function Set-SecretEnv($Name) {
  $secureValue = Read-Host $Name -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
  try {
    [Environment]::SetEnvironmentVariable(
      $Name,
      [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr),
      "Process"
    )
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

Set-SecretEnv "SUPABASE_ACCESS_TOKEN"
Set-SecretEnv "SUPABASE_SERVICE_ROLE_KEY"
Set-SecretEnv "OPENAI_API_KEY"
Set-SecretEnv "AGENT_RUNNER_SECRET"
```

Expected: variables are set only in the operator shell and are not written to repo files.

- [ ] **Step 2: Push Edge Function secrets**

Run:

```powershell
supabase secrets set --project-ref zlpzdokcyztvuiujgffs `
  SUPABASE_URL="$env:SUPABASE_URL" `
  SUPABASE_SERVICE_ROLE_KEY="$env:SUPABASE_SERVICE_ROLE_KEY" `
  OPENAI_API_KEY="$env:OPENAI_API_KEY" `
  AGENT_RUNNER_SECRET="$env:AGENT_RUNNER_SECRET" `
  AGENT_MODEL="gpt-5.4-mini" `
  AGENT_LLM_BASE_URL="https://api.openai.com/v1" `
  AGENT_LLM_API="responses"
```

Expected: command succeeds.

- [ ] **Step 3: Verify secret names**

Run:

```powershell
supabase secrets list --project-ref zlpzdokcyztvuiujgffs
```

Expected: output includes the secret names from Step 2. Do not print secret values in logs or chat.

## Task 5: Deploy and Smoke Test the Edge Function

**Files:**
- No repo files modified.

- [ ] **Step 1: Deploy the function**

Run:

```powershell
supabase functions deploy agent-auto-comment --project-ref zlpzdokcyztvuiujgffs
```

Expected: deploy succeeds.

- [ ] **Step 2: Dry-run production invocation**

Run:

```powershell
curl.exe -X POST "https://zlpzdokcyztvuiujgffs.supabase.co/functions/v1/agent-auto-comment" `
  -H "Content-Type: application/json" `
  -H "x-agent-runner-secret: $env:AGENT_RUNNER_SECRET" `
  --data '{"mode":"single","max_posts":6,"max_comments":1,"dry_run":true}'
```

Expected: HTTP 200; response includes `"ok":true`, `"dry_run":true`, and no non-null `inserted_comment_id`.

- [ ] **Step 3: Real one-shot production invocation**

Run:

```powershell
curl.exe -X POST "https://zlpzdokcyztvuiujgffs.supabase.co/functions/v1/agent-auto-comment" `
  -H "Content-Type: application/json" `
  -H "x-agent-runner-secret: $env:AGENT_RUNNER_SECRET" `
  --data '{"mode":"single","max_posts":6,"max_comments":1,"dry_run":false}'
```

Expected: HTTP 201; response includes `"ok":true`, `"dry_run":false`, and one non-null `inserted_comment_id`.

- [ ] **Step 4: Verify user-facing comment fields**

Run in Supabase SQL Editor:

```sql
select id, post_id, author_name, author_badge, author_disclosure, is_ai_agent, created_at
from public.feed_comments
where is_ai_agent = true
order by created_at desc
limit 5;
```

Expected: newest row has `is_ai_agent = true`, non-empty `author_badge`, and non-empty `author_disclosure`.

- [ ] **Step 5: Verify backend run logs**

Run:

```sql
select id, run_mode, status, error, model, created_at
from public.agent_runs
order by created_at desc
limit 10;
```

Expected: recent rows include `status = 'success'` for the dry-run and real insert.

## Task 6: Create Vault Secrets and Enable Cron

**Files:**
- Remote Supabase database state changes through Vault and migration.

- [ ] **Step 1: Create Vault secrets**

Use Supabase Dashboard > Vault, or run equivalent SQL with the actual runner secret in the private SQL editor session:

```sql
select vault.create_secret(
  'https://zlpzdokcyztvuiujgffs.supabase.co',
  'agent_auto_comment_project_url',
  'Project URL used by the AttraX agent-auto-comment cron job.'
);
```

Then create `agent_auto_comment_runner_secret` with the same value as `AGENT_RUNNER_SECRET`.

Expected: Vault contains both named secrets.

- [ ] **Step 2: Verify Vault secret names**

Run:

```sql
select name
from vault.decrypted_secrets
where name in (
  'agent_auto_comment_project_url',
  'agent_auto_comment_runner_secret'
)
order by name;
```

Expected:

```text
agent_auto_comment_project_url
agent_auto_comment_runner_secret
```

- [ ] **Step 3: Apply the migration**

Run:

```powershell
supabase db push --project-ref zlpzdokcyztvuiujgffs
```

Expected: migration `20260425001000_agent_auto_comment_cron.sql` applies successfully.

- [ ] **Step 4: Verify the cron job**

Run:

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname = 'agent-auto-comment-every-10-minutes';
```

Expected: one row with `schedule = '*/10 * * * *'` and `active = true`.

## Task 7: Monitor and Roll Back if Needed

**Files:**
- No repo files modified.

- [ ] **Step 1: Check scheduler execution**

Run after at least 10 minutes:

```sql
select jobid, status, return_message, start_time, end_time
from cron.job_run_details
where jobid = (
  select jobid
  from cron.job
  where jobname = 'agent-auto-comment-every-10-minutes'
)
order by start_time desc
limit 5;
```

Expected: latest run status is successful. If the HTTP response indicates `no_autonomous_targets`, treat that as a content-availability condition rather than scheduler failure.

- [ ] **Step 2: Check function logs**

Run:

```sql
select id, run_mode, status, error, details, created_at
from public.agent_runs
order by created_at desc
limit 10;
```

Expected: recent autonomous rows either succeed or show actionable errors such as missing eligible posts or provider failure.

- [ ] **Step 3: Emergency stop**

Run this if comments are too frequent, LLM output is wrong, costs spike, or demo moderation requires pause:

```sql
select cron.unschedule('agent-auto-comment-every-10-minutes');
```

Expected: `cron.job` no longer contains `agent-auto-comment-every-10-minutes`.

## Final Verification

- [ ] `node --test supabase/schema-policy.test.mjs` runs and the new scheduler test passes.
- [ ] `supabase secrets list --project-ref zlpzdokcyztvuiujgffs` shows the required Edge Function secret names.
- [ ] `supabase functions deploy agent-auto-comment --project-ref zlpzdokcyztvuiujgffs` succeeds.
- [ ] Dry-run curl returns `ok: true`.
- [ ] Real curl returns an `inserted_comment_id`.
- [ ] `feed_comments` shows visible AI Agent labeling for the inserted comment.
- [ ] `agent_runs` records success rows.
- [ ] `cron.job` contains the 10-minute job.
- [ ] `cron.job_run_details` records scheduler runs.
- [ ] Rollback SQL is documented and tested in a non-production rehearsal or reviewed by the operator before launch.
