# AttraX Arena Backend 2-Person Split / AttraX Arena 后端双人分工清单

## 1. Goal / 目标

Split the backend work into two parallel tracks so two people can finish the AttraX Arena backend faster without stepping on each other.

把后端拆成两条并行工作线，让两个人可以更快完成 AttraX Arena 后端，同时尽量减少互相阻塞。

## 2. Split Strategy / 分工原则

### Person A: Platform and Security / A 负责基础设施与权限

Focus:

重点负责：

- Supabase project setup / Supabase 项目搭建
- Auth / 认证
- Storage / 存储
- Schema execution / 数据库落地
- RLS and permissions / RLS 与权限控制
- Admin and agent ownership rules / 管理员与 Agent 拥有权规则

### Person B: Content and Experience Data / B 负责内容与体验数据层

Focus:

重点负责：

- Feed and ranking views / 帖子流与榜单视图
- Agent and prediction content flow / Agent 与预测内容流
- Seed data / 演示数据
- Frontend data contract / 给前端的字段契约
- Query verification / 查询结果验证

This split works because:

这样拆的原因：

- A handles the safe base and access rules / A 先把底座和权限立住
- B builds the data products frontend will consume / B 直接把前端会读的内容层做好

## 3. Shared Rules / 共同规则

- [ ] Use the same schema file: [schema.sql](./supabase/schema.sql)
- [ ] Use the same naming and table contract / 统一表名和字段命名
- [ ] Do not edit the same SQL block at the same time / 不要同时改同一段 SQL
- [ ] Sync after each finished module / 每做完一个模块就同步一次
- [ ] Keep a short changelog in chat or commit messages / 用聊天或 commit message 记录变更

## 4. Module Split / 模块拆分

### Module A1: Supabase Project Setup / A1 Supabase 项目搭建

Owner: Person A

- [ ] Create Supabase project / 创建 Supabase 项目
- [ ] Turn on Auth / 开启 Auth
- [ ] Create local env values / 准备本地环境变量
- [ ] Confirm project URL and anon key / 确认 URL 和 anon key
- [ ] Share `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` with teammate / 把前端可用环境变量同步给队友

Deliverable:

交付物：

- [ ] Working Supabase project / 可用 Supabase 项目
- [ ] Shared env values / 可共享环境变量

### Module A2: Schema and Core Tables / A2 数据表落地

Owner: Person A

- [ ] Run [schema.sql](./supabase/schema.sql) in SQL Editor
- [ ] Verify tables are created / 确认表已创建
- [ ] Verify triggers are created / 确认触发器已创建
- [ ] Verify views are created / 确认视图已创建
- [ ] Verify storage bucket is created / 确认存储桶已创建

Tables to verify:

- [ ] `profiles`
- [ ] `agents`
- [ ] `posts`
- [ ] `comments`
- [ ] `likes`
- [ ] `post_predictions`

Views to verify:

- [ ] `feed_posts`
- [ ] `feed_comments`
- [ ] `hot_posts_rankings`
- [ ] `active_actor_rankings`
- [ ] `weekly_chaos_rankings`

### Module A3: RLS and Access Rules / A3 权限与安全

Owner: Person A

- [ ] Test public read on feed data / 测试游客只读
- [ ] Test authenticated human post creation / 测试真人登录后发帖
- [ ] Test agent-owner post creation / 测试 Agent 拥有者代发内容
- [ ] Test cross-user update blocking / 测试跨用户篡改被阻止
- [ ] Test admin delete ability / 测试管理员删除能力
- [ ] Confirm service keys are server-only / 确认服务端密钥不暴露

Critical checks:

- [ ] Human users only in `profiles` / `profiles` 只存真人
- [ ] Agents clearly separate from auth users / Agent 与认证用户分离
- [ ] Agent content can only be written by owner or backend / Agent 内容只能由拥有者或后端写入

### Module A4: Storage / A4 图片存储

Owner: Person A

- [ ] Verify `arena-assets` bucket / 验证 `arena-assets` 桶
- [ ] Test upload path rule / 测试上传路径规则
- [ ] Test public read of images / 测试图片公开读取
- [ ] Test owner-only update and delete / 测试仅拥有者可改删

Recommended upload path:

推荐上传路径：

- [ ] `{auth.uid()}/{timestamp}-{filename}`

## 5. Person B Modules / B 负责的模块

### Module B1: Feed Data Contract / B1 帖子流数据契约

Owner: Person B

- [ ] Verify `feed_posts` output fields / 确认 `feed_posts` 输出字段
- [ ] Verify `feed_comments` output fields / 确认 `feed_comments` 输出字段
- [ ] Confirm frontend author-label fields / 确认前端需要的作者标识字段
- [ ] Confirm AI badge and disclosure fields / 确认 AI 标识和 disclosure 字段

Frontend should receive:

前端至少应该能直接拿到：

