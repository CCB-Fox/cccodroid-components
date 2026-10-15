// 真机验证一个组件，打印一条可以直接提 PR 进 verified.json 的记录。
//
// 在装了 cccodroid 的设备上、cccodroid 的终端里跑（走 App 自己的网关装卸，和用户点按钮是同一条路）：
//   node verify-device.mjs <组件 id> --app "cccodroid 0.1.11" [--by <GitHub 用户名>] [--keep] [--out 结果.txt]
//   node verify-device.mjs --pending --app … --by … [--out 结果.txt] [--pr]
//     --pr：跑完直接把通过的记录并进 verified.json、开 PR（用 gh，要已登录且对市场仓库有写权限；
//     没权限就照旧打印，手动提）。不用 clone 仓库，走 GitHub API。
//     批量：索引里当前工具包有构建、还没验证（直接验或继承都算验过）的组件，按依赖顺序挨个验。
//     全部跑完打印一份合并好的记录（只含通过的），没通过的列在最后。开着屏幕等它跑完即可。
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
const APP = opt("--app"), BY = opt("--by") || "", OUT = opt("--out"), KEEP = flag("--keep"), PENDING = flag("--pending"), PR = flag("--pr");
const ID0 = argv[0];
if (PENDING ? ID0 : !ID0 || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(ID0)) {
  console.log("用法：node verify-device.mjs <组件 id> --app \"cccodroid <版本>\" [--by <GitHub 用户名>] [--keep] [--out 结果.txt]");
  console.log("　　　node verify-device.mjs --pending --app \"cccodroid <版本>\" --by <GitHub 用户名> [--out 结果.txt]");
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

let checks = [], problems = [];
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
  return { code: r.status ?? (r.error ? -1 : -2), out: ((r.stdout || "") + (r.stderr || "")).trim(), stdout: (r.stdout || "").trim() };
};
const prop = (k) => { try { return execFileSync("/system/bin/getprop", [k], { encoding: "utf8" }).trim(); } catch { return ""; } };

