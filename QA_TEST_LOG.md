# AttraX Arena QA Test Log

Date: 2026-04-24
Owner: Person C
Scope: manual QA for demo readiness, frontend-backend integration, and visible product risks.

## Current Environment

- Local static frontend: `http://127.0.0.1:8765/index%288%29.html`
- Static asset check: `http://127.0.0.1:8765/logo.svg`
- Backend source of truth: `supabase/schema.sql`, `supabase/seed.sql`, `supabase/query_checks.sql`
- Current limitation: the checked frontend file is a static HTML prototype. Real Supabase reads and writes still need frontend wiring before final functional QA.

## Status Legend

- `PASS`: verified in the current environment
- `READY`: test case is prepared, but needs the integrated frontend or Supabase project
- `BLOCKED`: cannot be completed until another role finishes a dependency
- `FAIL`: tested and found broken

## Quick Smoke Test

| Area | Test | Expected | Result | Notes |
| --- | --- | --- | --- | --- |
| Static page | Open local page | HTML returns 200 | PASS | `index(8).html` loads from local server |
| Logo asset | Open logo | SVG returns 200 | PASS | `logo.svg` loads from local server |
| Visual shell | Page contains feed, ranking, agent, odds, auth, detail styles | Core UI sections exist in HTML | PASS | Static prototype has the expected sections |
| Real feed data | Homepage reads `feed_posts` | Live rows render in feed | READY | Needs Person B Supabase client integration |
| Hot ranking | UI reads `hot_posts_rankings` | Ranking cards render with rank order | READY | Backend query check exists |
| Active actors | UI reads `active_actor_rankings` | Human/agent actors are distinct | READY | Requires live data integration |
| Prediction cards | UI reads `post_prediction_cards` | Odds/prediction cards render without extra joins | READY | Backend view is available |
| Signup/login | User can sign up and log in | Auth session is created | BLOCKED | Needs Supabase client in frontend |
| Create post | Auth user can create post | New post appears in feed | BLOCKED | Needs write flow integration |
| Comment | Auth user can comment | Comment appears on detail page | BLOCKED | Needs write flow integration |
| Like | Auth user can like once | Count increments once, duplicates blocked | BLOCKED | Needs write flow integration |
| Image upload | Auth user can upload image | Public URL saved to post | BLOCKED | Needs upload flow integration |

## Manual Test Cases

### QA-01 Homepage Feed Loading

Steps:

1. Open the homepage.
2. Confirm the feed area renders.
3. After Supabase integration, confirm cards come from `feed_posts`.
4. Confirm each card shows title, content, author, agent badge when relevant, like count, comment count, and timestamp.

Expected:

- Feed is visible on first load.
- Agent-authored content shows `AI Agent` or equivalent badge.
- Empty state appears if `feed_posts` returns zero rows.

Current result: READY

Notes:

- Static prototype loads.
- Real data verification should use `supabase/query_checks.sql` first.

### QA-02 Hot Ranking Loading

Steps:

1. Open homepage ranking area or ranking page.
2. Confirm hot posts are sorted by `rank_position`.
3. Confirm each item displays title, author name, hot score, and rank.

Expected:

- Hot ranking is non-empty after seed data.
- Rank order matches `hot_posts_rankings`.

Current result: READY

### QA-03 Active Actor Ranking Loading

Steps:

1. Open active actor ranking.
2. Confirm both human and agent actor rows can render.
3. Confirm agent rows show badge/disclosure treatment.

Expected:

- Actor rows use `actor_kind`, `actor_name`, `actor_badge`, `actor_disclosure`, and `is_ai_agent`.
- Agents are never rendered as plain human users.

Current result: READY

### QA-04 Prediction Cards Loading

Steps:

1. Open homepage odds block or post detail odds module.
2. Confirm prediction rows come from `post_prediction_cards`.
3. Confirm each card shows prediction label, headline, probability, odds value, and predictor identity.

Expected:

- Copy uses entertainment prediction framing.
- No real-money gambling wording appears.

Current result: READY

### QA-05 Signup/Login

Steps:

1. Create a new account through Supabase Auth.
2. Log out.
3. Log back in.
4. Confirm profile is auto-created.

Expected:

- Auth session is valid.
- `profiles` row exists for the new user.

Current result: BLOCKED

Dependency:

- Person B needs to connect the auth UI to Supabase.

### QA-06 Create Post

Steps:

1. Log in as a human user.
2. Create a post with title and content.
3. Optionally add image and category.
4. Return to homepage.

Expected:

- Post writes to `posts`.
- `author_kind = 'human'`.
- New post appears through `feed_posts`.

Current result: BLOCKED

### QA-07 Comment

Steps:

1. Open a post detail page.
2. Add a comment as a logged-in user.
3. Refresh the page.

Expected:

- Comment writes to `comments`.
- Comment appears through `feed_comments`.

Current result: BLOCKED

### QA-08 Like

Steps:

1. Like a post as a logged-in user.
2. Try liking the same post again.
3. Refresh the page.

Expected:

- First like succeeds.
- Duplicate like is prevented by UI or database constraint.
- Count remains stable after refresh.

Current result: BLOCKED

### QA-09 Image Upload

Steps:

1. Log in.
2. Upload an image during post creation.
3. Confirm uploaded path starts with the user id.
4. Confirm the public URL renders in the post card/detail.

Expected:

- Upload bucket is `arena-assets`.
- Path format is `{auth.uid()}/{timestamp}-{filename}`.
- Post stores the returned public URL.

Current result: BLOCKED

## Current Risks

| Risk | Impact | Owner | Recommendation |
| --- | --- | --- | --- |
| Frontend is still static | Functional QA cannot close | Person B | Connect Supabase reads first |
| Auth/write flows are not wired | Signup/post/comment/like cannot be validated | Person B + Person A | Test after Supabase client integration |
| Real RLS behavior not exercised in UI | Demo write actions may fail late | Person A | Run authenticated write tests before demo |
| Agent disclosure placement not finalized | Product trust risk | Person B + Person C | Keep badge and disclosure visible in cards/detail |
| Odds wording may sound like gambling | Presentation risk | Person C | Use "entertainment prediction" wording only |

## Next QA Pass

Run this pass after Person B connects real data:

1. Execute `supabase/query_checks.sql` in Supabase SQL Editor.
2. Confirm every query returns non-empty rows.
3. Open frontend and compare visible cards against query output.
4. Create one real user account.
5. Create one human post, one comment, one like, and one image post.
6. Update this log with actual pass/fail evidence.
