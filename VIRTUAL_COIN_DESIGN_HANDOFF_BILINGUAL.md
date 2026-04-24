# Virtual Coin Design Handoff / 虚拟币设计交接说明

## 1. Goal / 目标

This file defines how one teammate can independently design the virtual coin icon system and motion package without blocking the main frontend or backend work.

这个文件用来定义：如何让一个队友单独负责虚拟币图标和动效设计，同时不阻塞主前端和后端开发。

## 2. Core Principle / 核心原则

The coin-design owner should work as an `asset and motion package` owner, not as a `main frontend page` owner.

负责虚拟币设计的人，最好扮演“设计资产和动效包负责人”，而不是“主前端页面负责人”。

That means:

这意味着：

- they should design assets, tokens, and motion rules
- they should avoid directly rewriting the main homepage file
- final integration should still be handled by the frontend owner

- 他主要设计图标、视觉 token 和动效规则
- 尽量不要直接改主首页大文件
- 最终接入仍然由前端主负责人统一完成

## 3. Is This Feasible? / 这样做可行吗？

Yes, this is a good split.

可以，而且这是一个很合理的拆分方式。

Why:

原因：

- icon design can run in parallel with backend work
- motion rules can be defined before the wallet system is fully finished
- frontend integration becomes cleaner if the deliverable is modular

- 图标设计可以和后端开发并行
- 动效规范可以先于完整虚拟币系统做出来
- 如果交付物是模块化的，前端接入会更干净

## 4. Recommended Ownership / 推荐归属

### Coin Design Owner / 虚拟币设计负责人

Owns:

- coin icon language
- motion behavior
- color and glow tokens
- UI microstates for rewards and odds movement
- handoff documentation

负责：

- 虚拟币图标体系
- 动效行为
- 颜色和发光 token
- 奖励和赔率变化的小状态设计
- 交接文档

### Frontend Owner / 前端主负责人

Owns:

- final layout integration
- real data binding
- event triggers
- wallet display placement
- homepage odds board placement

负责：

- 最终页面接入
- 真数据绑定
- 事件触发
- 钱包显示位置
- 首页赔率榜位置

### Backend Owner / 后端负责人

Owns:

- wallet schema
- reward logic
- coin balances
- reward cycles
- fields needed by frontend triggers

负责：

- 钱包表结构
- 奖励逻辑
- 虚拟币余额
- 奖励周期
- 前端动效触发所需字段

## 5. What The Coin Design Owner Should Deliver / 虚拟币设计负责人要交付什么

### A. Icon Pack / 图标包

At minimum:

至少交付：

- main coin icon / 主虚拟币图标
- reward icon / 奖励图标
- spend icon / 消耗图标
- wallet icon / 钱包图标
- odds-up icon / 赔率上涨图标
- odds-down icon / 赔率下跌图标
- stable icon / 平稳状态图标

### B. Motion Spec / 动效规范

At minimum:

至少交付：

- coin gain animation / 获得虚拟币动效
- reward pop animation / 奖励弹出动效
- wallet count update animation / 钱包数字跳动动效
- odds rise pulse / 赔率上涨脉冲动效
- odds drop fade / 赔率下跌衰减动效
- success state / 成功状态动效

### C. Visual Tokens / 视觉 Token

At minimum:

至少交付：

- coin primary color / 虚拟币主色
- coin glow color / 虚拟币发光色
- reward highlight color / 奖励高亮色
- up/down/stable semantic colors / 涨跌平语义色
- recommended shadow and blur / 推荐阴影和模糊参数
- motion durations / 动效时长

### D. Handoff Notes / 交接说明

At minimum:

至少交付：

- where each icon should be used / 每个图标用在哪
- when each animation should trigger / 每个动效在什么时机触发
- desktop/mobile notes / 桌面端和移动端注意事项
- accessibility note / 可访问性说明

## 6. What This Person Should Not Directly Own / 不建议这个人直接负责什么

Avoid giving this person direct responsibility for:

不建议直接让这个人负责：

- Supabase schema changes
- reward business rules
- main auth flow
- homepage data fetching
- final merged layout logic
- large edits to `front/index.html`

