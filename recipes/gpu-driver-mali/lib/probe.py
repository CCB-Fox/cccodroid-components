#!/usr/bin/env python3
"""gpu-driver-mali 组件探针（自检用，不需要网络、不需要显示服务器）。

用法:
  probe.py summary      设备信息 + 厂商 Vulkan + 厂商 GLES + 离屏渲染读回校验

退出码：0 = 系统 loader 枚举到 Mali GPU 且渲染读回正确；1 = 不是 Mali 或不可用。

探针的 Vulkan 结构体与 EGL 调用方式参考了同仓库 recipes/gpu-driver/lib/probe.py
（Apache-2.0），针对 Mali / 系统 loader 精简。
"""
import ctypes
import os
import struct
import subprocess
import sys
from ctypes import (CDLL, CFUNCTYPE, POINTER, byref, c_char_p, c_float, c_int,
                    c_size_t, c_uint, c_uint32, c_void_p, create_string_buffer)

SYSTEM_VK_LOADER = "/system/lib64/libvulkan.so"
SYSTEM_EGL = "/system/lib64/libEGL.so"
SYSTEM_GLES = "/system/lib64/libGLESv2.so"
EGL_NONE = 0x3038
VK_LOADER_ERRORS = ("VK_DRIVER_FILES", "VK_ICD_FILENAMES")


def hdr(s):
    print("== %s ==" % s, flush=True)


def getprop(name):
    try:
        return subprocess.run(["getprop", name], capture_output=True, text=True,
                              timeout=3).stdout.strip() or "?"
    except Exception:
        return "?"


# ---------------------------------------------------------------- Vulkan
class VkApplicationInfo(ctypes.Structure):
    _fields_ = [("sType", c_uint32), ("pNext", c_void_p), ("pApplicationName", c_char_p),
                ("applicationVersion", c_uint32), ("pEngineName", c_char_p),
                ("engineVersion", c_uint32), ("apiVersion", c_uint32)]


class VkInstanceCreateInfo(ctypes.Structure):
    _fields_ = [("sType", c_uint32), ("pNext", c_void_p), ("flags", c_uint32),
                ("pApplicationInfo", POINTER(VkApplicationInfo)), ("enabledLayerCount", c_uint32),
                ("ppEnabledLayerNames", c_void_p), ("enabledExtensionCount", c_uint32),
                ("ppEnabledExtensionNames", c_void_p)]


def _vk_version(x):
    return "%d.%d.%d" % (x >> 22, (x >> 12) & 0x3FF, x & 0xFFF)


def vk_devices():
    """用 /system loader 枚举厂商驱动；返回 [dict]，失败返回 []。"""
    for k in VK_LOADER_ERRORS:
        os.environ.pop(k, None)
    try:
        vk = CDLL(SYSTEM_VK_LOADER)
    except OSError as e:
        print("[failed] dlopen %s: %s" % (SYSTEM_VK_LOADER, e))
        return []

    gipa = vk.vkGetInstanceProcAddr
    gipa.restype = c_void_p
    gipa.argtypes = [c_void_p, c_char_p]

    p = gipa(None, b"vkCreateInstance")
    if not p:
        print("[failed] 系统 loader 没有 vkCreateInstance")
        return []
    create = CFUNCTYPE(c_int, POINTER(VkInstanceCreateInfo), c_void_p,
                       POINTER(c_void_p))(p)
    app = VkApplicationInfo(0, None, b"cccodroid-mali-probe", 1, b"probe", 1, 0x00401000)
    ci = VkInstanceCreateInfo(1, None, 0, ctypes.pointer(app), 0, None, 0, None)
    inst = c_void_p()
    rc = create(byref(ci), None, byref(inst))
    if rc != 0:
        print("[failed] vkCreateInstance rc=%d" % rc)
        return []

    p = gipa(inst, b"vkEnumeratePhysicalDevices")
    if not p:
        print("[failed] 没有 vkEnumeratePhysicalDevices")
        return []
    enum_pd = CFUNCTYPE(c_int, c_void_p, POINTER(c_uint32), POINTER(c_void_p))(p)
    n = c_uint32(0)
    rc = enum_pd(inst, byref(n), None)
    if rc != 0 or n.value == 0:
        print("[failed] 设备数 0（rc=%d）" % rc)
        return []
    devs = (c_void_p * n.value)()
    enum_pd(inst, byref(n), devs)

    get_props = CFUNCTYPE(None, c_void_p, c_void_p)(gipa(inst, b"vkGetPhysicalDeviceProperties"))
    out = []
    for i, dv in enumerate(devs):
        buf = create_string_buffer(1024)
        get_props(dv, buf)
        api, drv, vend, dev = struct.unpack_from("<IIII", buf.raw, 0)
        name = buf.raw[20:276].split(b"\0")[0].decode(errors="replace")
        out.append({"index": i, "name": name, "api": _vk_version(api),
                    "driver": _vk_version(drv), "vendor": vend, "device": dev})
        print("[vendor] [%d] %s | vendorID=0x%04x deviceID=0x%08x | api %s | driver %s"
              % (i, name, vend, dev, _vk_version(api), _vk_version(drv)))
    return out


