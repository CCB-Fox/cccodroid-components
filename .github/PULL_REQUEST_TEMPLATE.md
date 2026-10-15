## 组件 / Component

- id:
- 上游 / Upstream:
- 许可证 / License:

## 检查 / Checklist

- [ ] `node tools/check-recipes.mjs` 通过 / passes
- [ ] `ci-build.mjs --dry` 依赖都能解 / resolves（本地想先看审计：`node tools/audit.mjs --devkit ../cccodroid/devkit --only <id>`）
- [ ] 读过 [组件编写规则](../.claude/skills/component-authoring/SKILL.md) / read the authoring rules
- [ ] 描述与 skill 里的版本、能力以实际打进包的为准，没写没带的东西 / description and skill match what is actually packaged
- [ ] 看过 CI 贴的审计报告（共用的包、缺的库、风险分级都在里面）/ read the audit report posted by CI
- [ ] 第一次运行要下载的：skill 里写明大小与来源、先问用户 / first-run downloads are disclosed and need user consent
- [ ] SKILL.md 不会让 Claude 读取或打印令牌、密码 / never reads or prints secrets
- [ ] 对外发布、删除类操作写明先问用户 / asks before public or destructive actions
- [ ] `needs` 如实填写 / filled honestly

## 真机测试（可选，合并后也可以补）/ Device test (optional)

- [ ] `node tools/verify-device.mjs <id> --app … --by …` 全过，输出的记录另开 PR 进 `verified.json` / passes; record goes to `verified.json` in a follow-up PR
- 设备 / Device:
- cccodroid 版本 / version:
