// cf --selftest —— 不只看版本号：真起一个 wrangler dev，打请求核对回包，再收掉。不需要登录、不联网发布。
// 最后一行打总结（验证脚本取它进记录），全过退出 0。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";

const BIN = process.env.CF_BIN || "";
const W = process.env.CF_WRANGLER || path.join(BIN, "wrangler"), K = process.env.CF_WORKERD || path.join(BIN, "workerd");
const res = {};
const say = (ok, msg) => console.log(`${ok ? "✓" : "✗"} ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
setTimeout(() => { console.log("✗ 两分钟没跑完，停下"); finish(); }, 120000).unref();

const ver = (cmd, re) => {
  const r = spawnSync(cmd, ["--version"], { encoding: "utf8", timeout: 60000 });
  const m = ((r.stdout || "") + (r.stderr || "")).match(re);
  return r.status === 0 && m ? m[1] : "";
};
res.wrangler = ver(W, /(\d+\.\d+\.\d+)/);
say(!!res.wrangler, `wrangler --version：${res.wrangler || "失败"}`);
res.workerd = ver(K, /workerd (\S+)/);
say(!!res.workerd, `workerd --version：${res.workerd || "失败"}`);

const port = await new Promise((ok) => { const s = net.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); });
const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), "cf-selftest-"));
fs.writeFileSync(path.join(dir, "wrangler.toml"), 'name = "selftest"\nmain = "index.js"\ncompatibility_date = "2026-10-01"\n');
fs.writeFileSync(path.join(dir, "index.js"), 'export default { fetch(req) { return new Response("ok " + new URL(req.url).pathname); } };\n');
const dev = spawn(W, ["dev", "--ip", "127.0.0.1", "--port", String(port)], { cwd: dir, detached: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" } });
let devOut = "";
dev.stdout.on("data", (d) => (devOut += d));
dev.stderr.on("data", (d) => (devOut += d));
const get = (p) => fetch(`http://127.0.0.1:${port}${p}`).then((r) => r.text()).catch(() => "");

const t0 = Date.now();
let up = false;
while (!up && Date.now() - t0 < 60000 && dev.exitCode === null) { await sleep(500); up = (await get("/ping")) === "ok /ping"; }
res.dev = up ? "OK" : "失败";
say(up, up ? `wrangler dev 起来了（${((Date.now() - t0) / 1000).toFixed(1)} 秒）` : "wrangler dev 60 秒内没起来");
if (up) {
  let n = 0;
  for (let i = 0; i < 20; i++) if ((await get(`/s${i}`)) === `ok /s${i}`) n++;
  const par = await Promise.all(Array.from({ length: 20 }, (_, i) => get(`/p${i}`)));
  n += par.filter((x, i) => x === `ok /p${i}`).length;
  res.req = `${n}/40`;
  say(n === 40, `请求 串行 20 + 并发 20：${n}/40 回包正确`);
} else {
  for (const l of devOut.replace(/\x1b\[[0-9;]*m/g, "").trim().split("\n").slice(-10)) console.log("  | " + l);
}
finish();

function finish() {
  try { process.kill(-dev.pid, "SIGKILL"); } catch {}
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  const ok = res.wrangler && res.workerd && res.dev === "OK" && res.req === "40/40";
  console.log(`===== 总结 ===== wrangler=${res.wrangler || "失败"} workerd=${res.workerd || "失败"} dev=${res.dev || "没跑"} 请求=${res.req || "没跑"}`);
  process.exit(ok ? 0 : 1);
}
