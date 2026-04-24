# Virtual Coin Frontend Integration Draft / 虚拟币前端接入草案

This document explains how the frontend should call the two draft reward functions:

这份文档说明前端如何调用这两个奖励函数草案：

- `reconcile-signup-bonus`
- `claim-daily-login-reward`

It is written for the current AttraX setup:

它基于当前 AttraX 的结构：

- Supabase Auth on the frontend
- Supabase Edge Functions for trusted reward writes
- wallet data stored in:
  - `wallets`
  - `wallet_transactions`

- 前端使用 Supabase Auth
- 奖励写入走 Supabase Edge Functions
- 钱包数据存在：
  - `wallets`
  - `wallet_transactions`

## 1. Goal / 目标

The frontend should do three simple things:

前端只需要做三件简单的事：

1. call signup bonus reconcile after signup
2. call daily login reward after login/session restore
3. refresh wallet summary and recent transactions after success

1. 注册后调用注册奖励补齐函数
2. 登录后或 session 恢复后调用每日登录奖励函数
3. 成功后刷新钱包摘要和最近流水

The frontend should not write reward rows directly.

前端不应该直接写奖励流水。

## 2. Required Frontend Inputs / 前端所需前置条件

Before integrating, make sure:

接入前要先确认：

1. user can sign up and log in normally
2. `wallets` table exists
3. `wallet_transactions` table exists
4. both Edge Functions are deployed

1. 用户能正常注册和登录
2. `wallets` 表已存在
3. `wallet_transactions` 表已存在
4. 两个 Edge Function 已部署

Functions expected:

预期函数：

- `reconcile-signup-bonus`
- `claim-daily-login-reward`

## 3. Recommended Frontend Timing / 推荐前端调用时机

### A. Signup flow / 注册流程

Call `reconcile-signup-bonus` after signup succeeds and a session exists.

在注册成功且 session 已建立后，调用 `reconcile-signup-bonus`。

Recommended sequence:

推荐顺序：

1. user submits signup form
2. frontend calls `supabase.auth.signUp(...)`
3. signup succeeds
4. frontend waits until session/user is available
5. frontend calls `reconcile-signup-bonus`
6. frontend refreshes wallet data

1. 用户提交注册表单
2. 前端调用 `supabase.auth.signUp(...)`
3. 注册成功
4. 前端等待 session/user 可用
5. 前端调用 `reconcile-signup-bonus`
6. 前端刷新钱包数据

Important:

注意：

- if `profile_not_ready` happens, retry after a short delay

  如果出现 `profile_not_ready`，稍后重试

### B. Login flow / 登录流程

Call `claim-daily-login-reward` after login succeeds.

在登录成功后调用 `claim-daily-login-reward`。

Recommended sequence:

推荐顺序：

1. user logs in
2. frontend confirms session exists
3. frontend loads profile
4. frontend calls `claim-daily-login-reward`
5. frontend refreshes wallet data

1. 用户登录
2. 前端确认 session 存在
3. 前端加载 profile
4. 前端调用 `claim-daily-login-reward`
5. 前端刷新钱包数据

### C. Session restore / Session 恢复

When the app reloads and a session already exists:

当页面刷新且 session 已存在时：

1. load current session
2. load profile
3. call `claim-daily-login-reward` once
4. refresh wallet data

1. 加载当前 session
2. 加载 profile
3. 调用一次 `claim-daily-login-reward`
4. 刷新钱包数据

This keeps daily rewards feeling automatic.

这样每日奖励看起来会更自然。

## 4. Recommended Frontend Read Queries / 推荐前端读取查询

### Wallet summary / 钱包摘要

```ts
const { data, error } = await supabase
  .from("wallets")
  .select("id, balance, lifetime_earned, lifetime_spent, last_rewarded_at")
  .eq("owner_profile_id", session.user.id)
  .maybeSingle();
```

### Recent transactions / 最近流水

```ts
const walletId = wallet?.id;

const { data, error } = await supabase
  .from("wallet_transactions")
  .select("id, direction, transaction_type, amount, description, created_at")
  .eq("wallet_id", walletId)
  .order("created_at", { ascending: false })
  .limit(10);
```

## 5. How To Call Edge Functions / 如何调用 Edge Function

Recommended way:

推荐方式：

```ts
const { data, error } = await supabase.functions.invoke("reconcile-signup-bonus", {
  body: {},
});
```

```ts
const { data, error } = await supabase.functions.invoke("claim-daily-login-reward", {
  body: {},
});
```

Why `body: {}`:

为什么只传空对象：

- both functions read identity from the current auth session
- reward amount and wallet id should stay backend-owned

- 两个函数都从当前登录态里取用户身份
- 奖励金额和钱包 id 应由后端控制

## 6. Suggested Integration Helpers / 建议封装的前端辅助函数

Recommended helper functions:

建议封装这几个函数：

- `loadWalletSummary()`
- `loadWalletTransactions()`
- `reconcileSignupBonus()`
- `claimDailyLoginReward()`
- `refreshWalletModule()`

### Example helper: `loadWalletSummary`

```ts
async function loadWalletSummary(supabase, userId) {
  const { data, error } = await supabase
    .from("wallets")
    .select("id, balance, lifetime_earned, lifetime_spent, last_rewarded_at")
    .eq("owner_profile_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}
```

### Example helper: `loadWalletTransactions`

```ts
async function loadWalletTransactions(supabase, walletId) {
  if (!walletId) return [];

  const { data, error } = await supabase
    .from("wallet_transactions")
    .select("id, direction, transaction_type, amount, description, created_at")
    .eq("wallet_id", walletId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) throw error;
  return data ?? [];
}
```

