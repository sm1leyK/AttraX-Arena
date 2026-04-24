# claim-daily-login-reward

Draft Supabase Edge Function for the virtual coin `daily_login` flow.

## Purpose

- authenticate current human user
- ensure wallet exists
- grant one daily login reward per UTC day
- return current wallet state

## Environment variables

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Notes

- This is a draft implementation.
- It uses service role for reward writes.
- It uses UTC day boundaries for claim checks.
- It is idempotent at the query-check level.
- It is not fully race-safe yet because the flow is not wrapped in one SQL transaction.
- For stricter production safety, add a unique daily claim guard or move the write flow into one SQL wrapper function.

