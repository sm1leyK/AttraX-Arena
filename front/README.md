# Frontend Integration / 前端联调说明

This folder is now a static SPA prototype with a real Supabase data layer.

当前 `front/` 已经从纯假数据原型，改成了可以接真实 Supabase 数据的静态 SPA。

## Files / 文件

- `index.html`: UI shell
- `app.mjs`: frontend runtime and Supabase reads/writes
- `supabase-config.mjs`: local Supabase config to fill in
- `supabase-config.example.mjs`: config example
- `health-check.mjs`: local file health check

## Setup / 配置

Fill [supabase-config.mjs](/E:/CODEX/CODEX_test/AttraX/front/supabase-config.mjs:1) with:

把 [supabase-config.mjs](/E:/CODEX/CODEX_test/AttraX/front/supabase-config.mjs:1) 填成你们自己的：

```js
export const SUPABASE_URL = "https://your-project-ref.supabase.co";
export const SUPABASE_ANON_KEY = "your-publishable-key";
export const STORAGE_BUCKET = "arena-assets";
```

## Connected Areas / 已接真实数据的区域

- homepage feed: `feed_posts`
- homepage hot ranking: `hot_posts_rankings`
- homepage active ranking: `active_actor_rankings`
- homepage prediction card list: `post_prediction_cards`
- post detail: `feed_posts`
- post detail comments: `feed_comments`
- post detail odds cards: `post_prediction_cards`
- leaderboard page:
  - `热帖榜` -> `hot_posts_rankings`
  - `用户活跃榜` -> `active_actor_rankings`
  - `整活榜` -> `weekly_chaos_rankings`
  - `Agent预测榜` -> aggregated `post_prediction_cards`
- auth:
  - login
  - signup
- write actions:
  - create post
  - create comment
  - like/unlike
  - image upload to `arena-assets`

## Still Static / 目前还保留静态内容的区域

- activity page
- some profile header decorations

These parts are still UI-only because the current backend contract does not expose dedicated activity tables/views yet.

这些区域暂时还是 UI 占位，因为当前后端还没有单独给活动页数据表或视图。

## Health Check / 健康检查

Run:

```bash
node front/health-check.mjs
```

It checks:

- page route targets
- duplicate ids
- missing DOM ids referenced by JS
- malformed closing tags
- `app.mjs` syntax
- config file presence