### Example helper: `refreshWalletModule`

```ts
async function refreshWalletModule(supabase, userId) {
  const wallet = await loadWalletSummary(supabase, userId);
  const transactions = wallet
    ? await loadWalletTransactions(supabase, wallet.id)
    : [];

  return { wallet, transactions };
}
```

## 7. Suggested Signup Integration / 建议注册接入方式

Example:

示例：

```ts
async function handleSignup(supabase, email, password, username) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username },
    },
  });

  if (error) throw error;

  const userId = data.user?.id;
  if (!userId) return { signup: data };

  const rewardResult = await supabase.functions.invoke("reconcile-signup-bonus", {
    body: {},
  });

  return {
    signup: data,
    reward: rewardResult.data,
    rewardError: rewardResult.error,
  };
}
```

Handling `profile_not_ready`:

处理 `profile_not_ready`：

```ts
async function reconcileSignupBonusWithRetry(supabase, retries = 3) {
  for (let i = 0; i < retries; i += 1) {
    const result = await supabase.functions.invoke("reconcile-signup-bonus", {
      body: {},
    });

    if (!result.error && result.data?.ok) {
      return result.data;
    }

    if (result.data?.code !== "profile_not_ready") {
      return result.data ?? result.error;
    }

    await new Promise((resolve) => setTimeout(resolve, 800));
  }

  return {
    ok: false,
    code: "profile_not_ready_timeout",
  };
}
```

## 8. Suggested Login Integration / 建议登录接入方式

Example:

示例：

```ts
async function handleLogin(supabase, email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;

  const rewardResult = await supabase.functions.invoke("claim-daily-login-reward", {
    body: {},
  });

  return {
    login: data,
    reward: rewardResult.data,
    rewardError: rewardResult.error,
  };
}
```

## 9. Suggested Session Restore Integration / 建议 Session 恢复接入方式

When the app boots:

应用启动时：

```ts
async function bootstrapWalletFeatures(supabase) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const userId = session?.user?.id;
  if (!userId) {
    return { wallet: null, transactions: [] };
  }

  await supabase.functions.invoke("claim-daily-login-reward", {
    body: {},
  });

  return refreshWalletModule(supabase, userId);
}
```

Important:

注意：

- call it once on startup
- do not repeatedly spam the function on every route switch

- 启动时调用一次就够了
- 不要在每次路由切换时重复调用

## 10. UI States / UI 状态建议

### Wallet card / 钱包卡片

Recommended fields:

建议显示：

- current balance
- lifetime earned
- lifetime spent
- last rewarded time

- 当前余额
- 累计获得
- 累计消耗
- 最近奖励时间

### Reward toast / 奖励提示

For `signup_bonus`:

对于 `signup_bonus`：

- if `reward_granted = true`, show:
  - `+500 starter coins`

  - 如果 `reward_granted = true`，提示：
    - `+500 starter coins`

For `daily_login`:

对于 `daily_login`：

- if `granted = true`, show:
  - `Daily reward claimed: +30`

  - 如果 `granted = true`，提示：
    - `Daily reward claimed: +30`

- if `reason = already_claimed`, show:
  - `Today's login reward already claimed`

  - 如果 `reason = already_claimed`，提示：
    - `今天的登录奖励已领取`

## 11. Error Handling / 错误处理

### Signup reward errors / 注册奖励错误

- `profile_not_ready`
  - retry after short delay

  - 短暂延迟后重试

- `already_granted`
  - treat as success

  - 视为成功

- network failure
  - allow later retry

  - 允许后续重试

### Daily reward errors / 每日奖励错误

- `already_claimed`
  - treat as success

  - 视为成功

- network failure
  - do not block page rendering

  - 不要阻塞页面渲染

- backend failure
  - show non-blocking warning

  - 给一个非阻塞提示

## 12. State Management Recommendation / 状态管理建议

Minimum frontend state:

前端最少状态：

- `wallet`
- `walletTransactions`
- `walletLoading`
- `walletError`
- `dailyRewardStatus`

- `wallet`
- `walletTransactions`
- `walletLoading`
- `walletError`
- `dailyRewardStatus`

Suggested shape:

建议结构：

```ts
const walletState = {
  wallet: null,
  transactions: [],
  loading: false,
  error: null,
  dailyRewardStatus: null,
};
```

## 13. Recommended Build Order / 推荐接入顺序

1. deploy both functions
2. verify auth headers work
3. integrate signup bonus call
4. integrate daily login call
5. add wallet summary read
6. add transaction list read
7. add reward toasts

1. 部署两个函数
2. 确认鉴权头生效
3. 接入注册奖励调用
4. 接入每日登录调用
5. 加钱包摘要读取
6. 加流水列表读取
7. 加奖励提示

## 14. Testing Checklist / 测试清单

- signup triggers signup bonus once
- repeat signup reward reconcile does not duplicate
- login triggers daily reward once per UTC day
- wallet summary updates after reward
- transactions list shows new reward rows
- page still loads even if reward call fails

- 注册会触发一次注册奖励
- 重复补齐不会重复发
- 登录每天只触发一次每日奖励
- 发奖后钱包摘要会更新
- 流水列表会出现新奖励记录
- 就算奖励调用失败，页面也还能正常加载

## 15. Final Recommendation / 最终建议

Keep the first frontend version small.

第一版前端接入尽量做小。

The best first cut is:

最好的第一版是：

- call reward functions
- refresh wallet summary
- refresh recent transactions
- show one small success message

- 调用奖励函数
- 刷新钱包摘要
- 刷新最近流水
- 显示一个简短成功提示

That is enough for MVP.

这对 MVP 已经足够了。

