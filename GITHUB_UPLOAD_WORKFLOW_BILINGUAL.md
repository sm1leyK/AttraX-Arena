# GitHub Upload Workflow / GitHub 上传工作流

## 1. Goal / 目标

This is the fastest repeatable workflow for uploading changes to the shared GitHub repo.

这是以后每次把改动上传到共享 GitHub 仓库时，最快、最稳、最完整的一套固定流程。

Use this file as the team default workflow.

以后团队统一默认按这个文件走。

## 2. Best Practice / 推荐原则

- only commit the files you actually changed
- do not stage random screenshots, temp folders, or unrelated docs
- always check `git status` before commit
- always write a short meaningful commit message
- push right after commit

- 只提交你这次真的改过的文件
- 不要把截图、临时目录、无关文档一起提交
- commit 前一定先看 `git status`
- commit message 要短，但要表达清楚改了什么
- commit 完就立刻 push

## 3. Fast Standard Workflow / 最快标准流程

Run these in the repo root:

在仓库根目录里运行：

```bash
git status -sb
git add <your changed files>
git commit -m "your short message"
git push origin main
```

Example:

例如：

```bash
git status -sb
git add front
git commit -m "Polish auth UX and homepage odds layout"
git push origin main
```

## 4. What To Check First / 开始前先检查什么

### Step 1 / 第一步

Check current repo state:

先看当前仓库状态：

```bash
git status -sb
```

You should read:

你要重点看：

- which files are modified
- which files are untracked
- whether your branch is ahead or behind

- 哪些文件被修改了
- 哪些文件还没跟踪
- 当前分支是领先还是落后

## 5. What To Add / 该 add 什么

### Safe pattern / 安全做法

Add only the folder or files you finished this round.

只 add 你这一轮完成的文件或目录。

Examples:

示例：

```bash
git add front
```

```bash
git add supabase/schema.sql supabase/seed.sql
```

```bash
git add TEAM_3P_SPLIT.md FUTURE_3P_TASKS_BILINGUAL.md
```

### Do not do this by default / 默认不要这样做

```bash
git add .
```

Only use `git add .` if you are sure every changed file should go up.

只有在你非常确定所有改动都该上传时，才用 `git add .`

## 6. Commit Message Rule / 提交信息规则

Use this format:

建议格式：

```text
Verb + main change
```

Good examples:

好的例子：

- `Add Supabase-backed frontend MVP polish`
- `Update wallet schema draft`
- `Add bilingual 3-person task board`
- `Fix auth login hint and logout flow`

Bad examples:

不推荐：

- `update`
- `fix`
- `123`
- `final version`

## 7. Push Rule / 推送规则

After commit:

commit 完就执行：

```bash
git push origin main
```

If push succeeds, you are done.

如果 push 成功，这一轮就结束了。

## 8. Common Problems / 常见问题

### Problem A / 问题 A

`index.lock` exists

Meaning:

说明：

- an old Git process was interrupted
- the repo lock file was left behind

- 之前某个 Git 操作被中断了
- 仓库锁文件残留了

Fix:

处理：

```powershell
Remove-Item -LiteralPath E:\CODEX\CODEX_test\AttraX\_git\index.lock -Force
```

Then retry:

然后重试：

```bash
git add <files>
git commit -m "message"
git push origin main
```

### Problem B / 问题 B

Push fails because of network

Meaning:

说明：

- your commit is usually still saved locally
- only the remote push failed

- 本地 commit 往往已经成功了
- 只是远端 push 失败

Check:

检查：

```bash
git status -sb
```

If you see:

如果你看到：

```text
## main...origin/main [ahead 1]
```

that means local commit is already done, and you only need to retry:

说明本地提交已经成功，你只需要重新执行：

```bash
git push origin main
```

### Problem C / 问题 C

There are unrelated modified files

Meaning:

说明：

- do not commit everything together
- add only your own files

- 不要全部一起提交
- 只 add 你这次负责的文件

## 9. Team Workflow / 团队协作流程

### For each person / 每个人每次提交都这样走

1. finish one small task
2. run `git status -sb`
3. add only relevant files
4. commit with a clear message
5. push to `main`
6. tell teammates what changed

1. 完成一个小任务
2. 跑 `git status -sb`
3. 只 add 相关文件
4. 用清楚的 message 提交
5. push 到 `main`
6. 告诉队友这次改了什么

### Recommended cadence / 推荐节奏

- one feature = one commit
- one bugfix = one commit
- one doc update = one commit

- 一个功能一个 commit
- 一个 bug 修复一个 commit
- 一次文档更新一个 commit

## 10. Minimum Safe Workflow / 最小安全工作流

If you are in a hurry, use this:

如果你很赶时间，就走这个最小版本：

```bash
git status -sb
git add <only your files>
git commit -m "short clear message"
git push origin main
```

## 11. Current Repo Notes / 当前仓库特殊提醒

For this repo:

针对这个仓库，目前要特别注意：

- `.git` points to `_git/`
- stale `_git/index.lock` may appear after interrupted operations
- avoid committing `test_pic/` unless it is intentionally part of the project
- avoid committing unrelated modified docs together

- `.git` 实际指向 `_git/`
- 中断过的 Git 操作可能留下 `_git/index.lock`
- `test_pic/` 除非明确需要，否则不要提交
- 不要把无关文档改动顺手一起提交

## 12. Default Upload Template / 默认上传模板

Use this exact mini-playbook every time:

以后每次都可以直接照抄这套：

```bash
git status -sb
git add <your files>
git commit -m "clear short message"
git push origin main
```

If lock error happens:

如果遇到 lock 错误：

```powershell
Remove-Item -LiteralPath E:\CODEX\CODEX_test\AttraX\_git\index.lock -Force
```

Then rerun:

然后重新执行：

```bash
git add <your files>
git commit -m "clear short message"
git push origin main
```
