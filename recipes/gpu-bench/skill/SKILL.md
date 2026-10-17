---
name: gpu-bench
description: 看本机 GPU 信息和跑分（cccodroid 的 gpu-bench 组件）：clinfo 列 OpenCL 设备、vkmark 跑 Vulkan 基准、clpeak 跑 OpenCL 峰值算力与带宽。用户问「这机器 GPU 是什么」「GPU 能跑多快」「跑个分测一下」时使用。都是离屏跑，不需要屏幕。
---

# gpu-bench：GPU 信息与跑分

本机装了三个命令行工具（都不需要屏幕，离屏渲染/计算）：

| 工具 | 版本 | 干嘛的 |
|---|---|---|
| `clinfo` | 3.1.26.09.26 | 列 OpenCL 平台 / 设备 / 各项属性 |
| `vkmark` | 2025.01 | Vulkan 基准，7 个场景（cube / effect2d / texture / …） |
| `clpeak` | 3.0.1 | OpenCL 峰值算力（fp32/fp16/整数…）和内存带宽 |

**一律用 `gpu-bench` 这个包装命令，不要直接调那三个工具** ——
它们在本机会**静默给出错的结果**（退出码 0、输出看着正常），下面第三节逐条说明。

## 先自检

```sh
gpu-bench --selftest      # 约 10 秒：三个工具各真跑一遍 + 核对设备是 Adreno
```

## 运行链路

```
gpu-bench（bash 包装，$PREFIX/bin/gpu-bench）
  ├─ info / opencl：clinfo、clpeak
  │    └─ gpu-run --opencl（gpu-driver 组件）把 /vendor/lib64/libOpenCL.so 拷进
  │       ~/.cccodroid/gpu-driver/opencl/ 并挂到 LD_LIBRARY_PATH
  │       → 高通厂商 OpenCL 驱动 → Adreno
  │       （没有 gpu-run 时退回直接把 /vendor/lib64 挂进 LD_LIBRARY_PATH）
  └─ vulkan：vkmark 直接启动
       → $PREFIX/lib 里的 Vulkan 加载器按默认目录 $PREFIX/share/vulkan/icd.d/ 找 ICD
       → gpu-driver 装的 Turnip → /dev/kgsl-3d0 → Adreno
```

| 这一环 | 由谁提供 | 在哪 |
|---|---|---|
| `gpu-bench` 包装 | 本组件 | `$PREFIX/bin/gpu-bench` |
| `clinfo` / `vkmark` / `clpeak` | 本组件：Termux 官方包（vkmark 来自 x11 仓库） | `$PREFIX/bin/` |
| `gpu-run`、Turnip、Vulkan 加载器 | **gpu-driver 组件**（本组件的依赖） | `$PREFIX/bin/gpu-run`、`$PREFIX/lib/`、`$PREFIX/share/vulkan/icd.d/` |
| OpenCL 驱动 | 设备厂商（`/vendor/lib64/libOpenCL.so`），不是 Turnip | 现拷到 `~/.cccodroid/gpu-driver/opencl/` |

- **OpenCL 跑分测的是厂商驱动，Vulkan 跑分测的是 Turnip**，两者不是同一个驱动，数字不能互相印证。
- **三个工具都会悄悄出错**：clinfo 找不到平台也返回 0；clpeak 找不到 GPU 会拿 CPU 顶上，输出看着和 GPU 跑分一样；vkmark 场景名写错只给 0 分。`gpu-bench` 会把这些情况挡下来报错，所以只能经它调用（详见下文「为什么必须走 gpu-bench」）。
- 这些都是 bionic 程序；glibc 侧的 OpenCL（clvk）不在这条链上，要测它用 clvk-glibc 组件的 `clvk-info`。

## 三条常用命令

```sh
gpu-bench info            # 设备：OpenCL 平台/设备 + Vulkan 设备名（0.5 秒）
gpu-bench vulkan          # Vulkan 跑分：cube / effect2d / texture 三个场景（约 30 秒）
gpu-bench opencl          # OpenCL 跑分：fp32 + fp16 + 全局内存带宽（约 17 秒）
gpu-bench                 # 不带参数 = info + vulkan 默认场景
```

- **场景可以带参数**：`gpu-bench vulkan cube:duration=1.5 --size 800x600`
  - `duration=` 每个场景跑几秒（默认 10 秒）。跑短点省时间，但数字更不稳（下面有实测）。
  - `--size WxH` 分辨率，默认 320x240。
  - 场景名写错会被**当场拦下**（rc=2）—— 因为 vkmark 自己遇到不存在的场景名只会打一行
    `Warning: Skipping …` 然后给 **Score: 0、退出码 0**，看着像跑完了。
