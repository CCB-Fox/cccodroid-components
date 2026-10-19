---
name: sci-python
description: 用 Python 做数据分析、数值计算和画图：numpy 数组与线性代数、scipy 拟合与信号处理、matplotlib 无头出 PNG/SVG/PDF、Pillow 处理图片、pyarrow 读写 Parquet（cccodroid 的 sci-python 组件）。用户要算统计、拟合曲线、处理表格、画图表、读 Parquet/CSV 时使用。
---

# 科学计算 Python

本机装的是 **numpy 2.5.4**、**scipy 1.18.1**、**matplotlib 3.11.2**、**Pillow 13.0.0**、**pyarrow 26.0.0**
（`sci-python-selftest` 的输出就是版本依据）。都装在 `$PREFIX/lib/python3.14/site-packages`，
用底座的 `python3`（3.14）直接 import，没有图形界面。

## 运行链路

```
python3（底座 devkit 自带）
  ├─ numpy / scipy / matplotlib / Pillow / pyarrow          ← 本组件（Termux 预编译包）
  │    └─ libopenblas、libandroid-complex-math、libarrow-cpp 等   ← 本组件的依赖包（同一批装进来）
  ├─ matplotlib 的 6 个纯 Python 依赖
  │    （配方 pip 钉死版本的 PyPI wheel：cycler 0.12.1、fonttools 4.67.0、
  │     packaging 26.3、pyparsing 3.3.3、python-dateutil 2.9.0.post0、six 1.17.0）
  │    ← 本组件（随包解进 site-packages；postinst 的 pip 看到依赖已满足，不再联网）
  └─ 中文字体 /system/fonts/NotoSansCJK-Regular.ttc   ← 系统提供
       └─ matplotlib 不会自动发现，必须自己 addfont
```

| 这一环 | 由谁提供 | 在哪 | 缺了会怎样 |
|---|---|---|---|
| `python3` | 底座 devkit | `$PREFIX/bin/python3` | 所有包都用不了 |
| numpy / scipy / matplotlib / Pillow / pyarrow | 本组件 | `$PREFIX/lib/python3.14/site-packages/` | 对应的 `import` 失败 |
| OpenBLAS / libarrow-cpp 等共享库 | 本组件的 Termux 依赖包 | `$PREFIX/lib/` | numpy / scipy / pyarrow 导入时报找不到 `.so` |
| matplotlib 的 6 个纯 Python 依赖 | 本组件（配方 `pip` 钉死版本的 PyPI wheel） | `site-packages/` | `import matplotlib` 报 `No module named 'six'` 之类 |
| 中文字体 | 系统 `/system/fonts` | `/system/fonts/NotoSansCJK-Regular.ttc` | 中文变方框，**不报错**；用下面的 addfont 代码解决 |

## 先自检

```sh
sci-python-selftest
```

它会做：numpy 矩阵乘法、scipy 曲线拟合、matplotlib（Agg）出图、Pillow 读图、pyarrow 写读 Parquet。
最后一行应是 `===== 总结 ===== numpy=OK scipy=OK matplotlib=OK pillow=OK pyarrow=OK fonts=CJK`。
脚本用 `python3 -I` 跑，不看用户的 site-packages。不联网，只写 `$TMPDIR`。

## 中文字体（本机实测的写法）

matplotlib **不会扫描 `/system/fonts`**（本机 `font_manager.findSystemFonts()` 返回 0 个字体），
所以只改 rcParams 或只放一个 matplotlibrc 都不够，必须先把字体注册进去：

```python
import matplotlib
matplotlib.use("Agg")                 # 没有显示器，必须用 Agg
from matplotlib import font_manager as fm
import matplotlib.pyplot as plt

fm.fontManager.addfont("/system/fonts/NotoSansCJK-Regular.ttc")
plt.rcParams["font.sans-serif"] = ["Noto Sans CJK SC"]
plt.rcParams["axes.unicode_minus"] = False

fig, ax = plt.subplots()
ax.plot([1, 2, 3], [2, 1, 3])
ax.set_title("中文标题：苹果香蕉")
fig.savefig("out.png", dpi=150)
```

- 这个 TTC 注册后同时提供 `Noto Sans CJK SC / TC / HK / JP / KR`；写 `Noto Sans CJK SC` 实测正常。
- 出 SVG / PDF 也是同样写法：`fig.savefig("out.svg")`、`fig.savefig("out.pdf")`，中文都正常。
- 组件里**没有**放 matplotlibrc：rc 文件只能改字体名，不能注册 `/system/fonts` 里的文件，所以默认配置解决不了中文。

