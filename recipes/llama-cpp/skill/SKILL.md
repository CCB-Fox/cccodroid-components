---
name: llama-cpp
description: 在本机跑大语言模型（llama.cpp）：命令行推理、量 tokens/s、起 OpenAI 兼容的本地 API 服务，CPU / Vulkan 两种后端（cccodroid 的 llama-cpp 组件）。用户要本地跑模型、离线对话、给自己写的程序接一个本地 LLM 接口、或者问「这机器能跑多大的模型」时使用。
---

# llama.cpp：本地跑大模型

本机装了 **llama.cpp 0.6.0**（`llama-cli --version` 有版本；Clang 21 编的 aarch64）。
命令行批处理，没有图形界面。**模型不随组件发布**，要自己下（看下面的规矩）。

## ⚠️ 下模型之前必须先问用户

**下任何模型之前，先把「多大、从哪下、干嘛用」告诉用户，得到同意再下。**
模型动辄几百 MB 到几 GB，用户可能在用流量。

现成的例子（本机实测跑过的）：

| 模型 | 文件 | 来源 |
|---|---|---|
| Qwen2.5-0.5B-Instruct **Q4_K_M** | 469 MB | HuggingFace `Qwen/Qwen2.5-0.5B-Instruct-GGUF` |

下好放到 `/sdcard/cccodroid/models/`（`llama-run` 会自动去那里找；也能用
`--models` 列出来）。放这个目录的好处是用户自己在文件管理器里也看得到、能删。

## 先自检（不需要模型）

```sh
llama-run --selftest
```

看 `===== 总结 ===== 全部通过`。它检查：版本、能列出设备（CPU/Vulkan/OpenCL）、
厂商 OpenCL 库找得到、模型目录在哪、以及模型路径写错时会不会清楚报错。约 2 秒。

## 最快上手

```sh
llama-run --devices                     # 看有哪些后端/设备
llama-run --models                      # 看模型目录里有什么
llama-run -m qwen2.5-0.5b -p "用一句话说明电阻是什么" -n 48 -st
```

- `-m` 给**短名字**也行（`qwen2.5-0.5b` 会匹配到 `qwen2.5-0.5b-instruct-q4_k_m.gguf`）。
- `-p` 提示词，`-n` 最多生成多少 token，`-st` 单轮跑完就退（不进交互模式）。
- 结尾会打一行 `[ Prompt: 152.0 t/s | Generation: 30.0 t/s ]` —— 这就是速度。

## 本机实测的性能（Qwen2.5-0.5B Q4_K_M，462.96 MiB）

| 后端 | 提示处理 pp64 | 生成 tg32 |
|---|---|---|
| **Vulkan**（Turnip）`-ngl 99 -t 4` | **271～280 t/s** | 28.6～29.9 t/s |
| **CPU** `-dev none -t 4` | 67～74 t/s | **25～38 t/s** |
| CPU 默认线程数（7） | 37～67 t/s | 10～17 t/s |
| OpenCL（厂商 Adreno 驱动）`-t 4` | 51～58 t/s | **5～6 t/s** |

（r=3~5 的 llama-bench 数据，手机跑久了会降频所以给了区间。）

三条结论，都跟直觉不太一样，是实测出来的：

1. **线程数别开满。** 本机 8 个核是 4 小核（2.016GHz）+ 3 中核（2.7456GHz）+ 1 大核（3.1872GHz），
   llama.cpp 默认用满线程会把活儿派到小核上 —— 生成速度只有用 4 线程的**一半不到**。
   `llama-run` 在没写 `-t` 时会自动补成「比最慢那档快的核数」（本机 = 4），并在 stderr 上说一句。
2. **Vulkan 在「提示处理」上快约 4 倍**（271 vs 70 t/s），但**生成速度两者差不多** ——
   生成是内存带宽瓶颈，一个 0.5B 模型 CPU 完全够用。
   想快就把 `-ngl 99` 拉满（llama.cpp 新版默认 `-ngl auto`，本机 auto 已经会走 Vulkan）。
