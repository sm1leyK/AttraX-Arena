# AttraX Superpowers Constraints and Todo / AttraX Superpowers 约束与待办清单

## 1. Purpose / 目的

This file turns the current working features into product and engineering constraints, then adds new payout-market work as an explicit todo list.

这个文件把当前已经存在的功能整理成产品和工程约束，再把新的赔率派奖系统整理成明确待办。

Use this document when deciding whether a new feature:

- must preserve an existing capability
- can extend an existing capability
- needs a brand-new schema or backend flow

用这份文档判断一个新功能：

- 是不是必须保留现有能力
- 是不是只是在现有能力上扩展
- 是不是需要新增表结构或后端流程

## 2. Superpowers / 现有能力约束

### Superpower A: Entertainment Odds / Superpower A：娱乐赔率

Current base:

- `post_predictions`
- `post_prediction_cards`
- `homepage_odds_rankings`
- homepage and post-detail odds display already have a data source

当前底座：

- `post_predictions`
- `post_prediction_cards`
- `homepage_odds_rankings`
- 首页和帖子详情页的赔率展示已经有数据源

Constraints:

- [x] Keep odds framed as entertainment prediction, not real-money betting
- [x] Keep official wording away from recharge, withdrawal, or gambling claims
- [x] Keep current odds views readable by frontend without forcing a full rewrite
- [x] Keep `odds_value` and `probability` usable as display metadata even if payout logic is added later
- [x] Do not make existing odds cards depend on payout settlement before the new backend is ready

约束：

- [x] 赔率继续定义为娱乐预测，不定义成真钱博彩
- [x] 对外文案继续避免充值、提现、赌博表述
- [x] 继续保证前端可直接读取现有赔率视图，不强制重写
- [x] 即使后面加入派奖逻辑，`odds_value` 和 `probability` 仍然先保留为展示元数据
- [x] 在新结算后端完成前，不让现有赔率卡依赖派奖逻辑才能显示

### Superpower B: Wallet and Reward Foundation / Superpower B：钱包与奖励底座

Current base:

- `wallets`
- `wallet_transactions`
- `reward_cycles`
- signup bonus flow
- daily login reward flow

当前底座：

- `wallets`
- `wallet_transactions`
- `reward_cycles`
- 注册奖励流程
- 每日登录奖励流程

Constraints:

- [x] Keep wallet balance backend-controlled, not client-controlled
- [x] Keep reward writes server-side
- [x] Keep signup bonus idempotent
- [x] Keep daily login reward limited to once per UTC day
- [x] Keep wallet transaction history readable by the current frontend wallet module
- [x] Preserve current reward types while adding new spending or payout transaction types

约束：

- [x] 钱包余额继续只允许后端控制，不允许前端直接改
- [x] 奖励写入继续只走服务端
- [x] 注册奖励继续保持幂等
- [x] 每日登录奖励继续保持 UTC 每天一次
- [x] 继续保证当前前端钱包模块能读取钱包流水
- [x] 在新增消费或派奖类型时，不破坏现有奖励类型

### Superpower C: Support Board and Market Participation / Superpower C：支持率榜与参与记录

Current base:

- `post_market_bets`
- `place_post_bet(...)`
- `get_homepage_support_board(...)`

当前底座：

- `post_market_bets`
- `place_post_bet(...)`
- `get_homepage_support_board(...)`

Constraints:

- [x] Keep support-board ranking query working during schema expansion
- [x] Keep `yes_rate`, total amount, and sample count available for homepage ranking
- [x] Treat current `post_market_bets` rows as participation records first
- [x] Do not break existing frontend bet submission flow while upgrading it to real wallet settlement
- [x] Any new settlement fields must be additive before old read paths are retired

约束：

- [x] 在扩表过程中继续保证支持率榜查询可用
- [x] 继续保证首页排行可以拿到 `yes_rate`、总额和样本数
- [x] 当前 `post_market_bets` 先视为参与记录
- [x] 升级成真钱包结算前，不打断现有前端下注提交流程
- [x] 新结算字段优先走增量扩展，旧读取路径下线前不能直接砍掉

### Superpower D: Frontend Integration Surface / Superpower D：前端接入面

Current base:

- wallet summary query exists
- wallet transaction list exists
- frontend bet UI already attempts RPC or table write fallback

当前底座：

- 钱包摘要查询已存在
- 钱包流水列表已存在
- 前端下注 UI 已经有 RPC 和表写入兜底路径

Constraints:

- [x] Keep wallet summary fields stable: `balance`, `lifetime_earned`, `lifetime_spent`, `last_rewarded_at`
- [x] Keep wallet transaction list query shape backward-compatible where possible
- [x] New payout UI should extend the current wallet and bet UI instead of replacing it from scratch
- [x] Frontend should only depend on one canonical settlement path once the new backend is ready

约束：

- [x] 尽量保持钱包摘要字段稳定：`balance`、`lifetime_earned`、`lifetime_spent`、`last_rewarded_at`
- [x] 钱包流水查询结构尽量保持向后兼容
- [x] 新的派奖 UI 基于当前钱包和下注 UI 扩展，而不是整套推翻重做
- [x] 新后端完成后，前端只依赖一条正式结算路径

