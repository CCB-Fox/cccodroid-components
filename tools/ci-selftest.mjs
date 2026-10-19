// CI 实跑 selftest（L2）：在 GitHub 的 arm64 机器上，用 termux-docker（自带安卓的 bionic）跑组件的 selftest。
//   node tools/ci-selftest.mjs [--report audit.md]
//
// 前提：tools/audit.mjs 刚跑过（work/audit/targets.json 记着审了哪些、包在哪）。要 sudo 和 docker ——
// 工具包得解到 /data/data/cc.codroid：和设备上同一个路径，二进制里写死的前缀才对得上。
// 每个组件：从「底座 + 跑过首次运行」的快照恢复 → 解依赖组件和本组件 → 按顺序跑各自的 first-run → 跑 selftest。
// 环境和 App 里 Claude 的 Bash 工具一致（PREFIX/HOME/TMPDIR/PATH + termux-exec），只是没有 GPU、屏幕和 Shizuku：
// 要这些的组件跳过，留给真机。selftest 失败算 ❌（CI 标红）。
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { ROOT, APP_REPO, bases } from "./lib.mjs";

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : undefined; };
const WORK = path.resolve(process.env.WORK || path.join(ROOT, "work"));
const IMAGE = process.env.TERMUX_DOCKER_IMAGE || "termux/termux-docker:aarch64";
const LIVE = "/data/data/cc.codroid", SNAP = "/opt/cc-base", USR = `${LIVE}/files/usr`;
const ST = path.join(WORK, "selftest");
fs.mkdirSync(ST, { recursive: true });

const targets = JSON.parse(fs.readFileSync(path.join(WORK, "audit", "targets.json"), "utf8"));
const sudo = (...a) => execFileSync("sudo", a, { stdio: ["ignore", "pipe", "inherit"], maxBuffer: 1 << 26 });
// 容器里跑一段 sh：工具包目录和 ST（放脚本、收输出）挂进去
function inContainer(script, timeoutSec) {
  const f = path.join(ST, "in.sh");
  fs.writeFileSync(f, [
    `export PREFIX=${USR} HOME=${LIVE}/files/home LANG=en_US.UTF-8 TERM=xterm-256color`,
    `export TMPDIR=$PREFIX/tmp PATH=$PREFIX/bin:/system/bin SHELL=$PREFIX/bin/bash`,
    `mkdir -p "$TMPDIR" "$HOME"`,
    // 和网关给 Bash 工具的一样：termux-exec 让 #!/usr/bin/env、#!/bin/bash 指回 $PREFIX/bin
    `[ -f $PREFIX/lib/libtermux-exec-ld-preload.so ] && export LD_PRELOAD=$PREFIX/lib/libtermux-exec-ld-preload.so`,
    script,
  ].join("\n") + "\n");
  const r = spawnSync("docker", ["run", "--rm", "-v", `${LIVE}:${LIVE}`, "-v", `${ST}:/st`, "--entrypoint", "/system/bin/sh", IMAGE, "/st/in.sh"],
    { encoding: "utf8", timeout: (timeoutSec + 60) * 1000, maxBuffer: 1 << 26 });
  return { code: r.status ?? -1, out: ((r.stdout || "") + (r.stderr || "")).trim() };
}

const rows = [];
const skipWhy = (t) => t.needs.gpu === "adreno" || t.needs.gpu === true ? "要 GPU" : t.needs.display ? "要屏幕" : t.needs.shizuku ? "要 Shizuku" : null;
const todo = targets.filter((t) => {
  if (!t.ok) { rows.push([t.id, "—", "审计有 ❌，没跑"]); return false; }
  if (!t.selftest) { rows.push([t.id, "—", "没有 selftest"]); return false; }
  const w = skipWhy(t);
  if (w) { rows.push([t.id, "⏭", `${w}，留给真机`]); return false; }
  if (t.deps.some((d) => !d.tar)) { rows.push([t.id, "—", "依赖组件没打出包，没跑"]); return false; }
  return true;
});

