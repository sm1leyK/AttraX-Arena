# Daily Login Backend Draft / 每日登录奖励后端实现草案

This document defines a practical backend implementation draft for `daily_login`.

这份文档定义了一个可落地的 `daily_login` 后端实现草案。

It matches the current AttraX Arena virtual coin direction:

它和当前 AttraX Arena 的虚拟币方向保持一致：

- human users only
- Agent excluded
- wallet writes handled by trusted backend code

- 只给真人用户
- Agent 不参与
- 钱包写入由可信后端代码处理

## 1. Goal / 目标

When a logged-in human user opens the app:

当一个已登录的真人用户打开应用时：

1. ensure the user has a wallet
2. grant one daily login reward if eligible
3. never grant more than once per UTC day
4. return current wallet state

1. 确保用户有钱包
2. 如果符合条件，发一笔每日登录奖励
3. 每个 UTC 日绝不重复发
4. 返回当前钱包状态

## 2. Recommended Trigger / 推荐触发方式

Recommended trigger:

推荐触发方式：

- frontend calls a trusted backend endpoint after login/session restore

  前端在登录成功或 session 恢复后，调用一个可信后端接口

Recommended endpoint name:

推荐接口名：

- `claimDailyLoginReward`

Recommended frontend timing:

推荐前端调用时机：

1. user logs in
2. frontend loads session
3. frontend loads profile
4. frontend calls `claimDailyLoginReward`
5. frontend refreshes wallet summary

1. 用户登录
2. 前端加载 session
3. 前端加载 profile
4. 前端调用 `claimDailyLoginReward`
5. 前端刷新钱包摘要

Why this timing works:

为什么这个时机合适：

- reward decision stays on the backend
- frontend can safely retry if needed
- user gets immediate feedback

- 发奖判断留在后端
- 前端必要时可以安全重试
- 用户能立即看到反馈

## 3. Where This Backend Logic Can Live / 这段后端逻辑可以放在哪里

Best options:

最佳放置位置：

1. Supabase Edge Function
2. your own backend route
3. trusted server worker

1. Supabase Edge Function
2. 你们自己的后端路由
3. 可信服务端 worker

Recommended MVP choice:

推荐 MVP 选择：

- Supabase Edge Function

Reason:

原因：

- easy to call from frontend
- easy to protect with auth
- easy to use service role for reward writes

- 前端调用方便
- 便于鉴权保护
- 便于使用 service role 写奖励

## 4. Input Contract / 输入约定

The backend should accept:

后端建议接收：

- authenticated user id from session

  从 session 中获取已登录用户 id

Optional:

可选：

- `client_time`

  客户端时间，仅用于日志

- `request_id`

  请求 id，仅用于追踪

The backend should never trust the client to provide:

后端不要相信客户端提供这些关键值：

- reward amount
- reward date
- wallet id

- 奖励金额
- 奖励日期
- 钱包 id

## 5. Output Contract / 输出约定

Recommended response:

建议返回：

```json
{
  "ok": true,
  "wallet_created": false,
  "granted": true,
  "reason": "granted",
  "reward_amount": 30,
  "claim_date_utc": "2026-04-24",
  "wallet": {
    "wallet_id": "uuid",
    "balance": 830,
    "lifetime_earned": 890,
    "lifetime_spent": 60,
    "last_rewarded_at": "timestamp"
  }
}
```

If the reward was already claimed today:

如果今天已经领过：

```json
{
  "ok": true,
  "wallet_created": false,
  "granted": false,
  "reason": "already_claimed",
  "reward_amount": 0,
  "claim_date_utc": "2026-04-24",
  "wallet": {
    "wallet_id": "uuid",
    "balance": 800,
    "lifetime_earned": 860,
    "lifetime_spent": 60,
    "last_rewarded_at": "timestamp"
  }
}
```

## 6. Recommended Constants / 推荐常量

Suggested MVP constants:

建议 MVP 常量：

- `DAILY_LOGIN_REWARD_AMOUNT = 30`
- `DAILY_LOGIN_RULE_KEY = 'daily_login_v1'`
- `DAILY_LOGIN_TX_TYPE = 'daily_login'`

These should be backend-owned.

这些应该由后端统一持有。

## 7. UTC Day Rule / UTC 日期规则

This is the core business rule:

这是核心业务规则：

- one user can receive at most one `daily_login` reward per UTC day

  一个用户每个 UTC 日最多只能领一笔 `daily_login` 奖励

Define:

定义：

- `today_start_utc = date_trunc('day', timezone('utc', now()))`
- `tomorrow_start_utc = today_start_utc + interval '1 day'`

The backend should always use UTC, not browser local time.

后端必须统一使用 UTC，不要用浏览器本地时区。

## 8. Suggested Write Order / 建议写入顺序

### Step 1: authenticate request / 第一步：校验请求身份

- confirm caller is a valid authenticated human user

  确认调用方是有效的已登录真人用户

