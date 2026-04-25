# Comment Media Attachments Implementation Plan / 评论媒体附件实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **给 agentic workers：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 按任务逐步执行。本计划用 checkbox（`- [ ]`）追踪进度。

**Goal / 目标:** Let flat post-detail comments include one image or one audio attachment, render audio as a compact play button, and let comment authors or post authors delete comments.
让帖子详情页的扁平评论支持 1 个图片或音频附件；音频以紧凑播放按钮呈现；评论作者和帖子作者可以按权限删除评论。

**Architecture / 架构:** Add media metadata directly to `public.comments`, expose it through `feed_comments`, and keep the existing flat comment list. Put frontend media validation/rendering in a focused helper module, then wire `front/app.mjs` to upload comment attachments, render them, play audio, and delete comments through Supabase RLS.
直接在 `public.comments` 增加媒体元数据字段，通过 `feed_comments` 暴露给前端，并保持现有扁平评论列表。前端新增一个聚焦的媒体 helper 负责校验和渲染，再在 `front/app.mjs` 串起附件上传、评论渲染、音频播放和基于 Supabase RLS 的删除权限。

**Tech Stack / 技术栈:** Supabase Postgres, Supabase Storage `arena-assets`, browser ESM, Node `node:test`, static HTML/CSS.

---

## Bilingual Task Map / 双语任务索引

| Task | English | 中文 |
| --- | --- | --- |
| 1 | Add failing backend tests for comment media schema and delete policy. | 先补后端失败测试，覆盖评论媒体字段和删除权限策略。 |
| 2 | Add the Supabase migration and update `schema.sql`. | 新增 Supabase 迁移并同步更新 `schema.sql` 快照。 |
| 3 | Create the frontend comment media helper and unit tests. | 创建前端评论媒体 helper，并补单元测试。 |
| 4 | Add static composer markup and media styles. | 更新静态 HTML/CSS，加入附件入口、预览、媒体样式。 |
| 5 | Wire upload, submit, render, and compact audio playback. | 串联附件上传、评论提交、媒体渲染和语音按钮播放。 |
| 6 | Add comment delete UI and permissions in the frontend. | 加入评论删除入口和前端权限判断。 |
| 7 | Run full verification and manual QA. | 跑全量验证并进行手动 QA。 |

Code blocks, SQL, and commands remain in English because they are executable artifacts. Product behavior and task intent are mirrored in Chinese here and in the header.

代码块、SQL 和命令保持英文，因为它们是可直接执行的工程内容。产品行为和任务意图已在本节及文档头部用中文同步说明。

## Pre-Execution Notes / 执行前说明

The current working tree has many unrelated changes and an existing `git merge codex/signup-bonus-retry` process holding `_git/index.lock`. Before executing commit steps, resolve or stop that merge process safely. Do not stage unrelated files.

当前工作树有很多无关改动，并且已有 `git merge codex/signup-bonus-retry` 进程占用 `_git/index.lock`。执行 commit 步骤前，需要安全地处理该 merge 进程或锁文件。不要 stage 无关文件。

Use these direct test commands because the repo has no root `package.json` scripts:

```powershell
node --test .\supabase\schema-policy.test.mjs
node --test .\front\comment-media-render.test.mjs
node --test .\front\post-actions.test.mjs
```

## File Structure / 文件结构

- Create `supabase/migrations/20260425001300_comment_media_attachments.sql`: live migration for comment media fields, `feed_comments`, and delete policy.
- Modify `supabase/schema.sql`: canonical schema snapshot matching the migration.
- Modify `supabase/schema-policy.test.mjs`: schema and migration regex coverage for media fields and delete policy.
- Create `front/comment-media-render.mjs`: small, testable helper for comment attachment validation, storage paths, payload building, and media markup.
- Create `front/comment-media-render.test.mjs`: unit tests for the helper.
- Modify `front/index.html`: desktop/static shell markup and CSS for comment attachment picker, preview, media rendering, audio play button, and delete action styling.
- Modify `front/index.mobile.html`: mirror the same comment composer/media CSS and DOM hooks used by `app.mjs`.
- Modify `front/app.mjs`: attachment state, file input handlers, upload flow, comment insert payload, media rendering, audio playback, and comment deletion.
- Modify `front/post-actions.test.mjs`: source-level tests that the app wires upload, render, play, and delete flows.

---

### Task 1: Backend Failing Tests / 后端失败测试

**Files:**
- Modify: `supabase/schema-policy.test.mjs`

- [ ] **Step 1: Load the new migration in the schema test**

Add this constant after `agentAdminOverviewMigrationSql`:

```js
const commentMediaMigrationSql = readFileSync(
  new URL("./migrations/20260425001300_comment_media_attachments.sql", import.meta.url),
  "utf8",
);
```

- [ ] **Step 2: Add schema tests for comment media fields and constraints**

Append these tests near the other schema structure tests:

```js
test("comments support one image or audio attachment", () => {
  assert.match(schemaSql, /alter table public\.comments\s+add column if not exists media_kind text/i);
  assert.match(schemaSql, /alter table public\.comments\s+add column if not exists media_url text/i);
  assert.match(schemaSql, /alter table public\.comments\s+add column if not exists media_storage_path text/i);
  assert.match(schemaSql, /alter table public\.comments\s+add column if not exists media_mime_type text/i);
  assert.match(schemaSql, /alter table public\.comments\s+add column if not exists media_size_bytes integer/i);
  assert.match(schemaSql, /alter table public\.comments\s+add column if not exists media_duration_seconds numeric\(8,2\)/i);
  assert.match(schemaSql, /constraint comments_media_kind_valid check \(media_kind is null or media_kind in \('image', 'audio'\)\)/i);
  assert.match(schemaSql, /constraint comments_content_or_media_required check \([\s\S]*char_length\(trim\(content\)\) >= 1[\s\S]*or media_url is not null[\s\S]*\)/i);
  assert.match(schemaSql, /constraint comments_media_fields_consistent check \([\s\S]*media_url is null[\s\S]*media_storage_path is null[\s\S]*media_url is not null[\s\S]*media_storage_path is not null[\s\S]*\)/i);
  assert.match(schemaSql, /constraint comments_media_mime_valid check \([\s\S]*image\/jpeg[\s\S]*audio\/mpeg[\s\S]*\)/i);
});

test("feed_comments exposes comment media metadata", () => {
  const feedCommentsViewSql = schemaSql.match(/create view public\.feed_comments[\s\S]*?left join public\.agents a on a\.id = c\.author_agent_id;/i)?.[0] ?? "";

  assert.match(feedCommentsViewSql, /c\.media_kind/i);
  assert.match(feedCommentsViewSql, /c\.media_url/i);
  assert.match(feedCommentsViewSql, /c\.media_storage_path/i);
  assert.match(feedCommentsViewSql, /c\.media_mime_type/i);
  assert.match(feedCommentsViewSql, /c\.media_size_bytes/i);
  assert.match(feedCommentsViewSql, /c\.media_duration_seconds/i);
});
```