let fails = 0;
if (todo.length) {
  // 底座：解到真路径 → 容器里跑一遍首次运行 → 存快照（每个组件从快照恢复，互不影响）
  const tag = bases()[0].tag, gz = path.join(WORK, "base-gz", tag, `devkit-cc.codroid.tar.gz`);   // 不放 work/bases：那里进缓存，600 多 MB 不值得（下载只要几秒）
  if (!fs.existsSync(gz)) { fs.mkdirSync(path.dirname(gz), { recursive: true }); execFileSync("gh", ["release", "download", tag, "-R", APP_REPO, "-p", path.basename(gz), "-O", gz], { stdio: "inherit" }); }
  console.log(`底座 ${tag}：解包、首次运行`);
  sudo("rm", "-rf", LIVE, SNAP);
  sudo("mkdir", "-p", `${LIVE}/files/home`);
  sudo("tar", "xzf", gz, "-C", `${LIVE}/files`);
  const fr = inContainer(`sh $PREFIX/libexec/devkit/first-run.sh >/st/base-first-run.log 2>&1; echo "rc=$?"`, 900);
  console.log("  " + fr.out.split("\n").pop());
  sudo("cp", "-a", LIVE, SNAP);

  for (const t of todo) {
    console.log(`\n══ ${t.id}：${t.selftest}`);
    sudo("rm", "-rf", LIVE);
    sudo("cp", "-a", SNAP, LIVE);
    const chain = [...t.deps, { id: t.id, tar: t.tar }];
    for (const c of chain) sudo("tar", "xf", c.tar, "-C", `${LIVE}/files`);
    // first-run：依赖在前；selftest 限时 5 分钟，输出落到 /st/<id>.log
    // PIP_NO_INDEX=1：包的 postinst 现场 pip install 时不许去 PyPI —— 缺的纯 Python 依赖必须写进配方的 pip
    const firstRuns = chain.map((c) => `f=$PREFIX/libexec/devkit/components/${c.id}/first-run.sh; [ -f "$f" ] && { PIP_NO_INDEX=1 sh "$f" || echo "（${c.id} 的 first-run rc=$?）"; }`).join("\n");
    fs.writeFileSync(path.join(ST, "cmd"), t.selftest + "\n");
    const r = inContainer(`${firstRuns} >/st/${t.id}.first-run.log 2>&1
cd "$HOME"; timeout 300 $PREFIX/bin/bash /st/cmd >/st/${t.id}.log 2>&1; echo "rc=$?"`, 900);
    const code = Number((/rc=(\d+)\s*$/.exec(r.out) || [])[1] ?? -1);
    let log = ""; try { log = fs.readFileSync(path.join(ST, `${t.id}.log`), "utf8").trim(); } catch {}
    const last = log.split("\n").filter(Boolean).slice(-1)[0] || "";
    console.log(log.split("\n").slice(-8).map((l) => "  | " + l).join("\n") + `\n  rc=${code}`);
    if (code === 0) rows.push([t.id, "✅", `退出码 0${last ? "；最后一行：`" + last.slice(0, 100).replace(/`/g, "'") + "`" : ""}`]);
    else { fails++; rows.push([t.id, "❌", `${code === 124 ? "超时（5 分钟）" : "退出码 " + code}${last ? "；最后一行：`" + last.slice(0, 100).replace(/`/g, "'") + "`" : ""}`]); }
  }
  sudo("rm", "-rf", LIVE, SNAP);
}

const md = ["", "### CI 实跑 selftest（arm64 + termux-docker）", "",
  rows.length ? "| 组件 | 结果 | 说明 |\n|---|---|---|\n" + rows.map((r) => `| ${r.join(" | ")} |`).join("\n") : "这次没有要跑的。", "",
  "环境同 App 里 Claude 的 Bash 工具（PREFIX / HOME / TMPDIR / termux-exec），没有 GPU、屏幕、Shizuku。通过只说明「装得上、跑得起来」，安卓特有的问题仍要真机。", ""].join("\n");
if (opt("report")) fs.appendFileSync(opt("report"), md);
else console.log(md);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
process.exit(fails ? 1 : 0);
