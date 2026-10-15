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

例外是 `fetch`：组件要用的东西官方仓库里确实没有时（例如 glibc 侧的 OpenCL —— 厂商的 `libOpenCL.so`
是 bionic 库，glibc 程序加载不了，官方仓库里也没有可用的替代），可以声明**该组件自己的上游构件**的 URL +
SHA256，CI 下载核对后打进包里。规则见下面「`fetch`：仓库外的上游构件」。**仓库里依然不放二进制，
市场自己的 Release 也不许当 fetch 的来源**（那等于绕开评审塞二进制）。

## recipe.json

| 字段 | 必需 | 说明 |
|---|---|---|
| `schema` | ✓ | 固定 `1` |
| `id` | ✓ | 和目录名一致；小写字母、数字、`-`，≤40 字符；`index` 保留 |
| `kind` | ✓ | `"termux"`（`$PREFIX/bin` 里的程序）或 `"glibc"`（Linux arm64 / glibc 程序，装在 `$PREFIX/glibc/`）。`"display"`（需要图形显示）为后续保留 |
| `revision` | ✓ | 配方修订号，≥1。发布版本是 `<上游版本>-r<revision>`；上游没变但配方改了（换了 skill、包装脚本）就加一 |
| `version` | | 自己指定上游版本（代替 `roots[0]` 的版本）；发布版本照样是 `<version>-r<revision>`。配 `fetch` 的组件用它——版本来自上游构件，不该跟着 `roots[0]` 走 |
| `name` / `desc` | ✓ | `{ "zh": "...", "en": "..." }`，App 里显示 |
| `roots` | ✓ | 要装的 Termux 包名。依赖自动求闭包；`roots[0]` 的版本就是组件的上游版本 |
| `bin` | ✓ | 入口命令（相对 `$PREFIX/bin`），App 里显示 |
| `selftest` | ✓ | 装好后能证明它能跑的一条命令，比如 `gh --version` |
| `license` | ✓ | 上游软件的许可证（SPDX 写法） |
| `repos` | | 额外的 Termux 仓库，目前只有 `"x11"` |
| `exclude` | | 闭包里不要的包（比如 postinst 会失败的可选依赖） |
| `files` | | 额外放进包里的文件：`{ "usr/bin/xxx": { "src": "xxx", "mode": "755" } }`。目标只能在 `usr/` 下；内容里的 `{{PREFIX}}` 会换成真实前缀 |
| `fetch` | | 仓库之外的上游构件（官方仓库里没有的东西），见下节 |
| `needs` | | `{ "shizuku": bool, "display": bool, "gpu": bool }` —— 用到这些时如实写，App 据此提示 |
| `homepage` | | 上游主页 |
| `maintainers` | | 维护这个配方的 GitHub 用户名 |
| `notes` | | 给维护者看的备注 |

底座（cccodroid 工具包）里已有的包不会重复打进组件。所以组件**绑定底座版本**：
`bases.json` 里每个底座各打一份，用户装的是和自己工具包匹配的那份。工具包更新后组件显示"需要重装"。

## `fetch`：仓库外的上游构件

只在**官方仓库里确实没有**、而组件非用不可的时候写（典型：glibc 侧的 OpenCL —— 厂商的 `libOpenCL.so`
是 bionic 库，glibc 进程加载不了，官方仓库里也没别的可用）。每条是「落地路径 → 来源」，路径只能在 `usr/` 下：

```jsonc
"fetch": {
  "usr/glibc/lib/libOpenCL.so":   { "url": "https://…/libOpenCL.so", "sha256": "…",
                                    "why": "clvk 本体，clspv 内嵌在里面；官方仓库的 clvk 是 bionic 的，glibc 用不了" },
  "usr/glibc/bin/clspv":          { "url": "https://…/clspv", "sha256": "…", "mode": "755",
                                    "why": "离线把 OpenCL C 编成 SPIR-V" },
  "usr/glibc/lib/libOpenCL.so.1": { "link": "libOpenCL.so" }
}
```

要求：

- **sha256 写全**（64 位小写十六进制）：CI 下载后先核对再入包，对不上就构建失败。
- `mode`：权限（默认 `644`）。要装可执行文件就得写 `"755"`。
- `link`：只做一条软链、不下载，**目标只能写同目录的文件名**（不许绝对路径、不许带 `/`）。上游库的 SONAME 是
  `libX.so.1` 而文件叫 `libX.so` 时必须补这条 —— 链接过它的程序运行时找的是 `.so.1`。
- `why`：这是什么、为什么不能走 Termux 官方仓库。会进构建清单，给以后查的人看。
- `source` / `version`：出处、版本（只记账；默认 `pypi` / 从文件名猜）。配 `fetch` 的组件通常自己写 `version`。
- 不许指向**市场仓库自己**（Release、raw、codeload 都算 —— 那等于自带二进制），也不许 http。
- 只放**这个组件自己**运行要用的东西，不要顺手捎带别的工具；许可证必须允许再分发。
- `roots` 照写（决定跟着哪个底座打包、`roots[0]` 也是版本基准之一）；底座里已有的包不会重复打。

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