- [ ] **Step 3: Add migration tests for the live SQL file**

Append this test after the schema media tests:

```js
test("comment media migration can be applied to live Supabase", () => {
  assert.match(commentMediaMigrationSql, /alter table public\.comments\s+add column if not exists media_kind text/i);
  assert.match(commentMediaMigrationSql, /drop constraint if exists comments_content_length/i);
  assert.match(commentMediaMigrationSql, /add constraint comments_content_or_media_required/i);
  assert.match(commentMediaMigrationSql, /create or replace view public\.feed_comments/i);
  assert.match(commentMediaMigrationSql, /c\.media_storage_path/i);
  assert.match(commentMediaMigrationSql, /drop policy if exists "Authors can delete their own comments"/i);
  assert.match(commentMediaMigrationSql, /create policy "Comment authors post authors and admins can delete comments"/i);
});
```

- [ ] **Step 4: Add delete-policy tests**

Append this test near the existing policy tests:

```js
test("comment delete policy lets comment authors admins and post authors delete comments", () => {
  const deletePolicySql = schemaSql.match(
    /create policy "Comment authors post authors and admins can delete comments"[\s\S]*?;\r?\n/i,
  )?.[0] ?? "";

  assert.match(deletePolicySql, /on public\.comments/i);
  assert.match(deletePolicySql, /for delete/i);
  assert.match(deletePolicySql, /author_kind = 'human' and author_profile_id = auth\.uid\(\)/i);
  assert.match(deletePolicySql, /author_kind = 'agent' and public\.user_owns_agent\(author_agent_id, auth\.uid\(\)\)/i);
  assert.match(deletePolicySql, /exists \([\s\S]*from public\.posts p[\s\S]*p\.id = public\.comments\.post_id/i);
  assert.match(deletePolicySql, /p\.author_kind = 'human' and p\.author_profile_id = auth\.uid\(\)/i);
  assert.match(deletePolicySql, /p\.author_kind = 'agent' and public\.user_owns_agent\(p\.author_agent_id, auth\.uid\(\)\)/i);
  assert.match(deletePolicySql, /public\.is_admin\(auth\.uid\(\)\)/i);
});
```

- [ ] **Step 5: Run backend tests and verify they fail for the missing migration/schema**

Run:

```powershell
node --test .\supabase\schema-policy.test.mjs
```

Expected: FAIL with errors mentioning missing `20260425001300_comment_media_attachments.sql` or missing comment media schema patterns.

---

### Task 2: Backend Migration and Schema Snapshot / 后端迁移与 Schema 快照

**Files:**
- Create: `supabase/migrations/20260425001300_comment_media_attachments.sql`
- Modify: `supabase/schema.sql`
- Test: `supabase/schema-policy.test.mjs`

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/20260425001300_comment_media_attachments.sql` with this SQL:

```sql
alter table public.comments
  add column if not exists media_kind text;

alter table public.comments
  add column if not exists media_url text;

alter table public.comments
  add column if not exists media_storage_path text;

alter table public.comments
  add column if not exists media_mime_type text;

alter table public.comments
  add column if not exists media_size_bytes integer;

alter table public.comments
  add column if not exists media_duration_seconds numeric(8,2);

alter table public.comments
  alter column content set default '';

update public.comments
set content = ''
where content is null;

alter table public.comments
  alter column content set not null;

alter table public.comments
  drop constraint if exists comments_content_length;

alter table public.comments
  drop constraint if exists comments_media_kind_valid;

alter table public.comments
  add constraint comments_media_kind_valid
  check (media_kind is null or media_kind in ('image', 'audio'));

alter table public.comments
  drop constraint if exists comments_content_or_media_required;

alter table public.comments
  add constraint comments_content_or_media_required
  check (
    char_length(trim(content)) <= 2000
    and (
      char_length(trim(content)) >= 1
      or media_url is not null
    )
  );

alter table public.comments
  drop constraint if exists comments_media_fields_consistent;

alter table public.comments
  add constraint comments_media_fields_consistent
  check (
    (
      media_url is null
      and media_kind is null
      and media_storage_path is null
      and media_mime_type is null
      and media_size_bytes is null
      and media_duration_seconds is null
    )
    or
    (
      media_url is not null
      and media_kind is not null
      and media_storage_path is not null
      and media_mime_type is not null
      and media_size_bytes is not null
      and media_size_bytes > 0
    )
  );

alter table public.comments
  drop constraint if exists comments_media_duration_valid;

alter table public.comments
  add constraint comments_media_duration_valid
  check (
    (
      media_kind is distinct from 'image'
      or media_duration_seconds is null
    )
    and (
      media_duration_seconds is null
      or media_duration_seconds >= 0
    )
  );

alter table public.comments
  drop constraint if exists comments_media_mime_valid;

alter table public.comments
  add constraint comments_media_mime_valid
  check (
    media_kind is null
    or (
      media_kind = 'image'
      and media_mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')
    )
    or (
      media_kind = 'audio'
      and media_mime_type in ('audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/wav', 'audio/ogg')
    )
  );

create or replace view public.feed_comments
with (security_invoker = true)
as
select
  c.id,
  c.post_id,
  c.content,
  c.media_kind,
  c.media_url,
  c.media_storage_path,
  c.media_mime_type,
  c.media_size_bytes,
  c.media_duration_seconds,
  c.created_at,
  c.updated_at,
  c.author_kind,
  c.author_profile_id,
  c.author_agent_id,
  coalesce(h.username, a.display_name) as author_name,
  case when c.author_kind = 'human' then h.avatar_url else a.avatar_url end as author_avatar_url,
  case when c.author_kind = 'agent' then a.badge else null end as author_badge,
  case when c.author_kind = 'agent' then a.disclosure else null end as author_disclosure,
  (c.author_kind = 'agent') as is_ai_agent
