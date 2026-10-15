---
name: ngspice
description: 用 ngspice 跑 SPICE 电路仿真（cccodroid 的 ngspice 组件）：写网表，做直流 / 瞬态 / 交流 / 噪声 / 工作点分析，读结果、画波形。用户要仿真电路、验证滤波器 / 电源 / 放大器、算工作点、或者问「这个电路输出是多少」时使用。
---

# ngspice：电路仿真

本机装了 ngspice-47。写网表（`.cir`），命令行批处理跑仿真，读数值结果。

## 先自检

```sh
spice-run --selftest
```

最后一行 `===== 总结 ===== 瞬态=OK 末值=… 数据点=…` 就是好的。约 0.06 秒。
它真跑一个 RC 充电电路，并把 5τ 处的电压和解析解 5·(1−e⁻⁵)=4.96631 V 对一遍。

## ⚠️ 第一个坑：网表**第一行永远是标题**

SPICE 的老规矩 —— 第一行不是元件，是标题。**ngspice 不会提醒你**，被吃掉的那个元件就是不存在，
结果全是 0 或者矩阵奇异：

```
$ cat t1.cir
V1 in 0 DC 5          ← 第一行，被当标题吃掉了！
R1 in out 1k
R2 out 0 2k
...
$ spice-run t1.cir        # 只报「Circuit: v1 in 0 dc 5」这一行，别的什么都不说
v(out) = 0.000000e+00     ← 应该是 5×2/3 = 3.333 V
```

**第一行写成注释（`*` 开头）或者干脆空一行**：

```
* 分压器                       ← 标题
V1 in 0 DC 5                  ← 这才是元件
R1 in out 1k
R2 out 0 2k
.control
op
print v(out)
.endc
.end
```

`spice-run` 在首行长得像元件名（`V1 …` 这种字母+数字开头）时会打一句提示，别的不管。

## 跑一个网表

```sh
spice-run <网表.cir> [ngspice 的其它参数…]
```

- 输出就是 ngspice 的原话（只订掉两行和电路无关的噪声），所以结果照原样读。
- **分析语句要放进 `.control` 块**：batch 模式下光写 `.tran` 而没有 `.control` / `.print`，
  ngspice 会打 `no simulations run!` 并返回 1。`spice-run` 会把这个原文和提示一起给你。
- 网表末尾要 `.end`，`.control` 块要 `.endc` 收尾。

### 四种常用分析

```
* 瞬态：看随时间变化
.control
tran 0.2m 5m            ← 步长 0.2 ms，跑到 5 ms
print v(out)
.endc

* 直流扫描：看随某个源变化
.control
dc V1 0 5 0.5           ← V1 从 0 扫到 5，步长 0.5
print v(out)
.endc

* 交流：看频率响应
V1 in 0 AC 1            ← ac 分析要用 AC 源
.control
ac dec 5 10 10k         ← 每十倍频 5 个点，10 Hz 到 10 kHz
print vdb(out)          ← vdb = 20·log10，相位用 vp(out)
.endc

* 工作点
.control
op
print v(out)
.endc
```

- 节点电压：`v(out)`、`v(in)`。
- **电源支路**电流：`i(V1)`。方向是元件内部从 + 到 −，所以给电路供电的电源 `i(V1)` 通常是**负**的
  （5 V / 3 kΩ 的电路里是 −1.66667e−03）。
- **电阻 / 电容支路**电流不能写 `i(R1)` —— ngspice 只回一句 `Error: no such function as i,`
  然后**返回 0**，很容易看漏。要写 `@R1[i]`（实测 5 V / 3 kΩ 时是 +1.666667e−03）。

`print` 可以一次给多个：`print v(in) v(out) i(V1)`。

## 读结果

`print` 直接打在输出里，够用。**数据要拿去画图或细看，用 `wrdata` 写成两列文本**：

```
.control
tran 0.2m 5m
wrdata out.dat v(out)          ← 第一列时间，第二列值
.endc
```

```sh
spice-run charge.cir
head -3 out.dat && tail -1 out.dat
```

⚠️ **`wrdata` 写的是相对「当前工作目录」的路径，不是网表所在的目录**。要稳就用绝对路径，
或者先 `cd` 到目标目录再调 `spice-run`。

## 画波形给用户看

**优先走这条路：不用装任何东西，直接手写 SVG。** ngspice 出的本来就是文本数据，
写个几十行的 Python（只用标准库）把 `wrdata` 的两列画成 `<polyline>` 就行，
产出 `.svg` 放到 `/sdcard/cccodroid/`，用户在应用内查看器里直接能看（要 PNG 就
`magick -density 96 图.svg 图.png`，本机实测可用）：

```
<svg xmlns="http://www.w3.org/2000/svg" width="560" height="320" viewBox="0 0 560 320">
  <rect width="560" height="320" fill="white"/>
  <polyline fill="none" stroke="#1a6fd4" stroke-width="2" points="52.0,284.0 52.9,281.8 …"/>
  <text x="52" y="12" font-size="12">标题</text>
</svg>
```

**matplotlib 这条路要先问用户**：本机没装，`pip install --user matplotlib` 会从 PyPI 下
`matplotlib` 本体约 10 MB、`numpy` 约 15 MB，加上几个小依赖 —— **先说清楚多大、从哪下，得到同意再装**。

## 常见坑

- **第一行是标题**（见上，最坑的一个）。
- **别只看退出码**。ngspice 有些错误返回 0：`print i(R1)` 只打一句 `Error: no such function as i,`
  就返回 0；`.control` 里只写 `quit` 也是退出码 0、一行错都没有、什么都没算。
  所以结果里应该能看到 `No. of Data Rows` 和你 `print` 出来的那几行。
  `spice-run` 会扫一遍 `Error:`，见到就返回 1（上面这两种它都能挡）。
- **要看初始条件**：瞬态分析默认先算直流工作点当起始状态。所以 `V1 in 0 DC 5` 给电容充电的电路，
  t=0 时电容**已经是 5 V** 了。想看电容从 0 开始充，用 `PULSE(...)` 当源。
- **单位是后缀不是变量**：`1k` = 1000、`1u` = 1e−6、`1meg` = 1e6（注意 `m` 是**毫**，1e−3）。
- 温度默认 27 °C，跑出来会有 `TEMP = 27.000000 and TNOM = 27.000000` 那一行，正常。
- 结果不对先查这三样：第一行是不是标题、分析语句在不在 `.control` 里、单位后缀有没有写错。
