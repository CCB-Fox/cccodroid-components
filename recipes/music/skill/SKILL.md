---
name: music
description: 用户要把音乐变成能听的音频、或要从零做声音时用 —— MIDI 渲染成 WAV（内置 GM 音色库，不需要声卡）、用 SuperCollider 写合成器/算法作曲并离线渲染、sox 做后期（裁剪拼接淡入淡出归一化变速转码）、aubio 分析成品（基频/节拍/起始点）。配合 lilypond 组件就是完整链路：.ly 乐谱 → MIDI → 音频 → 后期。
---

# music：音乐生产工作流

**先跑自检**（约 5 秒，会把五件事各走一遍真链路，全程不联网）：

```sh
music --selftest
# ===== 总结 ===== 渲染=OK 合成=OK 后期=OK 分析=OK 超时=OK fluidsynth=2.6.1 scsynth=3.14.1
```

`music --where` 看各工具装在哪、音色库和许可原文在不在。`music banks` 看有哪些音色库、许可原文在哪。

四件工具：**fluidsynth**（MIDI → 音频）、**SuperCollider**（从零合成 / 算法作曲，离线渲染）、
**sox**（后期）、**aubio**（分析）。全部无头、命令行驱动，不需要图形界面，也不需要声卡。

## 1. MIDI → 音频

```sh
music render 曲子.mid                  # → 曲子.wav（44.1 kHz 立体声）
music render 曲子.mid /sdcard/cccodroid/曲子.wav
music render 曲子.mid --gain 1.2 --bank 别的.sf2
```

- 不给 `--bank` 就用**内置的 GeneralUser GS**（GM 音色库：128 种乐器 + 鼓组，31 MB，随组件装着）。
- 不用声卡、不按实时走：**10 秒的曲子约 0.3 秒**渲完，可以放心渲染长曲子。
- 成品写到 `/sdcard/cccodroid/`（用户能在应用内查看器里直接播放）。
- **退出码 3 = 渲出来了，但整段静音**（文件留着，不删）：要么音色库不是 GM 音色库，
  要么曲子里根本没有音符。单独给一个码是有意的 —— 只看「非 0 即失败」会漏掉「成功但没声音」。
- 音色库的**许可原文**跟着组件装着：`music banks` 会打出它的路径（`GeneralUser-GS-LICENSE.txt`）。
  要商业发行时先读一遍 —— 作者声明部分采样的来源无法 100% 确认，这跟"能打包进软件"是两件事。

**从 lilypond 组件的乐谱过来**（`\midi { }` 那一块就是给这步用的）：

```sh
lilypond-run 曲子.ly          # → 曲子.pdf + 曲子.midi
music render 曲子.midi        # → 曲子.wav
```

## 2. 从零合成 / 算法作曲（SuperCollider）

**`music synth` 跑的是「离线渲染」（NRT）**：脚本只负责算谱面，scsynth 把结果写成 WAV ——
不实时出声、不占声卡，几秒的声音 0.1 秒就渲完。写合成器、做音效、算法作曲都靠这个。

脚本用 `.scd`（SuperCollider 语言），**结尾必须按这个模板把谱面写出来**，否则渲染没有输入：

