# 配方格式 v1 / Recipe format v1

一个组件 = `recipes/<id>/` 目录：

```
recipes/<id>/
  recipe.json        必需：组件定义
  skill/SKILL.md     必需：告诉 cccodroid 里的 Claude 怎么用它（装好后自动成为一个 skill）
  skill/*            可选：skill 的其余文件
  <其他文件>          可选：被 files 引用的包装脚本等
```

配方**只写"装哪些包"**，二进制由 CI 从 [Termux 官方仓库](https://packages.termux.dev) 取 `.deb`、逐个核对 SHA256、
把前缀从 `com.termux` 等长改写成 `cc.codroid` 后打包。仓库里不放任何二进制。

## recipe.json

| 字段 | 必需 | 说明 |
|---|---|---|
| `schema` | ✓ | 固定 `1` |
| `id` | ✓ | 和目录名一致；小写字母、数字、`-`，≤40 字符；`index` 保留 |
| `kind` | ✓ | v1 只有 `"termux"`。`"display"`（需要图形显示）、`"glibc"`（glibc 程序）为后续保留 |
| `revision` | ✓ | 配方修订号，≥1。发布版本是 `<上游版本>-r<revision>`；上游没变但配方改了（换了 skill、包装脚本）就加一 |
| `name` / `desc` | ✓ | `{ "zh": "...", "en": "..." }`，App 里显示 |
| `roots` | ✓ | 要装的 Termux 包名。依赖自动求闭包；`roots[0]` 的版本就是组件的上游版本 |
| `bin` | ✓ | 入口命令（相对 `$PREFIX/bin`），App 里显示 |
| `selftest` | ✓ | 装好后能证明它能跑的一条命令，比如 `gh --version` |
| `license` | ✓ | 上游软件的许可证（SPDX 写法） |
| `repos` | | 额外的 Termux 仓库，目前只有 `"x11"` |
| `exclude` | | 闭包里不要的包（比如 postinst 会失败的可选依赖） |
| `files` | | 额外放进包里的文件：`{ "usr/bin/xxx": { "src": "xxx", "mode": "755" } }`。目标只能在 `usr/` 下；内容里的 `{{PREFIX}}` 会换成真实前缀 |
| `needs` | | `{ "shizuku": bool, "display": bool, "gpu": bool }` —— 用到这些时如实写，App 据此提示 |
| `homepage` | | 上游主页 |
| `maintainers` | | 维护这个配方的 GitHub 用户名 |
| `notes` | | 给维护者看的备注 |

底座（cccodroid 工具包）里已有的包不会重复打进组件。所以组件**绑定底座版本**：
`bases.json` 里每个底座各打一份，用户装的是和自己工具包匹配的那份。工具包更新后组件显示"需要重装"。

## skill/SKILL.md

```markdown
---
name: <skill 名，小写和 ->
description: <一句话：什么时候该用它>
---

正文：怎么调用、常见坑、哪些操作要先征得用户同意。
```

要求：

- 涉及登录的，**绝不让 Claude 读取或打印令牌/密码**，让用户自己在终端里登录。
- 会对外发布、删除、花钱的操作，写明"先问用户"。
- 命令一律带非交互参数（cccodroid 里 Claude 没有 TTY）。

## 版本与发布

- CI 按 `(id, 版本, 底座)` 判断是否已发布，已发布的跳过；要重打就加 `revision`。
- 每个组件一个 Release（tag = id），资产 `<id>-<版本>-for-<底座前 12 位>.tar.gz` 和同名 `.json`。
- 索引 `components.json` 在 `index` Release，用 ed25519 签名（`components.json.sig`），App 内置公钥验签。

## 真机验证

`verified.json`：

```json
{ "gh": { "2.102.0-r1": { "13ba8abc3e53": {
  "date": "2026-10-15", "device": "Lenovo TB320FC / Android 15", "app": "cccodroid 0.1.9",
  "checks": "装好、selftest 通过、skill 装上", "by": "greyoak111" } } } }
```

只有在真机上装过、`selftest` 过了、skill 装上的构建才写进去；`checks` 如实写做了哪些检查。
没写的构建在 App 里显示"未经真机验证"。
