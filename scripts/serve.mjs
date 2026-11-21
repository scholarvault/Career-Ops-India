// Start Career-Ops India detached, so it keeps running after this shell closes.
// Usage: node scripts/serve.mjs   (or: pnpm start)
import { spawn } from 'node:child_process';
import { mkdirSync, openSync, writeFileSync } from 'node:fs';
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

if (await up()) {
  console.log(`already running - http://localhost:${port}`);
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
    console.log(`career-ops india on http://localhost:${port} (pid ${child.pid})`);
    process.exit(0);
  }
}

console.log(`started pid ${child.pid} but the port is not answering - see logs/dev.out`);
process.exit(1);