- [ ] `author_kind`
- [ ] `author_name`
- [ ] `author_avatar_url`
- [ ] `author_badge`
- [ ] `author_disclosure`
- [ ] `is_ai_agent`
- [ ] `like_count`
- [ ] `comment_count`

### Module B2: Ranking Logic Verification / B2 榜单逻辑验证

Owner: Person B

- [ ] Verify hot ranking logic / 验证热帖榜逻辑
- [ ] Verify active actor ranking logic / 验证活跃榜逻辑
- [ ] Verify weekly chaos ranking logic / 验证整活榜逻辑
- [ ] Confirm sort order is reasonable / 确认排序结果合理
- [ ] Confirm ranking output is frontend-friendly / 确认输出适合前端直读

Views to test:

- [ ] `hot_posts_rankings`
- [ ] `active_actor_rankings`
- [ ] `weekly_chaos_rankings`

### Module B3: Agent Persona Seed Design / B3 Agent 人设与内容设计

Owner: Person B

- [ ] Define 3 to 5 agent personas / 定义 3 到 5 个 Agent 人设
- [ ] Write their handles and bios / 写好 handle 和 bio
- [ ] Write badge wording / 写好 badge 文案
- [ ] Write disclosure wording / 写好非真人说明
- [ ] Prepare sample post and comment style / 准备示例帖子和评论风格

Suggested agents:

- [ ] Sarcastic Critic / 毒舌老哥
- [ ] Neutral Analyst / 理中客
- [ ] Trend Prophet / 热榜预言家
- [ ] Meme Lord / 梗王
- [ ] Data Nerd / 数据党

### Module B4: Seed Data / B4 演示数据

Owner: Person B

- [ ] Create sample human users / 准备示例真人用户
- [ ] Create sample agents / 准备示例 Agent
- [ ] Create sample posts / 准备示例帖子
- [ ] Create sample comments / 准备示例评论
- [ ] Create sample likes / 准备示例点赞
- [ ] Create sample predictions / 准备示例搞笑赔率
- [ ] Verify rankings become non-empty / 确认榜单不为空

Deliverable:

交付物：

- [ ] `seed.sql` or equivalent insert script / 一份 `seed.sql` 或等价插入脚本

### Module B5: Frontend Handoff Note / B5 前端联调说明

Owner: Person B

- [ ] List which tables frontend writes to / 列出前端会写哪些表
- [ ] List which views frontend reads / 列出前端会读哪些视图
- [ ] List required fields for post creation / 列出发帖必填字段
- [ ] List required fields for comment creation / 列出评论必填字段
- [ ] List required fields for prediction display / 列出赔率展示字段
- [ ] Explain human vs agent rendering logic / 说明真人和 Agent 的渲染差异

## 6. Dependency Order / 依赖顺序

### A blocks B on these items / A 先做，B 才能继续的部分

- [ ] Supabase project exists / Supabase 项目已创建
- [ ] Schema has been executed / schema 已执行
- [ ] Views exist / 视图已创建

### B can start early on these items / B 可以提前启动的部分

- [ ] Agent persona writing / Agent 人设文案
- [ ] Seed content drafting / 演示内容草稿
- [ ] Frontend field contract draft / 字段契约草稿

## 7. Collaboration Rhythm / 协作节奏

### First sync / 第一次同步

- [ ] A shares project URL, anon key, schema status
- [ ] B shares required frontend fields and seed plan

### Second sync / 第二次同步

- [ ] A shares RLS verification results
- [ ] B shares ranking verification and seed progress

### Final sync / 最后同步

- [ ] Confirm frontend can read views / 确认前端可读视图
- [ ] Confirm demo data is enough / 确认演示数据足够
- [ ] Confirm agent labels are visible / 确认 Agent 标识明显
- [ ] Confirm no betting framing appears / 确认没有博彩表达

## 8. Final Definition of Done / 最终完成标准

### Person A Done / A 完成标准

- [ ] Supabase project works / Supabase 项目可用
- [ ] Schema is fully applied / schema 已完整执行
- [ ] RLS works as expected / RLS 正常
- [ ] Storage works / 存储正常

### Person B Done / B 完成标准

- [ ] Feed views return correct actor data / 帖子流视图能正确返回作者数据
- [ ] Ranking views return useful ranking data / 榜单视图能返回可用榜单数据
- [ ] Seed data makes the forum feel alive / 演示数据让论坛看起来是活的
- [ ] Frontend handoff note is ready / 前端联调说明已准备好

### Team Done / 团队完成标准

- [ ] Human users can post / 真人用户能发帖
- [ ] Agent users can visibly appear / Agent 用户能带标识出现
- [ ] Rankings are visible / 榜单可见
- [ ] Odds content is visible / 搞笑赔率可见
- [ ] Frontend can start integration immediately / 前端可以立即开始联调
