// 从各组件 Release 收集构建清单，合成 App 读的 components.json，并用 ed25519 签名：
//   INDEX_SIGNING_KEY=<PEM> node tools/build-index.mjs [--out DIR] [--upload]
//
// 产物：components.json + components.json.sig（对 components.json 原始字节的签名，base64）
// App 内置公钥，验签不过整份索引作废 —— 所以索引里的 sha256 可信，包被换了也装不上。
// 只收录仓库里还有配方的组件；每个底座只留最新版本。
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ROOT, REPO, recipes, run, asset } from "./lib.mjs";

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : undefined; };
const OUT = path.resolve(opt("out") || path.join(ROOT, "work", "index"));
const gh = (...a) => run("gh", a);
const verified = JSON.parse(fs.readFileSync(path.join(ROOT, "verified.json"), "utf8"));
fs.mkdirSync(OUT, { recursive: true });

const vcmp = (a, b) => a.localeCompare(b, "en", { numeric: true });
const idx = { schema: 1, source: REPO, generated: new Date().toISOString(), components: {} };
for (const r of recipes()) {
  let rel;
  try { rel = JSON.parse(gh("release", "view", r.id, "-R", REPO, "--json", "assets")).assets; } catch { console.log(`· ${r.id}: 还没有发布的构建`); continue; }
  const names = new Set(rel.map((a) => a.name));
  const dl = path.join(OUT, "meta", r.id);
  fs.rmSync(dl, { recursive: true, force: true });
  fs.mkdirSync(dl, { recursive: true });
  gh("release", "download", r.id, "-R", REPO, "-p", "*.json", "-D", dl);
  const byBase = new Map();
  for (const f of fs.readdirSync(dl)) {
    const m = JSON.parse(fs.readFileSync(path.join(dl, f), "utf8"));
    const name = asset(m.id, m.version, m.base.gz);
    if (m.id !== r.id || !names.has(name + ".tar.gz")) continue;       // 包没传完的不收
    const cur = byBase.get(m.base.gz);
    if (!cur || vcmp(m.version, cur.version) > 0) byBase.set(m.base.gz, { ...m, asset: name + ".tar.gz" });
  }
  if (!byBase.size) continue;
  idx.components[r.id] = {
    name: r.name, desc: r.desc, kind: r.kind || "termux", license: r.license, homepage: r.homepage || "",
    maintainers: r.maintainers || [], needs: r.needs || {}, requires: r.requires || [],
    builds: [...byBase.values()].map((m) => {
      const v = verified[r.id]?.[m.version]?.[m.base.gz.slice(0, 12)] || null;
      return {
        base: m.base.gz, baseTag: m.base.tag || "", version: m.version, upstream: m.upstream,
        url: `https://github.com/${REPO}/releases/download/${encodeURIComponent(r.id)}/${encodeURIComponent(m.asset)}`, asset: m.asset,
        sha256: m.gz.sha256, bytes: m.gz.bytes, installed: m.installed,
        bin: m.bin, skill: m.skill, selftest: m.selftest, packages: m.packages.length,
        verified: v,
      };
    }),
  };
  for (const b of idx.components[r.id].builds) console.log(`${r.id} ${b.version} for ${b.base.slice(0, 12)}${b.verified ? " ✓已验证" : " （未真机验证）"}`);
}

const body = Buffer.from(JSON.stringify(idx, null, 1) + "\n");
const jf = path.join(OUT, "components.json");
fs.writeFileSync(jf, body);
const pem = process.env.INDEX_SIGNING_KEY || (process.env.INDEX_SIGNING_KEY_FILE && fs.readFileSync(process.env.INDEX_SIGNING_KEY_FILE, "utf8"));
if (!pem) { console.log("\n⚠ 没有 INDEX_SIGNING_KEY，只出未签名的索引（App 默认不认）"); process.exit(args.includes("--upload") ? 1 : 0); }
const key = crypto.createPrivateKey(pem);
const sig = crypto.sign(null, body, key).toString("base64");
if (!crypto.verify(null, body, crypto.createPublicKey(key), Buffer.from(sig, "base64"))) throw new Error("自验签失败");
fs.writeFileSync(jf + ".sig", sig + "\n");
console.log(`\n✓ ${jf}（${Object.keys(idx.components).length} 个组件，已签名）`);
if (args.includes("--upload")) {
  try { gh("release", "view", "index", "-R", REPO); }
  catch { gh("release", "create", "index", "-R", REPO, "--title", "Component index / 组件索引", "--notes", "App 读这里的 components.json（ed25519 签名在 .sig）。由 CI 自动更新，别手动改。", "--latest=false"); }
  gh("release", "upload", "index", "-R", REPO, jf, jf + ".sig", "--clobber");
  console.log("  ↑ 已上传到 index");
}
