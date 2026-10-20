---
name: gpu-driver-mali
description: 在 ARM Mali（天玑 / Exynos / Tensor 等）设备上，让 Termux（bionic）命令行程序用上本机 Mali GPU 的厂商 Vulkan / GLES 驱动时使用；不适用于 glibc / Debian 程序。
---

# Mali GPU（天玑）驱动

本组件不打包驱动，而是把设备 `/vendor` 里已有的 Mali 驱动接进 Termux 程序：免 root、
只在被启动的进程里生效，不改系统设置。仅 bionic 程序；不提供 OpenCL。

## 先自检

```sh
mali-info
```

退出码 0 表示：系统 loader 枚举到 Mali GPU，且离屏 GLES 渲染读回像素正确。
最后一行形如：

```
===== 总结 ===== Mali=OK Vulkan=1.3.305 GL=Mali-G1-Ultra MC12 render=PASS
```

非 0（`Mali=NO` 或 `render=FAIL`）就不要继续按本组件调 GPU，先看下面的「常见坑」。

## 运行链路

`gpu-run <程序> [参数...]`：

1. **本组件的 `gpu-run`**（`$PREFIX/bin/gpu-run`）设置
   `LD_PRELOAD=/system/lib64/libvulkan.so`，然后 `exec` 目标程序。
2. **Android 系统 Vulkan loader**（`/system/lib64/libvulkan.so`，系统分区提供）接管程序对
   `libvulkan.so` 的调用。Termux 自带的 Khronos loader 在默认 linker namespace 下
   打不开 `/vendor`，所以必须用它替换；替换靠的就是同 SONAME 的预加载。
3. **系统 loader → 厂商 ICD**：它经 sphal namespace 加载
   `/vendor/lib64/hw/vulkan.mali.so`（设备厂商分区提供，不在组件里）。
4. **内核**：厂商驱动打开 `/dev/mali0`（本机权限 0666）执行计算 / 渲染。

`gl-run <程序> [参数...]` 同理，但预加载 `/system/lib64/libEGL.so` 和
`/system/lib64/libGLESv2.so`，最终走 `/vendor/lib64/egl/libGLES_mali.so`。
没有显示服务器也能建离屏上下文。

各层由谁提供：

| 层 | 谁提供 | 缺了会怎样 |
|---|---|---|
| `gpu-run` / `gl-run` / `mali-info` | 本组件 | 命令不存在 |
| `python3`（`mali-info` 用） | 底座工具包 | `mali-info` 报找不到 python3 |
| `/system/lib64/libvulkan.so`、`libEGL.so`、`libGLESv2.so` | Android 系统 | 包装器直接报错退出 127 |
| `/vendor/...` Mali 驱动、`/dev/mali0` | 设备厂商 | `mali-info` 枚举不到 Mali / 渲染 FAIL |
| 目标程序自己（及它链接的 Vulkan/GL 库） | 用户装的包或其它组件 | 与普通运行一样报缺库 |

确认当前走哪条路：跑 `mali-info`，看 `[vendor]` 行里的设备名是否为 `Mali-…`。
不要在普通 shell 里直接跑 `vulkaninfo`：Termux 的 vulkaninfo 1.4 与 Android 1.3
loader 不兼容，会报 `vkGetInstanceProcAddr: Invalid instance`，这不代表 GPU 不可用。

## 用法

```sh
# Vulkan 程序：在命令前加 gpu-run
gpu-run ./my-vulkan-app

# GLES / EGL 程序：用 gl-run
gl-run ./my-gles-app

# 看某个程序实际拿到的预加载
gpu-run sh -c 'echo "$LD_PRELOAD"'
```

第一次运行不会下载任何东西，也不需要网络。

## 常见坑

- **不是 Mali 设备**：App 0.3.3 起按 `needs.gpu: "mali"` 直接拒绝安装；更早的版本会装上，
  但 `mali-info` 的总结是 `Mali=NO`。高通 Adreno 请用 `gpu-driver` 组件（开源 Turnip）。
- **glibc / Debian / Blender 程序不能用**：厂商驱动是 bionic 库，glibc 进程加载不了；
  本组件只对 Termux 程序有效，也没有 glibc 变体。
- **没有 OpenCL**：厂商 `libOpenCL.so` 被 linker namespace 挡住，系统也没有 OpenCL
  loader。需要通用计算时用 Vulkan compute。
- **程序自己带 loader / 设了 ICD 环境变量**：系统 loader 不保证认
  `VK_ICD_FILENAMES` / `VK_DRIVER_FILES`；自检探针会先清掉这两个变量再枚举。如果程序
  静态链接了自己的 Vulkan loader，`LD_PRELOAD` 可能不生效，这时要换成动态链接的版本。
- **长时间 GPU 任务**：耗电、发热会明显上升；跑大模型或长渲染前先告诉用户预计占用。
- **不要用 `LD_PRELOAD` 全局写进 shell 配置**：只通过 `gpu-run` / `gl-run` 按进程启用，
  避免影响不相关的程序。
