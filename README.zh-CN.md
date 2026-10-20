# cccodroid-components

[English](README.md)

[cccodroid](https://github.com/greyoak111/cccodroid)（安卓上的 Claude Code 启动台）的社区组件配方仓库。

组件是可选安装的软件包，在 cccodroid 的「扩展」页安装，比如 GitHub 命令行、LibreOffice、电路仿真、本地大模型推理。装好后 cccodroid 里的 Claude 就能用它：每个组件自带一个 skill，告诉 Claude 怎么用、有哪些坑。

cccodroid 从 0.1.10 起读这个仓库。浏览器（Chromium）这类预置组件仍由 cccodroid 仓库发布。

## 组件列表

| id | 是什么 | 分类 | 说明 | 上游许可证 |
|---|---|---|---|---|
| `gh` | GitHub 命令行：PR、Issue、Release、Actions | 开发 | | MIT |
| `godot` | Godot 4 引擎：无头运行、导出 Android APK | 开发 | | MIT |
| `blender` | Blender 4.3 无头版：用 Python 脚本做合成、动效、出片，3D 渲染走 Adreno GPU（Vulkan 1.4） | 图像影音 | 首次使用下载本体：Debian 约 267 MB + GPU 用的补丁版 Mesa 约 11 MB（安装方法沿用 [blender-cli-android](https://github.com/greyoak111/blender-cli-android)） | GPL-2.0-or-later |
| `lilypond` | LilyPond：用文本写乐谱，排版成出版级 PDF，也能出 PNG / SVG / MIDI | 图像影音 | | GPL-3.0-or-later |
| `music` | 音乐生产工作流：MIDI → 音频（fluidsynth）、SuperCollider 合成、sox 后期、aubio 分析 | 图像影音 | 内置 GM 音色库（31 MB） | LGPL-2.1-or-later AND GPL-3.0-or-later AND GPL-2.0-only AND LicenseRef-GeneralUser-GS-2.0 |
| `libreoffice` | LibreOffice 无头版：文档互转、出 PDF | 办公 | | MPL-2.0 AND LGPL-3.0 |
| `llama-cpp` | llama.cpp：本地大模型推理 | AI | 模型自备（.gguf） | MIT |
| `openscad` | OpenSCAD：用脚本建 3D 模型，导出 STL 等格式，带 MCAD 库 | 3D 与建模 | | GPL-2.0-only |
| `ngspice` | ngspice：电路仿真 | 电子设计 | | BSD-3-Clause AND LGPL-2.1-only |
| `gnucap` | gnucap：电路仿真 | 电子设计 | | GPL-3.0-or-later |
| `iverilog` | Icarus Verilog：Verilog 仿真、波形出图 | 电子设计 | | GPL-2.0-or-later |
| `yosys` | Yosys：Verilog 综合 | 电子设计 | | ISC |
| `gpu-driver` | 让命令行程序用上 Adreno GPU：Turnip（Vulkan）+ zink（OpenGL / GLES） | GPU | 仅骁龙 | MIT |
| `gpu-driver-glibc` | 同上，给 glibc（Linux arm64）程序用，带 `lgpu-run` 启动器 | GPU | 仅骁龙 | MIT |
| `clvk-glibc` | OpenCL（clvk，跑在 Vulkan 上），给 glibc 程序用 | GPU | 仅骁龙；依赖 `gpu-driver-glibc` | Apache-2.0 |
| `gpu-bench` | GPU 信息与跑分（clinfo / vkmark / clpeak） | GPU | 仅骁龙；依赖 `gpu-driver` | CC0-1.0 AND GPL-3.0-or-later AND GPL-2.0-or-later |
| `cloudflare` | Cloudflare 官方命令行（wrangler）：部署 Workers / Pages，管 R2 / KV / D1，本地跑 `wrangler dev` | 网络 | 用 `cf-login` 粘贴令牌登录 | (MIT OR Apache-2.0) AND Apache-2.0 |

表里的组件都在当前工具包（devkit-2026.10.15.1）上真机验证过：有的直接验，有的从旧工具包上的验证记录自动继承（见下面「真机验证」）。具体记录在 [`verified.json`](verified.json)。

「仅骁龙」的组件，App 在别家芯片的设备上不给装。有依赖的组件，App 会先让你装好依赖，依赖也不能在它之前卸载。

## 怎么运作

- **仓库里只有配方，没有二进制。** 配方写的是 Termux 包名。CI 从 Termux 官方仓库下载 `.deb`，逐个核对 SHA-256，把前缀从 `com.termux` 等长改写成 `cc.codroid`，再打包。官方仓库里确实没有、而组件运行又必需的上游构件，可以用 `fetch` 声明 URL 和 SHA-256，由 CI 下载核对。
- **每个工具包版本各打一份。** 组件只装 cccodroid 工具包里没有的东西，所以 [`bases.json`](bases.json) 里列的每个工具包版本都要分别打包，App 装和用户工具包匹配的那份。cccodroid 发了新工具包，就在这里加一行。
- **索引签名。** CI 把 `components.json` 发到 `index` Release，并用 ed25519 签名（`components.json.sig`）。App 用内置公钥验签，索引或包被篡改就装不上。
- **真机验证。** `verified.json` 记录的是在真机上装过、跑过自检、卸干净了的构建；没记录的，在 App 里显示「未经真机验证」。换了新工具包后，如果组件自己的包和它用到的底座包都没变，CI 会自动继承旧的验证记录，只有真变了的才需要重新验证。
- **审计。** 每个 PR 都会跑格式检查（`check-recipes.mjs`），再用 `audit.mjs` 照正式流程真打一次包，检查这些：
  - 每个程序缺不缺库、脚本的解释器在不在；
  - 有没有盖掉底座的文件、有没有残留的 Termux 路径；
  - skill 里有没有需要人看一眼的地方（令牌、联网下载、删除 / 发布、提权）。

  审计报告按风险分成三级：🟢 看报告即可，🟡 要读脚本和 skill，🔴 要逐行审。

## 添加组件

先读 [组件编写规则](.claude/skills/component-authoring/SKILL.md)，再看 [CONTRIBUTING.md](CONTRIBUTING.md) 和 [配方格式](docs/recipe.md)。最快的办法是复制 `recipes/gh/` 来改；带包装脚本的复杂例子可以参考 `recipes/iverilog/` 或 `recipes/llama-cpp/`。

用 AI 助手写组件的话，仓库根目录的 [AGENTS.md](AGENTS.md) 就是写给它看的。

## 致谢

谢谢这些朋友（按时间先后）：

- **[CCB-Fox](https://github.com/CCB-Fox)**：投稿 [`gpu-driver-mali`](recipes/gpu-driver-mali/)（#46），第一个外部组件。在天玑 9400 上实测出不用 root、借系统 Vulkan 加载器用上厂商 Mali 驱动的办法，组件的 `needs.gpu: "mali"` 也因此而来。
- **[Cosmosophius](https://github.com/Cosmosophius)**：天玑 9300（Mali-G720）的完整实测报告（#47），独立验证了同一条路，并测出了计算性能、扩展支持和走不通的方向。

GitHub 的「贡献者」列表只统计代码提交。报告问题、测试机型同样是贡献，都会记在这里。

## 许可证

本仓库里的配方、脚本和文档采用 Apache-2.0。打包的软件各自保留上游许可证，记录在各配方里。
