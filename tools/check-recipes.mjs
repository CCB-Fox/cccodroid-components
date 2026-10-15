// 检查配方格式（PR 时 CI 跑；本地也可以跑）：node tools/check-recipes.mjs
import fs from "node:fs";
import path from "node:path";
import { recipes } from "./lib.mjs";

const KNOWN = new Set(["schema", "id", "kind", "revision", "version", "name", "desc", "repos", "roots", "exclude", "files",
  "fetch", "bin", "selftest", "needs", "license", "homepage", "maintainers", "notes"]);
const KINDS = new Set(["termux", "glibc"]);
// fetch 不许从市场自己这里取东西：那等于绕开评审往里塞二进制（"不带自带二进制"这条就废了）。
// 不光是 Release —— PR 里的提交（哪怕后来删了）也能经 raw.githubusercontent.com/<本仓库>/<提交>/… 取到，
// codeload、api 同理，所以整个 github.com / githubusercontent.com 下指向本仓库的都拦。
const SELF = /^https:\/\/(?:[a-z0-9-]+\.)*(?:github\.com|githubusercontent\.com)\/(?:repos\/)?greyoak111\/cccodroid-components(?:[/.?#]|$)/i;
let bad = 0;
const err = (r, m) => { console.log(`✗ ${r}: ${m}`); bad++; };
const ids = new Set();
for (const r of recipes()) {
  const n = path.basename(r.dir);
  if (r.schema !== 1) err(n, "schema 必须是 1");
  if (r.id !== n) err(n, "id 必须和目录名一致");
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(r.id || "")) err(n, "id 只能用小写字母、数字、-（≤40）");
  if (ids.has(r.id)) err(n, "id 重复"); ids.add(r.id);
  if (r.id === "index") err(n, "index 是保留名（索引的 Release 用它）");
  if (!KINDS.has(r.kind || "termux")) err(n, `kind "${r.kind}" 还不支持（termux / glibc）`);
  if (r.version !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(r.version)) err(n, "version 只能用字母数字 . _ -（≤40）");
  if (!Number.isInteger(r.revision) || r.revision < 1) err(n, "revision 必须是 ≥1 的整数");
  for (const k of ["name", "desc"]) if (!r[k] || !r[k].zh || !r[k].en) err(n, `${k} 要有 zh 和 en`);
  if (!Array.isArray(r.roots) || !r.roots.length) err(n, "roots 不能为空");
  if (!Array.isArray(r.bin) || !r.bin.length) err(n, "bin 至少一个入口命令");
  if (!r.selftest) err(n, "selftest 必填（装好后用它确认能跑）");
  if (!r.license) err(n, "license 必填（上游软件的许可证）");
  for (const k of Object.keys(r)) if (k !== "dir" && !KNOWN.has(k)) err(n, "不认识的字段: " + k);
  for (const [p, f] of Object.entries(r.files || {})) {
    if (!p.startsWith("usr/") || p.includes("..")) err(n, "files 只能放进 usr/ 下: " + p);
    if (!f.src || f.src.includes("..") || !fs.existsSync(path.join(r.dir, f.src))) err(n, "files 的 src 不存在: " + f.src);
  }
  for (const [p, f] of Object.entries(r.fetch || {})) {
    if (!p.startsWith("usr/") || p.includes("..")) err(n, "fetch 只能放进 usr/ 下: " + p);
    if (f.link !== undefined) {
      // 只做一条软链（不下载）：常见于上游库的 SONAME 是 libX.so.1、而文件叫 libX.so。
      // 目标只能是同目录的文件名：绝对路径、带 / 的都不行（软链指出去，后面的文件就能顺着它写到别处）
      if (f.url || f.sha256) err(n, `fetch 的 link 条目不该再有 url/sha256: ${p}`);
      if (!/^[A-Za-z0-9._+-]+$/.test(String(f.link)) || f.link === "." || f.link === "..") err(n, `fetch 的 link 只能写同目录的文件名: ${p}`);
      continue;
    }
    if (!/^https:\/\/\S+$/.test(f.url || "")) err(n, `fetch 的 url 必须是 https: ${p}`);
    else if (SELF.test(f.url)) err(n, `fetch 不能从市场仓库自己取（等于自带二进制）: ${p}`);
    if (!/^[0-9a-f]{64}$/.test(f.sha256 || "")) err(n, `fetch 的 sha256 要写全（64 位小写十六进制）: ${p}`);
    if (!f.why) err(n, `fetch 要写 why：这是什么、为什么不能走 Termux 官方仓库: ${p}`);
    if (f.mode !== undefined && !/^[0-7]{3,4}$/.test(String(f.mode))) err(n, `fetch 的 mode 是八进制三位/四位: ${p}`);
  }
  const sk = path.join(r.dir, "skill", "SKILL.md");
  if (!fs.existsSync(sk)) err(n, "缺 skill/SKILL.md（告诉 Claude 怎么用这个组件）");
  else if (!/^---\nname: [a-z0-9-]+\ndescription: .+\n---/m.test(fs.readFileSync(sk, "utf8"))) err(n, "SKILL.md 开头要有 name / description");
  console.log(`  ${n} ok?`);
}
if (bad) { console.log(`\n${bad} 个问题`); process.exit(1); }
console.log("\n✓ 配方格式没问题");
