---
name: lilypond
description: 用 LilyPond 写乐谱并排版成 PDF / PNG / SVG / MIDI（cccodroid 的 lilypond 组件）。用户要作曲、编曲、记谱、把旋律写成谱子、出正规五线谱、写歌词配旋律、写和弦进行或鼓谱、把 MIDI / MusicXML / ABC 转成可编辑乐谱时使用。
---

# LilyPond：用文本写乐谱

本机装了 LilyPond 2.26：**乐谱是纯文本**（`.ly`），排一次版出 PDF。
没有图形界面，也不需要 —— 改一个音符重排一次，几秒钟的事。

## 先自检

```sh
lilypond-run --selftest
```

最后一行是 `===== 总结 ===== 排版=OK 输出=PDF+MIDI 版本=2.26.0` 就正常，约 2 秒。

## 基本用法

```sh
lilypond-run <输入.ly> [输出基名] [lilypond 的其它参数…]
```

- 输出基名不给 → 写在输入文件旁边（同名）。
- **扩展名决定格式**：`.pdf`（默认）/ `.png` / `.svg`。`-dresolution=300` 可以调 PNG 精度。
- 乐谱里写了 `\midi { }`，同一基名下会**同时**出 `.midi`。
- 产物路径按行打在 stdout（一个文件一行），拿它去给用户或做下一步。
- 有警告（警告带 `文件:行:列:` 前缀）会打到 stderr，**别当没看见**。

```sh
lilypond-run song.ly                      # → song.pdf（+ song.midi，若写了 \midi{}）
lilypond-run song.ly /sdcard/cccodroid/song.pdf
lilypond-run song.ly cover.png -dresolution=300
```

**给用户的成品（PDF、PNG、MIDI）写到 `/sdcard/cccodroid/` 下**，用户能在应用内查看器里直接打开。

## 最小模板（照这个改）

```lilypond
\version "2.26.0"
\header { title = "曲名" composer = "作曲" tagline = ##f }

melody = \relative c'' {
  \key c \major \time 4/4 \tempo 4 = 90
  c8 c d e f4 f8 e | d8 c b4 c2 |
}

\score {
  \new Staff \new Voice = "v" \melody
  \layout { }
  \midi { }
}
```

**`\relative` 是省事的关键**：写 `c8 c d e`，每个音都取离前一个最近的那个八度；
不写 `\relative` 就得每个音都带八度标记（`c''8`）。

**每小节拍数要凑够**，否则会报 `warning: bar check failed at: 1/2` —— 谱子照样出得来，但节奏是错的。

## 常用片段

```lilypond
% 歌词：和声部里的音符一一对齐（一个音唱多个字用 __ 连起来）。
% 注意 { } —— 直接写 \lyricsto "v" \lyricmode {…} 会报语法错误。
\new Staff \new Voice = "v" \melody
\new Lyrics \lyricsto "v" { \lyricmode { 好 一 朵 美 丽 的 茉 莉 花 } }
% 也可以先赋值再用（等号前的名字**不带**反斜杠）：words = \lyricmode { … } / \lyricsto "v" \words

% 和弦名（Em / Am7 那种写在谱上方）+ 和弦进行
\new ChordNames \chordmode { e2:m a2:m d2 e2:m }

% 吉他指法图（和 ChordNames 一样是独立的一行谱，不能塞进 \new Staff 里）
<< \new ChordNames \chordmode { a1:m d2:m g2 }
   \new FretBoards \chordmode { a1:m d2:m g2 } >>

% 多声部（一个谱表两声部）
\new Staff << \new Voice { \voiceOne \stemUp   \relative c'' { c4 d e f } }
              \new Voice { \voiceTwo \stemDown \relative c'  { a4 b c d } } >>

% 鼓谱
\new DrumStaff \drums { \time 4/4 hh4 hh sn hh | hh hh sn hh }

% 反复、连音线、力度
\relative c'' { c4( d e f) \mf | \repeat volta 2 { g2 g } }
```

**歌词写在 `\lyricmode { }` 里、用 `\lyricsto "声部名"` 挂到具名声部上**。
声部名对不上时 LilyPond **只报一句 warning，歌词就不显示了**（谱子看不出哪里错）——
歌词没出来先查这个：声部要写成 `\new Voice = "v"`。

## 中文

**中文直接写就行**，标题、歌词、表情记号都能正常渲染（本机实测，不需要指定字体）。
真出现缺字形时 LilyPond 会打 warning（`no glyph available` 之类），那时才需要指字体：

```lilypond
\header { title = \markup { \override #'(font-name . "Noto Sans CJK SC") "曲名" } }
```

带中文的谱子 PDF 会大不少（要嵌 CJK 字体，一段小曲也能到 1 MB 上下），纯拉丁的谱子只有几十 KB。

## 和别的格式互转

```sh
musicxml2ly in.musicxml -o out.ly     # MusicXML → .ly
midi2ly in.mid -o out.ly              # MIDI → .ly（可能报 BUG: time skew，仍会出文件）
abc2ly in.abc -o out.ly               # ABC 记谱 → .ly
convert-ly -e old.ly                  # 旧版本语法的 .ly 就地升级到 2.26（网上抄的例子先跑这个）
lilypond-book doc.tex                 # 把乐谱嵌进 LaTeX/HTML（需要相应工具链）
```

## 常见坑

- **直接调 `lilypond` 而不是 `lilypond-run` 时，要自己保证 `TMPDIR` 指向一个存在的可写目录。**
  安卓上没有根目录级的临时目录，LilyPond 内部找不到可写的临时目录时会在排版阶段失败
  （`open-fdes … No such file or directory`），而同一个乐谱的 **MIDI 却能正常出来** ——
  看着像「PDF 坏了」。`lilypond-run` 已经兜住了这件事。
- `-o` 收的是**基名**不是文件名：直接给 lilypond 传 `-o out.pdf` 会得到 `out.pdf.pdf`；
  格式也不是靠扩展名（给 `out.png` 仍然出 PDF），要 `--png` / `-dbackend=svg`。`lilypond-run` 都替你办了。
- 第一遍排版稍慢（要加载字体），之后同一台机器上快一些。实测：三小节的小曲约 5 秒，
  32 小节约 5.4 秒 —— 时间是「启动 + 加载字体」占大头，不是按小节数线性涨。
- `\version` 与实际版本不符只报 warning，但**语法是按版本走的**；网上抄来的老例子用 `convert-ly -e` 升一下。
- 输出由每个 `\score` 块自己决定：写 `\layout { }` 出 PDF，写 `\midi { }` 出 MIDI，
  **两个都不写也照出 PDF**（LilyPond 套默认版式）；只写 `\midi { }` 就只出 MIDI。
  真正什么都不出的是**整个文件没有 `\score`**（只定义了几个变量之类），这时包装脚本按失败报（退出码 1）。
- 想听效果就把 `.midi` 交给用户。**工具包有 ffmpeg，但没有 MIDI 合成器，也没有音色库** ——
  `.midi` 暂时转不成音频，别去找 timidity / fluidsynth，等以后的音频合成组件。
