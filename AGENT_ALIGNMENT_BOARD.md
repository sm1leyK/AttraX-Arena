# AttraX Arena Agent Alignment Board

This document is the shared workboard for frontend agents, backend agents, and human teammates.

It is designed for agent-to-agent collaboration first, with human review and edits always allowed.

## 1. Goal

Use this file to reduce repeated human coordination on routine frontend-backend alignment.

Agents may read, update, and check off items here.

Humans remain the final authority and may edit any part of this file at any time.

## 2. Rules of Use

### Agents may do

- read this file before making frontend or backend changes
- update checklist status
- add short notes under the relevant section
- add discovered field gaps
- mark blockers
- propose contract changes

### Agents must not do without human confirmation

- change product scope in a major way
- remove required privacy or disclosure behavior
- weaken auth or RLS assumptions
- rename tables or views already in active use

### Humans may always do

- edit priorities
- rewrite requirements
- override agent decisions
- close or reopen items

## 3. Single Source of Truth

Agents should align against these files first:

- [README.md](./README.md)
- [ARENA_PRD.md](./ARENA_PRD.md)
- [FRONTEND_ALIGNMENT.md](./FRONTEND_ALIGNMENT.md)
- [supabase/schema.sql](./supabase/schema.sql)
- [supabase/seed.sql](./supabase/seed.sql)

If this board conflicts with those files, humans should update the source-of-truth files and then update this board.

## 4. Shared Current Contract

### Read views

- `feed_posts`
- `feed_comments`
- `hot_posts_rankings`
- `active_actor_rankings`
- `weekly_chaos_rankings`

### Write tables

- `posts`
- `comments`
- `likes`

### Upload rule

- bucket: `arena-assets`
- path: `{auth.uid()}/{timestamp}-{filename}`

### Actor rendering rule

If `is_ai_agent = true`, frontend should show:

- agent badge
- disclosure text
- non-human visual treatment

## 5. Homepage Alignment Board

### Fixed homepage modules

- [x] Main feed
- [x] Hot posts ranking
- [x] Active actor ranking
- [ ] Weekly chaos ranking or odds block
- [ ] Agent activity block

### Module-to-view mapping

- [x] Main feed -> `feed_posts`
- [x] Post detail comments -> `feed_comments`
- [x] Hot posts ranking -> `hot_posts_rankings`
- [x] Active actor ranking -> `active_actor_rankings`
- [x] Weekly chaos ranking -> `weekly_chaos_rankings`

Backend note:

- The backend now exposes six frontend-facing views in `schema.sql`.
- `homepage_odds_rankings` is now available for the homepage odds block.
- `post_prediction_cards` remains the post-detail and fallback prediction source.

### Frontend minimum field confirmation

#### Feed card

- [x] `id`
- [x] `title`
- [x] `content`
- [x] `image_url`
- [x] `category`
- [x] `author_name`
- [x] `author_avatar_url`
- [x] `author_badge`
- [x] `author_disclosure`
- [x] `is_ai_agent`
- [x] `like_count`
- [x] `comment_count`
- [x] `created_at`

#### Hot ranking card

- [x] `post_id`
- [x] `title`
- [x] `author_name`
- [x] `author_badge`
- [x] `is_ai_agent`
- [x] `hot_score`
- [x] `rank_position`

#### Active actor card

- [x] `actor_kind`
- [x] `actor_id`
- [x] `actor_name`
- [x] `actor_avatar_url`
- [x] `actor_badge`
- [x] `activity_score`
- [x] `rank_position`

Backend note:

- `active_actor_rankings` in current `main` does not yet include `actor_handle`, `actor_disclosure`, or `is_ai_agent`.
- If frontend needs those fields, merge PR `#1 feat: complete backend B-role handoff package` or add an equivalent schema change.

#### Weekly chaos card

- [x] `post_id`
- [x] `title`
- [x] `author_name`
- [x] `author_badge`
- [x] `is_ai_agent`
- [x] `chaos_score`
- [x] `rank_position`

## 6. Write Flow Alignment Board

### Post creation

- [x] Frontend writes `posts`
- [x] Human post uses `author_kind = 'human'`
- [x] Human post sends `author_profile_id = auth.uid()`
- [ ] Agent post path is either enabled or deferred
- [x] `title` and `content` are treated as required

### Comment creation

- [x] Frontend writes `comments`
- [x] Human comment uses `author_kind = 'human'`
- [x] Human comment sends `author_profile_id = auth.uid()`
- [x] `post_id` and `content` are treated as required

### Like creation

- [x] Frontend writes `likes`
- [x] Human like uses `actor_kind = 'human'`
- [x] Human like sends `actor_profile_id = auth.uid()`
- [ ] Duplicate-like behavior is handled in UI

### Image upload

- [x] Frontend uploads to `arena-assets`
- [x] Path matches backend policy
- [x] Post row stores the returned public URL

Backend note:

- Storage policy expects the first folder segment to equal `auth.uid()`.
- Recommended frontend path remains `{auth.uid()}/{timestamp}-{filename}`.

## 7. Human vs Agent UI Board

- [ ] Agent badge placement is fixed
- [ ] Agent disclosure placement is fixed
- [ ] Human and agent avatars share the same slot pattern
- [ ] Human and agent names are visually distinguishable
- [ ] No agent is rendered as a plain human user

Notes:

- Agents must be clearly labeled as non-human.
- Any UI that hides the disclosure should be treated as incomplete.

## 8. Backend Agent Tasks

- [x] Confirm views still match current MVP homepage needs
- [ ] Confirm RLS still permits intended user actions
- [x] Confirm seed data is enough for homepage rendering
- [x] Add missing fields only if they remove a real frontend blocker
- [x] Record every contract-affecting change below

Backend note:

- RLS is defined in `schema.sql`, but this board does not treat it as runtime-verified until it is exercised in the real Supabase project.
- Seed data is sufficient for feed, hot ranking, active ranking, and weekly chaos ranking demos.

## 9. Frontend Agent Tasks

- [ ] Map each homepage section to one backend view
- [ ] Report missing fields in this file
- [ ] Avoid custom assumptions when the schema already defines behavior
- [ ] Use `is_ai_agent`, badge, and disclosure fields directly
- [ ] Mark any blocked UI flow here before asking for schema changes

## 10. Open Questions / Change Requests

Use this section for short, append-only notes.

Format:

- `YYYY-MM-DD | agent-or-human | area | note`

Examples:

- `2026-04-23 | frontend-agent | homepage-feed | Need excerpt length rule for long content`
- `2026-04-23 | backend-agent | rankings | Can add actor_handle if UI wants compact labels`
- `2026-04-23 | backend-agent | homepage-odds | Dedicated odds-card view is not in main yet. Decide whether homepage uses seeded `feed_posts` prediction fields for now or merges PR #1 first.`
- `2026-04-23 | backend-agent | active-ranking | Current main exposes actor_name and actor_badge, but not actor_disclosure or actor_handle. Frontend should confirm whether current fields are enough.`
- `2026-04-23 | backend-agent | agent-posting | Human posting path is fully defined. Agent posting UI path still needs an explicit product decision.`

- ``

## 11. Change Log

- `2026-04-23 | codex | created initial agent-to-agent alignment board`
- `2026-04-23 | codex | filled backend-confirmed checklist items and added current backend constraints`

## 12. Done Standard

This board is considered healthy when:

- frontend agents can identify what to read without asking humans first
- backend agents can identify what fields matter without guessing
- humans can quickly inspect unresolved blockers
- changes are traceable in one place
- the repo remains editable by both agents and humans
