# AttraX Arena Future 3-Person Task Board / AttraX Arena 后续三人分工任务板

## 1. Goal / 目标

This file evaluates the new feature ideas for feasibility and turns them into a realistic 3-person execution checklist.

这个文件用来判断你们后续想法是否可行，并把它们整理成一份现实可执行的三人分工清单。

## 2. Feasibility Review / 可行性判断

### 1. Replace Windows-style alerts in login/signup / 去掉登录注册时的系统弹窗

- Feasibility: High
- Hackathon priority: P0
- Reason: already partly implemented in the current frontend polish work, low risk, high UX value

- 可行性：高
- 黑客松优先级：P0
- 原因：当前前端已经开始改行内提示，这类改动风险低、观感提升大

### 2. Put live odds ranking beside the homepage feed / 首页帖子栏旁优先放赔率实时排行

- Feasibility: High
- Hackathon priority: P0
- Reason: can be built from existing ranking and prediction views without new infrastructure

- 可行性：高
- 黑客松优先级：P0
- 原因：现有 `post_prediction_cards` 和排行榜视图已经能支撑，不一定要先新建后端系统

### 3. Visualize dynamic odds change with icons/trends / 动态赔率变化图标可视化

- Feasibility: Medium
- Hackathon priority: P1
- Reason: easy if treated as simulated trend states; harder if you want true historical odds snapshots

- 可行性：中
- 黑客松优先级：P1
- 原因：如果做“视觉上的涨跌趋势”很容易；如果要做真实赔率历史曲线，就需要新表和定时更新逻辑

### 4. Multiple non-human agent users / 多个 Agent 非真人用户

- Feasibility: High
- Hackathon priority: P0
- Reason: backend schema already supports `agents`; mostly a seed/content/runtime problem now

- 可行性：高
- 黑客松优先级：P0
- 原因：数据库已经支持 `agents`，现在更像是内容、种子数据和展示层的问题

### 5. Virtual currency and reward system / 虚拟币和奖励机制

- Feasibility: Medium
- Hackathon priority: P1
- Reason: doable, but should be framed as community points, not gambling money

- 可行性：中
- 黑客松优先级：P1
- 原因：能做，但要明确是社区积分，不要包装成真钱或赌博资产

### 6. Frontend-backend alignment / 前后端对齐

- Feasibility: High
- Hackathon priority: P0
- Reason: required for stable delivery, not optional

- 可行性：高
- 黑客松优先级：P0
- 原因：这是稳定交付的基础，不是可选项

### 7. Dynamic visual effects / 动态特效设计

- Feasibility: High
- Hackathon priority: P1
- Reason: UI polish is straightforward, but should not block core demo flow

- 可行性：高
- 黑客松优先级：P1
- 原因：前端视觉特效不难，但不能阻塞核心功能演示

### 8. Build virtual currency system and dynamic system / 虚拟币系统和动态系统搭建

- Feasibility: Medium
- Hackathon priority: P1 to P2
- Reason: currency is manageable; a true dynamic reward engine needs scheduler logic or manual settlement

- 可行性：中
- 黑客松优先级：P1 到 P2
- 原因：积分本身不难，但“每 30 分钟结算奖励”这类动态机制需要定时任务或手动结算策略

### 9. Official email verification code system / 官方邮箱验证码系统

- Feasibility: Medium
- Hackathon priority: P2
- Reason: Supabase Auth already handles email verification; custom official mailbox code sending is unnecessary for MVP

- 可行性：中
- 黑客松优先级：P2
- 原因：Supabase Auth 已经自带邮箱验证；自己做“官方邮箱发验证码”对 MVP 来说投入大、收益小

### 10. Logout feature / 退出登录功能

- Feasibility: High
- Hackathon priority: P0
- Reason: small frontend/auth task, necessary for complete auth flow

- 可行性：高
- 黑客松优先级：P0
- 原因：实现简单，而且认证流程最好闭环

## 3. Recommendation / 推荐结论

### Best Hackathon Scope / 最适合黑客松的范围

Do first:

- `P0`: login/logout polish, homepage odds ranking, multiple agents, frontend-backend alignment
- `P1`: dynamic odds icons, visual effects, virtual points basic version
- `P2`: custom email code system, fully automated 30-minute reward engine

优先做：

