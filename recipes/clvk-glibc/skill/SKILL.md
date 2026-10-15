---
name: clvk-glibc
description: 让 glibc（Linux arm64）程序用本机 Adreno GPU 做 OpenCL 计算（clvk：OpenCL C → SPIR-V → Vulkan → Turnip）。用户要跑 OpenCL 负载（llama.cpp 的 OpenCL 后端、自己写的 kernel）、或问 glibc 侧有没有 OpenCL 时使用。
---

# OpenCL（glibc 侧，clvk）

glibc 侧**没有**可用的厂商 OpenCL —— 厂商的 `/vendor/lib64/libOpenCL.so` 是 bionic 库，
glibc 进程加载不了（跨 libc）。这个组件装的是 **clvk**：OpenCL C 由内嵌的 clspv 编成 SPIR-V，
在本机 Turnip（Vulkan）上执行。

```sh
clvk-info            # 自检：平台/设备 + 编译并跑一个向量加 kernel；退出码 0 = 可用
clvk-info --env      # 只打印环境变量
```

## 跑自己的程序

```sh
lgpu-cc cl.c -o cl -lOpenCL     # 编（头文件在 $PREFIX/glibc/include/CL/）
lgpu-run ./cl                   # 跑（Vulkan 加载器 + Turnip ICD 由 lgpu-run 注入）
```

自己拉起进程时照 `clvk-info --env` 设环境（`LD_LIBRARY_PATH=$PREFIX/glibc/lib`），
Vulkan 那一半用 `lgpu-run` 最省事。

## 前提

- **glibc 的 GPU 组件**：`libvulkan.so.1` 与 Turnip ICD 由它提供；用它带的 `lgpu-run` 起进程 ——
  它会摘掉 cccodroid shell 挂的 bionic `LD_PRELOAD`（glibc 程序继承它会报
  `glibc/lib/libc.so: invalid ELF header`）并设好 `VK_DRIVER_FILES`。
- 只对高通 Adreno 有效（Turnip 走 `/dev/kgsl-3d0`）。
- 需要离线把 kernel 编成 SPIR-V 的话，组件里没带 `clspv` 命令行（它只比 libOpenCL 小一点，
  且在线编译已经够用）；要的话去同一个 Release 取，或用 `clCreateProgramWithSource` 现场编。

## 边界

- clvk 覆盖 OpenCL 3.0 的大部分：SPIR-V 能表达的都行。image/sampler、子设备、
  一些扩展（如 `cl_khr_gl_sharing`）没有；厂商驱动上的专有优化也没有。
- 每个 kernel 都先编成 SPIR-V（clspv 内嵌在 libOpenCL.so 里）：首次编译有开销，clvk 自己有缓存。
- 装组件、往 `$PREFIX` 里写东西前先问用户。
