# Virtual Coin Minimal Rollout / 虚拟币最小落地方案

This document defines the smallest production path for the virtual coin system after the schema draft is accepted.

这份文档定义了虚拟币系统在草案通过后的最小落地路径。

The recommended first scope is:

建议第一阶段只做：

- `signup_bonus`
- `daily_login`

Do not start with a full reward engine, scheduled leaderboard rewards, or a spend shop.

不要一开始就做完整奖励引擎、定时热榜奖励或消费商城。

## 1. Goal / 目标

Build one safe, explainable, testable wallet flow for real human users.

给真人用户先落一条安全、可解释、可测试的钱包主链路。

The product story for MVP should be:

MVP 阶段的产品故事应该是：

- new user gets starter coins after signup
- logged-in user can claim one daily login reward
- frontend can read current balance and recent transactions

- 新用户注册后拿到起始虚拟币
- 已登录用户每天可以领一次登录奖励
- 前端能读当前余额和最近流水

## 2. Scope Boundary / 范围边界

Included:

包含：

- wallet creation for human users
- signup bonus
- daily login reward
- read-only wallet display
- recent transaction list

- 真人用户钱包创建
- 注册奖励
- 每日登录奖励
- 只读钱包展示
- 最近流水列表

Not included yet:

暂时不包含：

- top post reward automation
- scheduled jobs for leaderboard rewards
- spend store
- redeem codes
- agent wallets

- 热帖自动奖励
- 榜单定时任务
- 消费商城
- 兑换码
- Agent 钱包

## 3. Recommended Trigger Timing / 推荐触发时机

### A. Signup bonus / 注册奖励

Recommended trigger:

推荐触发方式：

- trusted backend flow after signup completes

  在注册完成后，由可信后端流程触发

Best options:

最佳实现方式：

1. backend server / Edge Function receives the signup completion event
2. backend ensures the profile already exists
3. backend creates wallet if missing
4. backend inserts the signup reward transaction if not already granted

1. 后端服务 / Edge Function 接到注册完成事件
2. 后端确认 profile 已存在
3. 如果钱包不存在则创建钱包
4. 如果注册奖励还没发过，则写入奖励流水

Avoid:

不要这样做：

- letting the browser directly insert wallet transactions

  不要让浏览器直接写钱包流水

### B. Daily login reward / 每日登录奖励

Recommended trigger:

推荐触发方式：

- when the user opens the app after login, call one trusted reward endpoint

  用户登录后打开应用时，调用一个可信奖励接口

Frontend behavior:

前端行为：

1. user logs in
2. frontend loads profile and session
3. frontend calls a protected reward endpoint such as `claimDailyLoginReward`
4. endpoint decides whether reward should be granted
5. frontend reloads wallet summary

1. 用户登录
2. 前端加载 profile 和 session
3. 前端调用一个受保护的奖励接口，比如 `claimDailyLoginReward`
4. 接口判断今天是否可以发奖励
5. 前端刷新钱包摘要

This keeps the decision on the backend.

这样可以把发奖判断放在后端。

## 4. Suggested Write Order / 建议写表顺序

### Signup bonus write order / 注册奖励写入顺序

1. confirm `auth user` and `profile` exist

   确认 `auth user` 和 `profile` 已存在

2. find wallet by `owner_profile_id`

   用 `owner_profile_id` 查钱包

3. if wallet does not exist, create wallet with zero balance

   如果钱包不存在，先创建一个余额为 0 的钱包

4. check whether a `signup_bonus` transaction already exists for this wallet

   检查这个钱包是否已经有 `signup_bonus` 流水

5. if no prior reward exists:

   如果之前没发过：

   - insert one `reward_cycles` row if you want signup rewards tracked by campaign round
   - or skip `reward_cycles` for the simplest MVP
   - insert one `wallet_transactions` credit row
   - update `wallets.balance`
   - update `wallets.lifetime_earned`
   - update `wallets.last_rewarded_at`

   - 如果你想追踪活动轮次，就插入一条 `reward_cycles`
   - 如果想要最简单 MVP，也可以先不写 `reward_cycles`
   - 插入一条 `wallet_transactions` 加币流水
   - 更新 `wallets.balance`
   - 更新 `wallets.lifetime_earned`
   - 更新 `wallets.last_rewarded_at`

