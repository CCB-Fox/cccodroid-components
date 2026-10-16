---
name: cloudflare
description: 用户要部署或调试 Cloudflare Workers / Pages、管理 R2 / KV / D1、查改 Cloudflare 上的 DNS 或 SSL 设置时使用。
---

# Cloudflare（wrangler / cf）

本组件提供：

- `wrangler` —— Cloudflare 官方 CLI（4.151.1）。部署 Workers / Pages，管 R2、KV、D1、密钥等。
- `wrangler dev` —— 在手机上本地跑 Worker（运行时是本组件带的 `workerd`），默认监听 `127.0.0.1:8787`。
- `cf` —— 直接调 Cloudflare REST API，管 wrangler 管不到的东西（DNS 记录、SSL 模式、页面规则…）。
- `cf-login` —— 用户自己登录用。

## 登录：只能用户自己来

先跑 `wrangler whoami` 看有没有登录。没有的话，**请用户自己在终端里运行 `cf-login`**，
按提示粘贴 API 令牌（输入不回显）和账户 ID。不要：

- 让用户把令牌贴进聊天；
- 读取、打印、复制 `~/.config/cloudflare/` 里的文件，或 `echo $CLOUDFLARE_API_TOKEN`；
- 替用户在终端里输入令牌。

建议用户建令牌时只勾要用的权限（例如只部署 Workers 就给 Workers Scripts:Edit）。
`wrangler login`（浏览器授权）在手机上未经验证，优先用 `cf-login`。`cf-login --logout` 删除保存的令牌。

## 常用

```sh
wrangler whoami
cf --selftest                            # 自检：起一个 wrangler dev 打 40 个请求，不用登录
wrangler init my-worker --yes            # 或自己写 wrangler.toml + src/index.js
wrangler dev --ip 127.0.0.1 --port 8787  # 本地运行；长时间运行的命令放后台，用完结束它
wrangler deploy                          # 对外发布 —— 先问用户
wrangler tail                            # 看线上日志
cf /zones                                # 只读：列出域名
cf /zones/zone:example.com/dns_records   # 只读：DNS 记录（zone:<域名> 自动换成 id）
CF_WRITE=1 cf PATCH /zones/zone:example.com/settings/ssl '{"value":"strict"}'   # 写操作 —— 先问用户
```

## 先问用户再做

会对外生效、删除数据或花钱的操作，**先说清楚要做什么、等用户同意**：
`wrangler deploy` / `pages deploy`、`wrangler delete`、`secret put/delete`、R2 / KV / D1 的删除和写入、
`cf` 的任何写操作（`CF_WRITE=1`）、改 DNS 和 SSL。只读查询可以直接做。

## 注意

- 所有命令要非交互：`wrangler` 遇到提问会卡住，带上 `--yes` 之类的参数；`wrangler dev` 别在前台一直挂着。
- `wrangler dev` 本地运行需要 Node 兼容时在 `wrangler.toml` 写 `compatibility_flags = ["nodejs_compat"]`。
- workerd 是 glibc 程序，经底座的 glibc 加载器运行；报 SIGSYS 或起不来时把完整报错给用户看，别自己乱改组件文件。
