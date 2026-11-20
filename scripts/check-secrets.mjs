#!/usr/bin/env node
/* Fail the build if a secret or a real person's contact detail is in a
   tracked file. Run by `pnpm check:secrets`, the pre-commit hook and CI.

   The rule from AGENTS.md: a key lives in data/secrets.json or .env, both
   gitignored. No real name, email, phone or handle in a fixture, demo or
   comment - use example.com data. */

import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { extname } from "node:path";

const SKIP_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".docx",
  ".woff", ".woff2", ".ttf", ".otf", ".zip", ".gz", ".mp4", ".lock",
]);

const RULES = [
  { id: "sarvam-key", re: /\bsk_[A-Za-z0-9]{16,}\b/g, why: "Sarvam API key" },
  { id: "openai-key", re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g, why: "OpenAI-style key" },
  { id: "github-token", re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, why: "GitHub token" },
  { id: "aws-key", re: /\bAKIA[0-9A-Z]{16}\b/g, why: "AWS access key id" },
  { id: "slack-token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, why: "Slack token" },
  { id: "private-key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, why: "private key block" },
  { id: "assigned-secret", re: /\b(?:api[_-]?key|apikey|secret|client[_-]?secret|access[_-]?token|password|passwd)\b\s*[:=]\s*["'][^"'\s]{16,}["']/gi, why: "hard-coded credential" },
  { id: "real-email", re: /\b[A-Za-z0-9._%+-]+@(?!example\.(?:com|org|net)\b)(?![0-9])[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g, why: "real email address (use @example.com)" },
  { id: "absolute-user-path", re: /\b[A-Za-z]:\\Users\\[A-Za-z0-9._-]+/g, why: "absolute path that names a person's account" },
];

const ALLOW = [
  /* the documented fake number and fake domains used by the fixtures */
  /^\+?91?9000012345$/,
  /@example\.(com|org|net)$/i,
  /@users\.noreply\.github\.com$/i,
  /^C:\\Users\\<[^>]+>$/,
];

function tracked() {
  try {
    return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
      .split("\0")
      .filter(Boolean);
  } catch {
    console.error("check-secrets: not a git repository, or git is not installed.");
    process.exit(2);
  }
}

const findings = [];

for (const file of tracked()) {
  if (SKIP_EXT.has(extname(file).toLowerCase())) continue;
  let size = 0;
  try { size = statSync(file).size; } catch { continue; }
  if (size > 2_000_000) continue;

  let text;
  try { text = readFileSync(file, "utf8"); } catch { continue; }
  if (text.includes("\0")) continue;

  const lines = text.split(/\r?\n/);
  for (const rule of RULES) {
    for (let i = 0; i < lines.length; i++) {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(lines[i]))) {
        const hit = m[0];
        if (ALLOW.some((a) => a.test(hit))) continue;
        findings.push({ file, line: i + 1, rule: rule.id, why: rule.why, hit: hit.slice(0, 80) });
      }
    }
  }
}

if (!findings.length) {
  console.log(`check-secrets: clean (${tracked().length} tracked files)`);
  process.exit(0);
}

console.error(`check-secrets: ${findings.length} finding(s)\n`);
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}  [${f.rule}] ${f.why}`);
  console.error(`      ${f.hit}`);
}
console.error("\nRemove the value, or move it to data/secrets.json / .env (both gitignored).");
console.error("If it is a real key that was ever pushed, rotate it - deleting the line is not enough.");
process.exit(1);
