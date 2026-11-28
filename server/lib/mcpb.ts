/* The Claude Desktop extension (.mcpb): one file Claude installs in a click,
 * listed under Settings → Extensions instead of the Developer config.
 *
 * The bundle is a launcher, not a copy of the app. It starts this folder's
 * own MCP server (server/mcp.ts) with the Node and tsx the app already uses,
 * so the profile, sessions and CVs stay where they are, in data/. The bundle
 * is built for this machine because it records this folder's path; the
 * folder is also a setting, so moving the repo is a change in Claude, not a
 * rebuild.
 *
 * No dependency: the zip and the PNG icon are written with node:zlib.
 * Nothing secret goes in: no key, no profile, no session.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { deflateRawSync, deflateSync, crc32 } from "node:zlib";

export const BUNDLE_NAME = "career-ops-india";

type Entry = { name: string; data: Buffer };

/* ---------------- zip (deflate, no data descriptors) ---------------- */
function zip(entries: Entry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  const t = new Date();
  const dosTime = (t.getHours() << 11) | (t.getMinutes() << 5) | Math.floor(t.getSeconds() / 2);
  const dosDate = ((t.getFullYear() - 1980) << 9) | ((t.getMonth() + 1) << 5) | t.getDate();
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const packed = deflateRawSync(e.data);
    const crc = crc32(e.data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // utf-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + packed.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

/* ---------------- icon: the brand dot on a dark tile ---------------- */
function png(size: number, pixel: (x: number, y: number) => [number, number, number, number]): Buffer {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = a;
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
function icon(): Buffer {
  const S = 512, R = 112; // tile corner radius
  const cov = (d: number) => Math.max(0, Math.min(1, 0.5 - d)); // 1px antialias
  return png(S, (x, y) => {
    const px = x + 0.5, py = y + 0.5;
    const qx = Math.max(Math.abs(px - S / 2) - (S / 2 - R), 0);
    const qy = Math.max(Math.abs(py - S / 2) - (S / 2 - R), 0);
    const tile = cov(Math.hypot(qx, qy) - R);
    if (!tile) return [0, 0, 0, 0];
    const dot = cov(Math.hypot(px - S / 2, py - S / 2) - 92);
    const mix = (a: number, b: number) => Math.round(a * (1 - dot) + b * dot);
    return [mix(17, 243), mix(17, 107), mix(17, 43), Math.round(tile * 255)];
  });
}

/* ---------------- launcher ---------------- */
const LAUNCHER = `// Starts Career-Ops India's MCP server from the app folder set in Claude.
// Built by Career-Ops India; it holds no key and no profile.
const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const { join } = require("node:path");

const folder = process.env.CAREER_OPS_FOLDER || "";
const tsx = join(folder, "node_modules", "tsx", "dist", "cli.mjs");
const entry = join(folder, "server", "mcp.ts");
if (!folder || !existsSync(entry) || !existsSync(tsx)) {
  process.stderr.write("Career-Ops India: the app folder is not set or pnpm install has not run there. Folder: " + folder + "\\n");
  process.exit(1);
}
const node = process.env.CAREER_OPS_NODE && existsSync(process.env.CAREER_OPS_NODE) ? process.env.CAREER_OPS_NODE : process.execPath;
const child = spawn(node, [tsx, entry], { cwd: folder, stdio: "inherit", windowsHide: true, env: process.env });
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
`;

export type BuiltBundle = { file: string; bytes: number; tools: number };

/** Build data/career-ops-india.mcpb for this machine. */
export async function buildBundle(root: string, dataDir: string, version: string): Promise<BuiltBundle> {
  const toolNames = await listTools(root);
  const manifest = {
    manifest_version: "0.3",
    name: BUNDLE_NAME,
    display_name: "Career-Ops India",
    version,
    description: "Find, score, tailor and apply to jobs in India from Claude. Runs on this computer.",
    long_description:
      "Career-Ops India runs on your computer. Claude can search Naukri, Indeed and company boards, score postings against your profile, tailor a resume without inventing anything, and run auto apply, which stops to ask you for an OTP, a captcha or a missing answer. Your profile, sessions and CVs stay in the app's data folder.",
    author: { name: "ScholarVault", url: "https://github.com/scholarvault/Career-Ops-India" },
    repository: { type: "git", url: "https://github.com/scholarvault/Career-Ops-India.git" },
    license: "AGPL-3.0",
    icon: "icon.png",
    server: {
      type: "node",
      entry_point: "server/launch.js",
      mcp_config: {
        command: "node",
        args: ["${__dirname}/server/launch.js"],
        env: {
          CAREER_OPS_FOLDER: "${user_config.app_folder}",
          CAREER_OPS_NODE: process.execPath,
        },
      },
    },
    user_config: {
      app_folder: {
        type: "directory",
        title: "Career-Ops India folder",
        description: "The folder you cloned and ran pnpm install in.",
        required: true,
        default: root,
      },
    },
    tools: toolNames,
    tools_generated: true,
    compatibility: {
      platforms: ["win32", "darwin"],
      runtimes: { node: ">=20.0.0" },
    },
  };
  const out = join(dataDir, `${BUNDLE_NAME}.mcpb`);
  await mkdir(dirname(out), { recursive: true });
  const buf = zip([
    { name: "manifest.json", data: Buffer.from(JSON.stringify(manifest, null, 2)) },
    { name: "server/launch.js", data: Buffer.from(LAUNCHER) },
    { name: "icon.png", data: icon() },
  ]);
  await writeFile(out, buf);
  return { file: out, bytes: buf.length, tools: toolNames.length };
}

/* The tools, read from server/mcp.ts so the listing never drifts. Shared
   actions are added at run time, hence tools_generated. */
async function listTools(root: string): Promise<Array<{ name: string; description: string }>> {
  const src = join(root, "server", "mcp.ts");
  if (!existsSync(src)) return [];
  const text = await readFile(src, "utf8");
  const out: Array<{ name: string; description: string }> = [];
  for (const m of text.matchAll(/\bname:\s*"([a-z][a-z0-9_]{2,40})",\s*description:\s*"((?:[^"\\]|\\.)*)"/g)) {
    const first = m[2]!.replace(/\\"/g, '"').split(/(?<=\.)\s/)[0]!;
    out.push({ name: m[1]!, description: first.slice(0, 160) });
  }
  return out;
}

export const PLUGIN_FILE = `${BUNDLE_NAME}-plugin.zip`;

/**
 * The same launcher as a Claude plugin: what Claude Desktop's
 * "Plugins → Upload a plugin" and Claude Code's plugin system take. A plugin
 * is a zip with .claude-plugin/plugin.json and an .mcp.json that starts the
 * server. Like the bundle, it records this folder's path and holds no key.
 */
export async function buildPlugin(root: string, dataDir: string, version: string): Promise<BuiltBundle> {
  const tools = await listTools(root);
  const plugin = {
    name: BUNDLE_NAME,
    version,
    description: "Find, score, tailor and apply to jobs in India from Claude. Runs on this computer.",
    author: { name: "ScholarVault" },
    homepage: "https://github.com/scholarvault/Career-Ops-India",
    repository: "https://github.com/scholarvault/Career-Ops-India",
    license: "AGPL-3.0",
    keywords: ["jobs", "india", "naukri", "resume", "auto-apply", "mcp"],
  };
  const mcp = {
    mcpServers: {
      [BUNDLE_NAME]: {
        command: process.execPath,
        args: ["${CLAUDE_PLUGIN_ROOT}/server/launch.js"],
        env: { CAREER_OPS_FOLDER: root, CAREER_OPS_NODE: process.execPath },
      },
    },
  };
  const readme = `# Career-Ops India\n\nStarts the Career-Ops India MCP server from ${root}.\nThe app keeps your profile, sessions and CVs in its data folder; this plugin holds no key.\n\nTools: ${tools.map((t) => t.name).join(", ")}.\n`;
  const out = join(dataDir, PLUGIN_FILE);
  await mkdir(dirname(out), { recursive: true });
  const buf = zip([
    { name: ".claude-plugin/plugin.json", data: Buffer.from(JSON.stringify(plugin, null, 2)) },
    { name: ".mcp.json", data: Buffer.from(JSON.stringify(mcp, null, 2)) },
    { name: "server/launch.js", data: Buffer.from(LAUNCHER) },
    { name: "README.md", data: Buffer.from(readme) },
  ]);
  await writeFile(out, buf);
  return { file: out, bytes: buf.length, tools: tools.length };
}