# ---------------------------------------------------------------- EGL / GLES
def _load_egl():
    egl = CDLL(SYSTEM_EGL)
    CDLL(SYSTEM_GLES)
    egl.eglGetDisplay.restype = c_void_p
    egl.eglGetDisplay.argtypes = [c_void_p]
    egl.eglInitialize.restype = c_uint
    egl.eglInitialize.argtypes = [c_void_p, POINTER(c_int), POINTER(c_int)]
    egl.eglChooseConfig.restype = c_uint
    egl.eglChooseConfig.argtypes = [c_void_p, POINTER(c_int), POINTER(c_void_p),
                                    c_int, POINTER(c_int)]
    egl.eglCreateContext.restype = c_void_p
    egl.eglCreateContext.argtypes = [c_void_p, c_void_p, c_void_p, POINTER(c_int)]
    egl.eglMakeCurrent.restype = c_uint
    egl.eglMakeCurrent.argtypes = [c_void_p, c_void_p, c_void_p, c_void_p]
    egl.eglGetProcAddress.restype = c_void_p
    egl.eglGetProcAddress.argtypes = [c_char_p]
    egl.eglQueryString.restype = c_char_p
    egl.eglQueryString.argtypes = [c_void_p, c_int]
    egl.eglTerminate.restype = c_uint
    egl.eglTerminate.argtypes = [c_void_p]
    return egl


def _egl_session(egl):
    dpy = egl.eglGetDisplay(None)
    if not dpy:
        print("[failed] eglGetDisplay 失败")
        return None
    maj, mi = c_int(0), c_int(0)
    if not egl.eglInitialize(c_void_p(dpy), byref(maj), byref(mi)):
        print("[failed] eglInitialize 失败")
        return None
    cfg, n = c_void_p(), c_int(0)
    attribs = (c_int * 5)(0x3033, 0x0001, 0x3040, 0x0004, EGL_NONE)  # PBUFFER + ES2
    if not egl.eglChooseConfig(c_void_p(dpy), attribs, byref(cfg), 1, byref(n)) or n.value < 1:
        print("[failed] eglChooseConfig 失败（没有 PBUFFER+ES2 配置）")
        return None
    ctx = egl.eglCreateContext(c_void_p(dpy), cfg, None, (c_int * 3)(0x3098, 2, EGL_NONE))
    if not ctx:
        print("[failed] eglCreateContext 失败")
        return None
    if not egl.eglMakeCurrent(c_void_p(dpy), None, None, c_void_p(ctx)):
        print("[failed] eglMakeCurrent 失败（无显示服务器的离屏上下文）")
        return None
    return dpy, maj.value, mi.value


def _gl_proc(egl, name, restype, *args):
    p = egl.eglGetProcAddress(name)
    if not p:
        raise RuntimeError("缺函数 %s" % name.decode())
    return CFUNCTYPE(restype, *args)(p)


def egl_info(egl, session):
    dpy = session[0]
    glgetstring = _gl_proc(egl, b"glGetString", c_char_p, c_uint)
    renderer = (glgetstring(0x1F01) or b"?").decode(errors="replace")
    version = (glgetstring(0x1F02) or b"?").decode(errors="replace")
    vendor = egl.eglQueryString(c_void_p(dpy), 0x3053) or b"?"
    eglver = egl.eglQueryString(c_void_p(dpy), 0x3054) or b"?"
    print("[vendor] EGL %d.%d | EGL_VENDOR: %s | EGL_VERSION: %s"
          % (session[1], session[2], vendor.decode(errors="replace"),
             eglver.decode(errors="replace")))
    print("[vendor] GL_RENDERER: %s" % renderer)
    print("[vendor] GL_VERSION: %s" % version)
    return renderer


