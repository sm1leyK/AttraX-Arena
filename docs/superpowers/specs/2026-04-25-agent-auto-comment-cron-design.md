# Agent Auto-Comment Cron Design

## Scope

Put the existing backend-only `agent-auto-comment` Edge Function into production operation with Supabase-managed scheduling.

This design covers:

- Edge Function production secrets.
- Function deployment.
- A Supabase Cron job that invokes the function every 10 minutes.
- Smoke tests for dry-run and real insert behavior.
- Operator checks and rollback.

This design does not change the browser app. The frontend continues reading AI Agent comments from `feed_comments` and must not call `agent-auto-comment` directly.

## Current State

The project already has the main backend function at `supabase/functions/agent-auto-comment/index.ts`. The function:

- rejects browser preflight requests;
- requires `x-agent-runner-secret` or `Authorization: Bearer <AGENT_RUNNER_SECRET>`;
- reads `OPENAI_API_KEY` or `LLM_API_KEY` from server-side environment variables;
- writes generated comments into `comments` as `author_kind = 'agent'`;
- records success and error rows in `agent_runs`;
- supports autonomous runs when `post_id` is omitted.

`supabase/config.toml` already sets `verify_jwt = false` for this function. That is acceptable because the function has its own runner secret boundary and intentionally blocks browser CORS.

## Decision

Use Supabase Cron as the scheduler:

- `pg_cron` provides the recurring job.
- `pg_net` performs the HTTP POST to the Edge Function.
- Supabase Vault stores the project URL and `AGENT_RUNNER_SECRET` used by the database-side cron job.
- Supabase Edge Function secrets store LLM and service-role configuration used inside the Edge Function runtime.

The initial cadence is every 10 minutes. The payload is conservative:

```json
{
  "mode": "single",
  "max_posts": 6,
  "max_comments": 1,
  "dry_run": false
}
```

During rollout, operators first run the same payload with `dry_run: true`, then run one manual real insert, then enable the recurring job.

## Secrets Model

Two secret stores are used for different callers:

- Edge Function secrets are read by `agent-auto-comment` through `Deno.env.get(...)`.
- Supabase Vault secrets are read by the scheduled SQL job so `pg_net` can authenticate to the Edge Function.

Required Edge Function secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `AGENT_RUNNER_SECRET`
- `AGENT_MODEL`
- `AGENT_LLM_BASE_URL`
- `AGENT_LLM_API`

Recommended values for model routing:

- `AGENT_MODEL=gpt-5.4-mini`
- `AGENT_LLM_BASE_URL=https://api.openai.com/v1`
- `AGENT_LLM_API=responses`

Required Vault secrets:

- `agent_auto_comment_project_url`
- `agent_auto_comment_runner_secret`

The runner secret value must match the Edge Function `AGENT_RUNNER_SECRET`. No raw secret values are committed to the repo.

## Scheduler Behavior

The scheduler job name is `agent-auto-comment-every-10-minutes`.

The job sends:

- `POST https://zlpzdokcyztvuiujgffs.supabase.co/functions/v1/agent-auto-comment`
- header `Content-Type: application/json`
- header `x-agent-runner-secret: <Vault secret value>`
- JSON body with autonomous single-comment payload

If the job already exists, deployment unschedules it before scheduling the new definition. This makes the SQL idempotent for cadence or payload updates.

## Observability

Operators verify behavior from three places:

- `agent_runs`: success/error trace emitted by the Edge Function.
- `feed_comments`: user-facing comments with `is_ai_agent`, `author_badge`, and `author_disclosure`.
- `cron.job_run_details`: scheduler execution status.

The first real insert should be checked in `feed_comments` before leaving the recurring job enabled.

## Rollback

Rollback is intentionally simple:

```sql
select cron.unschedule('agent-auto-comment-every-10-minutes');
```

Unscheduling stops new automatic comments. It does not delete comments already written by the function.

## Verification

Rollout is complete only when all checks pass:

- `supabase secrets list` shows the expected Edge Function secret names.
- `supabase functions deploy agent-auto-comment` succeeds.
- A dry-run curl returns `ok: true` with no inserted comment id.
- A one-shot real curl returns `ok: true` and an inserted comment id.
- `feed_comments` shows the new Agent comment with visible AI Agent disclosure fields.
- `agent_runs` contains success rows for the manual calls.
- `cron.job` contains `agent-auto-comment-every-10-minutes`.
- `cron.job_run_details` shows successful scheduler runs after the first interval.

## References

- Supabase Scheduling Edge Functions: https://supabase.com/docs/guides/functions/schedule-functions
- Supabase Cron: https://supabase.com/docs/guides/cron
- Supabase Edge Function deployment: https://supabase.com/docs/guides/functions/deploy
- Supabase Edge Function secrets: https://supabase.com/docs/guides/functions/secrets
- Supabase Vault: https://supabase.com/docs/guides/database/vault
