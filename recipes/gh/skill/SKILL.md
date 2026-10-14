---
name: github-cli
description: GitHub CLI（gh，cccodroid 组件）：在 GitHub 上开 PR、看/建 Issue、发 Release、查 Actions 运行与日志、调 GitHub API。用户提到 GitHub 仓库、PR、Issue、Release、CI 时使用。
---

# GitHub CLI（gh）

本机装了 GitHub 官方命令行 `gh`（Termux 官方包，已改写为本应用路径）。

## 先确认登录

```sh
gh auth status
```

- **没登录**：不要替用户输入令牌，也不要索要令牌。请用户打开 cccodroid 的终端，运行 `gh auth login`，
  按提示选 GitHub.com → HTTPS → 用浏览器登录（会给一个一次性码，复制后在浏览器里粘贴）。
- 登录后运行一次 `gh auth setup-git`，之后 `git push` 走 https 就不用再输密码。
- 令牌由 gh 自己保存（`~/.config/gh/hosts.yml`），**不要读取、打印或转述它的内容**。

## 常用

```sh
gh repo view owner/repo
gh pr create --fill                      # 用最近的提交信息开 PR
gh pr list / gh pr view 12 / gh pr checks 12
gh issue list --state open / gh issue create -t "标题" -b "正文"
gh release create v1.0.0 dist/*.apk --notes-file NOTES.md
gh run list / gh run view <id> --log-failed
gh api repos/owner/repo/contents/README.md --jq .content | base64 -d
```

- 发 PR、Release、评论都是**对外公开的动作**：先把要发的内容给用户看，确认后再执行。
- 需要交互的命令（如不带参数的 `gh pr create`）在这里没有终端可交互，务必带齐参数（`--title`/`--body`/`--fill`）。
