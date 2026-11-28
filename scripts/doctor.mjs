/**
 * Repository health & architecture invariant check (`pnpm doctor`),
 * inspired by @agent-native/core doctor. Read-only: exits 1 on findings.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const findings = [];

function checkSecrets() {
  try {
    execSync("node scripts/check-secrets.mjs", { cwd: ROOT, stdio: "pipe" });
  } catch (err) {
    findings.push(`[secrets] check-secrets failed: ${err.stdout?.toString() || err.message}`);
  }
}

function checkConnectorsHavePolicy() {
  const dir = join(ROOT, "server", "connectors");
  if (!existsSync(dir)) return;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".ts") || file === "fill.ts") continue;
    const src = readFileSync(join(dir, file), "utf8");
    if (!/_POLICY\s*=/.test(src)) {
      findings.push(`[source-policy] server/connectors/${file} does not export a *_POLICY SourcePolicy record.`);
    }
  }
}

function checkUiPersistsToApi() {
  const idx = join(ROOT, "ui", "index.html");
  if (existsSync(idx)) {
    const src = readFileSync(idx, "utf8");
    if (!src.includes('"/api/profile"') || !src.includes('"/api/resume"')) {
      findings.push(`[ui-sync] ui/index.html should persist profile & resume to /api/profile and /api/resume.`);
    }
  }
  const setHtml = join(ROOT, "ui", "settings.html");
  if (existsSync(setHtml)) {
    const src = readFileSync(setHtml, "utf8");
    if (/"Included key"/.test(src)) {
      findings.push(`[byok-truth] ui/settings.html still displays misleading "Included key" when no key is stored.`);
    }
  }
}

function checkNoBlankMcpSave() {
  const mcp = join(ROOT, "server", "mcp.ts");
  if (existsSync(mcp)) {
    const src = readFileSync(mcp, "utf8");
    if (/html:\s*""/.test(src)) {
      findings.push(`[mcp-tailor] server/mcp.ts passes empty html: "" to /api/tailored/save (always fails < 200 bytes).`);
    }
  }
}

function main() {
  checkSecrets();
  checkConnectorsHavePolicy();
  checkUiPersistsToApi();
  checkNoBlankMcpSave();

  console.log(`career-ops doctor: ${ROOT}`);
  console.log("Checks run: secrets, source-policy, ui-sync, byok-truth, mcp-tailor");
  if (findings.length) {
    console.error(`\n${findings.length} finding(s):`);
    for (const f of findings) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log("Clean — no findings.");
}

main();
