# ─────────────────────────────────────────────────────────────────────
#  Blender 组件（cccodroid）—— 运行环境装配（被 source，不单独执行）
#
#  调用方先设好 PREFIX（应用前缀）和 COMP（组件目录），再：
#      . "$COMP/lib/env.sh"
#      export LD_LIBRARY_PATH="$LIB"          # 只能最后一行导，见下
#      exec "$LDSO" --library-path "$LIB" <程序> <参数...>
#
#  GPU 链路（和上游 blender-cli-android 一致；全貌见 SKILL.md「运行链路」）:
#    Blender → EGL(补丁版 Mesa, surfaceless) → Zink(GL→Vulkan) → Vulkan loader
#            → Turnip(补丁版 Mesa 26.2, Vulkan 1.4, KGSL 后端) → /dev/kgsl-3d0 → Adreno
#
#  与上游包体（blender-cli-android）的差异只有两处：
#    · 包体根 ROOT 换成组件数据目录 $HOME/.cccodroid/blender（可用环境变量覆盖）
#    · glibc 运行时不是私有副本，而是组件依赖的 glibc 包 → $PREFIX/glibc
# ─────────────────────────────────────────────────────────────────────

ROOT="${CCODROID_BLENDER_DATA:-$HOME/.cccodroid/blender}"
DEBROOT="${DEBROOT:-$ROOT/data/debroot}"
GLIBC="${CCODROID_GLIBC_ROOT:-$PREFIX/glibc}"
EXTRALIB="${EXTRALIB:-$ROOT/data/lib}"
B="$DEBROOT"
A="$B/usr/lib/aarch64-linux-gnu"
LDSO="$GLIBC/lib/ld-linux-aarch64.so.1"
[ -x "$LDSO" ] || { [ -x "$GLIBC/glibc/lib/ld-linux-aarch64.so.1" ] && \
  LDSO="$GLIBC/glibc/lib/ld-linux-aarch64.so.1"; }

# ── 必须先清掉 bionic 侧的注入 ──────────────────────────────────────
# 本应用（以及 Termux 系环境）会把 libtermux-exec-ld-preload.so 放进
# LD_PRELOAD 来改写脚本 shebang。它是 **bionic** 库，符号版本是 LIBC，
# 而 glibc 的 ld.so 会用 GLIBC_2.x 去查 —— 结果就是启动即失败：
#     libc.so.6: version `LIBC' not found
# 这是「两套 C 运行时」那一类问题的第三个变体，必须在这里切断。
unset LD_PRELOAD LD_AUDIT LD_DEBUG 2>/dev/null

# ── 可写目录：安卓没有可写的根级临时目录，全部落到组件数据目录里 ──
export TMPDIR="$ROOT/data/tmp"
export HOME="${BLENDER_HOME:-$ROOT/data/home}"
mkdir -p "$TMPDIR" "$HOME" 2>/dev/null

# ── 库搜索路径 ──────────────────────────────────────────────────────
# ⚠️ 绝不能出现 bionic 库目录（$PREFIX/lib 之类）。
#    bionic 的符号版本是 LIBC / LIBC_N，glibc 是 GLIBC_2.x，
#    混用会满屏 `version 'LIBC' not found`。
#
# Debian 的库分散在 /usr/lib、blas/、lapack/、pulseaudio/ … 多个子目录，
# 只写死 aarch64-linux-gnu 一定会漏。规则改为：扫所有含 .so 的子目录。
#
# 扫描很贵（几百次 ls），所以结果缓存；用 find -newer 做失效校验。
# glibc / 额外库路径每次现拼，不写进缓存 —— 否则改路径后缓存不会失效。
CACHE="$ROOT/data/.libpath.cache"
NEED_SCAN=1
# 缓存第一行记着生成它的 $ROOT。数据目录一旦被整体搬走，旧缓存里全是失效的
# 绝对路径 —— 必须能识别出来，否则搬完就找不到 Debian 的库。
if [ -f "$CACHE" ] && [ "$(head -n1 "$CACHE" 2>/dev/null)" = "$ROOT" ]; then
  CHANGED=$(find "$B/usr/lib" "$B/lib" -type d -newer "$CACHE" 2>/dev/null | wc -l)
  [ "$CHANGED" -eq 0 ] && NEED_SCAN=0
fi

