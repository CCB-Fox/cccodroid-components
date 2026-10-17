# 给 AI 助手：在这个仓库里干活

这是 cccodroid 的组件市场：`recipes/<id>/` 是配方，CI 打包并出签名索引。

**写新组件、改配方前，先完整读 [`.claude/skills/component-authoring/SKILL.md`](.claude/skills/component-authoring/SKILL.md)。**
里面是 CI 会拦的硬规则和评审会退回的规矩。改完跑 `node tools/check-recipes.mjs`。

几条最容易犯的：

- 不许关证书校验（`curl -k` 之类），下载必须核对 sha256。
- 描述和 skill 只写实际打进包的东西，版本以 `selftest` 的输出为准。
- skill 必须有「## 运行链路」一节：命令经过哪些层、每层由谁提供、缺了会报错还是悄悄降级（CI 会查）。
- 配方、skill、脚本有任何改动，`revision` 都要加一。
- 大组件的脚本在上游仓库改，再 `recipe/sync.sh` 同步过来；别直接改这里的副本。
- 绝不读取、打印、提交任何令牌或密钥。