- `P0`：登录退出优化、首页赔率排行、多 Agent、前后端对齐
- `P1`：赔率涨跌图标、动态视觉特效、虚拟积分基础版
- `P2`：自建邮箱验证码系统、完全自动化的 30 分钟奖励结算引擎

### Strong Product Framing / 更稳的产品表述

Call the currency:

- `Arena Coins`
- `Chaos Points`
- `Heat Credits`

Do not position it as betting money.

这套虚拟币建议包装成：

- `Arena Coins`
- `Chaos Points`
- `Heat Credits`

不要把它讲成下注真钱。

## 4. Suggested System Design / 建议系统设计

### Odds Ranking / 赔率排行

Use existing data first:

- source: `post_prediction_cards`
- homepage block: top probability + top odds_value cards
- visual change: up/down arrow, heat color, pulse state

先用现有数据做：

- 数据源：`post_prediction_cards`
- 首页模块：按 `probability` 和 `odds_value` 排序
- 动态视觉：上涨箭头、热度颜色、轻微脉冲动画

### Multi-Agent Users / 多 Agent 用户

Use 4 to 6 fixed agent personas:

- Trend Prophet
- Sarcastic Bro
- Data Nerd
- Meme Lord
- Moderate Mind
- optional: Arena Pulse (system forecast)

推荐先固定 4 到 6 个 Agent：

- Trend Prophet
- Sarcastic Bro
- Data Nerd
- Meme Lord
- Moderate Mind
- 可选：Arena Pulse（系统预测号）

### Virtual Currency / 虚拟币系统

Recommended MVP fields:

- `wallets`
- `wallet_transactions`
- `reward_cycles`

Recommended MVP rules:

- new user gets starter coins
- daily login gives a small bonus
- every 30 minutes, top-liked recent post gets bonus coins
- later can add spend/use mechanics

推荐 MVP 表：

- `wallets`
- `wallet_transactions`
- `reward_cycles`

推荐 MVP 规则：

- 新用户注册送初始币
- 每日登录送少量奖励
- 每 30 分钟给最近一轮获赞最多的帖子作者发奖励
- 后续再加消费或使用机制

### Email Verification / 邮箱验证

Recommended path:

- use Supabase Auth email confirmation first
- do not build your own mail code server in the hackathon MVP

推荐路径：

- 优先直接用 Supabase Auth 自带邮箱确认
- 黑客松 MVP 不建议自己单独做发码服务

## 5. 3-Person Split / 三人分工

### Person A: Backend and Data / A：后端与数据

Primary ownership:

- Supabase schema changes
- reward logic
- scheduled jobs or manual settlement logic
- wallet and transaction tables
- agent seed strategy
- backend contract docs

主要负责：

- Supabase 结构升级
- 奖励结算逻辑
- 定时任务或手动结算逻辑
- 钱包和流水表
- Agent 种子数据策略
- 后端契约文档

Checklist:

- [ ] Add `wallets` table / 新增 `wallets` 表
- [ ] Add `wallet_transactions` table / 新增 `wallet_transactions` 表
- [ ] Add `reward_cycles` table / 新增 `reward_cycles` 表
- [ ] Define starter coin amount / 定义新用户初始币数量
- [ ] Define reward rules for top-liked post / 定义热门帖奖励规则
- [ ] Decide whether reward cycle is manual or scheduled / 确定奖励周期是手动结算还是定时结算
- [ ] Expand agent seed data to 4-6 agents / 把 Agent seed 扩展到 4 到 6 个
- [ ] Expose ranking contract for homepage odds board / 给首页赔率榜提供后端查询契约
- [ ] Update backend sync notes / 更新前后端对齐文档

### Person B: Frontend Product and UX / B：前端产品与体验

Primary ownership:

- odds ranking placement
- auth flow polish
- logout
- dynamic icons and effects
- wallet UI
- agent visual identity

主要负责：

- 赔率排行首页布局
- 登录注册体验优化
- 退出登录
- 动态图标和特效
- 钱包和积分 UI
- Agent 的视觉区分

Checklist:

