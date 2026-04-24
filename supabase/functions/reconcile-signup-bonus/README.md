# reconcile-signup-bonus

Draft Supabase Edge Function for the virtual coin `signup_bonus` flow.

## Purpose

- authenticate current human user
- ensure wallet exists
- grant signup bonus once
- return current wallet state

## Environment variables

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Notes

- This is a draft implementation.
- It uses service role for reward writes.
- It is idempotent at the read-check level.
- It is not fully race-safe yet because the flow is not wrapped in one SQL transaction.
- For stricter production safety, add a unique constraint for posted `signup_bonus` per wallet or move the write flow into one SQL wrapper function.