```supercollider
(
var score = Score.new;

// SynthDef = 一个合成器：这里是一个带包络的正弦音
var sd = SynthDef(\ping, { |freq = 440, amp = 0.3, dur = 0.5, pan = 0|
    var e = EnvGen.kr(Env.perc(0.005, dur), doneAction: 2);   // doneAction: 2 = 包络走完自己释放
    var sig = SinOsc.ar(freq) * 0.6 + Saw.ar(freq * 2) * 0.2 + WhiteNoise.ar(0.03);
    Out.ar(0, Pan2.ar((sig * e * amp).tanh, pan));            // .tanh 当限幅器，别让叠加爆掉
}).asBytes;

score.add([0.0, [\d_recv, sd]]);                              // 第一个事件：把 SynthDef 发过去

// 之后每个事件是 [时间(秒), [动作, …]]
// 下面这段是算法作曲：固定随机种子 + 五声音阶，结果可复现
thisThread.randSeed = 20261016;
32.do { |i|
    var scale = [0, 2, 4, 7, 9];
    var midi = 60 + scale.choose + [0, 12].wchoose([0.75, 0.25]);
    score.add([0.15 * i, [\s_new, \ping, 1000 + i, 0, 0,
        \freq, midi.midicps, \amp, 0.8, \dur, 0.5, \pan, rrand(-0.8, 0.8)]]);
};

score.add([0.15 * 32 + 1.5, [\c_set, 0, 0]]);                 // 末尾归零 = 自然收尾
score.writeOSCFile("MUSIC_OSC".getenv, 0, nil);               // ← 这两行是约定，别改
0.exit;
)
```

```sh
music synth piece.scd                 # → piece.wav
music synth piece.scd 出.wav --rate 48000
music synth piece.scd --timeout 600   # 卡住时最多等 600 秒（默认 120）
```

- `\s_new` 的参数：`[动作, 合成器名, 节点号(自己编号，别重复), 加在哪, 目标, 参数…]`。
- `Out.ar(0, …)` 的 0 是输出总线：`music synth` 固定按**立体声**（2 声道）渲染。
- 想换别的 UGen：`SinOsc` / `Saw` / `Pulse` / `WhiteNoise` / `PinkNoise` / `LFTri`，滤波器 `RLPF` / `MoogFF`，
  效果 `FreeVerb` / `DelayN`，都内置。`sc3-plugins` 那类第三方 UGen 不在组件里。
- ⚠️ **别在脚本里调 scsynth**（`Score.recordNRT` / `String.system`）—— 本机上一个会挂死、
  一个是异步的（脚本一退出就把渲染掐死，还打印"成功"）。渲染交给 `music synth` 就行，它已经拆好两步。
- ⚠️ **sclang 端有超时**（默认 120 秒，`--timeout N` 可调）：漏写末尾那两行，或者调了会挂住的
  `String.system`，sclang 会一直不退出（实测：`</dev/null` 也不会让它自己退出），调用方跟着卡死。
  到点会停下并明确报「sclang 超时」，不要以为它挂了就重跑 —— 先看脚本结尾那两行在不在。

## 3. 后期（sox）

```sh
sox in.wav out.mp3                       # 转格式（mp3 编码器在工具包里，本机实测过）
sox in.wav out.wav trim 5 10             # 从第 5 秒截 10 秒
sox a.wav b.wav out.wav                  # 拼接
sox in.wav out.wav fade 0.5 0 -0.5       # 头 0.5 秒淡入、尾 0.5 秒淡出
sox in.wav out.wav gain -n -3            # 归一化到 -3 dB
sox in.wav out.wav tempo 0.9             # 变速不变调（tempo 0.9 = 慢 10%）
sox in.wav -n stat                       # 只看统计：峰值、RMS、时长
```

`/sdcard` 上的文件可以直接读写；`sox` 的 `-n` 意思是"不写文件"。

**mp3 是真的能编**（本机实测，不是照抄上游文档）：`sox x.wav x.mp3` 出 128 kbps 的 MPEG layer III，
再解回来时长 10.005 秒、RMS 0.037 —— 编码器是工具包里的 `libmp3lame`（跟着 ffmpeg 那条链），
不是这个组件带的。`mp3` / `ogg` 都行，`wav` 当然也行。

## 4. 分析（aubio）—— 让 AI 听自己的成品

aubio 在这个组件里是**拆开的子命令**（没有 `aubio <子命令>` 这种总入口）：

```sh
aubiopitch  曲子.wav        # 逐帧基频（Hz + 音名）—— 核对有没有跑调
aubioonset  曲子.wav        # 音符起始点（切分、对谱用）
aubiotrack  曲子.wav        # 节拍位置
aubionotes  曲子.wav        # 音符级转录（起止 + 音高）
```

