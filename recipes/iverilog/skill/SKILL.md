---
name: iverilog
description: 用 Icarus Verilog 跑 Verilog 仿真：编译 RTL 和 testbench、跑仿真看 $display 输出、导出 VCD 波形并画成时序图（cccodroid 的 iverilog 组件）。用户要仿真数字电路、验证 RTL 行为、写 testbench、看波形、或者问「这段逻辑跑起来对不对」时使用。
---

# Icarus Verilog：跑 Verilog 仿真

本机装了 **Icarus Verilog 13.0**（`iverilog -V` 的输出就是版本依据）。
命令行批处理，没有图形界面。

## 一条命令跑完：`iverilog-run`

```sh
iverilog-run <testbench.v> [dut.v …] [iverilog 自己的参数…]
```

它把「编译」和「跑」合成一步，并且补上 `iverilog` + `vvp` 直用时会踩的坑
（下面每一条都是本机实测出来的）：

| 情况 | 直接用 vvp/iverilog | `iverilog-run` |
|---|---|---|
| testbench 没写 `$finish`（时钟还在翻） | **永远跑下去，一个提示都没有** | 默认 60 秒超时，报「仿真没结束」并指出多半是少了 `$finish`（退出码 3） |
| 编译不过 | 会拿上一次留下的 `.vvp` 跑出假结果 | 不往下跑，返回 iverilog 的退出码 |
| `$readmemh` 打不开文件 | 打一句 ERROR 就把存储器填成 `xx`，**退出码 0** | 跑完扫出来，退出码 4 |
| `$error("...")` | 只报错不终止，**退出码 0** | 同上（`$fatal` 本来就会给 1） |
| testbench 里 `$stop` | 停在交互提示符上等人敲回车 | 用 `vvp -n` 跑，`$stop` 当成 `$finish` |

退出码：**0** 跑完且干净 · **1** 仿真里 `$fatal` 之类 · **3** 超时 · **4** 跑完了但输出里有 `ERROR:`/`FATAL:` ·
编译不过 = iverilog 自己的码（实测缺 include 是 1、语法错/模块找不到是 2）· **2** 用法不对。

```sh
iverilog-run --timeout 600 tb.v dut.v     # 仿真确实很长时放宽超时
iverilog-run --no-scan tb.v               # 本来就要打印以 ERROR: 开头的行时，关掉扫描
iverilog-run --selftest                   # 自检（9 项，约 4 秒）
```

## 先自检

```sh
iverilog-run --selftest     # 编译+跑、VCD、编译报错挡住、超时挡住、$stop、plusarg、带参数的选项、$readmemh、--no-scan
vcd2svg --selftest          # 画波形那条（VCD 解析、出图、XML 转义）
```

## 基本用法

RTL 和 testbench 一起给（顺序随意，**选项要写在源文件前面**）：

```sh
cat > counter.v <<'EOF'
module counter(input clk, input rst, output reg [3:0] q);
  always @(posedge clk) q <= rst ? 4'd0 : q + 4'd1;
endmodule
EOF

cat > tb.v <<'EOF'
`timescale 1ns/1ps
module tb;
  reg clk = 0, rst = 1;
  wire [3:0] q;
  counter dut(.clk(clk), .rst(rst), .q(q));
  always #5 clk = ~clk;
  initial begin
    #12 rst = 0;
    #100 $display("Q=%0d", q);
    #50 $finish;
  end
endmodule
EOF