if [ "$NEED_SCAN" -eq 1 ]; then
  DEBLIB="$A"
  for d in $(find "$B/usr/lib" "$B/lib" -type d 2>/dev/null); do
    case "$d" in *python3*|*lib-dynload*|*aarch64-linux-gnu) continue ;; esac
    ls "$d"/*.so* >/dev/null 2>&1 && DEBLIB="$DEBLIB:$d"
  done
  mkdir -p "$ROOT/data" 2>/dev/null
  # 临时文件 + mv：并发启动时不会读到写了一半的缓存
  if printf '%s\n%s\n' "$ROOT" "$DEBLIB" > "$CACHE.tmp.$$" 2>/dev/null; then
    mv -f "$CACHE.tmp.$$" "$CACHE" 2>/dev/null || rm -f "$CACHE.tmp.$$"
  fi
else
  DEBLIB=$(tail -n +2 "$CACHE")
fi

GLIBCLIB="$GLIBC/lib"
[ -d "$GLIBC/glibc/lib" ] && GLIBCLIB="$GLIBC/glibc/lib"

LIB="$DEBLIB:$GLIBCLIB"
[ -d "$EXTRALIB" ] && LIB="$EXTRALIB:$LIB"
# dri 驱动目录：Mesa 默认按编译期路径找，非标准根下必须显式指过去
LIB="$LIB:$A/dri"

# ⚠️ 这里**故意不 export LD_LIBRARY_PATH** —— 这是最隐蔽的一个坑。
#
# 本脚本后面还要调用 sed / rm / find / ls / mkdir 这些**安卓自带的 bionic 程序**。
# 一旦 LD_LIBRARY_PATH 里出现 glibc 的库目录，bionic 链接器会优先在那里找到
# glibc 的 libc.so.6，符号版本对不上（bionic 要 LIBC / LIBC_N），这些程序就会
# **静默启动失败**：
#     sed "..." > file       → file 是 **0 字节**
#     rm -f file             → 文件**还在**
# 看起来像"sed 坏了""文件系统只读"，实际是整个 bionic 工具链被毒死了。
# ld.so 的 `--library-path` 本来就同时管住主程序和后续 dlopen，够用。
# 调用方只在 exec 那一行前导出，绝不污染本 shell 自己的工具链。

# ── Blender 自己的资源与 Python ─────────────────────────────────────
# Debian 把 Blender 拆成 blender + blender-data（资源在 /usr/share/blender）。
# 我们的根不是 "/"，必须显式告诉它，否则报
#     Font data directory "fonts/" could not be detected!
# 然后它会去 popen("/bin/sh ...") 探测字体/挂载点 —— 那一步会踩到
# 「LD_LIBRARY_PATH 毒死 bionic 工具」（/bin/sh 是 bionic 的）。
#
# BLENDER_SYSTEM_PYTHON 要指向 Python 的**安装根**（含 bin/ lib/），不是 lib 目录
# —— 名字像"库目录"，语义其实是"安装前缀"。指错了报 No module named 'encodings'。
export BLENDER_SYSTEM_RESOURCES="$B/usr/share/blender"
export BLENDER_SYSTEM_PYTHON="$B/usr"

# ── 字体（3D 文字对象需要；合成器没有文字节点）──────────────────────
export FONTCONFIG_PATH="$B/etc/fonts"
[ -f "$B/etc/fonts/fonts.conf" ] && export FONTCONFIG_FILE="$B/etc/fonts/fonts.conf"
export XDG_CACHE_HOME="$ROOT/data/cache"
export XDG_DATA_HOME="$ROOT/data/cache/xdg-data"
export XDG_CONFIG_HOME="$ROOT/data/cache/xdg-config"
mkdir -p "$XDG_CACHE_HOME" "$XDG_DATA_HOME" "$XDG_CONFIG_HOME" 2>/dev/null

# ── GPU：四个条件缺一不可（缺了会悄悄退回软件渲染）─────────────────
# 1) libglvnd 必须能找到 Mesa 的 EGL 厂商驱动。
#    缺了它只会看到极具误导性的 EGL_BAD_PARAMETER（实为"找不到驱动"），
#    而不是"文件不存在"。这是整条链路里最难的一个坎。
EGL_VENDOR_JSON="$B/usr/share/glvnd/egl_vendor.d/50_mesa.json"
[ -f "$EGL_VENDOR_JSON" ] && export __EGL_VENDOR_LIBRARY_FILENAMES="$EGL_VENDOR_JSON"

# 2) 安卓没有可用的 /dev/dri/*（SELinux 挡死），只能用 surfaceless。
export EGL_PLATFORM=surfaceless
export LIBGL_DRIVERS_PATH="$A/dri"

# 3) OpenGL → Vulkan 转译。
#    允许外部覆盖：GALLIUM_DRIVER=llvmpipe 可强制纯软件光栅化，
#    这是验证「GPU 到底有没有生效」的 A/B 手段。
export GALLIUM_DRIVER="${GALLIUM_DRIVER:-zink}"
export MESA_LOADER_DRIVER_OVERRIDE="${MESA_LOADER_DRIVER_OVERRIDE:-zink}"

# 3b) 着色器缓存固定到持久目录。不设的话会落到写不进去的默认位置，
#     每次渲染都要重新编译着色器（实测冷 11.1s / 预热 9.8s）。
export MESA_SHADER_CACHE_DIR="${MESA_SHADER_CACHE_DIR:-$ROOT/data/cache/shader}"
mkdir -p "$MESA_SHADER_CACHE_DIR" 2>/dev/null

# 4) Turnip：用补丁版 Mesa 里的那份（Vulkan 1.4.353，走 KGSL）—— 和上游 blender-cli-android 一致。
#    它由 blender --setup 解进 Debian 根（install-debroot.py 的最后一步），
#    Debian 自己的闭包里没有 Turnip，所以 Debian 根里有这个 ICD 就一定是补丁版那份。
#    /dev/kgsl-3d0 对普通应用是 0666；/dev/dri/* 被 SELinux 挡死，所以只能走 KGSL。
#    优先级：ICD=<json>（手动指定） > 补丁版（Debian 根里） > gpu-driver-glibc 组件的 Turnip（Mesa 24.2，Vulkan 1.3）
#            > 都没有 → 明确切 llvmpipe（CPU）
#    2026-10-18 教训：r2 指向 Debian 根里的 ICD，但组件当时漏装了补丁版 Mesa，那个文件根本不存在，
#    zink 报 VK_ERROR_INCOMPATIBLE_DRIVER、EEVEE 不出图。缺哪层要明说，不能悄悄撞墙。
BL_ICD_SRC="" BL_GPU_FROM=""
if [ -n "${ICD:-}" ] && [ -f "$ICD" ]; then
  BL_ICD_SRC="$ICD" BL_GPU_FROM="ICD=$ICD"
elif [ -f "$B/usr/share/vulkan/icd.d/freedreno_icd.aarch64.json" ]; then
  BL_ICD_SRC="$B/usr/share/vulkan/icd.d/freedreno_icd.aarch64.json" BL_GPU_FROM="补丁版 Mesa"
elif [ -f "$GLIBC/share/vulkan/icd.d/freedreno_icd.aarch64.json" ]; then
  BL_ICD_SRC="$GLIBC/share/vulkan/icd.d/freedreno_icd.aarch64.json" BL_GPU_FROM="gpu-driver-glibc"
fi
[ "$BL_GPU_FROM" = "补丁版 Mesa" ] || [ -n "${ICD:-}" ] || \
  echo "blender: 补丁版 Mesa 没装，GPU 退到 ${BL_GPU_FROM:-CPU（llvmpipe）}；跑一次 blender --setup 补上（约 11 MB）" >&2

BL_GPU="cpu"
if [ -n "$BL_ICD_SRC" ]; then
  # ICD 里的 library_path 若是非本机的绝对路径（例如 Debian 的 "/usr/lib/…"），
  # 换成本机能打开的那份，写进组件自己的 etc/。只替换开头的 "/usr/，
  # 不能替换中间的 /usr/lib/，否则会拼出 …/usr/lib/aarch64-linux-gnu/usr/lib/…
  BL_ICD="$BL_ICD_SRC"
  if grep -q '"library_path"[^"]*"/usr/' "$BL_ICD_SRC" 2>/dev/null; then
    mkdir -p "$ROOT/etc" 2>/dev/null
    ICD_TMP="$ROOT/etc/patched_icd.json.tmp.$$"
    sed "s|\"/usr/|\"$B/usr/|g" "$BL_ICD_SRC" > "$ICD_TMP" 2>/dev/null
    if [ -s "$ICD_TMP" ]; then mv -f "$ICD_TMP" "$ROOT/etc/patched_icd.json" && BL_ICD="$ROOT/etc/patched_icd.json"; fi
    rm -f "$ICD_TMP" 2>/dev/null
  fi
  export VK_ICD_FILENAMES="$BL_ICD" VK_DRIVER_FILES="$BL_ICD"
  [ "$GALLIUM_DRIVER" = "zink" ] && BL_GPU="zink（$BL_GPU_FROM）"
else
  # 没有可用的 Turnip：直接声明走 llvmpipe（CPU），而不是让 zink 去撞墙。
  # 慢 5–19 倍（看场景），但结果可预期。要 GPU 就跑 blender --setup 补上补丁版 Mesa。
  if [ "$GALLIUM_DRIVER" = "zink" ]; then
    export GALLIUM_DRIVER=llvmpipe
    unset MESA_LOADER_DRIVER_OVERRIDE
  fi
fi
export CCODROID_BLENDER_GPU="$BL_GPU"
