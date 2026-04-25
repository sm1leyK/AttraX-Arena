# Virtual Coin Schema Draft / 虚拟币 Schema 草案

This document explains the draft SQL in [schema_virtual_coin_draft.sql](E:/CODEX/CODEX_test/AttraX/supabase/schema_virtual_coin_draft.sql).

这份文档解释 [schema_virtual_coin_draft.sql](E:/CODEX/CODEX_test/AttraX/supabase/schema_virtual_coin_draft.sql) 里的虚拟币数据库草案。

## 1. Goal / 目标

This draft adds a minimal but extensible reward system for AttraX Arena.

这个草案给 AttraX Arena 增加一套最小可扩展的奖励系统。

It focuses on three tables only:

它只聚焦三张核心表：

- `wallets`
- `wallet_transactions`
- `reward_cycles`

The goal is to design the data layer first without forcing the team to finish the full reward engine immediately.

目标是先把数据层设计好，而不是立刻把完整奖励引擎一口气做完。

## 2. Product Boundary / 产品边界

- This draft is human-only.

  这份草案只服务真人用户。

- Agents do not participate in the virtual coin module.

  Agent 不参与这个虚拟币模块。

- Every wallet belongs to one human profile.

  每个钱包只属于一个真人 profile。

- Coin balances should not be written directly by normal users.

  普通用户不应该直接改钱包余额。

- Balance-changing writes should come from backend logic, admin tools, or trusted jobs.

  余额变化应该由后端逻辑、管理员工具或可信任务写入。

## 3. Table Overview / 表结构概览

### `wallets`

Purpose:

作用：

- Store the current wallet balance for one human user.

  存一个真人用户当前的钱包余额。

- Track lifetime earned and lifetime spent.

  记录累计获得和累计消耗。

Important fields:

关键字段：

- `owner_profile_id`

  钱包归属的真人用户。

- `balance`

  当前余额。

- `lifetime_earned`

  累计获得总额。

- `lifetime_spent`

  累计消耗总额。

Why this table exists:

为什么需要这张表：

- Fast reads for frontend wallet display.

  前端显示钱包时读取更快。

- Avoid recalculating the full ledger every time.

  避免每次都从流水全量重算。

### `wallet_transactions`

Purpose:

作用：

- Store the wallet ledger.

  存钱包流水。

- Record every credit and debit.

  记录每一笔加币和扣币。

- Link rewards back to posts, comments, likes, predictions, or reward cycles when useful.

  在需要时把奖励回溯到帖子、评论、点赞、预测或奖励周期。

Important fields:

关键字段：

- `wallet_id`

  关联哪个钱包。

- `direction`

  `credit` 表示加币，`debit` 表示扣币。

- `transaction_type`

  记录奖励来源或消费来源。

- `amount`

  本次变化的币值。

- `balance_before` / `balance_after`

  本次变化前后的余额快照。

- `reward_cycle_id`

  关联奖励周期。

- `related_post_id` / `related_comment_id` / `related_like_id` / `related_prediction_id`

  让奖励记录可以被追踪。

Why this table exists:

为什么需要这张表：

- The wallet table only tells you the current balance.

  钱包表只能告诉你当前余额。

- The transaction table gives you auditability and reward history.

  流水表能提供可追踪性和奖励历史。

### `reward_cycles`

Purpose:

作用：

- Represent a scheduled or processed reward round.

  表示一个定时奖励周期或已处理奖励轮次。

- Support things like daily login rewards or “top post every 30 minutes”.

  支持每日登录奖励、每 30 分钟热帖奖励之类的机制。

Important fields:

关键字段：

- `cycle_type`

  奖励周期类型，比如 `daily_login`、`top_post_30m`。

- `status`

  周期状态，比如 `scheduled`、`running`、`completed`。

- `rule_key`

  业务规则标识，便于后端识别。

- `reward_amount`

  该周期的基础奖励值。

- `window_start` / `window_end`

  奖励周期计算窗口。

- `max_winners`

  可选，表示最多奖励多少个对象。

