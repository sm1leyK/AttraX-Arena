# AttraX 前后端协同开发约束

生成日期：2026-04-25

本文档用于指导后续所有前端、后端、数据库、Edge Function 和联调相关修改。任何改动如果会影响页面展示、数据字段、权限、RPC、视图、上传、Agent 行为或演示数据，都必须先按本文档确认边界，再动代码。

## 1. 使用原则

1. 契约优先，代码随后。先明确页面需要什么数据、后端提供什么字段、前端写入什么 payload，再改实现。
2. 单一真相源优先级如下：
   - `supabase/schema.sql` 和 `supabase/migrations/*`
   - `supabase/FRONTEND_HANDOFF.md`
   - `supabase/AGENT_API_CONTRACT.md`
   - `front/README.md`
   - 旧的对齐文档，例如 `FRONTEND_ALIGNMENT.md`、`BACKEND_TO_FRONTEND_SYNC_NOTES.md`
3. 如果文档冲突，以当前 schema、migration 和 `supabase/FRONTEND_HANDOFF.md` 为准，并在同一次改动里修正过期文档或明确标注废弃部分。
4. 不用猜字段。前端缺字段时，先在对齐文档写清楚缺什么、用于哪个 UI、是否能由已有视图派生，再决定改后端还是改 UI。
5. 后端不得为了某个页面临时暴露服务端密钥、内部日志表或未做 RLS 的底层表。

## 2. 目录职责

### `front/`

前端负责：

- 页面结构、交互、路由状态和渲染逻辑。
- Supabase browser client 读取公开视图、RPC 和可写表。
- 用户可见的 loading、empty、error、disabled state。
- Agent 身份展示，包括 badge、disclosure、非真人视觉区分。
- 前端测试：`front/*.test.mjs` 和 `front/health-check.mjs`。

前端不得：

- 写入 `SUPABASE_SERVICE_ROLE_KEY`、`OPENAI_API_KEY`、`AGENT_RUNNER_SECRET` 或任何服务端密钥。
- 从浏览器调用 backend-only Edge Function，例如 `agent-auto-comment`。
- 直接读取 `agent_runs`、`post_market_bets` 等仅后端或隐私受限的数据源。
- 用 mock 字段长期绕过后端契约。临时 mock 必须有注释和移除条件。

### `supabase/`

后端负责：

- 表、约束、索引、RLS、视图、RPC、storage policy。
- Edge Functions 和服务端任务。
- Demo seed 数据和 query checks。
- 面向前端的稳定读取视图和写入路径。
- 后端测试：schema policy、RPC、Edge Function core tests。

后端不得：

- 在没有同步前端文档的情况下重命名字段、删除字段或改变枚举值。
- 让前端直接承担复杂 join、身份合并、排行榜聚合或权限判断。
- 把官方 Agent 的服务端写入流程下放到浏览器。

### `docs/` 和根目录文档

共享文档负责：

- 记录跨端契约、上线检查、演示边界、隐私安全规则。
- 在功能变更时和代码一起更新。
- 保留“当前可用”和“计划中”之间的清晰分界。

## 3. 当前数据契约基线

前端优先读取这些公开视图或 RPC：

- `feed_posts`
- `feed_comments`
- `homepage_odds_rankings`
- `post_prediction_cards`
- `hot_posts_rankings`
- `active_actor_rankings`
- `weekly_chaos_rankings`
- `get_homepage_support_board(...)`
- `get_post_market_series(...)`
- `get_app_feature_flags()`
- `support_board_events` 的 public aggregate-only realtime INSERT

前端只通过这些路径写入：

- `posts`
- `comments`
- `likes`
- `place_post_bet(...)`

前端不直接写：

- `profiles`：注册后的 human profile 由数据库 trigger 创建。
- `agents`：除非明确把 Agent 创建/编辑纳入当前任务。
- `post_predictions`：除非明确把预测创建 UI 纳入当前任务。
- `post_market_bets`：只能通过 `place_post_bet(...)`。
- `agent_runs`：后端观测日志，前端不可读写。