- get `user_id = auth.uid()`

  获取 `user_id = auth.uid()`

### Step 2: confirm profile exists / 第二步：确认 profile 存在

Query:

查询：

```sql
select id, username, role
from public.profiles
where id = :user_id
limit 1;
```

Rules:

规则：

- if no profile exists, return retryable error

  如果没有 profile，返回可重试错误

- if profile is not a valid human participant/admin, stop

  如果不是有效真人身份，就停止

### Step 3: create or load wallet / 第三步：创建或读取钱包

Query existing wallet:

先查钱包：

```sql
select id, balance, lifetime_earned, lifetime_spent, last_rewarded_at
from public.wallets
where owner_profile_id = :user_id
limit 1;
```

If missing, create:

如果没有则创建：

```sql
insert into public.wallets (
  owner_profile_id,
  balance,
  lifetime_earned,
  lifetime_spent
)
values (
  :user_id,
  0,
  0,
  0
)
returning id, balance, lifetime_earned, lifetime_spent, last_rewarded_at;
```

### Step 4: compute today's UTC claim window / 第四步：计算今天的 UTC 领取窗口

Recommended values:

推荐值：

```sql
select
  date_trunc('day', timezone('utc', now())) as today_start_utc,
  date_trunc('day', timezone('utc', now())) + interval '1 day' as tomorrow_start_utc;
```

### Step 5: idempotency check / 第五步：幂等检查

Check whether today already has a posted daily reward:

检查今天是否已经有已生效的每日奖励：

```sql
select id, amount, created_at
from public.wallet_transactions
where wallet_id = :wallet_id
  and transaction_type = 'daily_login'
  and status = 'posted'
  and created_at >= :today_start_utc
  and created_at < :tomorrow_start_utc
limit 1;
```

If one row exists:

如果已存在一条：

- do not write again

  不要重复写

- return current wallet state with `reason = already_claimed`

  返回当前钱包状态，并带 `reason = already_claimed`

### Step 6: create or reuse today's reward cycle / 第六步：创建或复用今天的奖励周期

Recommended behavior:

推荐行为：

- one `daily_login` reward cycle per UTC day

  每个 UTC 日只保留一个 `daily_login` 奖励周期

First try to find one:

先尝试查询：

```sql
select id
from public.reward_cycles
where cycle_type = 'daily_login'
  and rule_key = 'daily_login_v1'
  and window_start = :today_start_utc
  and window_end = :tomorrow_start_utc
limit 1;
```

If missing, create one:

如果没有则创建：

```sql
insert into public.reward_cycles (
  cycle_type,
  status,
  rule_key,
  reward_amount,
  max_winners,
  window_start,
  window_end,
  processed_at,
  created_by,
  notes,
  metadata
)
values (
  'daily_login',
  'completed',
  'daily_login_v1',
  30,
  null,
  :today_start_utc,
  :tomorrow_start_utc,
  timezone('utc', now()),
  null,
  'Daily login reward cycle for current UTC day.',
  jsonb_build_object('source', 'claimDailyLoginReward')
)
returning id;
```

### Step 7: insert transaction / 第七步：写入流水

After the idempotency check passes:

幂等检查通过后：

```sql
insert into public.wallet_transactions (
  wallet_id,
  reward_cycle_id,
  direction,
  transaction_type,
  status,
  amount,
  balance_before,
  balance_after,
  created_by,
  description,
  metadata
)
values (
  :wallet_id,
  :reward_cycle_id,
  'credit',
  'daily_login',
  'posted',
  30,
  :current_balance,
  :current_balance + 30,
  null,
  'Daily login reward.',
  jsonb_build_object(
    'source', 'claimDailyLoginReward',
    'claim_date_utc', :today_date_text
  )
)
returning id;
```

### Step 8: update wallet / 第八步：更新钱包

Then update wallet totals:

然后更新钱包统计：

```sql
update public.wallets
set
  balance = balance + 30,
  lifetime_earned = lifetime_earned + 30,
  last_rewarded_at = timezone('utc', now()),
  updated_at = timezone('utc', now())
where id = :wallet_id
returning id, balance, lifetime_earned, lifetime_spent, last_rewarded_at;
```

## 9. Transaction Boundary / 事务边界

The safest path is:

最安全的方式是：

- profile check
- wallet create/load
- idempotency check
- reward cycle create/reuse
- transaction insert
- wallet update

- profile 检查
- 钱包创建 / 读取
- 幂等检查
- 奖励周期创建 / 复用
- 流水写入
- 钱包更新

All inside one database transaction.

全部包在一个数据库事务里。

## 10. Recommended Pseudocode / 推荐伪代码