尤其不要直接负责：

- Supabase 表结构
- 奖励业务规则
- 认证主流程
- 首页真实数据拉取
- 最终合并布局逻辑
- 大规模修改 `front/index.html`

## 7. Recommended Output Files / 推荐交付文件

Suggested structure:

建议目录结构：

```text
front/assets/coins/
front/assets/coins/coin-main.svg
front/assets/coins/coin-reward.svg
front/assets/coins/coin-spend.svg
front/assets/coins/odds-up.svg
front/assets/coins/odds-down.svg
front/assets/coins/odds-stable.svg
front/assets/coins/COIN_TOKENS.md
front/assets/coins/COIN_MOTION_SPEC.md
front/assets/coins/COIN_USAGE_NOTES.md
```

If they also want to provide example code, use:

如果还想附带示例代码，建议加：

```text
front/assets/coins/coin-snippets.css
front/assets/coins/coin-snippets.js
```

## 8. Integration Rules / 接入规则

### Rule 1 / 规则 1

The design owner can provide demo snippets, but should avoid merging directly into the main page unless coordinated.

设计负责人可以提供示例代码，但尽量不要在没有协调的情况下直接改主页面。

### Rule 2 / 规则 2

The frontend owner should be the one who decides:

最终由前端主负责人决定：

- where the wallet appears
- where the odds trend appears
- how much motion is acceptable
- how asset files are imported

- 钱包显示在哪
- 赔率走势显示在哪
- 动效强度开到多少
- 资源文件如何引入

### Rule 3 / 规则 3

The backend owner should confirm what event states exist.

后端负责人要确认有哪些事件状态能提供给前端：

Examples:

例如：

- `coin_balance`
- `reward_amount`
- `reward_reason`
- `odds_direction`
- `odds_delta`
- `reward_cycle_status`

## 9. Best Hackathon Scope / 最适合黑客松的做法

For the MVP, the coin-design owner should target:

对于黑客松 MVP，虚拟币设计负责人建议只做：

- one strong main coin icon
- one wallet display style
- one reward popup motion
- one odds up/down/stable icon set
- one short token document

也就是：

- 一个主虚拟币图标
- 一种钱包显示样式
- 一套奖励弹出动效
- 一套涨跌平图标
- 一份简短 token 文档

This is enough to make the feature feel polished without overbuilding.

这已经足够让功能看起来完整且精致，不会过度建设。

## 10. 3-Person Collaboration Flow / 三人协作流

### Step 1 / 第一步

Backend owner defines wallet and reward fields.

后端负责人先定义钱包和奖励字段。

### Step 2 / 第二步

Coin design owner makes icons, motion rules, and handoff files.

虚拟币设计负责人制作图标、动效规则和交接文件。

### Step 3 / 第三步

Frontend owner integrates the final chosen assets into the live UI.

前端主负责人把确认后的资产接进真实页面。

### Step 4 / 第四步

QA/demo owner verifies the wallet display and reward moment in the demo flow.

测试/演示负责人检查钱包展示和奖励触发在演示中的效果。

## 11. Handoff Checklist / 交接清单

The coin-design owner is done when:

虚拟币设计负责人完成的标准：

- [ ] icon files are exported / 图标文件已导出
- [ ] motion behavior is documented / 动效行为已写清楚
- [ ] color tokens are documented / 颜色 token 已写清楚
- [ ] usage notes are documented / 使用说明已写清楚
- [ ] files are placed in a clean folder / 文件放在清晰独立目录里
- [ ] no accidental edits were made to unrelated main logic / 没有误改无关主逻辑

## 12. Recommendation / 最终建议

Yes, you can absolutely split this out to one person.

可以，完全可以单独分给一个人做。

But the safest version is:

最稳的版本是：

- let them own `design assets and motion spec`
- let the frontend owner own `final UI integration`

也就是：

- 让他负责“设计资产和动效规范”
- 让前端主负责人负责“最终页面接入”

This gives you parallel speed without merge chaos.

这样既能并行推进，也能避免最后合并时一团乱。
