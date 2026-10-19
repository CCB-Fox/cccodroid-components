---
name: latex
description: 用 Tectonic 把 .tex 编译成 PDF（XeTeX 引擎，支持 ctex / xeCJK 中文和 beamer）。用户已经有 .tex 文件、期刊模板，或明确要 LaTeX 排版时使用；简单文档和中文排版优先用底座自带的 typst。
---

# LaTeX 编译：Tectonic

本机装的是 **Tectonic 0.17.0**（`tectonic --version` 的输出就是版本依据）。
它是自包含的 XeTeX 引擎，不需要另装 TeX Live；第一次编译时按需下载 TeX 资源包。

## 运行链路

```
tectonic（本组件，$PREFIX/bin/tectonic）
  ├─ XeTeX 引擎 + xdvipdfmx        ← 本组件二进制
  ├─ 动态库（fontconfig / freetype / harfbuzz / libicu / openssl …）
  │                                 ← 底座 devkit 已有
  ├─ TeX 资源包（包、类、字体）
  │     ├─ 第一次编译：从 https://relay.fullyjustified.net 按需下载
  │     │   （索引 default_bundle_v33.tar.index.gz 会重定向到 data1b.fullyjustified.net）
  │     └─ 缓存在 $HOME/.cache/tectonic，可用 TECTONIC_CACHE_DIR 覆盖
  └─ 中文字体
        ├─ ctex 默认用资源包里的 Fandol 字体（第一次中文编译时下载）
        └─ 系统 /system/fonts/*.ttc 是 TrueType Collection，**不能直接嵌入**
```

| 这一环 | 由谁提供 | 在哪 | 缺了会怎样 |
|---|---|---|---|
| `tectonic` | 本组件 | `$PREFIX/bin/tectonic` | 命令不存在 |
| 动态库 | 底座 devkit | `$PREFIX/lib/` | `tectonic` 起不来（`CANNOT LINK EXECUTABLE`） |
| TeX 资源包 | 第一次编译联网下载 | `$HOME/.cache/tectonic` | 离线且缓存为空时**明确报错**；缓存热了之后离线可用 |
| 中文字体 | ctex 默认 Fandol（资源包） | 缓存内 | 中文文档缺字体时报错；用系统 TTC 会报 `sfnt: table not found` |

## 第一次编译要联网（重要）

Tectonic 本体只有 3.9 MB，**TeX 资源包是运行时按需下载的**。本机实测（家庭网络）：

| 文档 | 首次下载/缓存 | 首次耗时 | 热缓存耗时 |
|---|---|---|---|
| 最小英文 article | 约 42 MB | 166 秒 | 0.92 秒 |
| 英文 beamer，再加中文 ctexbeamer | 再增约 11 MB（两者合计 158 个文件） | 103 秒 + 18 秒 | — |
| 中文 ctex（Fandol） | 再增约 18 MB（另加 ctex 包约 1 MB；空缓存总计约 61 MB） | 26 秒（ctex 包已缓存时） | 秒级 |

- 下载是**逐文件**进行的，文件多时主要耗在请求延迟上，不只是总字节数。
- **第一次编译前先告诉用户**：要联网、下载多大、大概多久；用户同意后再跑。
  流量敏感或网络差时，建议先用 typst。
- 缓存默认在 `$HOME/.cache/tectonic`（应用私有目录，不会写到别处）。
  `TECTONIC_CACHE_DIR=/path` 可以改位置，优先级高于 `XDG_CACHE_HOME`。

## 先自检

```sh
latex-selftest
```

它**不联网**：检查 `tectonic --version` 和 `--help`；如果本机资源缓存已经是热的，
再跑一次 `--only-cached` 的最小文档，验证离线编译。
最后一行是 `===== 总结 ===== tectonic=OK offline=skip|ok|failed fonts=CJK`（CI 无系统字体时是 `fonts=ASCII`）。
新装、还没联网编译过时 `offline=skip` 是正常的。

## 基本用法

