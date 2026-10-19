---
name: pdf-tools
description: 处理 PDF 文件：合并、拆分、旋转、加密解密、压缩、提取文字、页面转 PNG/JPEG、查看页数与元数据、提取内嵌图片（cccodroid 的 pdf-tools 组件）。用户给你一个 PDF 要读文字、要合并或拆页、要压小、要转成图片时使用。
---

# PDF 工具箱

本机装的是 **qpdf 12.4.2**、**poppler 26.02.0**（`pdftotext` / `pdftoppm` / `pdfinfo` / `pdfimages`）、
**mupdf 1.28.2**（`mutool`），压缩用底座自带的 **ghostscript 10.08.0**（`gs`）。
命令行工具，没有图形界面。

## 运行链路

```
qpdf / pdftotext / pdftoppm / pdfinfo / pdfimages / mutool   ← 本组件（前三个是 poppler，mutool 是 mupdf-tools）
pdf-shrink（本组件的 shell 包装）→ gs                          ← ghostscript 由底座提供
pdf-selftest 里的 typst                                      ← 底座提供，仅自检用
```

| 这一环 | 由谁提供 | 在哪 | 缺了会怎样 |
|---|---|---|---|
| `qpdf`（合并/拆分/旋转/加解密） | 本组件：Termux 包 `qpdf` 12.4.2 | `$PREFIX/bin/qpdf` | 这些操作不可用 |
| `pdftotext` / `pdftoppm` / `pdfinfo` / `pdfimages` | 本组件：Termux 包 `poppler` 26.02.0 | `$PREFIX/bin/` | 抽文字、出图、看信息不可用 |
| `mutool` | 本组件：`mupdf-tools` 1.28.2 + `mupdf` 库 | `$PREFIX/bin/mutool` | 备选抽文字不可用；pdf-tools 的其他命令不受影响 |
| `gs` | **底座** devkit 自带的 `ghostscript` 10.08.0 | `$PREFIX/bin/gs` | 只有 `pdf-shrink` 报「找不到 ghostscript」，其余命令照常 |
| `typst` | **底座**，只给 `pdf-selftest` 生成测试 PDF | `$PREFIX/bin/typst` | 只影响自检，不影响正常使用 |

- 全程不联网，纯 CPU。
- mupdf 库直接链接 `libtesseract` / `leptonica`，所以本组件会带 **tesseract**（约 27.8 MB）。
  这只是 mupdf 的依赖，**本组件不提供 OCR**；扫描件识别用 `ocr` 组件。

## 先自检

```sh
pdf-selftest     # 生成 2 页中文 PDF → 拆分/合并 → 抽字 → 出图 → 压缩
```

最后一行应是 `===== 总结 ===== qpdf=OK text=OK png=OK mutool=OK shrink=OK`。不联网，只写 `$TMPDIR`。

## 合并 / 拆分 / 旋转 / 加解密（qpdf）

```sh
qpdf --empty --pages a.pdf b.pdf c.pdf -- merged.pdf   # 合并（顺序就是给的顺序）
qpdf --empty --pages in.pdf 2 -- only-page-2.pdf       # 只取第 2 页（写成 1-3 就是范围）
qpdf --split-pages=1 in.pdf part.pdf                   # 每页一个文件 → part-1.pdf、part-2.pdf …
qpdf --rotate=+90:1 in.pdf rotated.pdf                 # 第 1 页顺时针 90°
```

- 合并 2 个和 3 个文件都实测过；页数分别是 2 和 3。
- qpdf 也能加密 / 解密 PDF（本机验证过）。但**密码一律由用户自己在终端处理**：
  Claude 不代跑带密码的命令，也不索要、不读取、不输出密码。遇到加密文件，请用户解密后
  再给文件，或让用户自己在终端执行 qpdf 的解密命令（参数见 `qpdf --help`）。

## 提取文字

```sh
pdftotext -layout in.pdf -            # 全部页，保留版式，输出到 stdout
pdftotext -f 2 -l 2 -layout in.pdf -  # 只抽第 2 页
mutool draw -F txt -o out.txt in.pdf  # 备选引擎
```

实测（中文 PDF）：

- `pdftotext -layout` 抽出的中文正确，没有多余的分页标记，**优先用它**。
- `mutool draw -F txt` 也能正确抽出中文，但会多出页码分隔；写到文件用 `-o`。
- 抽出来是空白 → 这份 PDF 没有文字层（扫描件），用 `ocr` 组件；只处理一两页也可以直接让 Claude 看图。

## 页面转图片

```sh
pdftoppm -r 150 -png in.pdf page            # → page-1.png、page-2.png …（A4 150dpi ≈ 1241×1754）
pdftoppm -r 72 -jpeg -f 1 -l 1 in.pdf cover # 只第 1 页 → cover-1.jpg
```

## 查看信息与内嵌图片

```sh
pdfinfo in.pdf                 # 页数、页面尺寸、是否加密、CreationDate 等
pdfimages -list in.pdf         # 列出内嵌图片（页码、尺寸、编码、体积）
pdfimages -all in.pdf img      # 抽出原图 → img-000.png / img-000.jpg …
```

## 压缩

```sh
pdf-shrink in.pdf                              # 默认 ebook，输出 in-shrunk.pdf
pdf-shrink in.pdf out.pdf --quality screen     # 最小，屏幕阅读
pdf-shrink in.pdf out.pdf --quality ebook      # 默认，约 150 dpi
pdf-shrink in.pdf out.pdf --quality printer    # 保留打印质量
```

实测一个 6.0 MB 的图片型 PDF：

| 档位 | 结果 |
|---|---|
| `screen` | 25 KB（缩小 99%） |
| `ebook` | 180 KB（缩小 97%） |
| `printer` | 455 KB（缩小 92%） |

一个 21 KB 的文字 PDF 用 `ebook` 也缩到 16 KB。`pdf-shrink` 不允许把输出写成输入本身；
如果原文件已经压得很紧、结果反而变大，它会如实说出来（文件仍然保留）。

## 常见坑

| 现象 | 原因 / 处理 |
|---|---|
| 打不开 / 提示需要密码 | 加密 PDF；请用户自己解密后再给文件，Claude 不索取、不读取、不输出密码 |
| 抽出来是空白 | 扫描件没有文字层；用 `ocr` 组件 |
| 中文/特殊字符乱码 | PDF 生成时没写 ToUnicode；pdftotext 和 mutool 都可能抽不出来，只能 OCR |
| `pdf-shrink` 说找不到 ghostscript | 底座的 `gs` 不在了，重装/修复工具包，不要自己改组件 |
| 压缩后反而变大 | 原文件已经很紧；换 `--quality screen` 再试，或保留原文件 |
| qpdf 拆分出来一堆文件 | `--split-pages=1` 就是每页一个；只想取某几页用 `qpdf --empty --pages` 自己拼 |
