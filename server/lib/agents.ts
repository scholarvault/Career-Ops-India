/* AI agents on this machine, and whether Career-Ops India is registered with
 * each one as an MCP server. The same registration `pnpm connect --apply`
 * does (scripts/connect-agents.mjs), behind one button per agent.
 *
 * It only ever adds an entry named "career-ops-india". It never removes or
 * edits another server, never writes a key, and backs up a JSON config
 * before changing it.
 */
import { execFile } from "node:child_process";
import { existsSync, readdirSync as require_readdirSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BUNDLE_NAME, buildPlugin } from "./mcpb";

const NAME = "career-ops-india";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const node = process.execPath;
const tsxCli = join(root, "node_modules", "tsx", "dist", "cli.mjs");
const entry = join(root, "server", "mcp.ts");
const isWin = process.platform === "win32";

export type AgentId = "claude-code" | "claude-desktop" | "codex" | "gemini" | "cursor" | "chatgpt";
export type AgentState = "connected" | "not-connected" | "not-installed" | "needs-url";
export type AgentStatus = {
  id: AgentId;
  name: string;
  kind: string;
  state: AgentState;
  /** One line for the row, e.g. "Restart Claude Desktop to load it". */
  note?: string;
  /** What the Connect button runs, shown so nothing is hidden. */
  command?: string;
  canConnect: boolean;
  /** The button's label when it is not "Connect <name>". */
  action?: string;
  /** Where the extension file can be downloaded, for Claude Desktop. */
  download?: string;
};

/* With shell: true (needed for .cmd shims on Windows) every argument is
   joined into one string, so a path with a space must be quoted. */
const q = (s: string) => (/[\s"]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s);

function run(bin: string, args: string[], ms = 20_000): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    execFile(isWin ? q(bin) : bin, isWin ? args.map(q) : args, { shell: isWin, timeout: ms, windowsHide: true, encoding: "utf8" }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: String(stdout || "") + String(stderr || "") });
    });
  });
}
async function has(bin: string): Promise<boolean> {
  return (await run(isWin ? "where" : "which", [bin], 5_000)).ok;
}

const CLIS: Record<"claude-code" | "codex" | "gemini", { bin: string; name: string; args: string[] }> = {
  "claude-code": { bin: "claude", name: "Claude Code", args: ["mcp", "add", "--scope", "user", NAME, "--", node, tsxCli, entry] },
  codex: { bin: "codex", name: "Codex", args: ["mcp", "add", NAME, "--", node, tsxCli, entry] },
  gemini: { bin: "gemini", name: "Gemini CLI", args: ["mcp", "add", "--scope", "user", NAME, node, tsxCli, entry] },
};