## 3. New Feature Todo / 新功能待办

### P0: Schema and Settlement Core / P0：表结构与结算核心

- [ ] Add `post_prediction_markets` as the canonical market table / 新增 `post_prediction_markets` 作为市场主表
- [ ] Add market status: `open`, `locked`, `resolved`, `cancelled` / 增加市场状态：`open`、`locked`、`resolved`、`cancelled`
- [ ] Add market result fields: `resolved_side`, `close_at`, `resolved_at` / 增加市场结果字段：`resolved_side`、`close_at`、`resolved_at`
- [ ] Extend `post_market_bets` with `bet_status` / 给 `post_market_bets` 增加 `bet_status`
- [ ] Extend `post_market_bets` with `odds_snapshot` / 给 `post_market_bets` 增加 `odds_snapshot`
- [ ] Extend `post_market_bets` with `payout_amount` / 给 `post_market_bets` 增加 `payout_amount`
- [ ] Extend `post_market_bets` with `settled_at` / 给 `post_market_bets` 增加 `settled_at`
- [ ] Link bet rows to settlement transaction ids / 给下注记录关联派奖交易 id
- [ ] Add wallet transaction type `bet_stake` / 增加钱包流水类型 `bet_stake`
- [ ] Add wallet transaction type `bet_payout` / 增加钱包流水类型 `bet_payout`
- [ ] Add wallet transaction type `bet_refund` / 增加钱包流水类型 `bet_refund`

### P0: Backend Flow / P0：后端流程

- [ ] Upgrade `place_post_bet` into a real transactional stake flow / 把 `place_post_bet` 升级成事务化真下注流程
- [ ] Validate wallet balance before accepting a bet / 下单前校验钱包余额
- [ ] Lock the odds snapshot at bet placement time / 下注时锁定赔率快照
- [ ] Deduct balance on bet placement / 下注时扣减余额
- [ ] Insert `wallet_transactions` debit record for stake / 写一条下注扣币流水
- [ ] Reject betting on locked or resolved markets / 封盘或已开奖市场禁止下注
- [ ] Add `resolve_post_market` admin-only flow / 增加仅管理员可用的 `resolve_post_market`
- [ ] Add `settle_post_market` payout flow / 增加 `settle_post_market` 派奖流程
- [ ] Add `refund_post_market` cancellation flow / 增加 `refund_post_market` 退款流程
- [ ] Add duplicate-settlement protection / 增加重复结算保护

### P1: Frontend Product Work / P1：前端产品工作

- [ ] Show market status on odds cards / 在赔率卡上显示市场状态
- [ ] Show stake amount input and estimated payout / 显示下注金额和预计派彩
- [ ] Add "My Bets" page or panel / 增加“我的下注”页或面板
- [ ] Show result state: open, won, lost, refunded / 展示 open、won、lost、refunded 状态
- [ ] Separate wallet records into stake, payout, and refund / 钱包流水区分下注、派奖、退款
- [ ] Show resolved-side result card after settlement / 结算后显示开奖结果卡

### P1: Ops and Admin / P1：运营与管理

- [ ] Add manual market resolution entry point / 增加手动开奖入口
- [ ] Decide whether settlement is manual or scheduled / 确定结算是手动还是定时
- [ ] Add minimal audit fields for resolver identity / 增加最小审计字段记录谁开奖
- [ ] Add safety rule for post deletion or market cancellation / 增加删帖或取消盘时的安全处理规则

## 4. Product Decisions Still Needed / 仍需拍板的产品决策

- [ ] Decide whether MVP payout uses fixed odds snapshot only / 确定 MVP 是否只用固定赔率快照派奖
- [ ] Decide whether one user can place multiple bets in the same market / 确定同一用户是否可在同一市场多次下注
- [ ] Decide whether cancelled markets return full refund / 确定取消盘是否全额退款
- [ ] Decide final currency label: `AX`, `Arena Coins`, or another name / 确定虚拟币名称：`AX`、`Arena Coins` 或其他
- [ ] Decide whether support-board ranking remains independent from payout status / 确定支持率榜是否继续独立于派奖状态

## 5. Definition of Done for Expansion / 本轮扩展完成标准

- [ ] Existing odds pages still render with no schema-regression break / 现有赔率页面在扩表后仍能正常显示
- [ ] Existing wallet summary and transaction list still work / 现有钱包摘要和流水仍能正常读取
- [ ] Users can place a bet and immediately see balance decrease / 用户下注后余额立刻减少
- [ ] Locked or resolved markets reject new bets / 封盘或已开奖市场拒绝新下注
- [ ] Admin can resolve a market once / 管理员可以完成一次开奖
- [ ] Winners receive payout exactly once / 胜方只会收到一次派奖
- [ ] Cancelled markets refund correctly / 取消盘能正确退款
- [ ] Wallet ledger can explain every stake and payout row / 钱包流水能解释每一条下注和派奖记录

