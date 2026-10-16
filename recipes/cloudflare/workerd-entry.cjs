// 冒充 npm 包 workerd 的入口：默认导出是可执行文件的路径（和官方包一致）
"use strict";
const bin = process.env.MINIFLARE_WORKERD_PATH || require("path").join(__dirname, "..", "..", "bin", "workerd");
module.exports = { __esModule: true, default: bin, version: require("./node_modules/workerd/package.json").version };
