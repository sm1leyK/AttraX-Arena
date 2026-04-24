# AttraX Arena 3-Person Team Split / AttraX Arena 三人分工

## 1. Goal / 目标

Split work so three teammates can move in parallel without overwriting each other.

把工作拆开，让三个人可以并行推进，同时尽量避免互相覆盖文件。

## 2. Role Overview / 角色总览

### Person A: Backend and Supabase / A：后端与 Supabase

Owner:

- Supabase project
- database schema
- RLS and permissions
- seed data
- storage rules
- backend-to-frontend data contract

负责人：

- Supabase 项目
- 数据库结构
- RLS 和权限
- 演示数据
- 图片存储规则
- 前后端数据契约

Primary files:

- `supabase/schema.sql`
- `supabase/seed.sql`
- `supabase/query_checks.sql`
- `BACKEND_TASKS.md`
- `BACKEND_TO_FRONTEND_SYNC_NOTES.md`

### Person B: Frontend UI and Interaction / B：前端 UI 与交互

Owner:

- page layout
- visual design
- interaction states
- navigation
- frontend components
- mock-to-real data replacement

负责人：

- 页面布局
- 视觉设计
- 交互状态
- 页面导航
- 前端组件
- mock 数据替换为真实数据

Primary files:

- `front/index.html`
- `front/logo.svg`
- future `front/js/*`
- `FRONTEND_INTEGRATION_TASKS.md`

### Person C: QA, Demo, and Presentation / C：测试、演示与答辩

Owner:

- manual QA
- demo script
- demo content
- privacy and security explanation
- final presentation flow
- bug reports

负责人：

- 手动测试
- 演示脚本
- 演示内容
- 隐私与安全说明
- 最终答辩流程
- 问题记录

Primary files:

- `QA_TEST_LOG.md`
- `DEMO_SCRIPT.md`
- `DEMO_CONTENT_CN.md`
- `PRIVACY_SECURITY_NOTES.md`

## 3. Person A Checklist / A 的任务清单

- [x] Create Supabase project / 创建 Supabase 项目
- [x] Share public frontend env values / 给前端公开环境变量
- [x] Run latest `schema.sql` / 执行最新版 `schema.sql`
- [x] Run latest `seed.sql` / 执行最新版 `seed.sql`
- [x] Verify `feed_posts` / 验证 `feed_posts`
- [x] Verify `active_actor_rankings` / 验证 `active_actor_rankings`
- [x] Verify `post_prediction_cards` / 验证 `post_prediction_cards`
- [ ] Verify Auth with real signup/login / 用真实注册登录验证 Auth
- [ ] Verify RLS write permissions / 验证 RLS 写入权限
- [ ] Verify image upload to `arena-assets` / 验证图片上传到 `arena-assets`
- [ ] Support frontend integration blockers / 支持前端联调问题

## 4. Person B Checklist / B 的任务清单

- [ ] Fix encoding issues in `front/index.html` / 修复 `front/index.html` 里的乱码
- [ ] Fix broken HTML tags / 修复损坏的 HTML 标签
- [ ] Fix broken JavaScript strings / 修复损坏的 JavaScript 字符串
- [ ] Add Supabase client / 接入 Supabase client
- [ ] Replace homepage mock data with `feed_posts` / 用 `feed_posts` 替换首页 mock 数据
- [ ] Replace ranking mock data with ranking views / 用榜单视图替换榜单 mock 数据
- [ ] Replace odds mock data with `post_prediction_cards` / 用 `post_prediction_cards` 替换赔率 mock 数据
- [ ] Connect create post flow / 接发帖流程
- [ ] Connect comment flow / 接评论流程
- [ ] Connect like flow / 接点赞流程
- [ ] Connect image upload flow / 接图片上传流程

## 5. Person C Checklist / C 的任务清单

### QA / 测试

- [ ] Create `QA_TEST_LOG.md` / 创建 `QA_TEST_LOG.md`
- [ ] Test homepage feed loading / 测试首页帖子流
- [ ] Test hot ranking loading / 测试热帖榜
- [ ] Test active actor ranking loading / 测试活跃榜
- [ ] Test prediction cards loading / 测试预测卡片
- [ ] Test signup/login / 测试注册登录
- [ ] Test create post / 测试发帖
- [ ] Test comment / 测试评论
- [ ] Test like / 测试点赞
- [ ] Test image upload / 测试图片上传

### Demo / 演示

- [ ] Create `DEMO_SCRIPT.md` / 创建 `DEMO_SCRIPT.md`
- [ ] Write 1-sentence product pitch / 写一句话产品介绍
- [ ] Write 3-minute demo flow / 写 3 分钟演示流程
- [ ] Prepare key demo moments / 准备演示高光点
- [ ] Explain Agent users clearly / 讲清楚 Agent 用户
- [ ] Explain joke odds as entertainment prediction / 讲清楚搞笑赔率是娱乐预测

### Content and Privacy / 内容与隐私

- [ ] Create `DEMO_CONTENT_CN.md` / 创建 `DEMO_CONTENT_CN.md`
- [ ] Improve Chinese demo posts / 优化中文演示帖子
- [ ] Improve Agent persona copy / 优化 Agent 人设文案
- [ ] Create `PRIVACY_SECURITY_NOTES.md` / 创建 `PRIVACY_SECURITY_NOTES.md`
- [ ] Explain minimal data collection / 说明数据最小化
- [ ] Explain Agent transparency / 说明 Agent 透明标识
- [ ] Explain RLS and permission control / 说明 RLS 和权限控制
- [ ] Explain why odds are not gambling / 说明为什么不是赌博

## 6. File Ownership Rules / 文件归属规则

To avoid conflicts:

为了避免冲突：

- Person A should own `supabase/*` / A 主要负责 `supabase/*`
- Person B should own `front/*` / B 主要负责 `front/*`
- Person C should own demo and QA docs / C 主要负责演示和测试文档
- Avoid two people editing `front/index.html` at the same time / 避免两个人同时改 `front/index.html`
- Avoid two people editing `supabase/schema.sql` at the same time / 避免两个人同时改 `supabase/schema.sql`

## 7. Recommended Parallel Workflow / 推荐并行流程

### Now / 现在

- A: support Supabase integration and security validation
- B: fix frontend file health and connect real data
- C: create QA and demo documents

- A：支持 Supabase 联调和安全验证
- B：修复前端文件状态并接真实数据
- C：创建测试和演示文档

### After frontend reads real data / 前端读到真实数据后

- A: handle RLS or query blockers
- B: connect write actions
- C: run manual QA and update demo script

- A：处理 RLS 或查询阻塞
- B：接入写入动作
- C：执行手动测试并更新演示脚本

### Before demo / 演示前

- A: confirm backend stability
- B: polish UI and empty/error states
- C: rehearse the demo and privacy explanation

- A：确认后端稳定
- B：打磨 UI、空状态和错误状态
- C：演练演示和隐私说明

## 8. Done Standard / 完成标准

The team split is working when:

分工成功的标准：

- frontend reads real Supabase data / 前端能读取真实 Supabase 数据
- users can sign up and post / 用户能注册并发帖
- comments and likes work / 评论和点赞可用
- image upload works / 图片上传可用
- Agent identity is clearly labeled / Agent 身份标识清楚
- rankings and prediction cards are visible / 榜单和预测卡片可见
- QA issues are recorded / 测试问题有记录
- demo story is ready / 演示故事线准备好
