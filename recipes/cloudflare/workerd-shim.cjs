// require("workerd") → 本组件的 workerd。
// 官方 npm 包只认 linux / darwin / win32，在安卓（process.platform === "android"）上一加载就抛
// "Unsupported platform"，连 wrangler 的云端命令都起不来。这里在模块解析这一层把它换成下面这个小模块，
// npm 包本身一个字不改。miniflare 另外认 MINIFLARE_WORKERD_PATH，两边指向同一个程序。
"use strict";
const Module = require("module");
const path = require("path");
const ENTRY = path.join(__dirname, "workerd-entry.cjs");
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "workerd") return ENTRY;
  return resolve.call(this, request, ...rest);
};
