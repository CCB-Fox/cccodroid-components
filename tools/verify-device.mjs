// 真机验证一个组件，打印一条可以直接提 PR 进 verified.json 的记录。
//
// 在装了 cccodroid 的设备上、cccodroid 的终端里跑（走 App 自己的网关装卸，和用户点按钮是同一条路）：
//   node verify-device.mjs <组件 id> --app "cccodroid 0.1.11" [--by <GitHub 用户名>] [--keep] [--out 结果.txt]
//
// 做的事：
//   1. 核对工具包本体（.devkit-manifest）当前状态，作为基准
//   2. 组件已经装着：先卸掉（有别的组件依赖它就停下，不替你卸别人）
//   3. 依赖没装的先装上（结束时按相反顺序卸掉，只卸本脚本装的）
//   4. 从签名索引装组件 → 看安装记录（放了几个文件、几个是共用的）→ skill 装上没有
//   5. 跑索引里的 selftest，看退出码（0 = 能用），记最后一行输出
//   6. 卸载（--keep 就不卸）→ 组件的文件都清掉了没有 → 工具包本体和基准比有没有被改
//   7. 原来就装着的，装回去
// 网关令牌在 App 里面读，不打印。只读写 cccodroid 自己的目录。
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : undefined; };
const flag = (k) => { const i = argv.indexOf(k); return i >= 0 ? (argv.splice(i, 1), true) : false; };
const APP = opt("--app"), BY = opt("--by") || "", OUT = opt("--out"), KEEP = flag("--keep");
const ID = argv[0];
if (!ID || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(ID)) {
  console.log("用法：node verify-device.mjs <组件 id> --app \"cccodroid <版本>\" [--by <GitHub 用户名>] [--keep] [--out 结果.txt]");
  process.exit(2);
}

const PREFIX = process.env.PREFIX || "/data/data/cc.codroid/files/usr";
const COMP = path.join(path.dirname(PREFIX), "components");
const HOME = process.env.HOME || path.join(path.dirname(PREFIX), "home");
const PORT = process.env.CCAPP_PORT || 8791;
let TOKEN;
try { TOKEN = fs.readFileSync(process.env.CCAPP_TOKEN_FILE || path.join(HOME, ".gateway-token"), "utf8").trim(); }
catch { console.log("✗ 读不到网关令牌：要在 cccodroid 的终端里跑"); process.exit(2); }