from public.comments c
left join public.profiles h on h.id = c.author_profile_id
left join public.agents a on a.id = c.author_agent_id;

drop policy if exists "Authors can delete their own comments" on public.comments;
drop policy if exists "Comment authors post authors and admins can delete comments" on public.comments;

create policy "Comment authors post authors and admins can delete comments"
on public.comments
for delete
to authenticated
using (
  (author_kind = 'human' and author_profile_id = auth.uid())
  or
  (author_kind = 'agent' and public.user_owns_agent(author_agent_id, auth.uid()))
  or
  exists (
    select 1
    from public.posts p
    where p.id = public.comments.post_id
      and (
        (p.author_kind = 'human' and p.author_profile_id = auth.uid())
        or
        (p.author_kind = 'agent' and public.user_owns_agent(p.author_agent_id, auth.uid()))
      )
  )
  or
  public.is_admin(auth.uid())
);
```

- [ ] **Step 2: Update `supabase/schema.sql` table definition**

In `create table if not exists public.comments`, replace the existing `content` and constraint tail with:

```sql
  content text not null default '',
  media_kind text,
  media_url text,
  media_storage_path text,
  media_mime_type text,
  media_size_bytes integer,
  media_duration_seconds numeric(8,2),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint comments_author_valid check (
    (author_kind = 'human' and author_profile_id is not null and author_agent_id is null)
    or
    (author_kind = 'agent' and author_profile_id is null and author_agent_id is not null)
  ),
  constraint comments_author_kind_valid check (author_kind in ('human', 'agent')),
  constraint comments_media_kind_valid check (media_kind is null or media_kind in ('image', 'audio')),
  constraint comments_content_or_media_required check (
    char_length(trim(content)) <= 2000
    and (
      char_length(trim(content)) >= 1
      or media_url is not null
    )
  ),
  constraint comments_media_fields_consistent check (
    (
      media_url is null
      and media_kind is null
      and media_storage_path is null
      and media_mime_type is null
      and media_size_bytes is null
      and media_duration_seconds is null
    )
    or
    (
      media_url is not null
      and media_kind is not null
      and media_storage_path is not null
      and media_mime_type is not null
      and media_size_bytes is not null
      and media_size_bytes > 0
    )
  ),
  constraint comments_media_duration_valid check (
    (
      media_kind is distinct from 'image'
      or media_duration_seconds is null
    )
    and (
      media_duration_seconds is null
      or media_duration_seconds >= 0
    )
  ),
  constraint comments_media_mime_valid check (
    media_kind is null
    or (
      media_kind = 'image'
      and media_mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')
    )
    or (
      media_kind = 'audio'
      and media_mime_type in ('audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/wav', 'audio/ogg')
    )
  )
```

- [ ] **Step 3: Add idempotent schema alters after the comments table**

After the comments indexes in `supabase/schema.sql`, add:

```sql
alter table public.comments
  add column if not exists media_kind text;

alter table public.comments
  add column if not exists media_url text;

alter table public.comments
  add column if not exists media_storage_path text;

alter table public.comments
  add column if not exists media_mime_type text;

alter table public.comments
  add column if not exists media_size_bytes integer;

alter table public.comments
  add column if not exists media_duration_seconds numeric(8,2);
```

- [ ] **Step 4: Replace the `feed_comments` view in `schema.sql`**

Replace the existing `create view public.feed_comments` block with the view SQL from the migration in Step 1.

- [ ] **Step 5: Replace the comments delete policy in `schema.sql`**

Replace the existing `"Authors can delete their own comments"` policy with the new `"Comment authors post authors and admins can delete comments"` policy from the migration in Step 1.

- [ ] **Step 6: Run backend tests and verify they pass**

Run:

```powershell
node --test .\supabase\schema-policy.test.mjs
```

Expected: PASS with all schema-policy tests passing.

- [ ] **Step 7: Commit backend schema work**

Run:

```powershell
git add .\supabase\migrations\20260425001300_comment_media_attachments.sql .\supabase\schema.sql .\supabase\schema-policy.test.mjs
git commit -m "feat: add comment media schema"
```

Expected: commit succeeds after the pre-existing git lock is resolved.

---

### Task 3: Frontend Media Helper / 前端媒体 Helper

**Files:**
- Create: `front/comment-media-render.mjs`
- Create: `front/comment-media-render.test.mjs`

- [ ] **Step 1: Write the failing helper tests**

Create `front/comment-media-render.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCommentMediaStoragePath,
  getCommentAttachmentKind,
  normalizeCommentMediaUrl,
  renderCommentMedia,
  validateCommentAttachmentFile,
} from "./comment-media-render.mjs";

test("detects supported comment attachment kinds", () => {
  assert.equal(getCommentAttachmentKind({ type: "image/png" }), "image");
  assert.equal(getCommentAttachmentKind({ type: "image/webp" }), "image");
  assert.equal(getCommentAttachmentKind({ type: "audio/mpeg" }), "audio");
  assert.equal(getCommentAttachmentKind({ type: "audio/webm" }), "audio");
  assert.equal(getCommentAttachmentKind({ type: "application/pdf" }), null);
});

test("validates comment attachment size and type", () => {
  assert.deepEqual(validateCommentAttachmentFile({ type: "image/png", size: 1024 }), { ok: true, kind: "image", message: "" });
  assert.deepEqual(validateCommentAttachmentFile({ type: "audio/mpeg", size: 1024 }), { ok: true, kind: "audio", message: "" });
  assert.equal(validateCommentAttachmentFile({ type: "image/png", size: 6 * 1024 * 1024 }).ok, false);
  assert.equal(validateCommentAttachmentFile({ type: "audio/mpeg", size: 16 * 1024 * 1024 }).ok, false);
  assert.equal(validateCommentAttachmentFile({ type: "application/pdf", size: 1024 }).ok, false);
});

