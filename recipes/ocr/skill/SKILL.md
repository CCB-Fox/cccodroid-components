---
name: ocr
description: 用 Tesseract 把图片和扫描版 PDF 里的文字识别成可编辑文本，支持简体中文、繁体中文和英文，也能输出带文字层的可搜索 PDF（cccodroid 的 ocr 组件）。用户给你截图、照片、扫描件要提取文字，或者要把扫描 PDF 变成能搜索的 PDF 时使用。
---

# OCR：图片与扫描 PDF 文字识别

本机装的是 **tesseract 5.5.3** + **poppler 26.02.0**（转 PDF 页面用），语言包来自
**tessdata_fast**（提交 `87416418657359cb625c412a48b6e1d6d41c29bd`，Apache-2.0）：
`chi_sim`（简体）、`chi_tra`（繁体）、`eng`（英文）、`osd`（方向检测）。

## 运行链路

```
ocr（本组件的 shell 包装，$PREFIX/bin/ocr）
  ├─ 图片输入 → $PREFIX/bin/tesseract（本组件：Termux tesseract 5.5.3）
  │     └─ 语言包 → $PREFIX/share/cccodroid/components/ocr/tessdata/（本组件 fetch 的 tessdata_fast）
  └─ PDF 输入 → 逐页循环（一页一页来）：
        $PREFIX/bin/pdftoppm（本组件 poppler 26.02.0）把当前页按 300 dpi 转 PNG
        → tesseract 识别 → 立刻删掉这一页的 PNG
        └─ --pdf 输出 → 每页的可搜索 PDF → $PREFIX/bin/pdfunite 合并
```

| 这一环 | 由谁提供 | 在哪 | 缺了会怎样 |
|---|---|---|---|
| `ocr` 包装 | 本组件 | `$PREFIX/bin/ocr` | 命令不存在 |
| `tesseract` | 本组件：Termux 包 `tesseract` 5.5.3 | `$PREFIX/bin/tesseract` | `ocr` 直接报「找不到 tesseract」 |
| 语言包 | 本组件 fetch：tessdata_fast，钉死 commit 和 sha256 | `$PREFIX/share/cccodroid/components/ocr/tessdata/` | 缺哪个语言就报哪个，并列出可用语言 |
| `pdftoppm` / `pdfinfo` / `pdfunite` | 本组件：Termux 包 `poppler` 26.02.0 | `$PREFIX/bin/` | 只有 PDF 输入不可用；图片输入照常 |
| `magick` | **底座**（仅 selftest 生成测试图用） | `$PREFIX/bin/magick` | 只影响 `ocr-selftest` |
| 中文字体 | **系统** `/system/fonts/NotoSansCJK-Regular.ttc`（仅 selftest 生成中文测试图用） | 系统目录 | 只影响 selftest 的中文分支；OCR 本身不需要本机字体 |

- 全程不联网，纯 CPU。语言包在组件里，不会写到 `$HOME` 或其他目录。
- 组件里用的是 `--tessdata-dir` 指向自己的语言包目录，等价于设置 `TESSDATA_PREFIX`，不会碰系统/用户目录里的 tessdata。

## 先自检

```sh
ocr-selftest
```

最后一行应是 `===== 总结 ===== langs=OK image=OK pdf=OK searchable=OK fonts=CJK`（CI 无系统字体时是 `fonts=ASCII`）。
不联网，只写 `$TMPDIR`。

## 基本用法

```sh
ocr image.png                     # 默认 chi_sim+eng，文本打到 stdout
ocr image.png --lang chi_sim      # 纯中文（比 chi_sim+eng 更稳，实测更少乱码）
ocr image.png --lang eng          # 纯英文
ocr scan.pdf                      # 扫描 PDF → 文本（自动逐页转图）
ocr scan.pdf --pdf searchable.pdf # 输出带文字层的可搜索 PDF
ocr image.png --pdf out.pdf       # 单张图片也可以出可搜索 PDF
ocr image.png --psm 6             # 整块文字；默认 psm 3
```

