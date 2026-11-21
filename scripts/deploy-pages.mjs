/* Deploy a folder to Cloudflare Pages with the direct-upload API.
 *
 * Wrangler needs account:read to find the account; this token does not have
 * it, so the four calls are made here instead. Usage:
 *
 *   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... \
 *     node scripts/deploy-pages.mjs <dir> <project> [branch]
 */
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";

const API = "https://api.cloudflare.com/client/v4";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".webmanifest": "application/manifest+json",
};

async function walk(dir, base = dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const full = join(dir, name);
    const s = await stat(full);
    if (s.isDirectory()) out.push(...(await walk(full, base)));
    else out.push({ full, key: relative(base, full).split(sep).join("/") });
  }
  return out;
}

async function api(path, { token, method = "GET", body, form } = {}) {
  const headers = { Authorization: `Bearer ${token}` };
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(API + path, { method, headers, body: payload });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok || json.success === false) {
    throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 400)}`);
  }
  return json.result;
}

async function main() {
  const [dir, project, branch = "main"] = process.argv.slice(2);
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!dir || !project) throw new Error("usage: deploy-pages.mjs <dir> <project> [branch]");
  if (!token || !account) throw new Error("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required");

  const files = await walk(dir);
  const entries = [];
  for (const f of files) {
    const buf = await readFile(f.full);
    entries.push({
      key: f.key,
      hash: createHash("md5").update(buf).digest("hex"),
      base64: buf.toString("base64"),
      type: TYPES[extname(f.key).toLowerCase()] || "application/octet-stream",
    });
  }
  console.log(`files=${entries.length} bytes=${entries.reduce((a, e) => a + Buffer.from(e.base64, "base64").length, 0)}`);

  const { jwt } = await api(`/accounts/${account}/pages/projects/${project}/upload-token`, { token });
  const hashes = [...new Set(entries.map((e) => e.hash))];

  const missing = await api("/pages/assets/check-missing", { token: jwt, method: "POST", body: { hashes } });
  const missingSet = new Set(missing);
  const toUpload = entries.filter((e) => missingSet.has(e.hash));
  console.log(`hashes=${hashes.length} missing=${toUpload.length}`);

  for (let i = 0; i < toUpload.length; i += 50) {
    const batch = toUpload.slice(i, i + 50).map((e) => ({
      key: e.hash,
      value: e.base64,
      metadata: { contentType: e.type },
      base64: true,
    }));
    await api("/pages/assets/upload", { token: jwt, method: "POST", body: batch });
    console.log(`uploaded ${Math.min(i + 50, toUpload.length)}/${toUpload.length}`);
  }

  await api("/pages/assets/upsert-hashes", { token: jwt, method: "POST", body: { hashes } });

  const manifest = {};
  for (const e of entries) manifest[e.key] = e.hash;

  const form = new FormData();
  form.append("manifest", JSON.stringify(manifest));
  form.append("branch", branch);
  form.append("commit_dirty", "true");
  const dep = await api(`/accounts/${account}/pages/projects/${project}/deployments`, {
    token,
    method: "POST",
    form,
  });
  console.log(`deployed ${dep.url}`);
  console.log(`id=${dep.id} stage=${dep.latest_stage?.name} status=${dep.latest_stage?.status}`);
}

main().catch((e) => {
  console.error("deploy failed:", e.message);
  process.exit(1);
});