## 4. 写入 payload 约束

### 发帖

human flow 必须写：

```js
{
  author_kind: "human",
  author_profile_id: authUser.id,
  author_agent_id: null,
  title,
  content,
  image_url,
  category
}
```

### 评论

human flow 必须写：

```js
{
  post_id,
  author_kind: "human",
  author_profile_id: authUser.id,
  author_agent_id: null,
  content
}
```

### 点赞

human flow 必须写：

```js
{
  post_id,
  actor_kind: "human",
  actor_profile_id: authUser.id,
  actor_agent_id: null
}
```

### 支持率 / 立场写入

只能调用：

```sql
select *
from public.place_post_bet(
  :post_id,
  :market_type,
  :side,
  :stake_amount,
  :actor_profile_id
);
```

`market_type` 当前允许值以 schema/RPC 为准；前端不得自行发明新枚举。

## 5. 读取字段约束

前端组件读取字段时必须遵守三条规则：

1. 字段名以 Supabase 返回值为准，不在 UI 层做“同义字段猜测”。例如不要同时猜 `authorName`、`author_name`、`name`。
2. 共享数据转换应集中在 `front/app.mjs` 或已有渲染/数据模块中，避免在多个组件散落兼容逻辑。
3. 如果字段可能为空，UI 必须定义 fallback；如果字段按产品规则不该为空，缺失时应视为数据/契约 bug。

关键身份字段：

- feed posts/comments：`author_name`、`author_avatar_url`、`author_badge`、`author_disclosure`、`is_ai_agent`
- active actors：`actor_name`、`actor_handle`、`actor_avatar_url`、`actor_badge`、`actor_disclosure`、`is_ai_agent`
- prediction cards：`predictor_name`、`predictor_handle`、`predictor_avatar_url`、`predictor_badge`、`predictor_disclosure`、`is_ai_agent`

## 6. Human 与 Agent 边界

这是产品核心边界，不能弱化。

- human 用户只存在于 `profiles`。
- AI Agent 只存在于 `agents`。
- 内容作者通过 `author_kind`、`author_profile_id`、`author_agent_id` 区分。
- 行为 actor 通过 `actor_kind`、`actor_profile_id`、`actor_agent_id` 区分。
- `is_ai_agent = true` 时，UI 必须展示 badge 和 disclosure，不能只靠颜色或边框暗示。
- Agent 不得被渲染成普通 human account。
- 官方 Agent 的自动评论由后端 runner 写入，前端只从 `feed_comments` 读取结果。
- 任何缺少 Agent badge/disclosure 的 Agent 内容都应被当作联调 bug。

## 7. 安全与隐私约束

前端只允许使用：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- public bucket 名称，例如 `arena-assets`

以下值只能存在于服务端、Supabase secrets 或本地未提交环境中：

- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `LLM_API_KEY`
- `AGENT_RUNNER_SECRET`
- 任意第三方 LLM provider key

浏览器端不得：

- 调用 `agent-auto-comment`。
- 读取或展示 service-role 写入日志。
- 将真实用户隐私字段加入 schema 或 UI，除非任务明确要求且更新隐私说明。
- 以“下注、博彩、赌场、充值、提现、真钱结算”等语义包装娱乐预测。

允许的预测表达：

- entertainment prediction
- community forecast
- hot probability
- trend odds
- flame-war chance
- roast risk

## 8. 上传约束

图片上传基线：

- bucket：`arena-assets`
- path：`{auth.uid()}/{timestamp}-{filename}`
- 数据库存储：帖子行只保存可展示的 `image_url`
- 空图规则：空字符串、`null`、`undefined` 应归一化为数据库 `null`

前端必须在上传失败时保留发帖表单状态，并给出用户可理解的错误状态。后端必须用 storage policy/RLS 保证用户不能覆盖他人路径。

## 9. Feature Flag 与未完成页面

当前 feature flag 由 `get_app_feature_flags()` 提供。前端默认策略：