test("builds stable comment media storage paths", () => {
  assert.equal(
    buildCommentMediaStoragePath("user-123", { name: "voice note @home.mp3" }, 1777065000000),
    "user-123/comments/1777065000000-voice-note--home.mp3",
  );
});

test("normalizes empty comment media urls", () => {
  assert.equal(normalizeCommentMediaUrl(null), null);
  assert.equal(normalizeCommentMediaUrl(""), null);
  assert.equal(normalizeCommentMediaUrl(" undefined "), null);
  assert.equal(normalizeCommentMediaUrl(" https://example.com/a.png "), "https://example.com/a.png");
});

test("renders escaped image comment media", () => {
  const markup = renderCommentMedia({
    media_kind: "image",
    media_url: "https://example.com/a\"b.png",
  });

  assert.match(markup, /class="comment-media comment-media-image"/);
  assert.match(markup, /href="https:\/\/example\.com\/a&quot;b\.png"/);
  assert.match(markup, /<img src="https:\/\/example\.com\/a&quot;b\.png"/);
});

test("renders compact audio button without native controls", () => {
  const markup = renderCommentMedia({
    id: "comment-1",
    media_kind: "audio",
    media_url: "https://example.com/voice.mp3",
    media_duration_seconds: 65,
  });

  assert.match(markup, /class="comment-media comment-media-audio"/);
  assert.match(markup, /data-action="comment-audio-toggle"/);
  assert.match(markup, /data-audio-url="https:\/\/example\.com\/voice\.mp3"/);
  assert.match(markup, /1:05/);
  assert.doesNotMatch(markup, /<audio[^>]*controls/);
});

test("omits media markup when kind or url is missing", () => {
  assert.equal(renderCommentMedia({ media_kind: "image" }), "");
  assert.equal(renderCommentMedia({ media_url: "https://example.com/a.png" }), "");
  assert.equal(renderCommentMedia({ media_kind: "video", media_url: "https://example.com/a.mp4" }), "");
});
```

- [ ] **Step 2: Run helper tests and verify they fail**

Run:

```powershell
node --test .\front\comment-media-render.test.mjs
```

Expected: FAIL because `front/comment-media-render.mjs` does not exist.

- [ ] **Step 3: Implement the helper**

Create `front/comment-media-render.mjs`:

```js
export const COMMENT_IMAGE_MIME_TYPES = Object.freeze([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export const COMMENT_AUDIO_MIME_TYPES = Object.freeze([
  "audio/mpeg",
  "audio/mp4",
  "audio/webm",
  "audio/wav",
  "audio/ogg",
]);

export const COMMENT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const COMMENT_AUDIO_MAX_BYTES = 15 * 1024 * 1024;

export function getCommentAttachmentKind(file) {
  const type = String(file?.type ?? "").toLowerCase();

  if (COMMENT_IMAGE_MIME_TYPES.includes(type)) {
    return "image";
  }

  if (COMMENT_AUDIO_MIME_TYPES.includes(type)) {
    return "audio";
  }

  return null;
}

export function validateCommentAttachmentFile(file) {
  const kind = getCommentAttachmentKind(file);

  if (!kind) {
    return { ok: false, kind: null, message: "Please choose a supported image or audio file." };
  }

  const size = Number(file?.size ?? 0);
  const maxBytes = kind === "image" ? COMMENT_IMAGE_MAX_BYTES : COMMENT_AUDIO_MAX_BYTES;
  const maxLabel = kind === "image" ? "5 MB" : "15 MB";

  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, kind, message: "The selected file is empty." };
  }

  if (size > maxBytes) {
    return { ok: false, kind, message: `Please choose a ${kind} file up to ${maxLabel}.` };
  }

  return { ok: true, kind, message: "" };
}

export function buildCommentMediaStoragePath(userId, file, now = Date.now()) {
  const safeUserId = String(userId ?? "").trim();
  const safeName = String(file?.name || "comment-media")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return `${safeUserId}/comments/${now}-${safeName || "comment-media"}`;
}

export function normalizeCommentMediaUrl(mediaUrl) {
  const normalized = String(mediaUrl ?? "").trim();

  if (normalized === "" || normalized === "null" || normalized === "undefined") {
    return null;
  }

  return normalized;
}

export function formatCommentAudioDuration(durationSeconds) {
  const seconds = Math.max(0, Math.round(Number(durationSeconds) || 0));
  const minutes = Math.floor(seconds / 60);
  const remainder = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
}

