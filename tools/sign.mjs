// 给任意索引文件签名（维护者本地用，例如给 cccodroid 预置组件的 components.json 签名）：
//   INDEX_SIGNING_KEY_FILE=<私钥 PEM> node tools/sign.mjs <components.json>   → 写 <文件>.sig
import fs from "node:fs";
import crypto from "node:crypto";
const f = process.argv[2];
const key = crypto.createPrivateKey(process.env.INDEX_SIGNING_KEY || fs.readFileSync(process.env.INDEX_SIGNING_KEY_FILE, "utf8"));
const body = fs.readFileSync(f);
fs.writeFileSync(f + ".sig", crypto.sign(null, body, key).toString("base64") + "\n");
console.log("✓ " + f + ".sig");
