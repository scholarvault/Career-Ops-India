// Start Career-Ops India detached, so it keeps running after this shell closes.
// Usage: node scripts/serve.mjs   (or: pnpm start)
import { spawn } from 'node:child_process';
import { mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4173);
const pidFile = join(root, 'data', 'server.pid');
const logDir = join(root, 'logs');
mkdirSync(logDir, { recursive: true });

async function up() {
  try {
    const r = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(2000) });
    return r.status < 500;
  } catch {
    return false;
  }
}

/* Open the app so `pnpm start` ends with a window, not a prompt that looks
   like nothing happened. NO_OPEN=1 skips it (CI, servers, headless runs). */
function openBrowser(url) {
  if (process.env.NO_OPEN) return;
  const [cmd, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } catch {
    console.log(`could not open a browser - open ${url} yourself`);
  }
}

/* A first run needs the setup page; a saved profile goes straight to the app. */
function startUrl() {
  const base = `http://localhost:${port}`;
  try {
    const p = JSON.parse(readFileSync(join(root, 'data', 'profile.json'), 'utf8'));
    return p && p.role ? `${base}/workspace.html` : `${base}/`;
  } catch {
    return `${base}/`;
  }
}

if (await up()) {
  const url = startUrl();
  console.log(`already running - ${url}`);
  console.log('opening it in your browser - it keeps running in the background; pnpm stop to stop it');
  openBrowser(url);
  process.exit(0);
}

const out = openSync(join(logDir, 'dev.out'), 'a');
const err = openSync(join(logDir, 'dev.out.err'), 'a');
const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  cwd: root,
  detached: true,
  stdio: ['ignore', out, err],
  windowsHide: true,
});
child.unref();
writeFileSync(pidFile, String(child.pid));

for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 500));
  if (await up()) {
    const url = startUrl();
    console.log(`career-ops india on ${url} (pid ${child.pid})`);
    console.log('opening it in your browser - if nothing happens, open that URL yourself');
    console.log('it keeps running in the background - pnpm stop to stop it');
    openBrowser(url);
    process.exit(0);
  }
}

console.log(`started pid ${child.pid} but the port is not answering - see logs/dev.out`);
process.exit(1);