def render_test(egl, session):
    dpy = session[0]
    try:
        gl_gen_fbos = _gl_proc(egl, b"glGenFramebuffers", None, c_int, POINTER(c_uint))
        gl_bind_fbo = _gl_proc(egl, b"glBindFramebuffer", None, c_uint, c_uint)
        gl_gen_tex = _gl_proc(egl, b"glGenTextures", None, c_int, POINTER(c_uint))
        gl_bind_tex = _gl_proc(egl, b"glBindTexture", None, c_uint, c_uint)
        gl_tex_image = _gl_proc(egl, b"glTexImage2D", None, c_uint, c_int, c_int, c_int,
                                c_int, c_int, c_uint, c_uint, c_void_p)
        gl_tex_param = _gl_proc(egl, b"glTexParameteri", None, c_uint, c_uint, c_int)
        gl_fbo_tex = _gl_proc(egl, b"glFramebufferTexture2D", None, c_uint, c_uint,
                              c_uint, c_uint, c_int)
        gl_fbo_status = _gl_proc(egl, b"glCheckFramebufferStatus", c_uint, c_uint)
        gl_viewport = _gl_proc(egl, b"glViewport", None, c_int, c_int, c_int, c_int)
        gl_clear_color = _gl_proc(egl, b"glClearColor", None, c_float, c_float,
                                  c_float, c_float)
        gl_clear = _gl_proc(egl, b"glClear", None, c_uint)
        gl_read_pixels = _gl_proc(egl, b"glReadPixels", None, c_int, c_int, c_int,
                                  c_int, c_uint, c_uint, c_void_p)
        gl_finish = _gl_proc(egl, b"glFinish", None)
    except RuntimeError as e:
        print("[vendor] %s" % e)
        return False

    GL_TEXTURE_2D, GL_RGBA, GL_UNSIGNED_BYTE = 0x0DE1, 0x1908, 0x1401
    GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_FRAMEBUFFER_COMPLETE = 0x8D40, 0x8CE0, 0x8CD5
    GL_TEXTURE_MIN_FILTER, GL_TEXTURE_MAG_FILTER, GL_LINEAR = 0x2801, 0x2800, 0x2601
    GL_COLOR_BUFFER_BIT = 0x4000

    tex, fbo = c_uint(0), c_uint(0)
    gl_gen_tex(1, byref(tex))
    gl_bind_tex(GL_TEXTURE_2D, tex.value)
    gl_tex_image(GL_TEXTURE_2D, 0, GL_RGBA, 64, 64, 0, GL_RGBA, GL_UNSIGNED_BYTE, None)
    gl_tex_param(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR)
    gl_tex_param(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR)
    gl_gen_fbos(1, byref(fbo))
    gl_bind_fbo(GL_FRAMEBUFFER, fbo.value)
    gl_fbo_tex(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, tex.value, 0)
    st = gl_fbo_status(GL_FRAMEBUFFER)
    if st != GL_FRAMEBUFFER_COMPLETE:
        print("[vendor] FBO 不完整: 0x%x" % st)
        return False
    gl_viewport(0, 0, 64, 64)
    gl_clear_color(0.25, 0.5, 0.75, 1.0)
    gl_clear(GL_COLOR_BUFFER_BIT)
    px = (ctypes.c_ubyte * 4)()
    gl_read_pixels(0, 0, 1, 1, GL_RGBA, GL_UNSIGNED_BYTE, ctypes.cast(px, c_void_p))
    gl_finish()
    got, exp = tuple(px), (64, 128, 191, 255)
    ok = all(abs(a - b) <= 2 for a, b in zip(got, exp))
    print("[vendor] 读回像素 %s（期望 %s）-> %s" % (got, exp, "PASS" if ok else "FAIL"))
    return ok


# ---------------------------------------------------------------- summary
def summary():
    print("===== 设备 =====")
    print("soc        : %s" % getprop("ro.soc.model"))
    print("egl/vulkan : %s / %s" % (getprop("ro.hardware.egl"), getprop("ro.hardware.vulkan")))
    print("mali node  : %s" % ("存在 (/dev/mali0)" if os.path.exists("/dev/mali0")
                                  else "不存在"))

    print()
    print("===== 厂商 Vulkan（系统 loader）=====")
    devices = vk_devices()
    mali = next((d for d in devices
                 if "mali" in d["name"].lower() or "immortalis" in d["name"].lower()), None)
    if not devices:
        print("(没有枚举到设备：这台设备可能没有 Vulkan，或不是 Mali)")

    print()
    print("===== 厂商 GLES（系统 EGL/GLESv2）=====")
    renderer = ""
    render_ok = False
    try:
        egl = _load_egl()
    except OSError as e:
        egl = None
        print("[failed] dlopen 系统 EGL/GLES 失败: %s" % e)
    if egl:
        session = _egl_session(egl)
        if session:
            renderer = egl_info(egl, session)
            print()
            print("===== 离屏渲染（建 FBO、清屏、读回像素）=====")
            render_ok = render_test(egl, session)
            egl.eglTerminate(c_void_p(session[0]))

    print()
    vk_api = mali["api"] if mali else "-"
    print("===== 总结 ===== Mali=%s Vulkan=%s GL=%s render=%s"
          % ("OK" if mali else "NO", vk_api, renderer or "-",
             "PASS" if render_ok else "FAIL"))
    if not mali:
        print("这台设备枚举不到 Mali GPU：本组件只适用于 ARM Mali（天玑 / Exynos / Tensor 等）。",
              file=sys.stderr)
        return 1
    if not render_ok:
        print("Vulkan 可用，但离屏 GLES 渲染没通过：先用 gpu-run 跑 Vulkan 程序，"
              "GLES 路径请反馈给维护者。", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] != "summary":
        print(__doc__)
        sys.exit(2)
    sys.exit(summary())