if (OUT) fs.writeFileSync(OUT, "");
const log = (s = "") => { console.log(s); if (OUT) fs.appendFileSync(OUT, s + "\n"); };
const api = async (p, body) => {
  const r = await fetch(`http://127.0.0.1:${PORT}${p}`, { method: body ? "POST" : "GET",
    headers: { "X-CC-Token": TOKEN, "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
  return r.json();
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rec = (id) => { try { return JSON.parse(fs.readFileSync(path.join(COMP, id + ".json"), "utf8")); } catch { return null; } };
const list = async (refresh) => api("/api/components" + (refresh ? "?refresh=1" : ""));
const item = async (id) => (await list()).items.find((x) => x.id === id);

const checks = [], problems = [];
const ok = (c, m) => { log(`${c ? "  ✓" : "  ✗"} ${m}`); (c ? checks : problems).push(m); return c; };

async function install(id) {
  const t0 = Date.now();
  const r = await api("/api/components/install", { id });
  if (!r.ok) return { ok: false, message: r.message };
  let c;
  for (let i = 0; i < 3600; i++) {          // 大组件下载慢，最多等两小时
    await sleep(2000);
    c = await item(id);
    if (!c || (!c.progress && !["downloading", "verifying", "installing"].includes(c.state))) break;
  }
  return { ok: !!c && ["ok", "update"].includes(c.state), message: c ? c.error || c.state : "不见了", secs: ((Date.now() - t0) / 1000) | 0 };
}
const remove = (id) => api("/api/components/remove", { id });

// 工具包本体：.devkit-manifest 每行「类型 大小 相对路径」。用户会改的配置、包管理器状态、pip/npm 装的东西不算
const userTouchable = (r) => /^(etc|glibc\/etc|var|tmp)\//.test(r) || /^lib\/python3\.\d+\/site-packages\//.test(r) || r.startsWith("lib/node_modules/");
function baseCheck() {
  let lines;
  try { lines = fs.readFileSync(path.join(PREFIX, ".devkit-manifest"), "utf8").trim().split("\n"); } catch { return null; }
  const bad = new Set();
  for (const l of lines) {
    const [, n, ...rest] = l.split(" "), r = rest.join(" ");
    if (!r || userTouchable(r)) continue;
    let st; try { st = fs.lstatSync(path.join(PREFIX, r)); } catch { bad.add("缺 " + r); continue; }
    if (st.isFile() && st.size !== Number(n)) bad.add("变 " + r);
  }
  return { total: lines.length, bad };
}
const sh = (cmd, timeout = 300000) => {
  const r = spawnSync(path.join(PREFIX, "bin", "bash"), ["-c", cmd], { encoding: "utf8", timeout, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PATH: path.join(PREFIX, "bin") + ":" + (process.env.PATH || "/system/bin") } });
  return { code: r.status ?? (r.error ? -1 : -2), out: ((r.stdout || "") + (r.stderr || "")).trim() };
};
const prop = (k) => { try { return execFileSync("/system/bin/getprop", [k], { encoding: "utf8" }).trim(); } catch { return ""; } };

// ── 开始 ──
const ix = await list(true);
if (ix.indexError) log(`⚠ 索引有错：${ix.indexError}`);
let c0 = ix.items.find((x) => x.id === ID);
if (!c0) { log(`✗ 索引里没有 ${ID}`); process.exit(1); }
if (!c0.available) { log(`✗ ${ID} 没有适配当前工具包的构建（工具包 ${ix.devkit}）`); process.exit(1); }
const base12 = ix.devkit;
log(`组件 ${ID} ${c0.version}　工具包 ${base12}　来源 ${c0.source}${c0.verified ? "（已有验证记录）" : ""}`);

const b0 = baseCheck();
log(b0 ? `工具包本体：${b0.total} 条，开始时有 ${b0.bad.size} 条和清单不符（作为基准）` : "⚠ 没有 .devkit-manifest，跳过本体核对");

const wasInstalled = !!c0.installedVersion;
if (wasInstalled) {
  if ((c0.usedBy || []).length) { log(`✗ ${(c0.usedBy).map((d) => d.id).join("、")} 依赖它，先卸掉那些再验证`); process.exit(1); }
  log(`\n⓪ 已经装着 ${c0.installedVersion}，先卸掉`);
  const r = await remove(ID);
  if (!r.ok) { log(`✗ 卸不掉：${r.message}`); process.exit(1); }
}

const depsAdded = [];
for (const d of c0.requires || []) {
  if (d.ok) continue;
  log(`\n· 先装依赖 ${d.id}`);
  const r = await install(d.id);
  if (!ok(r.ok, `依赖 ${d.id} 装好${r.ok ? "" : "：" + r.message}`)) process.exit(1);
  depsAdded.push(d.id);
}

log(`\n① 装 ${ID}`);
const ir = await install(ID);
ok(ir.ok, `从签名索引装好（${ir.secs ?? 0} 秒）${ir.ok ? "" : "：" + ir.message}`);
const r1 = rec(ID) || {};
const placed = (r1.files || []).length, shared = (r1.shared || []).length;
log(`   放进去 ${placed} 个文件，共用 ${shared} 个（装之前就在）`);
if (ir.ok && placed === 0 && shared > 0) log("   ⚠ 一个文件都没放：文件装之前就在设备上。checks 里要如实写明来历");
if (ir.ok) {
  if (r1.skill) ok(fs.existsSync(path.join(HOME, ".claude", "skills", r1.skill, "SKILL.md")), `skill ${r1.skill} 装上`);
  else ok(false, "skill 没装上（安装记录里没有 skill）");
}

let st = null;
if (ir.ok) {
  const self = (await item(ID)).selftest || await selftestFromIndex();
  log(`\n② selftest：${self || "（索引里没有）"}`);
  if (self) {
    st = sh(self);
    const last = st.out.split("\n").filter(Boolean).pop() || "";
    for (const l of st.out.split("\n").slice(-6)) log("   | " + l);
    ok(st.code === 0, `selftest 退出码 ${st.code}${last ? "；最后一行：" + last : ""}`);
    st.last = last;
  } else ok(false, "没有 selftest 可跑");
}
// 旧版 App 的组件列表里没有 selftest：去索引里找当前工具包那份构建的（社区、预置都看）
async function selftestFromIndex() {
  for (const u of ["https://github.com/greyoak111/cccodroid-components/releases/download/index/components.json",
    "https://github.com/greyoak111/cccodroid/releases/download/components/components.json"]) {
    try {
      const e = ((await (await fetch(u)).json()).components || {})[ID];
      const b = e && (e.builds || []).find((x) => String(x.base).startsWith(base12));
      if (b && b.selftest) return b.selftest;
    } catch {}
  }
  return null;
}

if (!KEEP && ir.ok) {
  log(`\n③ 卸 ${ID}`);
  const r = await remove(ID);
  ok(r.ok, "卸载" + (r.ok ? "" : "：" + r.message));
  const left = (r1.files || []).filter((f) => { try { fs.lstatSync(path.join(PREFIX, f.replace(/^usr\//, ""))); return true; } catch { return false; } });
  ok(left.length === 0, left.length ? `卸载后还剩 ${left.length} 个它的文件（${left.slice(0, 3).join("；")}）` : "它放进去的文件都清掉了");
  if (r1.skill) ok(!fs.existsSync(path.join(HOME, ".claude", "skills", r1.skill)), `skill ${r1.skill} 删掉了`);
}
// 原来就装着的要装回去，它的依赖得留着；--keep 同理
if (!KEEP && !wasInstalled) for (const d of depsAdded.reverse()) { const r = await remove(d); log(`   卸掉本脚本装的依赖 ${d}：${r.ok ? "ok" : r.message}`); }

const b1 = baseCheck();
if (b0 && b1) {
  const added = [...b1.bad].filter((x) => !b0.bad.has(x));
  ok(added.length === 0, added.length ? `工具包本体被改了 ${added.length} 处（${added.slice(0, 5).join("；")}）` : "工具包本体没被改动");
}

if (wasInstalled && !KEEP) {
  log(`\n④ 原来装着，装回去`);
  const r = await install(ID);
  log(`   ${r.ok ? "✓ 装回" : "✗ 没装回：" + r.message}`);
}

// ── 记录 ──
log(`\n${problems.length ? `✗ ${problems.length} 项没过，别写验证记录` : "✓ 全过"}（${checks.length} 项通过）`);
if (problems.length) process.exit(1);
const sdk = prop("ro.build.version.release");
const record = {
  [ID]: { [c0.version]: { [base12]: {
    date: new Date().toISOString().slice(0, 10),
    device: `${prop("ro.product.manufacturer")} ${prop("ro.product.model")} / Android ${sdk}`.trim(),
    app: APP || "cccodroid（版本没填，用 --app 补上）",
    checks: [
      "installed from signed index",
      placed === 0 && shared > 0 ? `files already on device before install (placed 0, shared ${shared})` : `placed ${placed}, shared ${shared}`,
      r1.skill ? `skill ${r1.skill} installed` : "",
      st ? `selftest exit 0${st.last ? ": " + st.last.slice(0, 160) : ""}` : "",
      KEEP ? "not removed (--keep)" : "removed cleanly",
      b0 ? "devkit base unchanged" : "",
      depsAdded.length ? `deps installed for the test: ${depsAdded.join(", ")}` : "",
    ].filter(Boolean).join("; "),
    by: BY || "（GitHub 用户名，用 --by 补上）",
  } } },
};
log("\n下面这段并进 verified.json（同一组件已有别的版本就合并到同一层），提 PR：\n");
log(JSON.stringify(record, null, 2));
if (!APP || !BY) log("\n⚠ --app / --by 没填全，提交前把占位的地方改掉");