先 `sox 曲子.wav mono.wav remix 1` 转单声道更稳。写完一段音乐后拿它核对一遍，
比"听起来应该没错"可靠 —— 尤其是生成的 MIDI 有没有调式错误。

## 5. 程序化生成 MIDI

组件里没有 MIDI 库，要程序生成就装 Python 的（纯 Python，几秒装好）：

```sh
pip install mido        # 读写 MIDI：mido.MidiFile / MidiTrack / Message('note_on', …)
```

也可以直接让 lilypond 组件出 MIDI（写 `\midi { }`），或用 `music synth` 直接合成 ——
不需要 MIDI 这一步时别绕远路。

## 坑（都真踩过）

| 现象 | 原因 / 怎么办 |
|---|---|
| 渲染出来的 WAV 整段静音 | 音色库不是 GM 音色库（bank 0 / prog 0 没音色），或者曲子里没有音符 —— 网上很多"免费 GM"其实是别的东西。`music render` 会警告并给**退出码 3**（文件留着）；用内置的那本就没事 |
| 换的 SoundFont 读不了 | **SF3（vorbis 压缩）fluidsynth 读不了**，要 SF2。MuseScore 系的 `.sf3` 就是这种 |
| `music synth` 报"脚本没有写出谱面" | 脚本结尾漏了 `score.writeOSCFile("MUSIC_OSC".getenv, 0, nil); 0.exit;` |
| `music synth` 等了很久，最后报「sclang 超时」 | 同上，也是漏了 `0.exit`（或调了会挂住的 `String.system`）—— 补上那两行；确实要跑更久就 `--timeout 600` |
| SuperCollider 报找不到类库 | 组件已经把 `-a --include-path` 指好了；**自己直接调 sclang 时**要照抄，另加 `scsynth -U <插件目录>`（`SC_PLUGIN_PATH` 环境变量没用） |
| 脚本报错但 sclang 退出码 0 | SC 启动时打一堆信息，别只看退出码 —— `music synth` 以"有没有写出谱面/有没有产物"为准 |
| 临时文件报 `No such file or directory` | 安卓没有可写的根级临时目录。组件已把 `TMPDIR` 指好；自己 fork 的进程要照抄 |
| 往 `/sdcard` 写失败 | `/sdcard` 只能当"输出/素材"目录：不能执行程序、不能建软链（写文件没问题） |
| 声音爆掉/削顶 | 多个音叠加时幅度会累加。给 `Out.ar` 那层套 `.tanh`，或把 `\amp` 调小 |

## 实测数字（本机 NX769J / Android 14）

| 活 | 耗时 |
|---|---|
| `music --selftest`（渲染 + 合成 + 后期 + 分析 + 超时保护） | 4.4 秒 |
| 10 秒的 MIDI → WAV（fluidsynth） | 0.3 秒 |
| 6.3 秒的算法作曲 NRT 渲染（SuperCollider） | 0.07 秒 |
| 音量对比（同一首《茉莉花》） | GeneralUser GS RMS 2306 / FluidR3_GM 1088 / TimGM6mb 994 |

## 要先问用户的事

- 渲染很长的曲子 / 出大文件前，报一下预计体积（10 秒 44.1 kHz 立体声 WAV 约 1.7 MB）。
- 覆盖或删除 `/sdcard/cccodroid/` 下已有文件之前，先问一句。
- 装 Python 的 MIDI 库（`pip install`）会联网，先问一句。
- 用户要把成品**商业发行**（卖钱、放进商业产品）时，提醒他读一下内置音色库的许可原文
  （路径用 `music banks` 看）：许可是允许商用的，但作者声明部分采样的来源无法 100% 确认，
  要不要用是他自己的决定 —— 别替他打包票。
