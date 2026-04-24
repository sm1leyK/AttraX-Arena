# Signup Bonus Backend Draft / 注册奖励后端实现草案

This document defines a practical backend implementation draft for `signup_bonus`.

这份文档定义了一个可落地的 `signup_bonus` 后端实现草案。

It is designed for the current AttraX Arena architecture:

它是按当前 AttraX Arena 架构设计的：

- Supabase Auth
- `profiles` auto-created after signup
- wallet module stored in:
  - `wallets`
  - `wallet_transactions`
  - `reward_cycles`

- Supabase Auth
- 注册后自动创建 `profiles`
- 钱包模块使用：
  - `wallets`
  - `wallet_transactions`
  - `reward_cycles`

This draft assumes:

这份草案假设：

- only human users receive signup bonus
- Agent does not participate
- reward writes are done by trusted backend code

- 只有真人用户拿注册奖励
- Agent 不参与
- 发奖写入由可信后端代码完成

## 1. Goal / 目标

When a new human user finishes signup:

当一个真人用户完成注册后：

1. ensure the user has a wallet
2. grant startup coins exactly once
3. return the current wallet state

1. 确保用户有钱包
2. 只发一次启动奖励
3. 返回当前钱包状态

## 2. Recommended Trigger / 推荐触发方式

Recommended trigger:

推荐触发方式：

- call a trusted backend endpoint immediately after signup completes

  在注册完成后立即调用一个可信后端接口

Recommended name:

推荐接口名：

- `reconcileSignupBonus`

Why this is the safest MVP:

为什么这是最稳的 MVP：

- profile creation may be asynchronous right after signup
- wallet creation is business logic, not browser logic
- retrying is easy if the first attempt races with profile creation

- 注册后 profile 创建可能有短暂异步延迟
- 钱包创建属于业务逻辑，不该由浏览器直接写
- 如果第一次和 profile 创建撞车，后续重试也容易

## 3. Where This Backend Logic Can Live / 这段后端逻辑可以放在哪里

Best options:

最佳放置位置：

1. Supabase Edge Function
2. your own backend server route
3. admin-only repair script for recovery

1. Supabase Edge Function
2. 你们自己的后端服务路由
3. 管理员修复脚本

Recommended MVP choice:

推荐 MVP 选择：

- Supabase Edge Function

Reason:

原因：

- close to the database
- easy to use service role safely
- easy to call after signup

- 离数据库近
- 比较容易安全使用 service role
- 注册后调用方便

## 4. Input Contract / 输入约定

The backend should accept:

后端建议接收：

- authenticated user id

  已登录用户的 id

Optional:

可选：

- `request_id`

  请求 id，用于日志追踪

You do not need the browser to send reward amount.

不需要让浏览器传奖励金额。

The reward amount should be backend-owned constant or config.

奖励金额应该是后端常量或配置。

Example:

示例：

```json
{
  "user_id": "auth.uid()"
}
```

## 5. Output Contract / 输出约定

Recommended response:

建议返回：

```json
{
  "ok": true,
  "wallet_created": true,
  "reward_granted": true,
  "reason": "granted",
  "reward_amount": 500,
  "wallet": {
    "wallet_id": "uuid",
    "balance": 500,
    "lifetime_earned": 500,
    "lifetime_spent": 0,
    "last_rewarded_at": "timestamp"
  }
}
```

When the bonus already exists:

如果奖励已经发过：

```json
{
  "ok": true,
  "wallet_created": false,
  "reward_granted": false,
  "reason": "already_granted",
  "reward_amount": 0,
  "wallet": {
    "wallet_id": "uuid",
    "balance": 500,
    "lifetime_earned": 500,
    "lifetime_spent": 0,
    "last_rewarded_at": "timestamp"
  }
}
```

## 6. Recommended Constants / 推荐常量

Suggested MVP constants:

建议 MVP 常量：