```sh
tectonic hello.tex                 # 生成 hello.pdf（输出和输入同目录）
tectonic -X compile hello.tex      # 同一件事的 v2 写法
tectonic --keep-intermediates hello.tex   # 保留 .aux 等中间文件
tectonic --keep-logs hello.tex            # 保留 hello.log 方便排错
tectonic --only-cached hello.tex   # 只用缓存，不联网（缓存缺失会报错）
tectonic --version                 # Tectonic 0.17.0
```

本机实测的最小英文文档：

```latex
\documentclass{article}
\begin{document}
Hello, Tectonic!  English test 123.
\end{document}
```

## 中文

**推荐：ctex 默认字体集（Fandol）**，不需要系统字体，实测能编译出中文 PDF：

```latex
\documentclass[UTF8]{ctexart}
\begin{document}
\section{中文测试}
中文测试：苹果香蕉橘子。English 123.
\end{document}
```

- 第一次会下载 Fandol 字体（约 18 MB）。
- 生成的 PDF 用 mutool 渲染后 OCR 能读出中文，文字层也能用 `mutool draw -F txt` 正确抽出。
- ctexbeamer 中文幻灯片也实测通过。

**不要用系统 `/system/fonts/NotoSansCJK-Regular.ttc`**：它是 TTC（TrueType Collection），
`fontset=none` + `\setCJKmainfont{Noto Sans CJK SC}` 或 `xeCJK` 都会在 xdvipdfmx 阶段失败：

```
error: the xdvipdfmx engine had an unrecoverable error
caused by: sfnt: table not found...
```

这是 Tectonic 0.17.0 的 xdvipdfmx 对 TTC 的限制，不是字体名写错。中文就用 ctex 默认的 Fandol；
Fandol 缺字时改用 typst 或其它支持系统字体的工具，不要试图指向系统 TTC。

## beamer 幻灯片

```latex
\documentclass{beamer}
\begin{document}
\begin{frame}{Beamer test}
Hello, beamer! English slide.
\end{frame}
\end{document}
```

中文用 `\documentclass[UTF8]{ctexbeamer}`。两种都实测出过 PDF（1 页）。

## 离线使用

- 缓存热了之后：`tectonic --only-cached hello.tex` 实测 0.97 秒，完全不联网。
- 缓存为空时 `--only-cached` 会失败：`failed to open input file "tectonic-format-latex.tex"`。
- 网络不可达时直接编译会 panic（退出码 101），报
  `this bundle isn't cached, and we couldn't get it from the internet`，URL 是
  `https://relay.fullyjustified.net/default_bundle_v33.tar.index.gz`。
- 换新宏包/新字体集时，仍需联网一次让 Tectonic 把对应文件拉进缓存。

## 和 typst 的分工

- **中文排版、简单文档、快速出图**优先用底座自带的 **typst 0.15.1**：不联网、秒出，
  中文直接用 `/system/fonts`（环境已设 `TYPST_FONT_PATHS`）。
- 用户已经有 `.tex`、期刊/会议模板，或明确要求 LaTeX → 用 Tectonic。
- 不要为了「用 LaTeX」把简单文档硬套模板；先问清楚用户是否有现成 `.tex`。

## 常见坑

| 现象 | 原因 / 处理 |
|---|---|
| 第一次编译很慢、卡在 downloading | 资源包逐文件下载，属正常；先告诉用户要联网和大致体积 |
| `sfnt: table not found` | 指向了系统 TTC 中文字体；改用 ctex 默认 Fandol |
| `this bundle isn't cached…` / 退出码 101 | 离线且缓存为空；联网编译一次 |
| `--only-cached` 报 `tectonic-format-latex.tex` 打不开 | 缓存里没有格式文件；去掉 `--only-cached` 联网跑一次 |
| `pdftoppm` / `pdftotext` 报 `Missing language pack for 'Adobe-GB1'` | poppler 缺中文字体映射（poppler-data）；用 `mutool draw` 渲染或抽字（pdf-tools 组件），或用其它 PDF 查看器 |
| 中文 PDF 里文字能看但复制出来是空白 | 同上，poppler 的 CMap 问题；`mutool draw -F txt` 实测能正确抽出中文 |
