/* Regenerate docs/ui-research/prototype/04-verify.png from the real prototype,
   using the demo persona only. No personal data is read or written. */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const UI = join(ROOT, "ui");
const OUT = join(ROOT, "docs", "ui-research", "prototype", "04-verify.png");

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".pdf": "application/pdf" };

const DEMO = `<html><head><meta charset="utf-8"></head><body style="font-family:Arial,Helvetica,sans-serif;padding:40px">
<h1 style="font-size:22px;margin:0">Ananya Iyer</h1>
<p style="font-size:10px;margin:4px 0 0">Senior Product Manager</p>
<p style="font-size:10px;margin:4px 0 0">ananya.iyer@example.com +91 9000012345 in/ananya-iyer Chennai, Tamil Nadu</p>
<p style="font-size:10px;margin:14px 0 0">Senior Product Manager Northwind Labs Jan 2021 - Present | Chennai, India</p>
<p style="font-size:10px;margin:2px 0 0">Owned the onboarding funnel and the pricing experiment programme.</p>
<p style="font-size:10px;margin:10px 0 0">Product Manager Halcyon Systems Jun 2018 - Dec 2020</p>
<p style="font-size:10px;margin:2px 0 0">Shipped the merchant dashboard used by 12,000 sellers.</p>
<p style="font-size:10px;margin:14px 0 0">EDUCATION</p>
<p style="font-size:10px;margin:2px 0 0">Bachelor of Engineering (B.E.)</p>
</body></html>`;

function serveUi() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://x");
      const file = join(UI, decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
      if (!file.startsWith(UI + sep)) { res.writeHead(403).end(); return; }
      const body = await readFile(file);
      res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r(server)));
}

const exe = process.env.CHROME_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].find((p) => existsSync(p));

if (!exe) { console.error("No Chrome or Edge found."); process.exit(2); }

const server = await serveUi();
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: exe, headless: true });

try {
  const gen = await browser.newPage();
  await gen.setContent(DEMO, { waitUntil: "load" });
  const pdf = await gen.pdf({ format: "A4" });
  await gen.close();

  const page = await browser.newPage({ viewport: { width: 1680, height: 893 } });
  await page.route("https://ui-sdk.dev/**", (r) => r.abort());
  await page.goto(base + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelectorAll("#roleChips .opt").length > 0);
  await page.fill("#roleInput", "Product Manager");
  await page.click("#next");
  await page.waitForSelector("#taskChips .opt");
  await page.click("#taskChips .opt");
  await page.click("#next");
  await page.waitForSelector("#file", { state: "attached" });
  await page.setInputFiles("#file", { name: "resume.pdf", mimeType: "application/pdf", buffer: pdf });
  await page.waitForFunction(
    () => /fields found|No file|scanned/i.test(document.querySelector("#fileHint")?.textContent || ""),
    null,
    { timeout: 40000 }
  );
  await page.click("#next");
  await page.waitForSelector("#facts .fact");
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    for (const el of document.querySelectorAll("*")) if (el.scrollTop) el.scrollTop = 0;
  });
  await page.screenshot({ path: OUT });
  console.log("wrote", OUT);
} finally {
  await browser.close();
  server.close();
}
