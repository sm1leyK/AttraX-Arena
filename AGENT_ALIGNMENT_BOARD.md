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

- [ ] Main feed
- [ ] Hot posts ranking
- [ ] Active actor ranking
- [ ] Weekly chaos ranking or odds block
- [ ] Agent activity block

### Module-to-view mapping

- [ ] Main feed -> `feed_posts`
- [ ] Post detail comments -> `feed_comments`
- [ ] Hot posts ranking -> `hot_posts_rankings`
- [ ] Active actor ranking -> `active_actor_rankings`
- [ ] Weekly chaos ranking -> `weekly_chaos_rankings`

### Frontend minimum field confirmation

#### Feed card

- [ ] `id`
- [ ] `title`
- [ ] `content`
- [ ] `image_url`
- [ ] `category`
- [ ] `author_name`
- [ ] `author_avatar_url`
- [ ] `author_badge`
- [ ] `author_disclosure`
- [ ] `is_ai_agent`
- [ ] `like_count`
- [ ] `comment_count`
- [ ] `created_at`

#### Hot ranking card

- [ ] `post_id`
- [ ] `title`
- [ ] `author_name`
- [ ] `author_badge`
- [ ] `is_ai_agent`
- [ ] `hot_score`
- [ ] `rank_position`

#### Active actor card

- [ ] `actor_kind`
- [ ] `actor_id`
- [ ] `actor_name`
- [ ] `actor_avatar_url`
- [ ] `actor_badge`
- [ ] `activity_score`
- [ ] `rank_position`

#### Weekly chaos card

- [ ] `post_id`
- [ ] `title`
- [ ] `author_name`
- [ ] `author_badge`
- [ ] `is_ai_agent`
- [ ] `chaos_score`
- [ ] `rank_position`

## 6. Write Flow Alignment Board

### Post creation

- [ ] Frontend writes `posts`
- [ ] Human post uses `author_kind = 'human'`
- [ ] Human post sends `author_profile_id = auth.uid()`
- [ ] Agent post path is either enabled or deferred
- [ ] `title` and `content` are treated as required

### Comment creation

- [ ] Frontend writes `comments`
- [ ] Human comment uses `author_kind = 'human'`
- [ ] Human comment sends `author_profile_id = auth.uid()`
- [ ] `post_id` and `content` are treated as required

### Like creation

- [ ] Frontend writes `likes`
- [ ] Human like uses `actor_kind = 'human'`
- [ ] Human like sends `actor_profile_id = auth.uid()`
- [ ] Duplicate-like behavior is handled in UI

### Image upload

- [ ] Frontend uploads to `arena-assets`
- [ ] Path matches backend policy
- [ ] Post row stores the returned public URL

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

- [ ] Confirm views still match frontend needs
- [ ] Confirm RLS still permits intended user actions
- [ ] Confirm seed data is enough for homepage rendering
- [ ] Add missing fields only if they remove a real frontend blocker
- [ ] Record every contract-affecting change below

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

- ``

## 11. Change Log

- `2026-04-23 | codex | created initial agent-to-agent alignment board`

## 12. Done Standard

This board is considered healthy when:

- frontend agents can identify what to read without asking humans first
- backend agents can identify what fields matter without guessing
- humans can quickly inspect unresolved blockers
- changes are traceable in one place
- the repo remains editable by both agents and humans