### Daily login write order / 每日登录奖励写入顺序

1. confirm user session

   确认用户会话有效

2. find wallet by `owner_profile_id`

   用 `owner_profile_id` 找钱包

3. if wallet does not exist, create it first

   如果钱包不存在，先创建钱包

4. compute today's UTC window

   计算当天 UTC 时间窗口

5. check whether a `daily_login` transaction already exists for this wallet in today's window

   检查这个钱包今天的时间窗口里是否已经有 `daily_login` 流水

6. if already exists, return "already claimed"

   如果已存在，返回“今天已领取”

7. otherwise:

   否则：

   - insert or reuse one `daily_login` reward cycle for today
   - insert one `wallet_transactions` credit row
   - update wallet totals
   - return the new balance

   - 为今天插入或复用一条 `daily_login` 奖励周期
   - 插入一条 `wallet_transactions` 加币流水
   - 更新钱包统计
   - 返回新余额

## 5. Idempotency Rules / 幂等规则

This part is critical.

这一部分非常关键。

### Signup bonus idempotency / 注册奖励幂等

A user must receive signup bonus at most once.

一个用户的注册奖励最多只能发一次。

Recommended rule:

推荐规则：

- treat `transaction_type = 'signup_bonus'` as one-time per wallet

  把 `transaction_type = 'signup_bonus'` 当成每个钱包只允许一次

Recommended guard:

推荐保护方式：

- before writing, query `wallet_transactions`
- if a `signup_bonus` row already exists for that wallet, stop

- 写入前先查 `wallet_transactions`
- 如果该钱包已经有 `signup_bonus`，就停止

Optional stronger rule:

可选的更强规则：

- add a partial unique index later if you decide signup bonus must always be unique

  如果以后确定注册奖励必须唯一，可以再加唯一索引

### Daily login idempotency / 每日登录幂等

A user must receive at most one daily login reward per UTC day.

一个用户每个 UTC 日最多领一次登录奖励。

Recommended rule:

推荐规则：

- use UTC day boundaries

  用 UTC 天界

- query existing `daily_login` rows in `[today_start, tomorrow_start)`

  查询 `[today_start, tomorrow_start)` 之间已有的 `daily_login` 流水

If one exists, do not write again.

如果已有一条，就不要重复写。

Optional stronger rule:

可选的更强规则：

- later add a `reward_date` field or dedicated claim table if daily rewards become business-critical

  如果后面每日奖励变成关键业务，可以再加 `reward_date` 字段或专门的 claim 表

## 6. RLS and Service Role Recommendation / RLS 与 Service Role 建议

### Recommended model / 推荐模型

- normal users can read their own wallet data
- normal users cannot directly write wallet balances or wallet transactions
- trusted backend uses service role or a secure server environment to write reward data

- 普通用户可以读自己的钱包数据
- 普通用户不能直接写钱包余额或流水
- 可信后端用 service role 或安全服务端环境写奖励数据

Why:

原因：

- reward logic is business logic
- wallet writing must be tamper-resistant

- 发奖逻辑属于业务逻辑
- 钱包写入必须防篡改

### RLS recommendation by table / 按表建议 RLS

`wallets`

- user can `select` only their own wallet
- admin can `select/update`
- frontend should not `insert/update` directly

- 用户只能 `select` 自己的钱包
- 管理员可以 `select/update`
- 前端不要直接 `insert/update`

`wallet_transactions`

- user can `select` only their own transactions
- admin or service role writes transactions
- frontend does not write directly

- 用户只能 `select` 自己的流水
- 管理员或 service role 负责写流水
- 前端不直接写

`reward_cycles`

- frontend can read if the UI needs reward history
- writes should remain backend/admin controlled