- `SIGNUP_BONUS_AMOUNT = 500`
- `SIGNUP_RULE_KEY = 'signup_bonus_v1'`
- `SIGNUP_TX_TYPE = 'signup_bonus'`

These should live in backend code, not in the frontend.

这些应该放在后端，不放前端。

## 7. Write Order / 写入顺序

This order is important.

这个顺序很重要。

### Step 1: authenticate the request / 第一步：校验请求身份

- confirm the caller is a valid authenticated human user

  确认调用方是有效的已登录真人用户

- get `user_id = auth.uid()`

  取 `user_id = auth.uid()`

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

  如果还没有 profile，返回一个可重试错误

- if role is not an allowed human role, stop

  如果 role 不是允许的人类角色，就停止

Recommended reason:

建议返回原因：

- `profile_not_ready`

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

### Step 4: idempotency check / 第四步：幂等检查

Check whether this wallet already has signup bonus:

检查这个钱包是否已经拿过注册奖励：

```sql
select id, amount, created_at
from public.wallet_transactions
where wallet_id = :wallet_id
  and transaction_type = 'signup_bonus'
  and status = 'posted'
limit 1;
```

If one row already exists:

如果已经存在：

- do not write again

  不要重复写

- return current wallet state with `reason = already_granted`

  返回当前钱包状态，并带 `reason = already_granted`

### Step 5: create or reuse reward cycle / 第五步：创建或复用奖励周期

For the simplest MVP, this step is optional.

对最简单的 MVP，这一步是可选的。

If you want clearer audit history, create or reuse one signup reward cycle:

如果你想要更清晰的审计记录，就创建或复用一个注册奖励周期：

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
  'signup_bonus',
  'completed',
  'signup_bonus_v1',
  500,
  null,
  timezone('utc', now()) - interval '365 days',
  timezone('utc', now()) + interval '365 days',
  timezone('utc', now()),
  null,
  'Signup bonus cycle for MVP rollout.',
  jsonb_build_object('source', 'reconcileSignupBonus')
)
returning id;
```

Simpler alternative:

更简单的替代方案：

- skip `reward_cycles` now

  现在先不写 `reward_cycles`

## 8. Transaction Insert / 流水写入

After the idempotency check passes, write one credit transaction.

幂等检查通过后，写一条加币流水。

Example:

示例：

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
  'signup_bonus',
  'posted',
  500,
  :current_balance,
  :current_balance + 500,
  null,
  'Starter coin bonus after signup.',
  jsonb_build_object('source', 'reconcileSignupBonus')
)
returning id;
```

## 9. Wallet Update / 钱包更新

Then update the wallet:

然后更新钱包：

```sql
update public.wallets
set
  balance = balance + 500,
  lifetime_earned = lifetime_earned + 500,
  last_rewarded_at = timezone('utc', now()),
  updated_at = timezone('utc', now())
where id = :wallet_id
returning id, balance, lifetime_earned, lifetime_spent, last_rewarded_at;
```

## 10. Transaction Boundary / 事务边界

The safest way is:

最安全的方式是：

- wrap wallet creation, idempotency check, transaction insert, and wallet update in one database transaction

  把钱包创建、幂等检查、流水写入、钱包更新包在一个数据库事务里

This avoids partial success states.

这样可以避免半成功状态。

## 11. Recommended Pseudocode / 推荐伪代码

```ts
async function reconcileSignupBonus(userId: string) {
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

    const existingBonus = await tx.getPostedSignupBonus(wallet.id);
    if (existingBonus) {
      const currentWallet = await tx.getWalletById(wallet.id);
      return {
        ok: true,
        wallet_created: walletCreated,
        reward_granted: false,
        reason: "already_granted",
        reward_amount: 0,
        wallet: currentWallet,
      };
    }

    const rewardCycleId = await tx.createOrReuseSignupRewardCycle();

    await tx.insertWalletTransaction({
      walletId: wallet.id,
      rewardCycleId,
      direction: "credit",
      transactionType: "signup_bonus",
      amount: 500,
      balanceBefore: wallet.balance,
      balanceAfter: wallet.balance + 500,
      description: "Starter coin bonus after signup.",
    });

    const updatedWallet = await tx.incrementWallet(wallet.id, 500);

    return {
      ok: true,
      wallet_created: walletCreated,
      reward_granted: true,
      reason: "granted",
      reward_amount: 500,
      wallet: updatedWallet,
    };
  });
}
```