- **`gpu-bench opencl` 的其余参数原样转给 clpeak**（`clpeak --help` 有一百多个开关：
  只跑某项、固定迭代数、导出 JSON 等）。脚本固定加上 `--no-cpu`：clpeak 在找不到 OpenCL
  平台时会拿 **CPU 后端顶上**，输出长得跟 GPU 跑分一样 —— 那不是用户要看的数。
- `gpu-bench --list` 列出 vkmark 的全部场景名。

## 本机实测（Lenovo TB320FC，Adreno 730/725）

Vulkan（vkmark，320x240，默认 duration，多次取样，同一天不同热状态下跑的）：

| 场景 | FPS | 说明 |
|---|---|---|
| cube | 15000～29000 | 最简单的几何 |
| texture | 6700～21000 | 纹理采样 |
| clear | 16000～30000 | 只清屏，最快的上界 |
| effect2d | 5300～7500 | 2D 混合，最重 |

OpenCL（clpeak）：**fp32 1.5～1.8 TFLOPS、fp16 2.4～3.5 TFLOPS、全局内存带宽 34～40 GB/s**。

两个坑要知道：

1. **同一场景两次跑出来的数能差一倍**（手机降频，还有首帧的管线编译）。
   上表的区间就是这么来的：报数字时给区间、说清是热机还是冷机，别当成精确值。
2. **`duration=` 会改变数字**：cube 跑 1.5 秒 ≈ 5700，跑默认 10 秒 ≈ 10300～29000。
   短跑把启动开销和首帧编译摊进去了，偏低。**不同 duration 的数不要互相比较。**

## 为什么必须走 gpu-bench（直接调工具会怎么骗你）

| 直接调 | 会发生什么（真机实测） | gpu-bench 怎么处理 |
|---|---|---|
| `clinfo -l` | 找不到厂商库时打印**空**、rc=0；`clinfo` 全量输出则是 `Number of platforms 0` —— 看着像「这机器没有 OpenCL」 | 经 `gpu-run --opencl` 挂上厂商库，并**核对输出里真有 Qualcomm/Adreno**，没有就报错 |
| `clpeak` | 认不到 OpenCL 平台时**退回 CPU 后端**继续跑，输出结构一模一样 | 固定加 `--no-cpu`，并扫输出里的 `no platforms found` / `clGetPlatformIDs` |
| `vkmark -b 拼错的场景` | `Warning: Skipping …` + **Score: 0 + rc=0** | 先拿 `vkmark -l` 核对场景名，写错直接 rc=2 |
| `vkmark -L` / `--list-devices` | **必挂**：`Error: … enumeratePhysicalDevices: ErrorInitializationFailed`。它建实例时会带 `VK_KHR_display`，而本机 Turnip 一开这个扩展，`vkEnumeratePhysicalDevices` 就返回 -3（用 `VK_LOADER_DEBUG=all` 定位的） | 脚本不碰 `-L`，设备名从基准输出的 header 里取 |
| `vkmark --frame-end finish` | vkmark 没这个选项（那是 glmark2 的），rc=1 报错 —— 这个倒是能自己发现 | 不管，报错就用 `gpu-bench --help` 里列的选项 |

## 没有 glmark2，别去找它

Termux 的 `glmark2` 包（`glmark2` / `-egl` / `-es2` 三个变体）**全是 X11 画布** ——
三个二进制都链接 `libX11`，没有显示服务器时一律 `Error: Could not initialize canvas`，
`--off-screen` 也救不了（离屏只是不显示窗口，还是要连 X）。本机没有 X 服务器，
所以这个组件里**没有装它**。要看 OpenGL 侧的图形栈，用 gpu-driver 组件的
`gpu-run -z … glmark2-es2` 那条路也得等有显示层之后（框架的 Xvfb 计划，见待办清单 §5）。

## 依赖与限制

- **需要骁龙设备 + gpu-driver 组件**：OpenCL 走高通厂商驱动（`/vendor/lib64/libOpenCL.so`），
  Vulkan 走 gpu-driver 提供的 Turnip。非骁龙设备上 `gpu-bench info` 会直接说清楚缺什么。
  组件已经声明 `requires: gpu-driver`，装 gpu-bench 会自动带上它。
- **不要拿它测 CPU**：clpeak 的 CPU 后端被脚本关掉了（见上）。CPU 跑分用别的工具。
- **跑分期间手机会热**，跑完一个 30 秒的 vkmark 大概升温几度；连跑几轮数字会往下走。
- 这些工具**不改设备状态**：不写 `$PREFIX`、不联网、不碰 GPU 驱动配置
  （gpu-run 把厂商库拷到 `~/.cccodroid/gpu-driver/` 自己用，那是 gpu-driver 组件的地盘）。
