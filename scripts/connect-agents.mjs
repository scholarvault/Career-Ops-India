// Connect Career-Ops India to the AI agents on this machine.
// Usage: pnpm connect            show what is connected and the exact commands
//        pnpm connect --apply    also register it with every CLI found
//
// Inside this repo nothing is needed: .mcp.json (Claude Code),
// .codex/config.toml (Codex) and .gemini/settings.json (Gemini CLI) already
// point at server/mcp.ts. This script is for using the tools from ANY folder,
// and for Claude Desktop, which has no per-project config.
//
// It only ever adds an entry named "career-ops-india". It never removes or
// edits another server, and it never writes a key anywhere.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const apply = process.argv.includes('--apply');
const NAME = 'career-ops-india';
const node = process.execPath;
const tsxCli = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const entry = join(root, 'server', 'mcp.ts');
/* Absolute paths: a global registration runs from whatever folder the agent
   is in, so "server/mcp.ts" relative to cwd would not resolve. */
const cmd = [node, tsxCli, entry];

function has(bin) {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [bin], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function run(bin, args) {
  try {
    const out = execFileSync(bin, args, { encoding: 'utf8', shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: String(e.stderr || e.message || e) };
  }
}

const q = (s) => (/\s/.test(s) ? `"${s}"` : s);

if (!existsSync(tsxCli)) {
  console.log('Run `pnpm install` first: node_modules/tsx is missing.');
  process.exit(1);
}

console.log('Career-Ops India -> AI agents\n');
console.log('In this repo: already wired (.mcp.json, .codex/config.toml, .gemini/settings.json).\n');

const clis = [
  { bin: 'claude', label: 'Claude Code', args: ['mcp', 'add', '--scope', 'user', NAME, '--', ...cmd], list: ['mcp', 'list'] },
  { bin: 'codex', label: 'Codex CLI', args: ['mcp', 'add', NAME, '--', ...cmd], list: ['mcp', 'list'] },
  { bin: 'gemini', label: 'Gemini CLI', args: ['mcp', 'add', '--scope', 'user', NAME, ...cmd], list: ['mcp', 'list'] },
];

for (const c of clis) {
  const found = has(c.bin);
  const line = `${c.bin} ${c.args.map(q).join(' ')}`;
  if (!found) {
    console.log(`- ${c.label}: not installed. When it is:\n    ${line}\n`);
    continue;
  }
  const listed = run(c.bin, c.list);
  if (listed.ok && listed.out.includes(NAME)) {
    console.log(`- ${c.label}: connected.\n`);
    continue;
  }
  if (!apply) {
    console.log(`- ${c.label}: installed, not connected. Run:\n    ${line}\n  or: pnpm connect --apply\n`);
    continue;
  }
  const r = run(c.bin, c.args);
  console.log(`- ${c.label}: ${r.ok ? 'connected.' : 'could not register:\n    ' + r.out.trim().split('\n')[0]}\n`);
}

/* Claude Desktop: one JSON file, merged, with a backup of the old one. */
const desktopCfg =
  process.platform === 'win32'
    ? join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json')
    : process.platform === 'darwin'
      ? join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
      : join(homedir(), '.config', 'Claude', 'claude_desktop_config.json');
const desktopEntry = { command: node, args: [tsxCli, entry] };

if (!existsSync(dirname(desktopCfg))) {
  console.log('- Claude Desktop: not installed. Its config would take:');
  console.log(JSON.stringify({ mcpServers: { [NAME]: desktopEntry } }, null, 2).replace(/^/gm, '    '));
} else {
  let cfg = {};
  try {
    cfg = JSON.parse(readFileSync(desktopCfg, 'utf8'));
  } catch {}
  const current = cfg.mcpServers?.[NAME];
  if (current && JSON.stringify(current) === JSON.stringify(desktopEntry)) {
    console.log('- Claude Desktop: connected.');
  } else if (!apply) {
    console.log(`- Claude Desktop: not connected. pnpm connect --apply adds it to\n    ${desktopCfg}`);
  } else {
    if (existsSync(desktopCfg)) copyFileSync(desktopCfg, desktopCfg + '.bak');
    mkdirSync(dirname(desktopCfg), { recursive: true });
    cfg.mcpServers = { ...(cfg.mcpServers || {}), [NAME]: desktopEntry };
    writeFileSync(desktopCfg, JSON.stringify(cfg, null, 2));
    console.log(`- Claude Desktop: connected (backup at ${desktopCfg}.bak). Restart Claude Desktop.`);
  }
}

console.log('\nThen ask your agent: "Use career-ops-india to find 10 Product Manager jobs in Bengaluru for my resume."');
console.log('Apply tools start the local app on :4173 by themselves if it is not running.');