const desktopCfg = isWin
  ? join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Claude", "claude_desktop_config.json")
  : process.platform === "darwin"
    ? join(homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json")
    : join(homedir(), ".config", "Claude", "claude_desktop_config.json");
const cursorCfg = join(homedir(), ".cursor", "mcp.json");

/* Claude Desktop from the Microsoft Store keeps its files in a package
   folder; the plain installer uses %APPDATA%. Look in both. */
function claudeHomes(): string[] {
  const homes = [dirname(desktopCfg)];
  if (isWin && process.env.LOCALAPPDATA) {
    try {
      const pk = join(process.env.LOCALAPPDATA, "Packages");
      for (const d of require_readdirSync(pk)) {
        if (/^Claude_/i.test(d)) homes.push(join(pk, d, "LocalCache", "Roaming", "Claude"));
      }
    } catch {}
  }
  return homes;
}
/* An uploaded plugin is listed in Claude-Data/<app>/plugin-list/<org>/<user>/plugins.json */
async function pluginInstalled(): Promise<boolean> {
  const base = isWin && process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Claude-Data") : join(homedir(), "Library", "Application Support", "Claude-Data");
  const walk = async (dir: string, depth: number): Promise<boolean> => {
    let names: string[] = [];
    try { names = await readdir(dir); } catch { return false; }
    for (const n of names) {
      const p = join(dir, n);
      if (n === "plugins.json") {
        try { if ((await readFile(p, "utf8")).includes(`"${BUNDLE_NAME}"`)) return true; } catch {}
      } else if (depth > 0 && !n.includes(".") && (depth < 4 || n === "plugin-list" || /^claude/i.test(n))) {
        if (await walk(p, depth - 1)) return true;
      }
    }
    return false;
  };
  return walk(base, 4);
}
async function extensionInstalled(): Promise<boolean> {
  if (await pluginInstalled()) return true;
  for (const h of claudeHomes()) {
    try {
      const names = await readdir(join(h, "Claude Extensions"));
      if (names.some((n) => n.toLowerCase().includes(BUNDLE_NAME))) return true;
    } catch {}
  }
  return false;
}
/* The config entry an earlier Connect wrote, in every place Claude reads. */
async function desktopEntries(): Promise<string[]> {
  const files: string[] = [];
  for (const h of claudeHomes()) {
    const f = join(h, "claude_desktop_config.json");
    if ((await readCfg(f))?.mcpServers?.[NAME]) files.push(f);
  }
  return files;
}
async function removeEntry(file: string): Promise<void> {
  const cfg = await readCfg(file);
  if (!cfg?.mcpServers?.[NAME]) return;
  await copyFile(file, file + ".bak");
  delete cfg.mcpServers[NAME];
  await writeFile(file, JSON.stringify(cfg, null, 2));
}
/* Show the file in Explorer or Finder, selected, so it can be dropped on
   Claude's "Upload a plugin". Nothing is installed here: Claude asks. */
function revealFile(file: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (isWin) {
      /* explorer exits 1 even when it opens the window, so no error check */
      execFile("explorer.exe", [`/select,${file}`], { windowsHide: false }, () => resolve(true));
      return;
    }
    const [bin, args] = process.platform === "darwin" ? ["open", ["-R", file]] : ["xdg-open", [dirname(file)]];
    execFile(bin as string, args as string[], { timeout: 10_000 }, (err) => resolve(!err));
  });
}
const serverEntry = { command: node, args: [tsxCli, entry] };

async function readCfg(file: string): Promise<any> {
  try { return JSON.parse(await readFile(file, "utf8")); } catch { return {}; }
}
async function mergeCfg(file: string): Promise<void> {
  const cfg = await readCfg(file);
  if (existsSync(file)) await copyFile(file, file + ".bak");
  await mkdir(dirname(file), { recursive: true });
  cfg.mcpServers = { ...(cfg.mcpServers || {}), [NAME]: serverEntry };
  await writeFile(file, JSON.stringify(cfg, null, 2));
}

let cache: { at: number; list: AgentStatus[] } | null = null;

