# 贡献配方 / Contributing

**动手前先读 [组件编写规则](.claude/skills/component-authoring/SKILL.md)**：CI 会拦的硬规则，和评审会退回的规矩都在里面。

1. 在 [packages.termux.dev](https://packages.termux.dev) 或 termux-packages 仓库确认软件有 aarch64 包。
   确实没有、而组件又非用不可的构件才走 `fetch`（写全 sha256 与 why，见 [docs/recipe.md](docs/recipe.md#fetch仓库外的上游构件)）。
2. 复制 `recipes/gh/` 改成你的组件，按 [docs/recipe.md](docs/recipe.md) 填写。
3. 本地检查（需要 Node 22 和 cccodroid 仓库的 `devkit/`）：
   ```sh
   node tools/check-recipes.mjs
   node tools/ci-build.mjs --devkit ../cccodroid/devkit --only <id> --dry        # 只解依赖
   node tools/ci-build.mjs --devkit ../cccodroid/devkit --only <id> --no-upload  # 真打包，不上传
   ```
4. 开 PR。CI 会检查格式并解一遍依赖；合并后自动打包、出签名索引。
5. 真机验证：在 cccodroid 的终端里跑 `node tools/verify-device.mjs <id> --app "cccodroid <版本>" --by <你的 GitHub 用户名>`，
   全过后把它打印的记录另开一个 PR 加进 `verified.json`。
   维护者换底座后跑 `verify-device.mjs --pending --pr`（记录自动开 PR）：只验没法自动继承的那些（见 [docs/recipe.md](docs/recipe.md)「真机验证」）。

不收：

- 需要 root、或要改系统设置才能用的东西。
- 仓库里放二进制，或从市场自己的 Release 取东西（`fetch` 也不许指过来）。
- 官方仓库没有、又不是这个组件自己运行所必需的上游构件（`fetch` 只留给这种情形）。
- 许可证不允许再分发的软件。
- 收集、转发账号凭据的工具或 skill。

---

Read the [authoring rules](.claude/skills/component-authoring/SKILL.md) first.

1. Make sure the software has an aarch64 package at [packages.termux.dev](https://packages.termux.dev).
2. Copy `recipes/gh/` and adapt it following [docs/recipe.md](docs/recipe.md).
3. Check locally with the commands above (Node 22 and the `devkit/` folder from the cccodroid repo).
4. Open a pull request. CI validates the recipe and resolves its dependencies; after merge it builds and publishes a signed index.
5. On a device, run `node tools/verify-device.mjs <id> --app "cccodroid <version>" --by <github-user>` in the cccodroid terminal; when it passes, add the record it prints to `verified.json` in a follow-up PR. After a new base, maintainers run `verify-device.mjs --pending`, which covers only the builds that could not inherit an earlier verification.

Not accepted: anything needing root or system-setting changes; binaries committed to the repo or pulled from the market's own releases; upstream artifacts the component does not itself need at runtime (the only thing `fetch` is for); software whose license forbids redistribution; and tools or skills that collect or relay account credentials.