## 12. Idempotency Notes / 幂等说明

This is the most important safety rule:

这是最重要的安全规则：

- never grant signup bonus by “assuming first signup means first reward”

  不要靠“第一次注册就一定是第一次发奖”这种假设来发奖

Always check the existing ledger first.

一定要先查已有流水。

Recommended MVP rule:

推荐 MVP 规则：

- one posted `signup_bonus` transaction per wallet

  每个钱包最多只有一条已生效的 `signup_bonus` 流水

Stronger future option:

后续更强方案：

- add a partial unique index on `wallet_transactions(wallet_id)` where `transaction_type = 'signup_bonus' and status = 'posted'`

  后面可以给 `wallet_transactions(wallet_id)` 加部分唯一索引，条件是 `transaction_type = 'signup_bonus' and status = 'posted'`

## 13. RLS / Service Role Recommendation / RLS 与 Service Role 建议

Recommended runtime:

推荐运行方式：

- use service role in Edge Function or secure backend

  在 Edge Function 或安全后端里使用 service role

Why:

原因：

- normal frontend clients should not be allowed to write wallet rewards

  普通前端客户端不应该被允许写奖励流水

- reward issuance must stay trusted

  发奖必须保持可信

Frontend should do:

前端应该做：

- authenticate user
- call trusted endpoint
- read wallet summary after response

- 验证用户身份
- 调用可信接口
- 在响应后读取钱包摘要

## 14. Frontend Readback / 前端回读方式

After successful signup flow:

在注册流程成功后：

1. frontend calls signup bonus reconcile endpoint
2. frontend receives wallet state
3. frontend optionally refreshes:

   - `wallets`
   - `wallet_transactions`

1. 前端调用注册奖励补齐接口
2. 前端收到钱包状态
3. 前端可选刷新：

   - `wallets`
   - `wallet_transactions`

Minimum frontend fields to read:

前端最少读取字段：

- `balance`
- `lifetime_earned`
- `lifetime_spent`
- most recent transactions

- `balance`
- `lifetime_earned`
- `lifetime_spent`
- 最近几条流水

## 15. Failure Cases / 失败场景

### `profile_not_ready`

Meaning:

含义：

- signup finished, but `profiles` trigger row is not visible yet

  注册完成了，但 `profiles` 触发器生成的记录暂时还没可见

Handling:

处理方式：

- return retryable response

  返回可重试响应

- frontend retries after a short delay

  前端稍后重试

### `already_granted`

Meaning:

含义：

- reward already exists, no new write needed

  奖励已经发过，不需要再写

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

- rollback entire transaction

  整个事务回滚

- return error for later retry

  返回错误，允许之后重试

## 16. Testing Checklist / 测试清单

- new user gets wallet created if missing
- new user gets exactly one signup bonus
- calling endpoint twice does not create second signup bonus
- wallet balance matches transaction math
- wallet summary is readable after reward

- 新用户缺钱包时会自动建钱包
- 新用户只会拿到一笔注册奖励
- 调两次接口不会生成第二笔注册奖励
- 钱包余额和流水数学一致
- 发奖后钱包摘要可正常读取

## 17. Final Recommendation / 最终建议

If you implement only one virtual coin write path first, implement this one.

如果你们先只实现一条虚拟币写入链路，就先实现这条。

Why:

原因：

- easiest to explain
- easiest to test
- lowest business ambiguity
- creates visible value immediately

- 最容易解释
- 最容易测试
- 业务歧义最低
- 能最快产生可见价值