// 验一个组件：返回 { record }（全过）或 { fail: 原因 }
async function verifyOne(ID) {
checks = []; problems = [];
const fail = (m) => { log(m); return { fail: m.replace(/^✗ /, "") }; };
const ix = await list(true);
if (ix.indexError) log(`⚠ 索引有错：${ix.indexError}`);
let c0 = ix.items.find((x) => x.id === ID);
if (!c0) { return fail(`✗ 索引里没有 ${ID}`); }
if (!c0.available) { return fail(`✗ ${ID} 没有适配当前工具包的构建（工具包 ${ix.devkit}）`); }
const base12 = ix.devkit;
log(`组件 ${ID} ${c0.version}　工具包 ${base12}　来源 ${c0.source}${c0.verified ? "（已有验证记录）" : ""}`);

const b0 = baseCheck();
log(b0 ? `工具包本体：${b0.total} 条，开始时有 ${b0.bad.size} 条和清单不符（作为基准）` : "⚠ 没有 .devkit-manifest，跳过本体核对");

const wasInstalled = !!c0.installedVersion;
if (wasInstalled) {
  if ((c0.usedBy || []).length) { return fail(`✗ ${(c0.usedBy).map((d) => d.id).join("、")} 依赖它，先卸掉那些再验证`); }
  log(`\n⓪ 已经装着 ${c0.installedVersion}，先卸掉`);
  const r = await remove(ID);
  if (!r.ok) { return fail(`✗ 卸不掉：${r.message}`); }
}

const depsAdded = [];
for (const d of c0.requires || []) {
  if (d.ok) continue;
  log(`\n· 先装依赖 ${d.id}`);
  const r = await install(d.id);
  if (!ok(r.ok, `依赖 ${d.id} 装好${r.ok ? "" : "：" + r.message}`)) return fail(`依赖 ${d.id} 装不上`);
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
  const self = (await item(ID)).selftest || await selftestFromIndex(ID, base12);
  log(`\n② selftest：${self || "（索引里没有）"}`);
  if (self) {
    st = sh(self);
    // 总结取标准输出的最后一行：stderr 上常有库的告警（GLib、LD_PRELOAD 提示），排在后面会把结果挤掉
    const last = (st.stdout || st.out).split("\n").filter(Boolean).pop() || "";
    for (const l of st.out.split("\n").slice(-6)) log("   | " + l);
    ok(st.code === 0, `selftest 退出码 ${st.code}${last ? "；最后一行：" + last : ""}`);
    st.last = last;
  } else ok(false, "没有 selftest 可跑");
}
// 旧版 App 的组件列表里没有 selftest：去索引里找当前工具包那份构建的（社区、预置都看）
async function selftestFromIndex(ID, base12) {
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
if (problems.length) return { fail: problems.join("；") };
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
return { record };
}

// 合并记录：{ id: { 版本: { 底座: … } } } 逐层并
const merge = (a, b) => { for (const [k, v] of Object.entries(b)) a[k] = v && typeof v === "object" && !v.date && a[k] ? merge(a[k], v) : v; return a; };
let records = {};
const failed = [];
if (!PENDING) {
  const r = await verifyOne(ID0);
  if (r.fail) process.exit(1);
  records = r.record;
} else {
  const ix = await list(true);
  const todo = ix.items.filter((c) => c.available && !c.verified && c.source !== "preset").map((c) => c.id);
  // 依赖排在前面：被依赖的先验，后面装依赖时用的就是刚验过的
  const byId = new Map(ix.items.map((c) => [c.id, c])), order = [], seen = new Set();
  const visit = (id) => { if (seen.has(id)) return; seen.add(id); for (const d of byId.get(id)?.requires || []) if (todo.includes(d.id)) visit(d.id); order.push(id); };
  todo.forEach(visit);
  log(`待验证 ${order.length} 个：${order.join("、") || "无"}`);
  for (const [i, id] of order.entries()) {
    log(`\n━━━━ [${i + 1}/${order.length}] ${id} ━━━━`);
    let r;
    try { r = await verifyOne(id); } catch (e) { r = { fail: "脚本出错：" + e.message }; }
    if (r.record) merge(records, r.record); else failed.push(`${id}：${r.fail}`);
  }
}
if (Object.keys(records).length) {
  log("\n下面这段并进 verified.json（同一组件已有别的版本就合并到同一层），提 PR：\n");
  log(JSON.stringify(records, null, 2));
  if (!APP || !BY) log("\n⚠ --app / --by 没填全，提交前把占位的地方改掉");
}
if (PR && Object.keys(records).length) {
  if (!APP || !BY) log("\n⚠ --pr 要 --app 和 --by 都填上，没开 PR");
  else try { log("\n已开 PR：" + openPr(records, failed)); }
  catch (e) { log(`\n✗ 开 PR 没成功（${String(e.message).split("\n")[0]}）：把上面的记录手动并进 verified.json 提 PR`); }
}
if (failed.length) { log(`\n✗ 没通过 ${failed.length} 个（别写记录）：`); for (const f of failed) log("  " + f); process.exit(1); }

// 记录并进 verified.json → 新分支 → PR。全程 GitHub API（gh api），不 clone
function openPr(recs, failed) {
  const REPO = "greyoak111/cccodroid-components";
  const gh = (...a) => execFileSync("gh", a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const head = gh("api", `repos/${REPO}/git/ref/heads/main`, "--jq", ".object.sha");
  const cur = JSON.parse(gh("api", `repos/${REPO}/contents/verified.json?ref=main`));
  const v = merge(JSON.parse(Buffer.from(cur.content, "base64").toString("utf8")), recs);
  const ids = Object.keys(recs);
  const branch = `verify/${new Date().toISOString().slice(0, 10)}-${ids.join("-").slice(0, 40)}-${Date.now().toString(36)}`;
  gh("api", "-X", "POST", `repos/${REPO}/git/refs`, "-f", `ref=refs/heads/${branch}`, "-f", `sha=${head}`);
  const msg = `真机验证：${ids.join("、")}（${APP}）`;
  gh("api", "-X", "PUT", `repos/${REPO}/contents/verified.json`, "-f", `message=${msg}`, "-f", `branch=${branch}`, "-f", `sha=${cur.sha}`,
    "-f", `content=${Buffer.from(JSON.stringify(v, null, 2) + "\n").toString("base64")}`);
  const body = [`verify-device.mjs --pending 跑出来的记录（设备 ${prop("ro.product.manufacturer")} ${prop("ro.product.model")}，${APP}，by ${BY}）。`, "",
    "通过：", ...ids.map((id) => `- ${id} ${Object.keys(recs[id]).join(", ")}`),
    ...(failed.length ? ["", "没通过（没写记录）：", ...failed.map((f) => "- " + f)] : [])].join("\n");
  return gh("pr", "create", "-R", REPO, "--head", branch, "--base", "main", "--title", msg, "--body", body);
}
