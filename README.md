# cccodroid-components

[中文](README.zh-CN.md)

Community component recipes for [cccodroid](https://github.com/greyoak111/cccodroid), the Android launcher for Claude Code.

A component is an optional software bundle that you install from cccodroid's Extensions page. Examples include the GitHub CLI, LibreOffice, circuit simulators and local LLM inference. Once installed, Claude inside cccodroid can use it. Each component ships a skill that tells Claude how to use it and what to watch out for.

cccodroid reads this repository since 0.1.10. Preset components such as the browser (Chromium) are still published from the cccodroid repository.

## Components

| id | What it is | Category | Notes | Upstream license |
|---|---|---|---|---|
| `gh` | GitHub CLI: pull requests, issues, releases, Actions | Dev | | MIT |
| `godot` | Godot 4 engine: headless runs, Android APK export | Dev | | MIT |
| `blender` | Headless Blender 4.3: Python-scripted compositing, motion graphics and video output; 3D rendering can use the GPU | Media | Downloads the engine from Debian on first use (about 267 MB) | GPL-2.0-or-later |
| `lilypond` | LilyPond: music notation from plain text — publication-grade PDF, plus PNG, SVG and MIDI | Media | | GPL-3.0-or-later |
| `music` | Music production toolchain: MIDI to audio (fluidsynth), SuperCollider synthesis, sox mastering, aubio analysis | Media | Bundles a GM soundfont (31 MB) | LGPL-2.1-or-later AND GPL-3.0-or-later AND GPL-2.0-only AND LicenseRef-GeneralUser-GS-2.0 |
| `libreoffice` | Headless LibreOffice: convert documents, export PDF | Office | | MPL-2.0 AND LGPL-3.0 |
| `llama-cpp` | llama.cpp: local LLM inference | AI | Bring your own model (.gguf) | MIT |
| `openscad` | OpenSCAD: script-based 3D modelling, STL and other exports, with the MCAD library | 3D & CAD | | GPL-2.0-only |
| `ngspice` | ngspice: circuit simulation | EDA | | BSD-3-Clause AND LGPL-2.1-only |
| `gnucap` | gnucap: circuit simulation | EDA | | GPL-3.0-or-later |
| `iverilog` | Icarus Verilog: Verilog simulation, waveforms rendered to images | EDA | | GPL-2.0-or-later |
| `yosys` | Yosys: Verilog synthesis | EDA | | ISC |
| `gpu-driver` | Gives command-line programs access to the Adreno GPU: Turnip (Vulkan) + zink (OpenGL / GLES) | GPU | Snapdragon only | MIT |
| `gpu-driver-glibc` | The same for glibc (Linux arm64) programs, with the `lgpu-run` launcher | GPU | Snapdragon only | MIT |
| `clvk-glibc` | OpenCL (clvk, on top of Vulkan) for glibc programs | GPU | Snapdragon only; needs `gpu-driver-glibc` | Apache-2.0 |
| `gpu-bench` | GPU info and benchmarks (clinfo / vkmark / clpeak) | GPU | Snapdragon only; needs `gpu-driver` | CC0-1.0 AND GPL-3.0-or-later AND GPL-2.0-or-later |
| `cloudflare` | Cloudflare CLI (wrangler): deploy Workers and Pages, manage R2 / KV / D1, run `wrangler dev` locally | Net | Log in with `cf-login` by pasting a token | (MIT OR Apache-2.0) AND Apache-2.0 |

Every component in the table has been verified on a real device with the current toolchain (devkit-2026.10.15.1). Some were tested directly; others inherited a verification from an earlier toolchain (see "Device verification" below). The records are in [`verified.json`](verified.json).

The app won't offer "Snapdragon only" components on devices with other chips. For components with dependencies, the app asks you to install those first and won't let you remove them while something still depends on them.

## How it works

- **This repo holds recipes only, no binaries.** A recipe lists Termux package names. CI downloads the official Termux `.deb` files, checks every SHA-256, rewrites the prefix from `com.termux` to `cc.codroid` (same length, byte for byte), and packs the result. A recipe may also declare an upstream artifact with `fetch` (URL plus SHA-256). This is only for artifacts the component needs at runtime that the official repository doesn't have; CI downloads and checks them.
- **One build per toolchain version.** Components contain only what the cccodroid toolchain lacks, so each one is built against every toolchain listed in [`bases.json`](bases.json). The app installs the build that matches the user's toolchain. When cccodroid ships a new toolchain, it gets a line here.
- **Signed index.** CI publishes `components.json` to the `index` release with an ed25519 signature (`components.json.sig`). The app checks it against a built-in public key, so a tampered index or package won't install.
- **Device verification.** `verified.json` lists builds that were installed on a real device, passed their self-test and uninstalled cleanly. Anything not listed shows as "not verified on a device" in the app. After a new toolchain, a build inherits the earlier record if neither the component's packages nor the toolchain packages it relies on have changed. Only builds that actually changed need a new test.
- **Audit.** Every pull request runs the format check (`check-recipes.mjs`). Then `audit.mjs` builds the package for real and checks:
  - missing libraries and script interpreters;
  - files that would overwrite the toolchain, and leftover Termux paths;
  - anything in the skill that a human should look at (tokens, downloads, delete or publish steps, privilege escalation).

  The audit report rates each component as 🟢 read the report, 🟡 read the scripts and skill, or 🔴 review line by line.

## Adding a component

Read the [authoring rules](.claude/skills/component-authoring/SKILL.md), then [CONTRIBUTING.md](CONTRIBUTING.md) and the [recipe format](docs/recipe.md). The quickest start is to copy `recipes/gh/`. For larger examples with wrapper scripts, see `recipes/iverilog/` or `recipes/llama-cpp/`.

If an AI assistant writes the component for you, [AGENTS.md](AGENTS.md) at the repository root is written for it.

## License

Recipes, scripts and documentation in this repository are Apache-2.0. Packaged software keeps its upstream license, recorded in each recipe.
