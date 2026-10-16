// 检查配方格式（PR 时 CI 跑；本地也可以跑）：node tools/check-recipes.mjs
import fs from "node:fs";
import path from "node:path";
import { recipes } from "./lib.mjs";

const KNOWN = new Set(["schema", "id", "kind", "revision", "version", "name", "desc", "repos", "roots", "exclude", "files",
  "fetch", "npm", "requires", "bin", "selftest", "needs", "license", "homepage", "maintainers", "notes", "category"]);
// 分类（App 扩展页的分类索引条按它分）：只认这几个，界面上有对应的译名
const CATEGORIES = new Set(["dev", "office", "media", "science", "eda", "cad", "ai", "gpu", "net", "other"]);
const KINDS = new Set(["termux", "glibc"]);
// fetch 不许从市场自己这里取东西：那等于绕开评审往里塞二进制（"不带自带二进制"这条就废了）。
// 不光是 Release —— PR 里的提交（哪怕后来删了）也能经 raw.githubusercontent.com/<本仓库>/<提交>/… 取到，
// codeload、api 同理，所以整个 github.com / githubusercontent.com 下指向本仓库的都拦。
const SELF = /^https:\/\/(?:[a-z0-9-]+\.)*(?:github\.com|githubusercontent\.com)\/(?:repos\/)?greyoak111\/cccodroid-components(?:[/.?#]|$)/i;
// 配方自带的脚本与 skill 里不许关证书校验：关了，取料时「核对 sha256」用的索引本身就可能被换掉
const INSECURE = [
  [/\bcurl\b[^\n]*\s(?:-[A-Za-z]*k[A-Za-z]*|--insecure)(?=\s|$|["',\]])/, "curl -k / --insecure"],
  [/\bwget\b[^\n]*--no-check-certificate/, "wget --no-check-certificate"],
  [/\bverify\s*=\s*False\b/, "verify=False"],
  [/_create_unverified_context|\bCERT_NONE\b/, "Python 关证书校验"],
  [/rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["']?0/, "Node 关证书校验"],
  [/GIT_SSL_NO_VERIFY|http\.sslVerify\s*=?\s*false/i, "git 关证书校验"],
];
// 脚本里自己下东西（不走 fetch）也要核对：出现下载调用、却通篇没有 sha256 的，算没校验
const DOWNLOAD = /\b(?:curl|wget|urlopen|urlretrieve|requests\.get)\b|\bfetch\(\s*["'`]https?:/;
const HASHED = /sha256|hashlib|sha256sum|createHash/i;
// 走 Turnip / 厂商 OpenCL 的包只对骁龙有意义：带了就必须写 needs.gpu: "adreno"
const ADRENO_PKG = /^(?:mesa-vulkan-icd-freedreno|opencl-vendor-driver|clvk)(?:-glibc)?$/;
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
let bad = 0;
const err = (r, m) => { console.log(`✗ ${r}: ${m}`); bad++; };
const ids = new Set(), wanted = [], adreno = new Map();   // wanted：[被依赖, 依赖者]；adreno：id → 是否写了 needs.gpu: "adreno"
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
  if (!CATEGORIES.has(r.category)) err(n, `category 必填，只能是 ${[...CATEGORIES].join(" / ")}`);
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
  // npm：Termux 官方仓库没有、只在 npm 上发布的 Node 程序（如 wrangler）。CI 用 npm ci 按配方里提交的
  // package-lock.json 装 —— 所以锁文件必须在、每个包都来自官方 registry 且带完整性哈希、顶层版本钉死
  if (r.npm !== undefined) {
    const m = r.npm;
    if (!m || typeof m !== "object") err(n, "npm 要写成对象 { dir, why }");
    else {
      for (const k of Object.keys(m)) if (!["dir", "why"].includes(k)) err(n, "npm 里不认识的键: " + k);
      if (!/^usr\/lib\/[a-z0-9][a-z0-9._-]*$/.test(m.dir || "")) err(n, "npm.dir 只能是 usr/lib/<名字>");
      if (!m.why) err(n, "npm 要写 why：为什么不能走 Termux 官方仓库");
      const pj = path.join(r.dir, "package.json"), pl = path.join(r.dir, "package-lock.json");
      if (!fs.existsSync(pj) || !fs.existsSync(pl)) err(n, "npm 型组件要提交 package.json 和 package-lock.json");
      else {
        const deps = JSON.parse(fs.readFileSync(pj, "utf8")).dependencies || {};
        if (!Object.keys(deps).length) err(n, "package.json 的 dependencies 是空的");
        for (const [d, v] of Object.entries(deps)) if (!/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(v)) err(n, `package.json 里 ${d} 的版本要钉死（写确切版本号，不要 ^ ~ 范围）: ${v}`);
        const lock = JSON.parse(fs.readFileSync(pl, "utf8"));
        if (!(lock.lockfileVersion >= 2) || !lock.packages) err(n, "package-lock.json 要 lockfileVersion 2 或 3（npm 7 以上生成）");
        else for (const [k, p] of Object.entries(lock.packages)) {
          if (!k || p.link) { if (p.link) err(n, `package-lock.json 里不许有本地链接包: ${k}`); continue; }
          if (!/^https:\/\/registry\.npmjs\.org\//.test(p.resolved || "")) err(n, `${k} 不是从 registry.npmjs.org 取的: ${p.resolved || "(没有 resolved)"}`);
          if (!/^sha512-/.test(p.integrity || "")) err(n, `${k} 缺 sha512 完整性哈希`);
        }
      }
    }
  }
  if (r.requires !== undefined) {
    if (!Array.isArray(r.requires) || r.requires.some((d) => typeof d !== "string" || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(d) || d === r.id)) err(n, "requires 是组件 id 的数组（不能写自己）");
    else for (const d of r.requires) wanted.push([d, n]);
  }
  // needs：gpu 可以写 "adreno" —— 只能用在高通骁龙上（走 /dev/kgsl-3d0），App 在别家 SoC 上直接不给装
  for (const [k, v] of Object.entries(r.needs || {})) {
    if (!["shizuku", "display", "gpu"].includes(k)) err(n, `needs 里不认识的键: ${k}`);
    else if (k === "gpu" ? ![true, false, "adreno"].includes(v) : typeof v !== "boolean") err(n, `needs.${k} 的值不对（gpu 是 true / false / "adreno"，其余是 true / false）`);
  }
  const sk = path.join(r.dir, "skill", "SKILL.md");
  if (!fs.existsSync(sk)) err(n, "缺 skill/SKILL.md（告诉 Claude 怎么用这个组件）");
  else if (!/^---\nname: [a-z0-9-]+\ndescription: .+\n---/m.test(fs.readFileSync(sk, "utf8"))) err(n, "SKILL.md 开头要有 name / description");
  adreno.set(r.id, !!(r.needs && r.needs.gpu === "adreno"));
  if ((r.roots || []).some((p) => ADRENO_PKG.test(p)) && !(r.needs && r.needs.gpu === "adreno"))
    err(n, `roots 带了只对骁龙有用的包（${r.roots.filter((p) => ADRENO_PKG.test(p)).join(", ")}），needs.gpu 要写 "adreno"`);
  for (const f of walk(r.dir)) {
    const rel = path.relative(r.dir, f);
    if (/(^|\/)__pycache__\/|\.py[co]$/.test(rel)) { err(n, "别提交 Python 编译缓存: " + rel); continue; }
    if (path.basename(f) === "recipe.json") continue;
    const buf = fs.readFileSync(f);
    if (buf.includes(0)) continue;                     // 二进制不扫（files 本来也不该带二进制，评审时看）
    const text = String(buf), md = f.endsWith(".md");
    // 注释行不算（脚本里常有「别加 -k」这种提醒）；skill 是给 Claude 照着做的，整篇都算
    const code = md ? text : text.split("\n").filter((l) => !/^\s*(?:#|\/\/)/.test(l)).join("\n");
    for (const [re, what] of INSECURE) if (re.test(code)) err(n, `${rel} 关了证书校验（${what}）`);
    if (!md && DOWNLOAD.test(code) && !HASHED.test(text)) err(n, `${rel} 会下载东西，但没看到 sha256 校验（下载的文件要核对哈希）`);
  }
  console.log(`  ${n} ok?`);
}
// 依赖了骁龙专用组件的，自己也只能在骁龙上用：不写的话 App 在别家设备上显示能装、依赖却永远装不上
for (const [d, by] of wanted) if (adreno.get(d) && !adreno.get(by)) err(by, `requires 了骁龙专用的 ${d}，自己的 needs.gpu 也要写 "adreno"`);
// requires 了本仓库没有的组件：可能是预置组件（cccodroid 自己发的，比如 chromium），提醒一下、不算错
for (const [d, by] of wanted) if (!ids.has(d)) console.log(`⚠ ${by} requires 了本仓库没有的组件 ${d}（预置组件？确认一下名字）`);
if (bad) { console.log(`\n${bad} 个问题`); process.exit(1); }
console.log("\n✓ 配方格式没问题");
