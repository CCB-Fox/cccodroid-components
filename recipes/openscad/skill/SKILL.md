---
name: openscad
description: 用 OpenSCAD 写 .scad 脚本建 3D 模型并导出 STL / OFF / AMF / CSG 或 2D 的 DXF / SVG（cccodroid 的 openscad 组件）。用户要画 3D 零件、做参数化建模、改尺寸重出模型、导出 3D 打印用的 STL、或者问「能不能画个……的零件」时使用。
---

# OpenSCAD：用代码画 3D 零件

本机装了 OpenSCAD **无头构建**（NULLGL）：写 `.scad` 脚本，导出模型文件。
**没有图形界面，也不能导出 PNG/图片**（一导就段错误）。要看模型长什么样，导出 STL 后交给用户，
或者用 `scad-export … out.svg`（2D）让用户在应用内查看器里看图。

## 先自检

```sh
scad-export --selftest
```

最后一行 `===== 总结 ===== 导出=OK MCAD=OK 版本=…` 就是好的。约 0.5 秒。

## 基本用法

```sh
scad-export <输入.scad> [输出文件] [openscad 的其它参数…]
```

- **输出文件不给** → 写在输入文件旁边，扩展名换成 `.stl`。
- 成功的唯一输出是**输出文件的绝对路径**（stdout 只有这一行），失败时错误在 stderr、退出码 1。
- **扩展名决定格式**：`stl`（默认 ASCII 文本）/ `off` / `amf` / `csg` / `ast`；
  `dxf`、`svg` 只能导 **2D** 模型（`square` / `circle` / `polygon` / `text` 这些没挤出的东西），
  拿 3D 模型导它们会报 `Current top level object is not a 2D object`。
- 默认导出的 STL 是 ASCII，一个面一行，好读；文件太大就加 `--export-format binstl` 出二进制（小一半以上）。

```sh
scad-export bracket.scad                              # → bracket.stl，就在旁边
scad-export bracket.scad /sdcard/cccodroid/bracket.stl
scad-export logo.scad /sdcard/cccodroid/logo.svg      # 2D 导出
scad-export bracket.scad out.stl -D 'width=60' -D 'height=50'
scad-export big.scad out.stl --export-format binstl
```

**给用户的成品（STL、SVG）写到 `/sdcard/cccodroid/` 下**，用户能在文件管理器里看到、能拿去切片。

## 参数化：一次写好，反复改尺寸

把尺寸写成文件开头的变量，导出时用 `-D 变量=值` 覆盖 —— 不用改文件：

```scad
// bracket.scad
width = 40;  height = 30;  thickness = 4;
cube([width, thickness, height]);
cube([thickness, width, height]);
```

```sh
scad-export bracket.scad small.stl -D 'width=20'
scad-export bracket.scad big.stl   -D 'width=60' -D 'height=50'
```

## 自带 MCAD 库（螺丝、齿轮、轴承、盒子…）

组件里带了 MCAD 库，包装脚本已经把路径接好，`use <MCAD/…>` 直接可用：

模块名（都是从库里查出来的，直接用）：

| 文件 | 模块 |
|---|---|
| `MCAD/boxes.scad` | `roundedBox(size, radius, sidesonly)` |
| `MCAD/gears.scad` | `gear(number_of_teeth, circular_pitch, …)` —— **是 2D 的，要自己 `linear_extrude`** |
| `MCAD/involute_gears.scad` | `gear(number_of_teeth, circular_pitch, gear_thickness, bore_diameter, …)` —— **本来就是 3D，别再挤出**；还有 `bevel_gear_pair` |
| `MCAD/nuts_and_bolts.scad` | `nutHole`、`boltHole` |
| `MCAD/metric_fastners.scad` | `cap_bolt`、`csk_bolt`、`washer`、`flat_nut`、`bolt` |
| `MCAD/bearing.scad` | `bearing` |
| `MCAD/stepper.scad` | `motor`（nema17 之类） |
| `MCAD/polyholes.scad` | `polyhole`（3D 打印的圆孔，避免小孔被切片器抹平） |
| `MCAD/teardrop.scad` | `teardrop(radius, length, angle)`（横孔的顶部收成尖角，免支撑） |
| `MCAD/regular_shapes.scad` | `reg_polygon`、`pentagon`、`hexagon`、`octagon`… |
| `MCAD/shapes.scad` | `box`、`cone`、`tube`、`ellipsoid` |

```scad
use <MCAD/boxes.scad>;
roundedBox([20,20,20], 3, true);
```

```scad
use <MCAD/gears.scad>;                              // 2D：要挤出
linear_extrude(height=5) gear(number_of_teeth=20, circular_pitch=200);

use <MCAD/involute_gears.scad>;                     // 3D：直接出实体
gear(number_of_teeth=20, circular_pitch=200, gear_thickness=8, bore_diameter=5);
```

外层还有官方例子：`$PREFIX/share/openscad/examples/`（`Basics` / `Functions` / `Advanced` / `Parametric`），照着改比自己从零写快。

## 读结果（给自己看）

`echo()` 算出来的值，用 `.echo` 后缀倒进文件再看 —— 这是「不改模型就查数」的办法：

```sh
printf 'W = 10;\necho("W is", W);\ncube(W);\n' > check.scad
scad-export check.scad check.echo
cat check.echo        # ECHO: "W is", 30
```

看 STL 里有多少个三角形，就知道模型是不是空壳或复杂得离谱：

```sh
grep -c "facet normal" out.stl         # ASCII STL 的面数
head -1 out.stl                        # 应该以 solid 开头
```

## 常见坑

- **不能导 PNG**。这版是 `NULLGL` 无头构建，导 PNG 会直接段错误（退出码 139）。`scad-export` 会提前拦住并提示。
- **不能导 3MF**：构建时没开，报 `Export to 3MF format was not enabled when building the application`。用 STL 或 AMF。
- **`text()` 里的中文默认是方块！** 必须显式指定字体，否则每个字都渲染成同一个占位方块
  （看起来「成功」了，但所有汉字一模一样，面数还都一样）。可用的家族名：
  `Noto Sans CJK SC`、`Noto Sans CJK JP`、`Noto Serif CJK SC`（都是系统 `/system/fonts` 里的 NotoSansCJK / NotoSerifCJK）。
  `Noto Sans SC`、`Droid Sans Fallback` 这些名字**不认**。拉丁文字不写 `font=` 就正常。

  ```scad
  linear_extrude(height=3) text("你好", size=10, font="Noto Sans CJK SC");
  ```
- `Could not initialize localization.` 这句**每次都会打、无害**（这版没装翻译文件）；包装脚本已经过滤掉了。
- 脚本有语法错误、或者模型是空的，OpenSCAD 返回 1，`scad-export` 会把 `ERROR:` / `WARNING:` 原文转给你看。
  **看到 `WARNING: Ignoring unknown module …` 要当回事** —— 那说明模块名写错了，出来的模型是缺东西的。
- `use <MCAD/involute_gears.scad>` 会打一串 `DEPRECATED: child() / assign() …`，是**那个老库自己的写法**，无害，忽略。
- 版本号有点绕：上游源码是 **2021.01**（组件版本就是这个），但 `openscad --version` 会打
  `2026.07.19` —— 没有 `.git` 的源码包里 OpenSCAD 拿构建日期当版本号，**不是**另一个上游版本。
