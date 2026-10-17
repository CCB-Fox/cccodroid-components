---
name: godot
description: 用 Godot 引擎无头跑游戏工程、导入资源、把工程导出成 Android APK 时用（本组件没有图形界面，编辑器要屏幕）。
---

# Godot（无头）：跑工程、导出 Android APK

包里是 Termux 的 **bionic 原生** Godot 4（`godot --version` → `4.7.2.stable.termux`）。
**只承诺无头**：跑工程、导入资源、把工程导出成 APK。编辑器要屏幕，本机没有显示服务器，
`godot --editor` 起不来（`godot-run` 会先提醒一句）。

## 先自检

```sh
godot-run --selftest          # 约 20～40 秒（装了导出模板时）：版本、最小工程、--import、导出环境、导出
godot-templates --selftest    # 1 秒：用本地假 release 把「下载 → sha512 核对 → 安装 → 版本不符」走一遍
```

## 运行链路

```
godot-run <参数>（python3 包装，$PREFIX/bin/godot-run）
  ├─ 参数里有 --export… 时先准备导出环境：
  │    SDK 垫片（假 adb + 包着 $PREFIX/bin/apksigner 的垫片 + 0 字节 android.jar）
  │    → 编辑器设置补三个键（只补缺的）→ keytool 生成 debug keystore（没有才生成）
  │    → 检查导出模板在不在，不在就拦下
  └─ $PREFIX/bin/godot <参数>   ← Termux 的 bionic 原生 Godot，直接运行（不经 glibc）
       └─ 导出 APK：读导出模板 → 打包工程 → 经垫片调 apksigner（java）签名
```

| 这一环 | 由谁提供 | 在哪 |
|---|---|---|
| `godot-run` / `godot-templates` | 本组件 | `$PREFIX/bin/` |
| `godot` 本体 | 本组件：Termux x11 仓库的 `godot`（bionic 原生，`4.7.2.stable.termux`） | `$PREFIX/bin/godot` |
| `java` / `keytool` / `apksigner` | **底座**（cccodroid 工具包），不在本组件里 | `$PREFIX/bin/` |
| SDK 垫片 | `godot-run` 导出前现建 | `$PREFIX/share/cccodroid/components/godot/android-sdk/` |
| 导出模板（`android_debug.apk` / `android_release.apk`） | `godot-templates download`（官方 tpz，1.28 GB，**先问用户**） | `~/.local/share/godot/export_templates/4.7.2.stable/` |
| debug keystore | `godot-run` 现场生成 | `~/.local/share/godot/keystores/debug.keystore` |

- 这是 **bionic 原生**构建，不经过 glibc，也不需要 Shizuku 提权。
- **不走 gradle 导出**：垫片只够非 gradle 导出用，工程里开了 `gradle_build/use_gradle_build` 会失败。
- 缺 `java` / `keytool` / `apksigner`：`godot-run` 会明说是底座缺东西；缺模板：明确拦下并提示 `godot-templates`。不会悄悄降级。
- 渲染：无头模式不画图。编辑器（`--editor`）要显示服务器，本机没有。

## 基本用法

```sh
godot-run --headless --path <工程目录> --quit            # 跑一次（主场景的 _ready 会跑到）
godot-run --headless --path <工程目录> --import          # 导入/重导资源（生成 .godot/）
godot-run --headless --path <工程目录> --export-debug "Android" out.apk   # 导出调试版 APK
godot-run --headless --version                            # 看版本
```

`godot-run` 就是把参数原样转给 godot（退出码照传），另外多做三件事：导出前自动准备
Android 环境、模板没装时提前拦下并说清楚、`--selftest`。

## 导出 Android APK：三样东西

| 东西 | 在哪 | 怎么来 |
|---|---|---|
| 导出模板 | `~/.local/share/godot/export_templates/4.7.2.stable/` | `godot-templates`（**1.28 GB 下载，先问用户**） |
| SDK 垫片 | `$PREFIX/share/cccodroid/components/godot/android-sdk/` | `godot-run` 导出前自动建 |
| debug keystore | `~/.local/share/godot/keystores/debug.keystore` | `godot-run` 导出前自动用 keytool 生成 |