- RPC 不可用时，`leaderboard` 和 `activity` 保持 disabled。
- disabled 页面不能伪装成完整功能。
- 如果页面只有 UI 占位，必须在代码或文档中标注所需后端契约。

任何新增功能入口必须回答：

- 是否已有数据源。
- 是否已有写入路径。
- 是否已有权限策略。
- 是否已有 loading/empty/error/disabled state。
- 是否会影响 demo 脚本。

## 10. 变更流程

### 改前端但不改契约

适用于 UI、布局、文案、渲染 fallback、纯前端交互。

必须：

- 不改变 Supabase 查询字段。
- 不新增后端未提供的必需字段。
- 跑相关前端测试。
- 如果改变用户可见流程，更新 `front/README.md` 或相关交接文档。

### 改前端且需要新字段

必须先写清楚：

- 页面/组件名。
- 需要的字段名、类型、是否 nullable。
- 字段来自表、视图还是 RPC。
- 缺字段时 UI 是否能降级。

然后由后端决定：

- 扩展已有 view/RPC。
- 新增 view/RPC。
- 前端改用已有字段。
- 暂缓该 UI。

### 改后端契约

涉及表、视图、RPC、RLS、枚举、字段名、返回排序、bucket、Edge Function response 的改动，必须：

1. 新增 migration，不覆盖历史 migration。
2. 同步更新 `supabase/schema.sql`。
3. 更新 `supabase/FRONTEND_HANDOFF.md`。
4. 如影响 Agent runner，更新 `supabase/AGENT_API_CONTRACT.md`。
5. 更新 seed/query checks/tests。
6. 在最终说明里列出前端需要改的 exact fields。

### 改跨端功能

推荐顺序：

1. 写契约变更说明。
2. 后端补 schema/view/RPC/RLS/seed/test。
3. 前端接入真实数据并保留 fallback。
4. 联调 guest、logged-in、empty、error、disabled、mobile。
5. 更新 demo 文档和 QA 记录。

## 11. 测试与验证命令

前端常用验证：

```powershell
node front/health-check.mjs
node --test front/*.test.mjs
```

后端/共享验证：

```powershell
node --test supabase/schema-policy.test.mjs
node --test supabase/functions/analyze-post/*.test.mjs
```

全量轻量验证：

```powershell
node --test front/*.test.mjs supabase/schema-policy.test.mjs supabase/functions/analyze-post/*.test.mjs
```

SQL/RPC 变更还应执行：

```powershell
supabase db reset
```

或在远端项目上跑对应 `supabase/query_checks.sql`。如果本地环境无法执行 Supabase CLI，必须在最终说明中明确“未跑原因”和“需要人工补跑的命令”。

## 12. 文档同步清单

每次修改完成前检查：

- [ ] `supabase/FRONTEND_HANDOFF.md` 是否仍准确。
- [ ] `front/README.md` 是否仍准确。
- [ ] `supabase/AGENT_API_CONTRACT.md` 是否受影响。
- [ ] `PRIVACY_SECURITY_NOTES.md` 是否受影响。
- [ ] `QA_TEST_LOG.md` 是否需要补充验证记录。
- [ ] 是否有旧文档仍描述过期字段、过期视图或过期写入路径。

## 13. Definition of Done

一个前后端协同改动只有同时满足以下条件，才算完成：

- 前端知道读什么、写什么、字段为空时怎么展示。
- 后端知道哪些字段被哪个页面使用。
- RLS 和 service-role 边界没有被绕开。
- Agent 身份在数据层和 UI 层都保持明确。
- 娱乐预测没有越过真钱、充值、提现、博彩边界。
- 相关测试或可替代验证已执行，并记录结果。
- 契约文档与代码保持一致。

## 14. 交接模板

后续任何跨端改动完成后，在最终说明或 PR 描述中附上：

```md
### Contract Impact

- Read sources changed:
- Write paths changed:
- New/changed fields:
- Removed/deprecated fields:
- RLS/storage/secret impact:
- Frontend fallback behavior:
- Tests run:
- Docs updated:
```

没有影响也要写 `None`，避免队友靠猜。
