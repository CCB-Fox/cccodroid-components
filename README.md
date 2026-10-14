# cccodroid-components

[中文](README.zh-CN.md)

Community component recipes for [cccodroid](https://github.com/greyoak111/cccodroid), the Android launcher for Claude Code.

A component is an optional bundle of command-line software (for example `gh`) that you install from cccodroid's Extensions page. Once installed, Claude inside cccodroid can use it, and each component ships a skill that tells Claude how.

## How it works

- **This repo holds recipes only, no binaries.** A recipe lists Termux package names. CI downloads the official Termux `.deb` files, checks every SHA-256, rewrites the prefix from `com.termux` to `cc.codroid` (same length, byte for byte), and packs the result.
- **One build per toolchain version.** Components contain only what the cccodroid toolchain lacks, so each one is built against every toolchain listed in `bases.json`. The app picks the build that matches the user's toolchain.
- **Signed index.** CI publishes `components.json` to the `index` release, signed with ed25519 (`components.json.sig`). The app checks it with a built-in public key, so a tampered index or package will not install.
- **Device-verified flag.** Builds listed in `verified.json` were installed and tried on a real device. Others are marked "not verified on device" in the app.

cccodroid reads this repo starting with v0.2.0. Preset components such as the Chromium browser ship from the cccodroid repo itself.

## Components

| id | What | Upstream license |
|---|---|---|
| `gh` | GitHub CLI | MIT |

## Adding one

See [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/recipe.md](docs/recipe.md).

## License

Recipes, scripts and docs in this repo: Apache-2.0. The packaged software keeps its own upstream license, recorded in each recipe.
