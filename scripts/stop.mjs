// Stop the detached Career-Ops India server.
// Usage: node scripts/stop.mjs   (or: pnpm stop)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4173);
const pidFile = join(root, 'data', 'server.pid');
const stopped = new Set();

function kill(pid) {
  try {
    process.kill(pid);
    stopped.add(pid);
  } catch {}
}

if (existsSync(pidFile)) {
  const pid = Number(readFileSync(pidFile, 'utf8').trim());
  if (Number.isFinite(pid) && pid > 0) kill(pid);
  rmSync(pidFile, { force: true });
}

// Anything else still holding the port (for example one started by hand).
try {
  const raw = execFileSync(
    'powershell',
    ['-NoProfile', '-Command', `(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue).OwningProcess`],
    { encoding: 'utf8' },
  );
  for (const line of raw.split(/\r?\n/)) {
    const pid = Number(line.trim());
    if (Number.isFinite(pid) && pid > 0) kill(pid);
  }
} catch {}

// The server is killed outright on Windows, so its Chrome would be orphaned
// and keep the profile locked. Close only Chrome running on this app's own
// data/browser-profile* folders; a personal Chrome is never touched.
let browsers = 0;
if (process.platform === "win32") {
  try {
    const ps =
      "$n = $env:CO_NEEDLE; $k = 0; Get-CimInstance Win32_Process -Filter \"Name='chrome.exe' or Name='msedge.exe'\" | " +
      "Where-Object { $_.CommandLine -and $_.CommandLine.Contains($n) -and $_.CommandLine -notmatch '--type=' } | " +
      "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; $k++ }; $k";
    browsers = Number(execFileSync("powershell", ["-NoProfile", "-Command", ps], {
      encoding: "utf8",
      env: { ...process.env, CO_NEEDLE: join(root, "data", "browser-profile") },
    }).trim()) || 0;
  } catch {}
} else {
  try { execFileSync("pkill", ["-f", `--user-data-dir=${join(root, "data", "browser-profile")}`]); browsers = 1; } catch {}
}
if (browsers) console.log(`closed the app's browser`);

if (stopped.size) console.log(`stopped pid ${[...stopped].join(', ')}`);
else console.log(`nothing was running on ${port}`);