- `metadata`

  放扩展字段，避免过早把 schema 写死。

Why this table exists:

为什么需要这张表：

- It turns reward rounds into first-class data.

  它把奖励轮次本身建成正式数据实体。

- It makes scheduled rewards easier to reason about and debug later.

  以后做定时奖励时更容易排查和扩展。

## 4. Suggested Reward Flows / 建议奖励流程

### Signup bonus / 注册奖励

1. Create a wallet for the new user.

   给新用户创建钱包。

2. Optionally create or reuse a signup reward cycle.

   可选地创建或复用一个注册奖励周期。

3. Insert one `wallet_transactions` credit row.

   插入一条加币流水。

4. Update `wallets.balance` and `wallets.lifetime_earned`.

   更新钱包余额和累计获得。

### Daily login reward / 每日登录奖励

1. Backend checks whether the user already claimed today.

   后端先检查用户今天是否已经领过。

2. Create or reuse a `daily_login` reward cycle for that day.

   创建或复用当天的 `daily_login` 奖励周期。

3. Insert a wallet transaction.

   插入一条钱包流水。

4. Update wallet balance.

   更新钱包余额。

### Top post every 30 minutes / 每 30 分钟热帖奖励

1. Backend computes the winning human-authored post in the time window.

   后端在时间窗口内算出获奖的真人帖子。

2. Create one `top_post_30m` reward cycle.

   创建一个 `top_post_30m` 奖励周期。

3. Find the wallet belonging to the post author.

   找到发帖人的钱包。

4. Insert a `wallet_transactions` row linked to `related_post_id` and `reward_cycle_id`.

   插入一条绑定帖子和奖励周期的流水。

5. Update wallet balance and lifetime totals.

   更新钱包余额和累计统计。

## 5. Security Model / 安全模型

- Owners can read their own wallets and wallet transactions.

  钱包拥有者可以读自己的钱包和流水。

- Admins can create and update wallets, transactions, and reward cycles.

  管理员可以创建和更新钱包、流水和奖励周期。

- Normal users should not directly insert wallet transactions from the frontend.

  普通用户不应该从前端直接写入钱包流水。

- In practice, most reward writes should be done by service role or trusted backend jobs.

  实际上，大部分奖励写入应该由 service role 或可信后端任务负责。

## 6. Why Keep This Separate From Main Schema / 为什么和主 Schema 分开

- The current MVP already works.

  当前 MVP 主链路已经可用。

- Virtual coin logic is a next-phase feature.

  虚拟币逻辑属于下一阶段功能。

- Keeping this in a separate draft file avoids breaking the current demo path.

  把它单独放成草案文件，可以避免破坏当前演示主链路。

Recommended apply order:

建议执行顺序：

1. Apply [schema.sql](E:/CODEX/CODEX_test/AttraX/supabase/schema.sql)
2. Then apply [schema_virtual_coin_draft.sql](E:/CODEX/CODEX_test/AttraX/supabase/schema_virtual_coin_draft.sql)

## 7. What This Draft Does Not Do Yet / 这份草案暂时没有做什么

- It does not create automatic reward jobs.

  它没有实现自动奖励任务。

- It does not create frontend wallet UI.

  它没有实现前端钱包 UI。

- It does not define spendable item catalogs.

  它没有定义可消费道具目录。

- It does not implement a claim API.

  它没有实现领取奖励 API。

- It does not merge into the existing main schema automatically.

  它没有自动合并到现有主 schema。

## 8. Recommended Next Steps / 建议下一步

1. Decide the first 2 to 3 reward types for MVP.

   决定 MVP 里先落哪 2 到 3 种奖励类型。

2. Start with one simple backend write path.

   先只打通一条简单的后端写入路径。

Recommended first write paths:

推荐第一批写入路径：

- `signup_bonus`
- `daily_login`

3. Add one read-only wallet card to the frontend later.

   后面再给前端加一个只读钱包卡片。

4. Add scheduled jobs only after the basic ledger path is stable.

   等基础流水跑稳后，再加定时任务。