3. **厂商 OpenCL 后端别用。** 直觉上「高通给 Adreno 优化的 OpenCL 应该最快」，
   实测最慢（5 t/s，只有 Vulkan 的 1/6）。真要用得显式开：
   `llama-run --backend opencl …`。

想自己复现这张表：

```sh
llama-run --bench -m qwen2.5-0.5b -p 64 -n 32 -r 3
```

## 换后端

```sh
llama-run --backend vulkan -m qwen2.5-0.5b -p "…" -n 64 -st
llama-run --backend cpu    -m qwen2.5-0.5b -p "…" -n 64 -st     # 不想用 GPU 时
llama-run --backend opencl -m qwen2.5-0.5b -p "…" -n 64 -st
```

- `--backend cpu` → 加 `-dev none`；`vulkan` → `-dev Vulkan0`；`opencl` → `-dev GPUOpenCL`
  并且自动把 `/vendor/lib64` 加进 `LD_LIBRARY_PATH`。
- **为什么要那一步**：`libggml-opencl.so` 链接的是 `libOpenCL.so`，应用的名字空间里找不到它
  （实测 dlopen 报 `library "libOpenCL.so" not found … in namespace (default)`），
  把 `/vendor/lib64` 挂上就能加载（那边只有 HAL 库和厂商 OpenCL，不会遮蔽我们的库）。
  装了 gpu-driver 组件的话，`gpu-run --opencl …` 是另一条等效的路。
- **Vulkan 不用做任何准备**：底座里有 libvulkan，Turnip（gpu-driver 提供的）默认就能被认出来，
  `llama-cli --list-devices` 直接就有 `Vulkan0: Turnip Adreno (TM) 725`。

## 起本地 API 服务（OpenAI 兼容）

```sh
llama-server -m /sdcard/cccodroid/models/qwen2.5-0.5b-instruct-q4_k_m.gguf \
             -c 1024 -t 4 -ngl 99 --port 8099
# 然后：
curl -s http://127.0.0.1:8099/v1/chat/completions -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"一句话说明什么是电容"}],"max_tokens":48}'
curl -s http://127.0.0.1:8099/health        # {"status":"ok"}
```

实测能用：`/v1/chat/completions` 返回标准 OpenAI 格式（含 `usage` 里的 token 数），
`/health` 返回 `{"status":"ok"}`。

**两点提醒**：llama-server 启动时会警告「没设 API key 而且 CORS 允许所有来源」——
给用户看的服务**要加 `--api-key`**；只在本机用（绑 127.0.0.1）就没关系。
另外服务是**常驻**的，起完记得告诉用户在哪儿、怎么停（或者用 `--timeout`）。

## 包里还有什么

`llama-server`（上面那个服务）、`llama-bench`（跑分）、`llama-quantize`（量化模型）、
`llama-gguf` / `llama-gguf-split`（看/切 GGUF 文件）、`llama-embedding`（要向量）、
`llama-perplexity`（算困惑度）、`llama-mtmd-cli`（多模态）等等，一共几十个 `llama-*` 命令。
**没测过的别当成能用** —— 这轮只实测了 `llama-cli` / `llama-bench` / `llama-server`。

## 限制

- **没有图形界面**，也没有 llama.cpp 的 WebUI 打包（`llama-server` 自带的网页界面在
  `--webui` 下要另外确认，这轮没测）。
- 模型要自己下（见最上面那条规矩），组件里一个模型都没有。
- 手机上跑大模型受**内存和散热**限制：0.5B 很轻松，7B 量化版会吃满内存、速度掉到个位数 t/s，
  而且跑两分钟就开始降频。给用户报数字时说清是哪个模型、哪个后端、多少线程。
- 模型放 `/sdcard`（FUSE）下也能正常 mmap（本机所有实测都是这么跑的），
  但读盘比放应用私有目录慢一点，首次加载会慢几秒。
