---
name: hugo
description: 用 Hugo 从 Markdown 生成静态网站：新建站点、套主题、本地预览、构建 public/ 成品（cccodroid 的 hugo 组件）。用户要建博客、文档站、作品集，或把 Markdown 变成网站时使用。
---

# Hugo 静态网站

本机装的是 **Hugo 0.168.0 extended（android/arm64）**（`hugo version` 的输出就是版本依据）。
组件本身**不带主题**；主题按 Hugo 的惯例用 git 克隆到站点的 `themes/` 下。

## 运行链路

```
hugo（本组件，$PREFIX/bin/hugo）
  ├─ 站点源文件：hugo.toml + content/（Markdown）+ layouts/
  ├─ 主题：themes/<名字>/（git clone 下来，第一次需要联网；本组件不带主题）
  ├─ 本地预览：hugo server --bind 127.0.0.1 → 内置 HTTP 服务，不联网
  └─ 构建：hugo --minify → public/（纯静态 HTML/CSS/JS，可直接托管）
发布（可选，不属于本组件）：
  cloudflare 组件的 wrangler pages deploy public
```

| 这一环 | 由谁提供 | 在哪 | 缺了会怎样 |
|---|---|---|---|
| `hugo` | 本组件 | `$PREFIX/bin/hugo` | 命令不存在 |
| 主题 | 用户 `git clone`（示例 Ananke） | `<站点>/themes/<名字>` | 构建报找不到主题；站点没有样式 |
| 本地预览服务 | `hugo server` 内置 | `127.0.0.1:<端口>` | 只能构建静态文件，不能预览 |
| 发布 | 可选：cloudflare 组件 | `wrangler` | 没有 cloudflare 组件时只能自己拷 `public/` 去托管 |

## 先自检

```sh
hugo-selftest
```

它在 `$TMPDIR` 用 `hugo new site` 建一个站点，自己写一个最小 layout（不用主题），构建后检查
`public/index.html` 里有标题和正文。最后一行是
`===== 总结 ===== hugo=OK build=OK fonts=CJK`（CI 无系统字体时是 `fonts=ASCII`）。
不联网，不到半秒结束。

## 从零建站（本机实测流程）

```sh
hugo new site mysite
cd mysite

# 套一个主题（示例：Ananke v2.19.1，提交 18867db，克隆下来约 4.4 MB）
git clone --depth 1 https://github.com/theNewDynamic/gohugo-theme-ananke.git themes/ananke
# 在 hugo.toml 里加一行：theme = "ananke"

hugo new content posts/hello.md
# 编辑 content/posts/hello.md；新建的文章默认 draft = true

hugo --minify                  # 生成 public/
hugo server --bind 127.0.0.1 --port 1313
# 浏览器打开 http://127.0.0.1:1313/
```

- `hugo server` 实测返回 HTTP 200，页面里的中文内容正常（`grep` 能在返回的 HTML 里找到标题和正文）。
  让用户在 App 内浏览器打开 `http://127.0.0.1:1313/` 即可；长时间运行要放后台，用完结束进程。
- `hugo --minify` 实测约 94 ms（11 个页面，套 Ananke）；不套主题的最小站点约 0.12 秒。
- `hugo new content` 建的文件是 `draft = true`，默认**不会**出现在构建结果里。
  预览草稿用 `hugo -D --minify`（实测能生成草稿页面），正式发布前把 `draft` 改成 `false`。
- 主题名必须和 `themes/` 下的目录名一致（`theme = "ananke"` ↔ `themes/ananke`）。
- 主题是从 GitHub 克隆的第三方代码，第一次需要联网；组件不绑定任何主题，也不替用户选主题。

## 发布到 Cloudflare Pages（可选）

**`requires` 里没有 cloudflare**：不装也能正常建站，只是少了发布这一步。

装了 cloudflare 组件时：

1. **登录只能用户自己来**。请用户在终端里运行 `cf-login`，按提示粘贴 API 令牌和账户 ID
   （输入不回显）。不要向用户索要令牌，也不要读取 `~/.config/cloudflare/` 里的文件。
2. 用户登录后，`wrangler whoami` 可以确认当前账号。
3. 发布前先征得用户同意（这是对外操作）：

```sh
wrangler pages deploy public --project-name <项目名>
```

说明：本机只验证了 `wrangler pages deploy --help` 的参数（`--project-name` 等），
**没有实际登录或部署**；发布路径需要用户自己完成登录后执行。

## 常见坑

| 现象 | 原因 / 处理 |
|---|---|
| 构建报找不到主题 | `hugo.toml` 的 `theme` 和 `themes/<目录名>` 不一致，或主题没克隆下来 |
| 新写的文章构建后不见了 | 默认 `draft = true`；改成 `false`，或预览时加 `-D` |
| 手机本地预览打不开 | 用 `--bind 127.0.0.1`；端口被占用就换 `--port` |
| 页面没有样式 | 主题没装或 `theme` 没配置；主题目录要在站点的 `themes/` 下 |
| 发布后链接指向 example.org | `hugo.toml` 的 `baseURL` 还是默认值；部署前改成实际站点地址 |
| 想用主题但没网 | 主题需要先 `git clone`；组件不带主题，离线时只能用自己写的 layout |