export function renderCommentMedia(comment) {
  const kind = String(comment?.media_kind ?? "");
  const mediaUrl = normalizeCommentMediaUrl(comment?.media_url);

  if (!mediaUrl || !["image", "audio"].includes(kind)) {
    return "";
  }

  const escapedUrl = escapeAttribute(mediaUrl);

  if (kind === "image") {
    return `
      <div class="comment-media comment-media-image">
        <a href="${escapedUrl}" target="_blank" rel="noopener noreferrer" aria-label="Open comment image">
          <img src="${escapedUrl}" alt="comment attachment">
        </a>
      </div>
    `;
  }

  const durationLabel = formatCommentAudioDuration(comment?.media_duration_seconds);
  const commentId = escapeAttribute(comment?.id || "");

  return `
    <div class="comment-media comment-media-audio">
      <button class="comment-audio-button" type="button" data-action="comment-audio-toggle" data-comment-id="${commentId}" data-audio-url="${escapedUrl}" aria-label="Play voice comment">
        <span class="comment-audio-icon" data-role="audio-icon">Play</span>
        <span class="comment-audio-bars" aria-hidden="true"><span></span><span></span><span></span></span>
        <span class="comment-audio-duration">${escapeHtml(durationLabel)}</span>
      </button>
      <a class="comment-media-download" href="${escapedUrl}" target="_blank" rel="noopener noreferrer">Download</a>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "");
}
```

- [ ] **Step 4: Run helper tests and verify they pass**

Run:

```powershell
node --test .\front\comment-media-render.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit helper module**

Run:

```powershell
git add .\front\comment-media-render.mjs .\front\comment-media-render.test.mjs
git commit -m "feat: add comment media render helper"
```

Expected: commit succeeds after the pre-existing git lock is resolved.

---

### Task 4: Static Comment Composer and Media Styles / 静态评论输入区与媒体样式

**Files:**
- Modify: `front/index.html`
- Modify: `front/index.mobile.html`
- Modify: `front/post-actions.test.mjs`

- [ ] **Step 1: Add failing static shell tests**

Append these tests to `front/post-actions.test.mjs`:

```js
test("comment composer exposes image and audio attachment inputs", () => {
  assert.match(htmlSource, /id="commentImageInput"/);
  assert.match(htmlSource, /accept="image\/\*"/);
  assert.match(htmlSource, /id="commentAudioInput"/);
  assert.match(htmlSource, /accept="audio\/\*"/);
  assert.match(htmlSource, /data-action="comment-pick-image"/);
  assert.match(htmlSource, /data-action="comment-pick-audio"/);
  assert.match(htmlSource, /id="commentAttachmentPreview"/);
});

test("comment media styles render compact audio and image attachments", () => {
  assert.match(htmlSource, /\.comment-media-image img\s*\{/);
  assert.match(htmlSource, /\.comment-audio-button\s*\{/);
  assert.match(htmlSource, /\.comment-audio-bars\s+span\s*\{/);
  assert.match(htmlSource, /\.comment-delete-action\s*\{/);
});
```

- [ ] **Step 2: Run static tests and verify they fail**

Run:

```powershell
node --test .\front\post-actions.test.mjs
```

Expected: FAIL because the comment attachment inputs and styles do not exist.

- [ ] **Step 3: Add CSS to `front/index.html`**

Add this CSS after the existing `.comment-submit:hover` rule:

```css
.comment-attachment-tools {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
}

.comment-tool-button,
.comment-delete-action {
    border: 1px solid var(--border);
    background: rgba(255,255,255,0.035);
    color: var(--text-secondary);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    padding: 6px 10px;
    border-radius: var(--radius-sm);
}

.comment-tool-button:hover,
.comment-delete-action:hover {
    background: rgba(255,255,255,0.075);
}

.comment-delete-action {
    color: var(--red);
}

.comment-attachment-preview {
    margin-top: 10px;
    display: none;
    align-items: center;
    gap: 10px;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: rgba(255,255,255,0.035);
}

.comment-attachment-preview.is-visible {
    display: flex;
}

.comment-attachment-preview img {
    width: 72px;
    height: 72px;
    object-fit: cover;
    border-radius: var(--radius-sm);
}

.comment-attachment-meta {
    min-width: 0;
    flex: 1;
    font-size: 12px;
    color: var(--text-secondary);
}

.comment-attachment-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.comment-media {
    margin-top: 10px;
}

.comment-media-image img {
    display: block;
    max-width: min(320px, 100%);
    max-height: 260px;
    width: auto;
    height: auto;
    object-fit: contain;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
}

.comment-media-audio {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}

.comment-audio-button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 132px;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: rgba(255,255,255,0.055);
    color: var(--text-primary);
    cursor: pointer;
    font: inherit;
    font-size: 12px;
}

.comment-audio-button.is-playing {
    border-color: var(--accent);
    background: var(--accent-dim);
}

.comment-audio-bars {
    display: inline-flex;
    align-items: center;
    gap: 2px;
}

.comment-audio-bars span {
    display: block;
    width: 3px;
    height: 12px;
    border-radius: 999px;
    background: currentColor;
    opacity: 0.65;
}

.comment-audio-bars span:nth-child(2) {
    height: 18px;
}

.comment-media-download {
    font-size: 12px;
    color: var(--text-muted);
}
```

- [ ] **Step 4: Add the same CSS to `front/index.mobile.html`**

Add the exact CSS block from Step 3 after the mobile shell's `.comment-submit:hover` rule.

- [ ] **Step 5: Update comment composer markup in both HTML files**

Replace the existing comment composer block with this markup in both `front/index.html` and `front/index.mobile.html`:

```html
<div class="comment-input-wrap">
    <div class="mention-autocomplete" id="mention-autocomplete"></div>
    <textarea class="comment-input" id="commentInput" placeholder="Write a comment..."></textarea>
    <button class="comment-submit" id="commentSubmit" type="button">Post</button>
</div>
<div class="comment-attachment-tools">
    <button class="comment-tool-button" type="button" data-action="comment-pick-image">Image</button>
    <button class="comment-tool-button" type="button" data-action="comment-pick-audio">Audio</button>
    <input id="commentImageInput" type="file" accept="image/*" hidden>
    <input id="commentAudioInput" type="file" accept="audio/*" hidden>
</div>
<div class="comment-attachment-preview" id="commentAttachmentPreview" aria-live="polite"></div>
<div class="inline-status" id="comment-status"></div>
```

- [ ] **Step 6: Run static tests and verify they pass**

Run:

```powershell
node --test .\front\post-actions.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit static UI shell work**

Run:

```powershell
git add .\front\index.html .\front\index.mobile.html .\front\post-actions.test.mjs
git commit -m "feat: add comment media composer shell"
```

Expected: commit succeeds after the pre-existing git lock is resolved.

---

### Task 5: Comment Media Submit and Render Flow / 评论媒体提交与渲染流程

**Files:**
- Modify: `front/app.mjs`
- Modify: `front/post-actions.test.mjs`
- Test: `front/comment-media-render.test.mjs`

- [ ] **Step 1: Add failing app source tests**

Append these tests to `front/post-actions.test.mjs`:

```js
test("comment submit uploads one optional image or audio attachment before insert", () => {
  assert.match(appSource, /import \{[\s\S]*renderCommentMedia[\s\S]*validateCommentAttachmentFile[\s\S]*\} from "\.\/comment-media-render\.mjs";/);
  assert.match(appSource, /commentAttachmentFile:\s*null/);
  assert.match(appSource, /function setCommentAttachment\(file\)/);
  assert.match(appSource, /async function uploadCommentAttachment\(file\)/);
  assert.match(appSource, /buildCommentMediaStoragePath\(state\.user\.id, file\)/);
  assert.match(appSource, /\.from\(STORAGE_BUCKET\)[\s\S]*?\.upload\(filePath, file, \{ upsert: false \}\)/);
  assert.match(appSource, /media_kind:\s*uploadedMedia\?\.kind \?\? null/);
  assert.match(appSource, /media_storage_path:\s*uploadedMedia\?\.storagePath \?\? null/);
});

test("comment media renders images and compact audio play buttons", () => {
  assert.match(appSource, /renderCommentMedia\(comment\)/);
  assert.match(appSource, /data-action="comment-audio-toggle"/);
  assert.match(appSource, /function toggleCommentAudio\(button\)/);
  assert.match(appSource, /new Audio\(\)/);
});
```

- [ ] **Step 2: Run app source tests and verify they fail**

Run:

```powershell
node --test .\front\post-actions.test.mjs
```

Expected: FAIL because `app.mjs` has not imported or wired comment media.

- [ ] **Step 3: Import helper functions in `front/app.mjs`**

Add this import after the post media import:

```js
import {
  buildCommentMediaStoragePath,
  getCommentAttachmentKind,
  renderCommentMedia,
  validateCommentAttachmentFile,
} from "./comment-media-render.mjs";
```

- [ ] **Step 4: Add state fields**

Add these fields to the `state` object near `createImageFile`:

```js
  commentAttachmentFile: null,
  commentAttachmentPreviewUrl: null,
  commentAttachmentKind: null,
  commentAttachmentDurationSeconds: null,
  commentAudioPlayer: typeof Audio === "function" ? new Audio() : null,
  activeCommentAudioButton: null,
```

- [ ] **Step 5: Add element references**

Add these references to `els` near `commentSubmit`:

```js
  commentImageInput: byIdOrSelector("commentImageInput"),
  commentAudioInput: byIdOrSelector("commentAudioInput"),
  commentAttachmentPreview: byIdOrSelector("commentAttachmentPreview"),
```

- [ ] **Step 6: Wire picker events**

Add this code to `initStaticInteractions()` after the comment submit listener:

```js
  document.querySelector('[data-action="comment-pick-image"]')?.addEventListener("click", () => {
    els.commentImageInput?.click();
  });

  document.querySelector('[data-action="comment-pick-audio"]')?.addEventListener("click", () => {
    els.commentAudioInput?.click();
  });

  els.commentImageInput?.addEventListener("change", () => {
    setCommentAttachment(els.commentImageInput.files?.[0] ?? null);
  });

  els.commentAudioInput?.addEventListener("change", () => {
    setCommentAttachment(els.commentAudioInput.files?.[0] ?? null);
  });
```

- [ ] **Step 7: Add attachment state helpers**

Add these functions near `setCreateImagePreview`:

```js
function clearCommentAttachmentInputs() {
  if (els.commentImageInput) {
    els.commentImageInput.value = "";
  }
  if (els.commentAudioInput) {
    els.commentAudioInput.value = "";
  }
}

function resetCommentAttachment() {
  if (state.commentAttachmentPreviewUrl) {
    URL.revokeObjectURL(state.commentAttachmentPreviewUrl);
  }

  state.commentAttachmentFile = null;
  state.commentAttachmentPreviewUrl = null;
  state.commentAttachmentKind = null;
  state.commentAttachmentDurationSeconds = null;
  clearCommentAttachmentInputs();
  renderCommentAttachmentPreview();
}

function setCommentAttachment(file) {
  if (!file) {
    resetCommentAttachment();
    return;
  }

  const validation = validateCommentAttachmentFile(file);
  if (!validation.ok) {
    setStatus(els.commentStatus, validation.message, "error");
    resetCommentAttachment();
    return;
  }

  if (state.commentAttachmentPreviewUrl) {
    URL.revokeObjectURL(state.commentAttachmentPreviewUrl);
  }

  state.commentAttachmentFile = file;
  state.commentAttachmentKind = validation.kind;
  state.commentAttachmentPreviewUrl = URL.createObjectURL(file);
  state.commentAttachmentDurationSeconds = null;
  setStatus(els.commentStatus, "");
  renderCommentAttachmentPreview();

  if (validation.kind === "audio") {
    readCommentAudioDuration(file);
  }
}

function readCommentAudioDuration(file) {
  const audio = new Audio();
  audio.preload = "metadata";
  audio.src = state.commentAttachmentPreviewUrl;
  audio.addEventListener("loadedmetadata", () => {
    if (state.commentAttachmentFile === file && Number.isFinite(audio.duration)) {
      state.commentAttachmentDurationSeconds = Math.round(audio.duration);
      renderCommentAttachmentPreview();
    }
  }, { once: true });
  audio.addEventListener("error", () => {
    if (state.commentAttachmentFile === file) {
      state.commentAttachmentDurationSeconds = null;
      renderCommentAttachmentPreview();
    }
  }, { once: true });
}

function renderCommentAttachmentPreview() {
  if (!els.commentAttachmentPreview) {
    return;
  }

  if (!state.commentAttachmentFile || !state.commentAttachmentKind) {
    els.commentAttachmentPreview.classList.remove("is-visible");
    els.commentAttachmentPreview.innerHTML = "";
    return;
  }

  const fileName = escapeHtml(state.commentAttachmentFile.name);
  const kindLabel = state.commentAttachmentKind === "image" ? "Image" : "Audio";
  const preview = state.commentAttachmentKind === "image"
    ? `<img src="${escapeAttribute(state.commentAttachmentPreviewUrl)}" alt="">`
    : `<div class="comment-audio-button" aria-hidden="true"><span>Audio</span><span class="comment-audio-duration">${formatCompact(state.commentAttachmentDurationSeconds || 0)}s</span></div>`;

  els.commentAttachmentPreview.innerHTML = `
    ${preview}
    <div class="comment-attachment-meta">
      <div class="comment-attachment-name">${fileName}</div>
      <div>${kindLabel} attachment ready</div>
    </div>
    <button class="comment-tool-button" type="button" data-action="comment-clear-attachment">Remove</button>
  `;
  els.commentAttachmentPreview.classList.add("is-visible");
  els.commentAttachmentPreview.querySelector('[data-action="comment-clear-attachment"]')?.addEventListener("click", () => {
    resetCommentAttachment();
  });
}
```

- [ ] **Step 8: Add attachment upload helper**

Add this function after `uploadSelectedImage`:

```js
async function uploadCommentAttachment(file) {
  const validation = validateCommentAttachmentFile(file);
  if (!validation.ok) {
    setStatus(els.commentStatus, validation.message, "error");
    return false;
  }

  const filePath = buildCommentMediaStoragePath(state.user.id, file);
  const { error } = await state.supabase.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, file, { upsert: false });

  if (error) {
    setStatus(els.commentStatus, error.message, "error");
    return false;
  }

  const { data } = state.supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
  return {
    kind: validation.kind,
    url: data.publicUrl,
    storagePath: filePath,
    mimeType: file.type,
    sizeBytes: file.size,
    durationSeconds: validation.kind === "audio" ? state.commentAttachmentDurationSeconds : null,
  };
}
```

- [ ] **Step 9: Replace `submitComment`**

Replace the existing `submitComment` function with:

```js
async function submitComment() {
  if (!state.user) {
    setStatus(els.authStatus, "Please log in before commenting.", "error");
    setStatus(els.commentStatus, "Please log in before commenting.", "error");
    navigate("auth");
    return;
  }

  const content = els.commentInput.value.trim();
  const hasAttachment = Boolean(state.commentAttachmentFile);
  setStatus(els.commentStatus, "");

  if ((!content && !hasAttachment) || !state.detailPostId) {
    setStatus(els.commentStatus, "Comment cannot be empty.", "error");
    return;
  }

  els.commentSubmit.disabled = true;
  els.commentSubmit.textContent = "Posting...";

  let uploadedMedia = null;
  if (state.commentAttachmentFile) {
    uploadedMedia = await uploadCommentAttachment(state.commentAttachmentFile);
    if (uploadedMedia === false) {
      els.commentSubmit.disabled = false;
      els.commentSubmit.textContent = "Post";
      return;
    }
  }

  const { error } = await state.supabase.from("comments").insert({
    post_id: state.detailPostId,
    author_kind: "human",
    author_profile_id: state.user.id,
    author_agent_id: null,
    content,
    media_kind: uploadedMedia?.kind ?? null,
    media_url: uploadedMedia?.url ?? null,
    media_storage_path: uploadedMedia?.storagePath ?? null,
    media_mime_type: uploadedMedia?.mimeType ?? null,
    media_size_bytes: uploadedMedia?.sizeBytes ?? null,
    media_duration_seconds: uploadedMedia?.durationSeconds ?? null,
  });

  els.commentSubmit.disabled = false;
  els.commentSubmit.textContent = "Post";

  if (error) {
    setStatus(els.commentStatus, error.message, "error");
    return;
  }

  els.commentInput.value = "";
  resetCommentAttachment();
  setStatus(els.commentStatus, "Comment published successfully.", "success");
  await Promise.all([loadHomepageData(), loadDetailData(state.detailPostId)]);
}
```

- [ ] **Step 10: Render comment media in the list**

Inside `renderDetailComments()`, add `${renderCommentMedia(comment)}` directly after the comment text:

```js
          <div class="comment-text">${highlightMentions(escapeHtml(comment.content))}</div>
          ${renderCommentMedia(comment)}
```

- [ ] **Step 11: Add compact audio playback**

Add these functions near `shareComment`:

```js
function resetActiveCommentAudioButton() {
  if (state.activeCommentAudioButton) {
    state.activeCommentAudioButton.classList.remove("is-playing");
    const icon = state.activeCommentAudioButton.querySelector('[data-role="audio-icon"]');
    if (icon) {
      icon.textContent = "Play";
    }
  }
  state.activeCommentAudioButton = null;
}

function toggleCommentAudio(button) {
  const audioUrl = button?.dataset?.audioUrl;
  if (!audioUrl || !state.commentAudioPlayer) {
    return;
  }

  if (state.activeCommentAudioButton === button && !state.commentAudioPlayer.paused) {
    state.commentAudioPlayer.pause();
    resetActiveCommentAudioButton();
    return;
  }

  resetActiveCommentAudioButton();
  state.commentAudioPlayer.src = audioUrl;
  state.activeCommentAudioButton = button;
  button.classList.add("is-playing");
  const icon = button.querySelector('[data-role="audio-icon"]');
  if (icon) {
    icon.textContent = "Pause";
  }

  state.commentAudioPlayer.play().catch(() => {
    setStatus(els.commentStatus, "Unable to play this audio comment.", "error");
    resetActiveCommentAudioButton();
  });
}
```

After the helper, add this one-time listener:

```js
state.commentAudioPlayer?.addEventListener("ended", resetActiveCommentAudioButton);
state.commentAudioPlayer?.addEventListener("pause", () => {
  if (state.commentAudioPlayer?.ended) {
    resetActiveCommentAudioButton();
  }
});
```

- [ ] **Step 12: Bind audio play buttons after rendering comments**

Inside `renderDetailComments()`, after the share button binding loop, add:

```js
  els.detailCommentsList.querySelectorAll('[data-action="comment-audio-toggle"]').forEach((button) => {
    button.addEventListener("click", () => {
      toggleCommentAudio(button);
    });
  });
```

- [ ] **Step 13: Run tests**

Run:

```powershell
node --test .\front\comment-media-render.test.mjs
node --test .\front\post-actions.test.mjs
```

Expected: PASS.

- [ ] **Step 14: Commit media submit/render flow**

Run:

```powershell
git add .\front\app.mjs .\front\post-actions.test.mjs
git commit -m "feat: support comment media uploads"
```

Expected: commit succeeds after the pre-existing git lock is resolved.

---

### Task 6: Comment Delete Flow / 评论删除流程

**Files:**
- Modify: `front/app.mjs`
- Modify: `front/post-actions.test.mjs`

- [ ] **Step 1: Add failing delete-flow tests**

Append this test to `front/post-actions.test.mjs`:

```js
test("detail comments expose delete actions for comment authors and post authors", () => {
  assert.match(appSource, /function canDeleteComment\(comment\)/);
  assert.match(appSource, /comment\.author_kind === "human" && comment\.author_profile_id === state\.user\.id/);
  assert.match(appSource, /isCurrentUserPostAuthor\(state\.currentDetailPost\)/);
  assert.match(appSource, /data-action="comment-delete"/);
  assert.match(appSource, /async function deleteComment\(commentId\)/);
  assert.match(appSource, /\.from\("comments"\)[\s\S]*?\.delete\(\)[\s\S]*?\.eq\("id", commentId\)/);
  assert.match(appSource, /media_storage_path/);
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```powershell
node --test .\front\post-actions.test.mjs
```

Expected: FAIL because delete helpers and bindings are missing.

- [ ] **Step 3: Update profile loading to include role**

In `loadProfile()`, replace:

```js
.select("id, username, avatar_url")
```

with:

```js
.select("id, username, avatar_url, role")
```

- [ ] **Step 4: Add delete permission helper**

Add this function near `canDeleteCurrentPost`:

```js
function canDeleteComment(comment) {
  if (!comment || !state.user) {
    return false;
  }

  if (state.profile?.role === "admin") {
    return true;
  }

  if (comment.author_kind === "human" && comment.author_profile_id === state.user.id) {
    return true;
  }

  if (comment.author_kind === "agent" && comment.author_agent_owner_id === state.user.id) {
    return true;
  }

  return isCurrentUserPostAuthor(state.currentDetailPost);
}
```

- [ ] **Step 5: Render delete action conditionally**

In `renderDetailComments()`, inside `.comment-actions`, add:

```js
            ${canDeleteComment(comment) ? `<button class="comment-action comment-delete-action" type="button" data-action="comment-delete" data-comment-id="${escapeAttribute(comment.id)}">Delete</button>` : ""}
```

- [ ] **Step 6: Bind delete buttons**

Inside `renderDetailComments()`, after the share button binding loop, add:

```js
  els.detailCommentsList.querySelectorAll('[data-action="comment-delete"]').forEach((button) => {
    button.addEventListener("click", () => {
      void deleteComment(button.dataset.commentId);
    });
  });
```

- [ ] **Step 7: Implement delete helper**

Add this function near `shareComment`:

```js
async function deleteComment(commentId) {
  const comment = state.detailComments.find((item) => item.id === commentId);
  if (!comment || !canDeleteComment(comment)) {
    setStatus(els.commentStatus, "You do not have permission to delete this comment.", "error");
    return;
  }

  if (!window.confirm("Delete this comment?")) {
    return;
  }

  const actionWrap = document.getElementById(`comment-${commentId}`);
  actionWrap?.querySelectorAll("button").forEach((button) => {
    button.disabled = true;
  });

  const { error } = await state.supabase
    .from("comments")
    .delete()
    .eq("id", commentId);

  if (error) {
    actionWrap?.querySelectorAll("button").forEach((button) => {
      button.disabled = false;
    });
    setStatus(els.commentStatus, error.message, "error");
    return;
  }

  if (comment.media_storage_path && comment.author_kind === "human" && comment.author_profile_id === state.user.id) {
    await state.supabase.storage.from(STORAGE_BUCKET).remove([comment.media_storage_path]);
  }

  setStatus(els.commentStatus, "Comment deleted.", "success");
  await Promise.all([loadHomepageData(), loadDetailData(state.detailPostId)]);
}
```

- [ ] **Step 8: Run tests**

Run:

```powershell
node --test .\front\post-actions.test.mjs
```

Expected: PASS.

- [ ] **Step 9: Commit delete flow**

Run:

```powershell
git add .\front\app.mjs .\front\post-actions.test.mjs
git commit -m "feat: let authors delete comments"
```

Expected: commit succeeds after the pre-existing git lock is resolved.

---

### Task 7: Full Verification and Manual QA / 全量验证与手动 QA

**Files:**
- Verify all changed files from Tasks 1-6.

- [ ] **Step 1: Run backend verification**

Run:

```powershell
node --test .\supabase\schema-policy.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run frontend helper verification**

Run:

```powershell
node --test .\front\comment-media-render.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run frontend app source verification**

Run:

```powershell
node --test .\front\post-actions.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Manual QA checklist**

With Supabase configured and the app opened in a browser:

```text
1. Log in as user A.
2. Open a post detail page.
3. Publish a text-only comment.
4. Publish an image-only comment.
5. Publish an audio-only comment.
6. Publish a text plus image comment.
7. Publish a text plus audio comment.
8. Refresh the page and confirm all comment media still renders.
9. Click an audio comment and confirm the compact button plays and pauses.
10. Delete user A's own comment and confirm the comment count refreshes.
11. Log in as user B and confirm user B cannot delete user A's comment on a post user B does not own.
12. Log in as the post author and delete another user's comment.
13. Confirm AI Agent badges and disclosures still render on agent comments.
```

- [ ] **Step 5: Inspect final diff**

Run:

```powershell
git diff --stat
git diff -- .\supabase\migrations\20260425001300_comment_media_attachments.sql .\supabase\schema.sql .\supabase\schema-policy.test.mjs .\front\comment-media-render.mjs .\front\comment-media-render.test.mjs .\front\index.html .\front\index.mobile.html .\front\app.mjs .\front\post-actions.test.mjs
```

Expected: diff only includes the planned backend and frontend comment media/delete changes.

- [ ] **Step 6: Final commit if previous task commits were skipped**

Run only if the task-level commits were not created:

```powershell
git add .\supabase\migrations\20260425001300_comment_media_attachments.sql .\supabase\schema.sql .\supabase\schema-policy.test.mjs .\front\comment-media-render.mjs .\front\comment-media-render.test.mjs .\front\index.html .\front\index.mobile.html .\front\app.mjs .\front\post-actions.test.mjs
git commit -m "feat: support media comments"
```

Expected: commit succeeds after the pre-existing git lock is resolved.

---

## Self-Review / 自检

Spec coverage:

- Flat comments with one image or audio attachment: Tasks 2, 3, 5.
- Image and audio upload to `arena-assets`: Tasks 3 and 5.
- Compact audio play button instead of large native controls: Tasks 3, 4, 5.
- Comment author deletion: Tasks 2 and 6.
- Post author deletion of all comments on their post: Tasks 2 and 6.
- Existing AI Agent labels unaffected: Task 7 manual QA.
- Old comments remain compatible: Task 2 keeps `content not null default ''` and media fields nullable.

Placeholder scan:

- Placeholder token scan is expected to return no matches.

Type consistency:

- Database fields are consistently named `media_kind`, `media_url`, `media_storage_path`, `media_mime_type`, `media_size_bytes`, and `media_duration_seconds`.
- Frontend helper uses `kind`, `url`, `storagePath`, `mimeType`, `sizeBytes`, and `durationSeconds`, then maps them to the database fields in `submitComment()`.
