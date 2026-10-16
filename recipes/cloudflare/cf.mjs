// cf —— 直接调 Cloudflare REST API v4（DNS、SSL、邮件路由这些 wrangler 管不到的）。
// 用法: cf [GET|POST|PATCH|PUT|DELETE] <路径> [JSON 体]     例: cf /zones   cf /zones/zone:example.com/dns_records
//   路径里可写 zone:<域名>，自动换成 zone id。
// 默认只允许 GET；写操作要显式设 CF_WRITE=1（防手滑）。令牌由包装脚本 cf 从 cf-login 存的文件里读。
const TOKEN = process.env.CLOUDFLARE_API_TOKEN || "";
if (!TOKEN) { console.error("还没登录：请用户自己在终端里运行 cf-login（令牌别贴进聊天）"); process.exit(2); }
let [method, p, body] = process.argv.slice(2);
if (!method) { console.error("用法: cf [GET|POST|PATCH|PUT|DELETE] <路径> [JSON 体]"); process.exit(2); }
if (!p || method.startsWith("/")) { body = p; p = method; method = "GET"; }
method = method.toUpperCase();
if (method !== "GET" && process.env.CF_WRITE !== "1") { console.error(`拒绝 ${method}：写操作要 CF_WRITE=1`); process.exit(3); }
const BASE = "https://api.cloudflare.com/client/v4";
const api = (path, init = {}) => fetch(BASE + path, { ...init, headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json", ...(init.headers || {}) } }).then((r) => r.json());
for (const m of [...p.matchAll(/zone:([a-z0-9.-]+)/g)]) {
  const r = await api("/zones?name=" + m[1]);
  if (!r.result?.length) { console.error("找不到 zone " + m[1]); process.exit(1); }
  p = p.replace(m[0], r.result[0].id);
}
const r = await api(p, { method, body: body || undefined });
console.log(JSON.stringify(r.success === false ? { errors: r.errors } : r.result, null, 1));
if (r.success === false) process.exit(1);