iverilog-run tb.v counter.v
# → Q=10
# → tb.v:13: $finish called at 162000 (1ps)
```

（`Q=10` 是对的：clk 周期 10ns，t=12 放开复位，第 10 个上升沿在 t=110，t=112 采样。）

**给 Claude 的提醒**：仿真「跑完没报错」不等于结果对。要么让 testbench 自己判
（`if (q !== 8'd10) $fatal(1, "期望 10，实际 %0d", q);`），要么把打印出来的值对一遍。

## 写 testbench 的要点（都实测过）

- **一定要写 `$finish`**。不写就靠 `--timeout` 兜底，但那只是兜底。
- **自检用 `$fatal`**：它会真的让退出码变 1。`$error` 只打印、不终止、不改退出码。
- **时钟**：`always #5 clk = ~clk;` 配合 `` `timescale 1ns/1ps ``。
- **选项写在源文件前面**。写在后面 iverilog 不当选项看，会原样丢给仿真程序 ——
  实测 `iverilog tb.v -o x.vvp` 报的是 `-o: No such file or directory`。
  `iverilog-run` 会拦下这种写法并告诉你改怎么排。
- **SystemVerilog 要 `-g2012`**：`logic` / `always_ff` / `interface` 默认统统语法错。
  ```sh
  iverilog-run -g2012 tb.sv dut.sv
  ```
- **信号没声明就直接用是错误**（Icarus 13 不再给隐式 wire）：`assign a = b;` 里 `b` 没声明会
  报 `Unable to bind wire/reg/memory 'b'`。补声明。
- **宏和 include**：`iverilog-run -DFAST -Iincdir tb.v`（实测 `-DFAST` 能选中 `` `ifdef FAST ``）。
  带参数的选项**分开写也行**（`-D FAST` / `-I incdir` / `-s top` / `-y libdir` …… man 的 OPTIONS
  一节里跟参数的那批：`-B -c -f -D -P -p -d -I -L -l -M -m -N -s -T -t -W -y -Y`），
  `iverilog-run` 会把参数一起吞掉，不会当成源文件。
- **顶层模块用 `-s` 指定**：文件里有多个没被实例化的模块时，不写 `-s` 会被**全部**当顶层
  一起 elaborate（不该跑的 initial 也会跑）。`iverilog-run -s tb -g2012 tb.v` 只跑 `tb`。
- **plusarg**：`iverilog-run tb.v +N=42` → testbench 里 `$value$plusargs("N=%d", n)` 收到 42；
  `$test$plusargs("FAST")` 同理。**plusarg 是给仿真程序的**，`iverilog-run` 会自动转发给 vvp。

## 常用系统任务（本机实测）

| 任务 | 行为 |
|---|---|
| `$display` / `$strobe` | 打印；`$strobe` 在时间步末尾打（和 `$monitor` 一起用时不打架） |
| `$monitor` | 只要参数变化就打印一行，t=0 也会打一次 |
| `$finish` | 结束仿真，打印 `$finish called at …`，退出码 0 |
| `$fatal(1, "…")` | 打印 `FATAL: …` 并结束，**退出码 1** |
| `$error("…")` | 只打印 `ERROR: …`，继续跑，**退出码 0**（靠 `iverilog-run` 的扫描发现） |
| `$readmemh` / `$readmemb` | 读数据文件；**文件不在就打一句 ERROR、存储器变 `xx`、退出码 0** |
| `$dumpfile` / `$dumpvars` | 写 VCD；只写 `$dumpvars` 不写 `$dumpfile` 会落到当前目录的 `dump.vcd` |
| `$time` / `%0t` | 时间；VCD 里的时间是按 timescale 的**精度**记的（`1ns/1ps` → 100ns 记成 100000） |

## 看波形：`vcd2svg`

本机没有 GTKWave，波形用 `vcd2svg` 画成 SVG（纯标准库，不装东西）：

```sh
# testbench 里先开 dump
$dumpfile("wave.vcd");
$dumpvars(0, tb);

iverilog-run tb.v counter.v
vcd2svg wave.vcd                       # → wave.svg（就在 vcd 旁边）
vcd2svg wave.vcd /sdcard/cccodroid/wave.svg
vcd2svg wave.vcd out.svg --signals tb.clk,tb.q     # 只画想要的（名字或子串）
vcd2svg wave.vcd out.svg --max 8                   # 默认最多 16 个
```

- 1 位的画方波，多位的画带数值的块（十六进制，未知值显示成红色的 `x`）。
- 信号名按层次拼（`tb.dut.q`），同名不会混。
- 时间轴**已经按 `$timescale` 换算**成好读的单位（图右上角写着「时间 / ns」这种）。
- **图要交给用户看**：SVG 存到 `/sdcard/cccodroid/`，应用内查看器能直接打开；
  要大图就先转 PNG（`magick -density 110 in.svg out.png`）。

## 限制

- **没有图形界面**：没有 GTKWave / gtkwave 那套，也没有交互式调试器。
- 只做**仿真**：综合是 yosys 那边的事（本机 `yosys-run`）。仿真综合后的门级网表也能跑，
  但门级网表里都是 `$_AND_` 这种内部单元，波形不如 RTL 直观。
- `iverilog-vpi` 在包里（能编 VPI 插件），但这条线没测过，要用先验证。
- `iverilog-run` 给 vvp 加了 `-n`：如果你的 testbench 是**故意**要 `$stop` 停下来等输入的，
  这个包装不适合，得直接调 `vvp`。