## pandas：能装，但要源码编译约 5 分钟（本机实测）

Termux 仓库没有 `python-pandas`，PyPI 也没有 Termux 能直接用的 wheel：

```sh
pip download --only-binary=:all: pandas
# ERROR: Could not find a version that satisfies the requirement pandas (from versions: none)

pip install pandas
# 默认的隔离构建会先现场编 numpy，失败（complex.h 的 ccosl / cexpl 等未声明）
```

**实测可行的办法**（先装构建工具，再关掉构建隔离）：

```sh
pip install meson-python cython versioneer   # 约 13 秒
pip install --no-build-isolation pandas      # 本机约 5 分钟，装好 pandas 3.0.6
python3 -I -c "import pandas as pd; print(pd.__version__)"
```

- 本机构建出的 wheel 是 `pandas-3.0.6-cp314-cp314-android_24_arm64_v8a.whl`（10.1 MB），装后约 72 MB。
- 这条要联网、要占 CPU 约 5 分钟；**先问用户要不要装**，不要擅自跑。
- 不把 pandas 打进组件；只有用户明确需要时才现场装。

读写 CSV、Parquet 和做分组聚合，优先用底座的 **duckdb**（1.5.6）或本组件的 **pyarrow**（不占这 72 MB）：

```sh
duckdb -c "SELECT * FROM read_csv_auto('data.csv') LIMIT 5;"
duckdb -c "SELECT name, sum(qty) AS total FROM read_csv_auto('data.csv') GROUP BY name;"
duckdb -c "SELECT * FROM 'data.parquet';"
```

```python
import pyarrow as pa, pyarrow.parquet as pq
t = pa.table({"x": [1, 2, 3], "y": ["a", "b", "c"]})
pq.write_table(t, "out.parquet")
print(pq.read_table("out.parquet").to_pydict())
```

数据量大的时候优先 duckdb（直接读文件、不用把整表读进 Python），比用 Python 循环快得多。

## 常用片段

```python
import numpy as np
a = np.arange(6).reshape(2, 3)
c = a @ np.ones((3, 2))          # 矩阵乘法

from scipy.optimize import curve_fit
x = np.linspace(0, 10, 50)
y = 2.5 * x + 1.3
popt, _ = curve_fit(lambda x, a, b: a * x + b, x, y)   # popt ≈ [2.5, 1.3]

from PIL import Image
im = Image.open("in.png").convert("RGB")   # JPEG 不支持透明通道，先转 RGB
im.thumbnail((1024, 1024))
im.save("small.jpg", quality=85)
```

字体工具（fonttools 4.67.0，随组件安装；`ttx --version` 实测 4.67.0）：

```sh
# 从 32 MB 的 Noto CJK TTC 里裁出只含所需字符的字体（--font-number=2 是简体中文 SC）
pyftsubset /system/fonts/NotoSansCJK-Regular.ttc --font-number=2 \
  --text="中文测试 ABC 123" --output-file=subset.otf

# 字体 ↔ XML 互转，便于查看或修改表结构
ttx -o font.ttx subset.otf
ttx -o back.otf font.ttx
```

本机实测：32,355,424 B 的 TTC 裁出 5,224 B 的 OTF（11 个字符），`ttx` 转出的 XML 1,893 行、再转回字体字符表一致。

- 脚本里先 `matplotlib.use("Agg")` 再 import pyplot；不要依赖环境变量。
- 保存图片时路径写成绝对路径或确认当前目录；输出文件已存在会直接覆盖。

## 常见坑

| 现象 | 原因 / 处理 |
|---|---|
| 中文标题/坐标轴变成方框 | 没用 `font_manager.addfont("/system/fonts/NotoSansCJK-Regular.ttc")`，或没设 `font.sans-serif` |
| `import matplotlib` 报 `No module named 'six'` | 组件的 pip 依赖没装上（组件没装全）；重装组件即可，不需要联网 |
| `UserWarning: Glyph ... missing from font` | 同中文方框；注册字体并设置字体族 |
| `ModuleNotFoundError: No module named 'numpy'` | 用错了解释器（比如别的 venv）；用 `which python3` 确认是 `$PREFIX/bin/python3` |
| pandas 默认装不上 | 见上一节：加 `--no-build-isolation` 可装，约 5 分钟；不急就用 duckdb / pyarrow |
| `findSystemFonts()` 返回 0 | 本机没有 fontconfig 字体目录；这是正常的，中文字体走 addfont |
| `cannot write mode RGBA as JPEG` | JPEG 不支持透明通道；先 `im.convert("RGB")` 再存 |
