// 共用的小工具：读配方、读底座、跑命令
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
export const REPO = process.env.GITHUB_REPOSITORY || "greyoak111/cccodroid-components";
export const APP_REPO = "greyoak111/cccodroid";

export function recipes() {
  const dir = path.join(ROOT, "recipes");
  return fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, "recipe.json")))
    .map((d) => ({ dir: path.join(dir, d), ...JSON.parse(fs.readFileSync(path.join(dir, d, "recipe.json"), "utf8")) }));
}
export const bases = () => JSON.parse(fs.readFileSync(path.join(ROOT, "bases.json"), "utf8")).bases;
export const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 1 << 28, ...opts });
// 版本号里的 : ~ + 之类 GitHub 资产名会改掉，统一换成 _
export const asset = (id, version, baseSha) => `${id}-${String(version).replace(/[^A-Za-z0-9._-]/g, "_")}-for-${baseSha.slice(0, 12)}`;