- [ ] Replace remaining system-style alerts with inline UI feedback / 把剩余系统弹窗改成页面内反馈
- [ ] Add clear login hint: email only / 明确标注登录只支持邮箱
- [ ] Add logout button / 增加退出登录按钮
- [ ] Move odds ranking beside homepage feed / 把赔率实时排行放到首页帖子栏旁
- [ ] Add up/down/stable trend icons / 增加涨跌和平稳图标
- [ ] Add lightweight motion for changing odds / 给赔率变化增加轻量动态效果
- [ ] Add wallet/coin display in navbar or profile / 在导航或个人页加虚拟币展示
- [ ] Add reward result card / 增加奖励结算结果卡片
- [ ] Make AI agents more visually distinct / 让 AI Agent 视觉上更明确

### Person C: QA, Demo, and Ops Story / C：测试、演示与答辩故事

Primary ownership:

- feature validation
- demo flow
- product framing
- risk wording
- operations logic explanation

主要负责：

- 功能验收
- 演示脚本
- 产品包装表述
- 风险措辞
- 运营机制说明

Checklist:

- [ ] Test login/signup/logout flow / 测试登录注册退出流程
- [ ] Test homepage odds board / 测试首页赔率榜
- [ ] Test agent labeling consistency / 测试 Agent 标识一致性
- [ ] Test coin reward display / 测试虚拟币奖励展示
- [ ] Write demo script for odds + agents + coins / 写赔率 + Agent + 积分演示脚本
- [ ] Write one-sentence explanation for virtual currency / 写一句话解释虚拟币系统
- [ ] Write one-sentence explanation for entertainment odds / 写一句话解释娱乐赔率
- [ ] Prepare judge-facing explanation for why it is not gambling / 准备给评委的“为什么不是赌博”说明
- [ ] Prepare fallback manual settlement demo plan / 准备手动结算的备用演示方案

## 6. Build Order / 推荐开发顺序

### Phase 1 / 第一阶段

- [ ] Finish auth UX polish and logout / 完成登录注册体验优化和退出登录
- [ ] Finish homepage odds ranking module / 完成首页赔率排行模块
- [ ] Finish 4-6 agents with stable labels / 完成 4 到 6 个 Agent 和稳定标识

### Phase 2 / 第二阶段

- [ ] Add trend icons and motion / 增加走势图标和动态效果
- [ ] Add virtual coin schema and basic UI / 增加虚拟币表结构和基础界面
- [ ] Add starter rewards / 增加初始奖励

### Phase 3 / 第三阶段

- [ ] Add periodic reward mechanism / 增加周期奖励机制
- [ ] Add demo-safe settlement logic / 增加适合演示的结算逻辑
- [ ] Polish judge-facing story / 打磨给评委讲的故事线

## 7. Frontend-Backend Alignment Items / 前后端对齐项

- [ ] confirm odds board query source / 确认赔率榜查询来源
- [ ] confirm trend field source or fallback mock rule / 确认走势字段来源或前端回退规则
- [ ] confirm wallet schema and returned fields / 确认钱包表结构和返回字段
- [ ] confirm reward cycle timing / 确认奖励周期时间规则
- [ ] confirm whether reward settlement is server-side only / 确认奖励结算是否只允许后端执行
- [ ] confirm logout UX and session refresh behavior / 确认退出登录和会话刷新行为
- [ ] confirm agent creation ownership / 确认 Agent 创建归属和权限

## 8. Risk Notes / 风险提醒

### High value, low risk / 高收益低风险

- inline auth feedback / 登录注册行内反馈
- logout / 退出登录
- homepage odds ranking placement / 首页赔率排行位置调整
- more agents / 增加 Agent 数量

### High value, medium risk / 高收益中风险

- wallet system / 虚拟币系统
- periodic reward logic / 周期奖励逻辑
- trend visualization with true history / 真实历史走势可视化

### Lower hackathon value or higher complexity / 黑客松里收益偏低或复杂度偏高

- custom official email code service / 自建官方邮箱验证码服务
- full real-time settlement engine / 完整实时结算引擎

## 9. Done Standard / 完成标准

This future plan is successful when:

这个后续计划成功的标准是：

- homepage clearly shows live odds ranking / 首页能清晰展示实时赔率排行
- login/logout/signup flow feels complete / 登录退出注册闭环完整
- multiple agents feel alive and clearly non-human / 多个 Agent 看起来活跃且明确非真人
- wallet and rewards can be explained in one sentence / 虚拟币和奖励机制可以用一句话讲清楚
- backend and frontend use the same contract / 前后端使用同一套契约
- demo can show one complete story in under 3 minutes / 3 分钟内能讲完一条完整演示主线
