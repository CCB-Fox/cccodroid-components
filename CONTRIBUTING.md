# 贡献配方 / Contributing

1. 在 [packages.termux.dev](https://packages.termux.dev) 或 termux-packages 仓库确认软件有 aarch64 包。
2. 复制 `recipes/gh/` 改成你的组件，按 [docs/recipe.md](docs/recipe.md) 填写。
3. 本地检查（需要 Node 22 和 cccodroid 仓库的 `devkit/`）：
   ```sh
   node tools/check-recipes.mjs
   node tools/ci-build.mjs --devkit ../cccodroid/devkit --only <id> --dry        # 只解依赖
   node tools/ci-build.mjs --devkit ../cccodroid/devkit --only <id> --no-upload  # 真打包，不上传
   ```
4. 开 PR。CI 会检查格式并解一遍依赖；合并后自动打包、出签名索引。
5. 真机验证后，再开一个 PR 往 `verified.json` 加记录。

不收：

- 需要 root、或要改系统设置才能用的东西。
- 自带二进制、从非 Termux 官方源下载的东西（v1 只有 `kind: termux`）。
- 许可证不允许再分发的软件。
- 收集、转发账号凭据的工具或 skill。

---

1. Make sure the software has an aarch64 package at [packages.termux.dev](https://packages.termux.dev).
2. Copy `recipes/gh/` and adapt it following [docs/recipe.md](docs/recipe.md).
3. Check locally with the commands above (Node 22 and the `devkit/` folder from the cccodroid repo).
4. Open a pull request. CI validates the recipe and resolves its dependencies; after merge it builds and publishes a signed index.
5. Once tested on a real device, add an entry to `verified.json` in a follow-up PR.

Not accepted: anything needing root or system-setting changes, prebuilt binaries or non-Termux sources, software whose license forbids redistribution, and tools or skills that collect or relay account credentials.
