---
name: office-convert
description: 无头 LibreOffice（cccodroid 的 libreoffice 组件）：把 Office 文档转成 PDF 或别的格式，或把文档内容转成纯文本读出来。用户要给 docx / xlsx / pptx / odt / ods / odp / doc / xls / ppt / rtf / csv / html 转格式、导出 PDF、或者想让你「看一眼」某个 Office 文件的内容时使用。
---

# Office 文档转换（无头 LibreOffice）

本机装了完整的 LibreOffice 26.8.1.1，**只能无头跑**（没有图形界面）：命令行转格式、导出 PDF。

## 先自检

```sh
office-convert --selftest
```

最后一行是 `===== 总结 ===== 转换=OK 输出=PDF 中文=OK` 就是好的。约 1 秒。

## 基本用法

```sh
office-convert <输入文件> [目标格式] [输出目录]
```

- **目标格式**不给就是 `pdf`。输出目录不给就写在输入文件旁边。
- 成功的唯一输出是**输出文件的绝对路径**（stdout 只有这一行），失败时错误在 stderr、退出码 1。
- 一次一个文件；要批量就循环（并发跑也没问题，各用各的配置目录）：

```sh
office-convert report.docx pdf /sdcard/cccodroid/out
for f in *.docx; do office-convert "$f" pdf /sdcard/cccodroid/out; done
```

常用格式：`pdf` `docx` `xlsx` `pptx` `odt` `ods` `odp` `csv` `txt` `html` `rtf` `epub` `png`。
新旧格式互转都行（`doc → docx`、`xlsx → csv`、`fodt → docx` 都可以）。
要指定过滤器就写全名，格式是 `<扩展名>:<过滤器>`：

```sh
office-convert slides.pptx pdf:impress_pdf_Export /sdcard/cccodroid/out
```

带参数导出（**导出 PDF/A-1b** 就是下面这条，已验证）：

```sh
"$PREFIX/lib/libreoffice/program/soffice" --headless --norestore --nolockcheck \
  -env:UserInstallation="file://$TMPDIR/lo-a" \
  --convert-to 'pdf:writer_pdf_Export:{"SelectPdfVersion":{"type":"long","value":"1"}}' \
  --outdir /sdcard/cccodroid/out report.docx
```

## 读文档内容（给 Claude 自己看）

想「读一下这个 docx/xlsx/ppt」——先转文本再读，不要试图解压 XML 猜结构：

```sh
office-convert report.docx txt "$TMPDIR"
cat "$TMPDIR/report.txt"

office-convert book.xlsx csv "$TMPDIR"     # 只导第一个工作表
```

PDF 也一样，组件里带了 poppler 的命令行工具：

```sh
pdftotext file.pdf -            # 取正文（UTF-8）
pdffonts file.pdf               # 用了哪些字体、有没有嵌进去
pdfinfo file.pdf                # 页数、页面尺寸、PDF 版本
pdftoppm -png -r 96 file.pdf /sdcard/cccodroid/page   # 转成图片，可以在查看器里看
```

**给用户交付成果（PDF、图片等）时，输出到 `/sdcard/cccodroid/` 下**，用户能在文件管理器里看到。

## 已知限制

- **没有图形界面**：没有任何窗口、菜单，`soffice` 不带 `--headless` 是起不来的。看文档用应用内查看器。
- **没带的东西**（组件刻意裁掉了，无头转换用不到）：MySQL / PostgreSQL 数据库连接器、Impress 里的音视频播放（gstreamer）、`xdg-open` 这类桌面集成、Perl 小工具（`wpg2svg`）、doxygen。文档本身的转换不受影响。
- **PDF 不能当输入转成 docx/odt**：LibreOffice 把 PDF 当图形导入（Draw 文档），只能导出成图片格式或 PDF；转 `odt`/`docx` 会报 `no export filter`。
- HTML 里的 `<img src="…">` **外链图片不会嵌进去**（LibreOffice 导入 HTML 的固有行为，不是缺包）。要图片一起走，用 docx/odt 这类自带资源的格式。
- 中文正常情况下没问题：字体来自系统的 `/system/fonts`（NotoSansCJK），组件里不塞字体包。`--selftest` 最后一行会写 `中文=OK`；如果是 `缺字体`，转出来的中文是方块，得先解决系统字体。
- 大文档慢一些但不多：300 段带中文的文档转 PDF 约 1 秒。
- 每次调用会在 `$TMPDIR` 下建一个临时用户配置目录（约 580 KB），结束就删 —— 不在 `$HOME` 里留东西。要用固定目录（例如想留住配置）就 `CCODROID_LO_PROFILE=/某个/目录 office-convert …`。