- **纯中文优先 `--lang chi_sim`**：实测 `chi_sim+eng` 在短中文行上可能被英文模型带偏（例如把“中文识别测试”末尾识别成 `int`），单独用 `chi_sim` 就正常。
- **中英混排用 `--lang chi_sim+eng`**：两行都有时这是必须的；如果某一行识别成乱码，把那一行裁出来单独用对应语言再识别。
- PDF 一律按 **300 dpi** 转图；页数很多时慢一些，但比低 dpi 准确。
- **临时空间按页算**：转一页 → 识别 → 立刻删图，几百页的 PDF 也不会在 `$TMPDIR` 堆几百 MB 图片。
  用 `--pdf` 时每页的小 PDF 会保留到 `pdfunite` 合并，但一张 300 dpi 图片（通常几 MB）不会同时存在多张。
- 输出文件已存在会被覆盖，不会询问。

## 语言包与 TESSDATA_PREFIX

```sh
tesseract --tessdata-dir "$PREFIX/share/cccodroid/components/ocr/tessdata" --list-langs
# List of available languages ... (4): chi_sim chi_tra eng osd

# 直接调 tesseract 时也可以这样指定（实测等价）：
TESSDATA_PREFIX="$PREFIX/share/cccodroid/components/ocr/tessdata" \
  tesseract image.png stdout -l chi_sim --psm 6
```

- 不要往 `$HOME/.tessdata` 或 `$PREFIX/share/tessdata` 里装语言包；本组件的语言包在私有目录里。
- 方向/文字方向检测（osd）：

```sh
tesseract page.png stdout --tessdata-dir "$PREFIX/share/cccodroid/components/ocr/tessdata" -l osd --psm 0
```

输出 `Orientation in degrees` 和 `Script: Han` 等信息；osd 对只有一两行字的图会报 “Too few characters”，用整页图。

## 什么时候用 OCR，什么时候直接看图

- **一两张图、只想知道内容** → 直接让 Claude 看图更快更准；不用先转文字。
- **很多页、要全文搜索、要交给别的程序处理、要可搜索 PDF** → 用本组件。
- **PDF 抽不出文字**（pdftotext 输出空白）→ 说明是扫描件，用本组件；pdf-tools 组件的 skill 里也是这么指向的。

## 中文准确率（选 fast 模型的理由）

本机用同一批中文样例比较了 `tessdata_fast` 和标准 `tessdata`：

| | fast | 标准版 |
|---|---|---|
| 四个语言包体积 | **19 MB** | **115 MB**（6 倍） |
| 小字号（11pt）整段 | 全对，输出无多余空格 | 全对，但**每个汉字之间插空格** |
| 个别难字（蕉/橘） | 1–3 个字错，偶尔掉行 | 0–1 个字错 |
| 输出可读性 | 干净，可直接用 | 需要先去掉汉字间的空格 |

所以组件选 **fast**：手机端体积优先，输出更干净；标准版只在个别难字上略好。遇到个别字不准时，
把那一块放大/裁剪后重试，或换 `--psm 6`，不要因此去下载 100 MB 的标准模型。

## 常见坑

| 现象 | 原因 / 处理 |
|---|---|
| 中文行末尾识别成英文乱码 | `chi_sim+eng` 的英文模型干扰；纯中文用 `--lang chi_sim` |
| 某个字反复识别错 | fast 模型的能力边界；放大/裁剪/`--psm 6` 重试，或让 Claude 直接看图核对 |
| 可搜索 PDF 里汉字之间有空格 | tesseract 文字层的正常行为；用 `pdftotext out.pdf - \| tr -d ' '` 去空格再搜索 |
| `Too few characters. Skipping this page`（psm 0） | 图片太小/字太少；osd 需要整页图 |
| PDF 识别很慢 | 每页按 300 dpi 转图；页多时属正常，可先用 pdf-tools 拆出需要的页 |
| `没有语言包 xxx` | `--lang` 写错或组件没装全；用 `--list-langs` 看可用的四个语言 |