```ts
async function claimDailyLoginReward(userId: string) {
  assertAuthenticated(userId);

  return db.transaction(async (tx) => {
    const profile = await tx.getProfile(userId);
    if (!profile) {
      return { ok: false, reason: "profile_not_ready", retryable: true };
    }

    let wallet = await tx.getWalletByOwner(userId);
    let walletCreated = false;

    if (!wallet) {
      wallet = await tx.createWallet(userId);
      walletCreated = true;
    }

    const { todayStartUtc, tomorrowStartUtc, todayDateText } = getUtcRewardWindow();

    const existingClaim = await tx.getDailyLoginClaimInWindow(
      wallet.id,
      todayStartUtc,
      tomorrowStartUtc
    );

    if (existingClaim) {
      const currentWallet = await tx.getWalletById(wallet.id);
      return {
        ok: true,
        wallet_created: walletCreated,
        granted: false,
        reason: "already_claimed",
        reward_amount: 0,
        claim_date_utc: todayDateText,
        wallet: currentWallet,
      };
    }

    const rewardCycleId = await tx.createOrReuseDailyLoginCycle(
      todayStartUtc,
      tomorrowStartUtc
    );

    await tx.insertWalletTransaction({
      walletId: wallet.id,
      rewardCycleId,
      direction: "credit",
      transactionType: "daily_login",
      amount: 30,
      balanceBefore: wallet.balance,
      balanceAfter: wallet.balance + 30,
      description: "Daily login reward.",
      metadata: { claim_date_utc: todayDateText },
    });

    const updatedWallet = await tx.incrementWallet(wallet.id, 30);

    return {
      ok: true,
      wallet_created: walletCreated,
      granted: true,
      reason: "granted",
      reward_amount: 30,
      claim_date_utc: todayDateText,
      wallet: updatedWallet,
    };
  });
}
```

## 11. Idempotency Notes / 幂等说明

This rule matters more than anything else:

这条规则比别的都重要：

- never decide daily reward based only on `last_rewarded_at`

  不要只靠 `last_rewarded_at` 来判断每日奖励

Why:

原因：

- `last_rewarded_at` may be updated by other reward types

  `last_rewarded_at` 可能会被别的奖励类型更新

- the ledger is the true source of reward history

  流水账本才是奖励历史的真实来源

Correct rule:

正确规则：

- query `wallet_transactions` for `daily_login` in today's UTC window

  去 `wallet_transactions` 里查今天 UTC 窗口内的 `daily_login`

Future stronger option:

后续更强方案：

- add a `claim_date_utc` column or a dedicated claim table if needed

  如果后面需要更强约束，可以再加 `claim_date_utc` 字段或专门 claim 表

## 12. RLS / Service Role Recommendation / RLS 与 Service Role 建议

Recommended runtime:

推荐运行方式：

- Edge Function or secure backend using service role

  用 Edge Function 或安全后端配合 service role

Why:

原因：

- users must not be able to self-award login rewards by writing directly

  用户不能通过直接写库给自己发登录奖励

- backend must control eligibility logic

  领取资格判断必须由后端控制

Frontend should only:

前端只负责：

- call the trusted endpoint
- read wallet summary
- read recent transactions

- 调用可信接口
- 读取钱包摘要
- 读取最近流水

## 13. Frontend Readback / 前端回读方式

After endpoint response:

接口返回后：

1. show whether reward was granted today
2. refresh wallet summary
3. refresh recent transactions list

1. 显示今天是否发放成功
2. 刷新钱包摘要
3. 刷新最近流水列表

Suggested frontend fields:

建议前端展示字段：

- `granted`
- `reason`
- `reward_amount`
- `wallet.balance`
- `wallet.last_rewarded_at`

- `granted`
- `reason`
- `reward_amount`
- `wallet.balance`
- `wallet.last_rewarded_at`

## 14. Failure Cases / 失败场景

### `profile_not_ready`

Meaning:

含义：

- session is ready but profile row is not yet visible

  session 已经有了，但 profile 记录暂时还没可见

Handling:

处理方式：

- return retryable error

  返回可重试错误

### `already_claimed`

Meaning:

含义：

- today's reward already exists

  今天的奖励已经发过

Handling:

处理方式：

- return current wallet state

  返回当前钱包状态

### `wallet_write_failed`

Meaning:

含义：

- transaction insert or wallet update failed

  流水写入或钱包更新失败

Handling:

处理方式：

- rollback full transaction

  整个事务回滚

- return error for retry/logging

  返回错误，便于重试和日志排查

## 15. Testing Checklist / 测试清单

- first call today grants reward
- second call today returns already claimed
- next UTC day grants reward again
- wallet auto-creates if missing
- transaction math stays correct
- recent transactions show one `daily_login` row

- 今天第一次调用会发奖励
- 今天第二次调用返回已领取
- 下一个 UTC 日可以再次领取
- 缺钱包时能自动建钱包
- 流水数学保持正确
- 最近流水里会出现一条 `daily_login`

## 16. Final Recommendation / 最终建议

This should be the second virtual coin write path after `signup_bonus`.

这应该是继 `signup_bonus` 之后的第二条虚拟币写入链路。

Together, these two flows are enough to make the wallet system feel alive.

这两条链路一起，已经足够让钱包系统“活起来”。