- 如果前端要显示奖励历史，可以读
- 写入仍应由后端 / 管理员控制

## 7. Frontend Read Pattern / 前端读取方式

Frontend should start with read-only display.

前端先从只读展示开始。

### Minimum wallet card / 最小钱包卡片

Read from `wallets`:

从 `wallets` 读取：

- `balance`
- `lifetime_earned`
- `lifetime_spent`
- `last_rewarded_at`

### Minimum transaction list / 最小流水列表

Read from `wallet_transactions`:

从 `wallet_transactions` 读取：

- `transaction_type`
- `direction`
- `amount`
- `description`
- `created_at`

Suggested frontend flow:

建议前端流程：

1. user logs in
2. frontend loads wallet summary
3. frontend optionally calls daily reward claim endpoint
4. frontend reloads wallet summary and recent transactions

1. 用户登录
2. 前端加载钱包摘要
3. 前端可选调用每日奖励领取接口
4. 前端重新加载钱包摘要和最近流水

## 8. Suggested API Shape / 建议接口形态

These do not need to be public browser-write endpoints.

这些不应该是让浏览器随便直写的公开接口。

Recommended minimal endpoints:

推荐最小接口：

### `POST /wallet/signup-bonus/reconcile`

Use case:

用途：

- repair or ensure signup bonus exists after account creation

  在注册后补发或确认注册奖励存在

Response idea:

返回建议：

- wallet created or reused
- reward granted or already existed
- current balance

- 钱包是新建还是复用
- 奖励是刚发还是已存在
- 当前余额

### `POST /wallet/daily-login/claim`

Use case:

用途：

- claim today's daily login reward if eligible

  如果符合条件就领取今天的每日登录奖励

Response idea:

返回建议：

- `granted: true/false`
- `reason: granted | already_claimed`
- `reward_amount`
- `current_balance`

- `granted: true/false`
- `reason: granted | already_claimed`
- `reward_amount`
- `current_balance`

### `GET /wallet/me`

Use case:

用途：

- load current wallet summary

  加载当前钱包摘要

### `GET /wallet/me/transactions`

Use case:

用途：

- load recent transaction history

  加载最近流水历史

## 9. Testing Checklist / 测试清单

### Signup bonus / 注册奖励

- new user gets wallet
- new user gets one signup bonus
- repeating the reconcile call does not issue a second signup bonus

- 新用户会建钱包
- 新用户会拿到一笔注册奖励
- 重复调用补偿接口不会再发第二笔注册奖励

### Daily login / 每日登录

- first claim today succeeds
- second claim today returns already claimed
- next UTC day can claim again

- 今天第一次领取成功
- 今天第二次领取返回已领取
- 下一个 UTC 日可以再次领取

### Read path / 读取链路

- wallet summary loads correctly
- transaction history loads correctly
- user cannot read another user's wallet

- 钱包摘要可正常读取
- 流水历史可正常读取
- 用户不能读别人的钱包

## 10. Recommended Build Order / 推荐开发顺序

1. finalize the schema draft

   定稿 schema 草案

2. keep read RLS working

   保证读取 RLS 正常

3. implement signup bonus backend write path

   实现注册奖励后端写入

4. implement daily login claim endpoint

   实现每日登录领取接口

5. add wallet summary UI

   加钱包摘要 UI

6. add recent transactions UI

   加最近流水 UI

7. only then consider more reward types

   之后再考虑更多奖励类型

## 11. Final Recommendation / 最终建议

If time is limited, the best MVP cut is:

如果时间有限，最好的 MVP 收口是：

- wallet auto-created for human users
- one signup bonus
- one daily login reward
- one small wallet panel
- one recent transactions list

- 真人用户自动建钱包
- 一笔注册奖励
- 一笔每日登录奖励
- 一个小钱包面板
- 一个最近流水列表

That is already enough to demo “community participation + reward system” without overbuilding.

这样已经足够演示“社区参与 + 奖励系统”，而且不会过度开发。

