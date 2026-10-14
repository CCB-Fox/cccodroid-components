# cccodroid-components

[English](README.md)

[cccodroid](https://github.com/greyoak111/cccodroid)（安卓上的 Claude Code 启动台）的社区组件配方仓库。

组件是可选安装的命令行软件包（比如 `gh`），在 cccodroid 的「扩展」页安装。装好后 cccodroid 里的 Claude 就能用它，每个组件自带一个 skill 告诉 Claude 怎么用。

## 怎么运作

- **仓库里只有配方，没有二进制。** 配方写的是 Termux 包名。CI 从 Termux 官方仓库下载 `.deb`、逐个核对 SHA-256，把前缀从 `com.termux` 等长改写成 `cc.codroid`，再打包。
- **每个工具包版本各打一份。** 组件只装 cccodroid 工具包里没有的东西，所以对 `bases.json` 里列的每个工具包版本分别打包，App 装和用户工具包匹配的那份。
- **索引签名。** CI 把 `components.json` 发到 `index` Release，用 ed25519 签名（`components.json.sig`）。App 用内置公钥验签，索引或包被篡改就装不上。
- **真机验证标记。** `verified.json` 里登记的构建在真机上装过、用过；没登记的在 App 里显示「未经真机验证」。

cccodroid 从 v0.2.0 开始读这个仓库。浏览器（Chromium）等预置组件仍由 cccodroid 仓库发布。

## 组件列表

| id | 是什么 | 上游许可证 |
|---|---|---|
| `gh` | GitHub 命令行 | MIT |

## 添加组件

见 [CONTRIBUTING.md](CONTRIBUTING.md) 和 [docs/recipe.md](docs/recipe.md)。

## 许可证

本仓库的配方、脚本、文档：Apache-2.0。打包的软件各自保留上游许可证，记录在各配方里。