### 1）导出模板 —— 组件里不带，装之前**先问用户**

官方只发一个 1.28 GB 的 tpz（里面 35 个平台的模板），Android 那两个 apk 占 232 MB。

```sh
godot-templates               # 看状态 + 要下载什么（网址、多大、怎么校验、装到哪）——不下载
godot-templates download      # 真下载（先问用户同意！），sha512 核对不符就删掉并失败
godot-templates use <目录|.tpz>   # 本机已经有副本（比如别人拷来的 templates/4.7.2.stable）
                              # 就直接用，不下载；**不核对 sha512**（你自己拿来的）
```

- **Claude 必须先问用户**再跑 `download`：1.28 GB，**实测约 20 分钟**（这台设备 ~1 MB/s；
  进度每 25 MB 打一行，会实时刷出来）。用户不同意就别下，用 `use` 指本地副本。
- 版本要对得上：模板版本 = `godot --version` 去掉 `.termux` 后缀（`4.7.2.stable.termux` →
  `4.7.2.stable`）。对不上就不装，`godot-templates` 会直接说清楚。
- 只解 Android 的三个文件，1.28 GB 的 tpz 下完就删（临时文件在 `$TMPDIR`）。

### 2）SDK 垫片和编辑器设置（`godot-run` 自动做，也可以单独跑）

```sh
godot-run --prepare           # 建垫片 + 补编辑器设置 + 生成 debug keystore
```

- 垫片：假 `adb`、包着 `$PREFIX/bin/apksigner` 的 `apksigner`、**0 字节**的 `android.jar`
  （真 jar 27 MB，非 gradle 导出只检查它在不在）。放在组件自己的目录里，**不往 $HOME 撒**。
- 编辑器设置 `~/.config/godot/editor_settings-4.7.tres` 里补三个键：
  `export/android/android_sdk_path`、`export/android/java_sdk_path`（指 `$PREFIX`，java 是自带的）、
  `export/android/debug_keystore`。**只补缺的、空的**：文件不存在就新建，已经有了的键
  （包括用户自己设的）一个字都不动，跑完会打印哪些补了、哪些没动。
- `java` / `keytool` / `apksigner` 是 cccodroid **工具包（底座）自带**的，不在本组件的包里。

### 3）debug keystore

导出的 APK 必须签名，`godot-run` 第一次导出前用 keytool 现场生成一个（`CN=Android Debug`）。
**这是调试密钥，不是发布密钥**：只是让 APK 能装到手机上调试。要上架/正式发布，
让用户用自己的 keystore（在编辑器里改 `export/android/debug_keystore`，或用 release 导出 +
自定义模板），别把调试签名当成正式签名。

## 坑（都实测过）

- **导出要 `export_presets.cfg`**：工程根目录没有它，godot 报
  `This project doesn't have an export_presets.cfg file at its root`（rc=1）。
  预设名也要对得上：`--export-debug "Android"` 里的名字必须是文件里 `[preset.0] name=…` 那个，
  写错会打印可用的名字然后 rc=1。
- **模板没装时**不会静默：`godot-run` 在导出前就拦下（rc=3）并告诉你怎么装。
  直接调 `godot` 也能看到 godot 自己那句话，但不好懂。
- **要 `--headless`**：不加的话它想开窗口，本机没有显示服务器。
- **`--import` 之后再导出**更稳（新加的图片/场景要先导入）。
- 空壳 `adb` 会在导出过程中被 godot 叫一次，往 stderr 打印一行 —— **正常现象**，
  非 gradle 导出用不到 adb。
- 第一次跑工程会慢一点（要建 `.godot/`）。

## 给 Claude 的规矩

- **下模板（1.28 GB）先问用户**；用户不同意就用 `godot-templates use <本地副本>`。
- **不读、不打印任何令牌/密码**；keystore 的密码是固定的调试口令（`android`），不是用户的秘密。
- 导出会往用户目录写东西（编辑器设置、keystore、导出模板），`--prepare` 只补缺的键；
  **不要**手写覆盖用户的 `editor_settings-*.tres`。
- 不要替用户发布/上传 APK。