export async function agentStatus(fresh = false): Promise<AgentStatus[]> {
  if (!fresh && cache && Date.now() - cache.at < 60_000) return cache.list;
  const cli = async (id: keyof typeof CLIS): Promise<AgentStatus> => {
    const c = CLIS[id];
    const command = `${c.bin} ${c.args.map(q).join(" ")}`;
    if (!(await has(c.bin))) return { id, name: c.name, kind: "MCP · command line", state: "not-installed", command, canConnect: false };
    /* `mcp list` can health-check every server; give it time */
    const listed = await run(c.bin, ["mcp", "list"], 25_000);
    const on = listed.out.includes(NAME);
    return { id, name: c.name, kind: "MCP · command line", state: on ? "connected" : "not-connected", command, canConnect: !on };
  };
  const json = async (id: "claude-desktop" | "cursor", name: string, file: string, note: string): Promise<AgentStatus> => {
    if (!existsSync(dirname(file))) return { id, name, kind: "MCP · desktop app", state: "not-installed", canConnect: false };
    const cfg = await readCfg(file);
    const on = Boolean(cfg?.mcpServers?.[NAME]);
    return { id, name, kind: "MCP · desktop app", state: on ? "connected" : "not-connected", command: `adds "${NAME}" to ${file}`, note: on ? note : undefined, canConnect: !on };
  };
  const desktop = async (): Promise<AgentStatus> => {
    const base: AgentStatus = { id: "claude-desktop", name: "Claude Desktop", kind: "Plugin", state: "not-installed", canConnect: false, download: "/api/agents/plugin" };
    if (!claudeHomes().some((h) => existsSync(h))) return base;
    const ext = await extensionInstalled();
    const old = (await desktopEntries()).length > 0;
    if (ext && old) return { ...base, state: "connected", note: "It is also still in the Developer config from an earlier connect, so Claude loads the tools twice.", canConnect: true, action: "Remove the old copy", command: "removes career-ops-india from claude_desktop_config.json (a .bak is kept)" };
    if (ext) return { ...base, state: "connected", note: "Find it under Plugins in Claude." };
    if (old) return { ...base, state: "connected", kind: "Developer config", note: "It sits under Settings → Developer. Add it as a plugin to see it under Plugins.", canConnect: true, action: "Get the plugin", command: "builds career-ops-india-plugin.zip and shows it in Explorer" };
    return { ...base, state: "not-connected", canConnect: true, action: "Get the plugin", command: "builds career-ops-india-plugin.zip and shows it in Explorer" };
  };
  const list = await Promise.all([
    cli("claude-code"),
    desktop(),
    cli("codex"),
    cli("gemini"),
    json("cursor", "Cursor", cursorCfg, "Cursor picks it up on its next start."),
  ]);
  list.push({
    id: "chatgpt",
    name: "ChatGPT",
    kind: "Developer mode · remote MCP",
    state: "needs-url",
    note: "ChatGPT reaches only a public HTTPS URL. This app stays on your machine, so use Claude or Codex here.",
    canConnect: false,
  });
  cache = { at: Date.now(), list };
  return list;
}

export async function connectAgent(id: string): Promise<{ ok: boolean; message: string }> {
  if (!existsSync(tsxCli)) return { ok: false, message: "Run pnpm install first: node_modules/tsx is missing." };
  if (id === "claude-code" || id === "codex" || id === "gemini") {
    const c = CLIS[id];
    if (!(await has(c.bin))) return { ok: false, message: `${c.name} is not installed on this machine.` };
    const r = await run(c.bin, c.args, 30_000);
    cache = null;
    return r.ok
      ? { ok: true, message: `${c.name} can now use the Career-Ops tools.` }
      : { ok: false, message: (r.out.trim().split("\n")[0] || "It did not register.").slice(0, 200) };
  }
  if (id === "claude-desktop") {
    try {
      if (await extensionInstalled()) {
        for (const f of await desktopEntries()) await removeEntry(f);
        cache = null;
        return { ok: true, message: "Removed the Developer copy. Restart Claude Desktop; the plugin stays." };
      }
      const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { version?: string };
      const b = await buildPlugin(root, join(root, "data"), pkg.version || "0.0.0");
      cache = null;
      return (await revealFile(b.file))
        ? { ok: true, message: "Explorer shows career-ops-india-plugin.zip. In Claude: Plugins → Upload a plugin, drop it there, then Upload." }
        : { ok: false, message: "Could not open the folder. Use Download the plugin below." };
    } catch (e: any) {
      return { ok: false, message: `Could not build the plugin: ${String(e?.message || e).slice(0, 160)}` };
    }
  }
  if (id === "cursor") {
    const file = cursorCfg;
    if (!existsSync(dirname(file))) return { ok: false, message: "That app is not installed on this machine." };
    try {
      await mergeCfg(file);
      cache = null;
      return { ok: true, message: "Added. Cursor loads it on its next start." };
    } catch (e: any) {
      return { ok: false, message: `Could not write the config: ${String(e?.message || e).slice(0, 160)}` };
    }
  }
  return { ok: false, message: "That agent cannot be connected from here." };
}
