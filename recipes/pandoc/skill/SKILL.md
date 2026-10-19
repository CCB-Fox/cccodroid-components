---
name: pandoc
description: 用 Pandoc 在 Markdown、Word（docx）、HTML、EPUB、PDF 之间互转（cccodroid 的 pandoc 组件）。用户要把 Markdown 交成 Word/网页/电子书/PDF、把 Word 转成 Markdown、或给文档加目录和自定义 Word 样式时使用。
---

# Pandoc：文档格式互转

本机装的是 **pandoc 3.12.1**（`pandoc --version`）。命令行工具，无图形界面。

## 运行链路

```
pandoc（本组件，$PREFIX/bin/pandoc）
  ├─ docx / html / epub / md：pandoc 自己完成，不调用外部程序
  └─ PDF：--pdf-engine=typst
       └─ typst 0.15.1（底座 devkit 自带，$PREFIX/bin/typst）
            └─ 中文字体：/system/fonts 里的 Noto Sans CJK（底座环境已设 TYPST_FONT_PATHS=/system/fonts）
```

| 这一环 | 由谁提供 | 在哪 | 缺了会怎样 |
|---|---|---|---|
| `pandoc` | 本组件（Termux 包 `pandoc` + `lua54`） | `$PREFIX/bin/pandoc` | 命令不存在 |
| PDF 引擎 `typst` | 底座（devkit-2026.10.18 自带 0.15.1） | `$PREFIX/bin/typst` | 只有 `md → pdf` 失败并报找不到引擎；docx/html/epub 不受影响 |
| 中文字体 | 系统 `/system/fonts` + 底座的 `TYPST_FONT_PATHS` | 环境变量 | **不报错**，但中文变成方框；表格首行可能压在表头横线上 |
| `unzip`（仅 selftest 用） | 底座 | `$PREFIX/bin/unzip` | 只影响 `pandoc-selftest`，正常转文档不需要 |

全程不上网。除 PDF 外都不依赖 typst。

## 先自检

```sh
pandoc --version        # 应显示 3.12.1
pandoc-selftest         # 转 docx / html / PDF 各一次，最后一行是 ===== 总结 =====
```

`pandoc-selftest` 只写 `$TMPDIR`，不联网。

## 常用命令（都已在本机实测）

```sh
pandoc in.md -o out.docx                              # Markdown → Word
pandoc in.md -o out.html --standalone --toc           # Markdown → 独立网页，带目录
pandoc in.md -o out.epub                              # Markdown → EPUB
pandoc in.md -o out.pdf --pdf-engine=typst -V mainfont="Noto Sans CJK SC"
pandoc in.docx -o out.md                              # Word → Markdown
```

- 图片按 Markdown 里的相对路径找，运行时的当前目录要对；从别处跑时加 `--resource-path=<图片目录>`。
- 输出文件已存在会被直接覆盖，不会询问。
- 输入只有英文时可以不写 `-V mainfont`；**含中文就写**，见下一节。

## PDF 与中文（本机实测的写法）

底座有 typst，所以**不需要 LaTeX**：

```sh
pandoc in.md -o out.pdf --pdf-engine=typst -V mainfont="Noto Sans CJK SC"
```

实测结果（样例含中文段落、表格、代码块、图片）：

- 上面这条命令中文正常，表格、代码块、图片和 `图 1` 题注都对。
- **不加 `-V mainfont` 也能出 PDF，但表格第一行会压在表头横线上**；中文文档一律加上。
- 加 `--toc` 可出中文“目录”页：`pandoc in.md -o out.pdf --pdf-engine=typst --toc -V mainfont="Noto Sans CJK SC"`。
- 字体能用的前提是 `TYPST_FONT_PATHS=/system/fonts`（底座默认已设）。如果从 `env -i` 之类清空环境的方式启动，中文会变成方框，需要自己补上这个变量。
- 文档开头写 `lang: zh-CN` 时 pandoc 会打几条 `Could not load translations …` 警告（Termux 包没带 translations 文件），**不影响输出**；实测“图 1”“目录”仍是中文。不想看警告就重定向 stderr。

## 自定义 Word 样式（`--reference-doc`，实测可用）

要让输出的 Word 套用固定模板（字体、标题颜色、页边距）：

```sh
pandoc --print-default-data-file reference.docx > ref.docx   # 取默认模板
# 用 Word/WPS 改 ref.docx 的样式，或者解压后改 word/styles.xml 再压回
pandoc in.md -o out.docx --reference-doc=ref.docx
```

实测：把模板里 `Heading1` 的颜色改成红色后转换，输出 docx 的 `word/styles.xml` 带上了新颜色，正文确实引用了 `Heading1`。模板里改过的样式会生效，没改的保持 pandoc 默认。

## 和 libreoffice 组件的分工

- **从 Markdown 出发**（写报告、交作业、出电子书）→ 用本组件。
- **已有 Word/Excel/PPT，要高保真转 PDF**（保留页眉页脚、文本框、复杂版式）→ 用 `libreoffice` 组件的无头转换；pandoc 读 docx 只保留语义结构，复杂排版会丢。
- `docx → md` 适合提取文字和标题层级，表格会变成简单文本表，图片会导出为文件。

## 常见坑

| 现象 | 原因 / 处理 |
|---|---|
| PDF 里中文是方框 | 没设 `TYPST_FONT_PATHS=/system/fonts`，或没写 `-V mainfont="Noto Sans CJK SC"` |
| 中文表格首行压线 | 没写 `-V mainfont`；补上即可 |
| `Could not load translations for zh-CN` | 包的 translations 文件缺失，警告可忽略 |
| 找不到图片 | 当前目录不对；加 `--resource-path=<目录>` |
| 复杂 Word 转出来版式变了 | pandoc 保留的是内容结构，不是版式；要高保真用 libreoffice 组件 |
