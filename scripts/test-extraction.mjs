/* Resume extraction regression test.
 *
 * Runs the real onboarding page in a real browser, feeds it real PDFs, and
 * asserts the ten fields it reads. No API server, no network, no key: the
 * page is served from ui/ by a throwaway static server and ui-sdk is blocked.
 *
 *   node scripts/test-extraction.mjs
 *   CO_RESUME="C:/path/to/your.pdf" node scripts/test-extraction.mjs
 *
 * The fixtures are generated at run time, so the repo carries no personal
 * data. The one that matters is "designed-header-with-stats": a name set in
 * large type on the same line as a tagline, above a grid of all-caps stat
 * labels. Flattening that page to text is what once produced a name of
 * "MANAGED GAIN USERS".
 */

import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const ROOT = normalize(join(fileURLToPath(import.meta.url), "..", ".."));
const UI = process.env.CO_UI ? normalize(process.env.CO_UI) : join(ROOT, "ui");
const WORK = join(tmpdir(), "co-extract-fixtures");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
};

/* ---------- fixtures ---------- */

const HEAD = `<html><head><meta charset="utf-8"></head><body style="font-family:Arial,Helvetica,sans-serif">`;

const FIXTURES = [
  {
    name: "single-column",
    html: `${HEAD}
      <div style="padding:40px">
        <h1 style="font-size:26px;margin:0">Ananya Iyer</h1>
        <p style="font-size:11px;margin:4px 0">ananya.iyer@example.com | +91 98765 43210 | Bengaluru, Karnataka</p>
        <p style="font-size:11px;margin:0">linkedin.com/in/ananya-iyer</p>
        <h2 style="font-size:13px;margin:24px 0 0">Experience</h2>
        <p style="font-size:12px;margin:0"><b>Senior Product Manager</b></p>
        <p style="font-size:11px;margin:0">Swiggy Pvt Ltd</p>
        <p style="font-size:11px;margin:0">Jan 2021 - Present</p>
        <p style="font-size:11px;margin:0">Owned the roadmap for the consumer app.</p>
        <p style="font-size:12px;margin:8px 0 0"><b>Product Manager</b></p>
        <p style="font-size:11px;margin:0">Zeta</p>
        <p style="font-size:11px;margin:0">Jun 2018 - Dec 2020</p>
        <h2 style="font-size:13px;margin:24px 0 0">Education</h2>
        <p style="font-size:11px;margin:0">B.Tech in Computer Science, NIT Trichy, 2018</p>
      </div></body></html>`,
    expect: {
      "Full name": "Ananya Iyer",
      Email: "ananya.iyer@example.com",
      Phone: "+91 98765 43210",
      Location: "Bengaluru, Karnataka",
      LinkedIn: "linkedin.com/in/ananya-iyer",
      "Current title": "Senior Product Manager",
      "Current company": "Swiggy Pvt Ltd",
      "Highest education": "B.Tech in Computer Science, NIT Trichy, 2018",
    },
  },
  {
    name: "name-at-body-size",
    html: `${HEAD}
      <div style="padding:40px;font-size:11px">
        <p style="margin:0">Rahul Verma</p>
        <p style="margin:0">rahul.verma@example.com | 9876543210 | Pune</p>
        <p style="margin:0">Experience</p>
        <p style="margin:0">Data Analyst at Freshworks</p>
        <p style="margin:0">Mar 2020 - Present</p>
        <p style="margin:0">Education</p>
        <p style="margin:0">M.Sc Statistics, Pune University</p>
      </div></body></html>`,
    expect: {
      "Full name": "Rahul Verma",
      Email: "rahul.verma@example.com",
      Phone: "9876543210",
      Location: "Pune",
      "Current title": "Data Analyst",
      "Current company": "Freshworks",
      "Highest education": "M.Sc Statistics, Pune University",
    },
  },
  {
    name: "two-column-sidebar",
    html: `${HEAD}
      <table style="width:100%;border-collapse:collapse"><tr>
        <td style="width:30%;background:#eee;padding:24px;vertical-align:top;font-size:10px">
          <p style="margin:0">CONTACT</p>
          <p style="margin:0">priya.nair@example.com</p>
          <p style="margin:0">+91 90000 11111</p>
          <p style="margin:0">Kochi, Kerala</p>
          <p style="margin:0">SKILLS</p>
          <p style="margin:0">SQL, Python, Tableau</p>
        </td>
        <td style="width:70%;padding:24px;vertical-align:top">
          <h1 style="font-size:28px;margin:0">Priya Nair</h1>
          <p style="font-size:11px;margin:2px 0">Business Analyst</p>
          <h2 style="font-size:12px;margin:20px 0 0">EXPERIENCE</h2>
          <p style="font-size:11px;margin:0"><b>Business Analyst</b> - Technoarete Pvt. Ltd.</p>
          <p style="font-size:11px;margin:0">Nov 2024 - Present</p>
          <h2 style="font-size:12px;margin:20px 0 0">EDUCATION</h2>
          <p style="font-size:11px;margin:0">Bachelor of Commerce, Calicut University</p>
        </td>
      </tr></table></body></html>`,
    expect: {
      "Full name": "Priya Nair",
      Email: "priya.nair@example.com",
      Phone: "+91 90000 11111",
      Location: "Kochi, Kerala",
      "Current title": "Business Analyst",
      "Current company": "Technoarete Pvt. Ltd.",
      "Highest education": "Bachelor of Commerce, Calicut University",
    },
  },
  {
    name: "caps-name-with-credential",
    html: `${HEAD}
      <div style="padding:40px">
        <h1 style="font-size:24px;margin:0;letter-spacing:2px">ARJUN MENON, PMP</h1>
        <p style="font-size:11px;margin:4px 0">arjun.menon@example.com · +91 99887 76655 · Chennai, Tamil Nadu</p>
        <h2 style="font-size:12px;margin:20px 0 0">PROFESSIONAL EXPERIENCE</h2>
        <p style="font-size:12px;margin:0"><b>Program Manager</b></p>
        <p style="font-size:11px;margin:0">Infosys Limited</p>
        <p style="font-size:11px;margin:0">Feb 2019 – Present</p>
        <h2 style="font-size:12px;margin:20px 0 0">EDUCATION</h2>
        <p style="font-size:11px;margin:0">MBA, IIM Kozhikode</p>
      </div></body></html>`,
    expect: {
      "Full name": "ARJUN MENON",
      Email: "arjun.menon@example.com",
      Phone: "+91 99887 76655",
      Location: "Chennai, Tamil Nadu",
      "Current title": "Program Manager",
      "Current company": "Infosys Limited",
      "Highest education": "MBA, IIM Kozhikode",
    },
  },
  {
    name: "curriculum-vitae-heading",
    html: `${HEAD}
      <div style="padding:40px">
        <p style="font-size:20px;margin:0">CURRICULUM VITAE</p>
        <p style="font-size:18px;margin:8px 0 0">Meera Krishnan</p>
        <p style="font-size:11px;margin:4px 0">meera.k@example.com | 9123456780 | Hyderabad</p>
        <p style="font-size:12px;margin:20px 0 0">Work Experience</p>
        <p style="font-size:11px;margin:0">HR Manager</p>
        <p style="font-size:11px;margin:0">Dr. Reddy's Laboratories</p>
        <p style="font-size:11px;margin:0">Aug 2017 - Present</p>
        <p style="font-size:12px;margin:20px 0 0">Education</p>
        <p style="font-size:11px;margin:0">MA Human Resource Management, Osmania University</p>
      </div></body></html>`,
    expect: {
      "Full name": "Meera Krishnan",
      Email: "meera.k@example.com",
      Phone: "9123456780",
      Location: "Hyderabad",
      "Current title": "HR Manager",
      "Current company": "Dr. Reddy's Laboratories",
      "Highest education": "MA Human Resource Management, Osmania University",
    },
  },

  /* The regression. A designed page: the name shares its line with a tagline
     in small type, and the stat grid below prints all-caps labels that look
     exactly like a name once the page is flattened. */
  {
    name: "designed-header-with-stats",
    html: `${HEAD}
      <div style="padding:36px 40px">
        <div style="display:flex;align-items:baseline;gap:14px">
          <span style="font-size:19px;font-weight:700">Kavya Raman</span>
          <span style="font-size:7px">0 → 1 Builder &amp; Systems Thinker</span>
        </div>
        <p style="font-size:9px;margin:6px 0 0">Head of Platform · Northwind Labs</p>
        <p style="font-size:8px;margin:4px 0 0">Platform Engineering · Product Strategy · Growth · 7 Yrs Scaling Ops</p>
        <p style="font-size:8px;margin:4px 0 0">kavya.raman@example.com +91 9000012345 kavyaraman.in in/kavya-raman Chennai, India</p>

        <div style="position:relative;height:56px;margin-top:22px">
          <div style="position:absolute;left:0;top:0;font-size:11px">100K +</div>
          <div style="position:absolute;left:0;top:15px;font-size:7px">PUBLICATION RECORDS</div>
          <div style="position:absolute;left:120px;top:0;font-size:11px">20 %</div>
          <div style="position:absolute;left:120px;top:15px;font-size:7px">OPERATIONAL EFFICIENCY</div>
          <div style="position:absolute;left:250px;top:0;font-size:11px">1,000 +</div>
          <div style="position:absolute;left:250px;top:15px;font-size:7px">DAILY ACTIVE PLATFORM</div>
          <div style="position:absolute;left:380px;top:0;font-size:11px">1,000 +</div>
          <div style="position:absolute;left:380px;top:15px;font-size:7px">VERIFIED SUMMITS INDEXED</div>
          <div style="position:absolute;left:510px;top:0;font-size:11px">1,000 +</div>
          <div style="position:absolute;left:510px;top:24px;font-size:7px">MANAGED ACTIVE USERS</div>
        </div>

        <p style="font-size:9px;margin:26px 0 0;letter-spacing:1px">PLATFORM BUILDING &amp; 0 → 1 PRODUCT EXECUTION</p>
        <p style="font-size:9px;margin:10px 0 0">Head of Platform Northwind Labs FLAGSHIP VENTURE Mar 2021 – Present | Chennai, India</p>
        <p style="font-size:8px;margin:2px 0 0">Built the platform and the agent pipeline.</p>
        <p style="font-size:9px;margin:10px 0 0">AI Product Consultant Halcyon Systems PRODUCT ADVISORY June 2019 – Feb 2021</p>
        <p style="font-size:9px;margin:10px 0 0">Product Operations Lead Meridian Retail Group PLATFORM SCALE July 2017 – May 2019 | Chennai, India</p>

        <p style="font-size:9px;margin:26px 0 0;letter-spacing:1px">EDUCATION CERTIFICATIONS</p>
        <div style="display:flex;gap:40px;margin-top:8px">
          <span style="font-size:9px">Bachelor of Computer Applications (BCA)</span>
          <span style="font-size:9px">Professional Scrum Master I</span>
        </div>
      </div></body></html>`,
    expect: {
      "Full name": "Kavya Raman",
      Email: "kavya.raman@example.com",
      Phone: "+91 9000012345",
      Location: "Chennai",
      LinkedIn: "linkedin.com/in/kavya-raman",
      Website: "kavyaraman.in",
      "Current title": "Head of Platform",
      "Current company": "Northwind Labs",
      "Highest education": "Bachelor of Computer Applications (BCA)",
    },
  },
];

/* ---------- static server ---------- */

function serveUi() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
      const file = normalize(join(UI, rel));
      if (!file.startsWith(UI + sep)) { res.writeHead(403).end(); return; }
      const body = await readFile(file);
      res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

/* ---------- drive the page ---------- */

async function extract(page, base, pdfPath) {
  await page.goto(base + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelectorAll("#roleChips .opt").length > 0);

  await page.fill("#roleInput", "Product Manager");
  await page.click("#next");
  await page.waitForSelector("#taskChips .opt");
  await page.click("#taskChips .opt");
  await page.click("#next");

  await page.waitForSelector("#file", { state: "attached" });
  await page.setInputFiles("#file", pdfPath);
  await page.waitForFunction(
    () => /fields found|No file|scanned/i.test(document.querySelector("#fileHint")?.textContent || ""),
    null,
    { timeout: 40000 }
  );

  await page.click("#next");
  await page.waitForSelector("#facts .fact");

  return page.evaluate(() => {
    const out = {};
    for (const f of document.querySelectorAll("#facts .fact")) {
      out[f.dataset.fact] = f.querySelector("input")?.value?.trim() || "";
    }
    return {
      facts: out,
      found: Object.values(out).filter(Boolean).length,
      total: Object.keys(out).length,
      hint: document.querySelector("#fileHint")?.textContent?.trim() || "",
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

/* ---------- assertions ---------- */

const norm = (s) => String(s).toLowerCase().replace(/\s+/g, " ").replace(/[.,;]+$/, "").trim();

function compare(expected, actual) {
  const rows = [];
  for (const [k, want] of Object.entries(expected)) {
    const got = actual[k] || "";
    rows.push({ field: k, want, got, ok: norm(got) === norm(want) });
  }
  return rows;
}

/* ---------- main ---------- */

const exe = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((p) => existsSync(p));

if (!exe) {
  console.error("No Chrome or Edge found. Install one, or set CHROME_PATH.");
  process.exit(2);
}

await rm(WORK, { recursive: true, force: true });
await mkdir(WORK, { recursive: true });

const server = await serveUi();
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || exe, headless: true });

let failures = 0;

try {
  /* 1. render each fixture to a real PDF */
  const gen = await browser.newPage();
  for (const f of FIXTURES) {
    await gen.setContent(f.html, { waitUntil: "load" });
    await gen.pdf({ path: join(WORK, f.name + ".pdf"), format: "A4", printBackground: true });
  }
  await gen.close();

  /* 2. run each PDF through the real page */
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  /* ui-sdk is a CDN; the test must not depend on the network */
  await page.route("https://ui-sdk.dev/**", (r) => r.abort());

  for (const f of FIXTURES) {
    const res = await extract(page, base, join(WORK, f.name + ".pdf"));
    const rows = compare(f.expect, res.facts);
    const bad = rows.filter((r) => !r.ok);

    console.log(`\n${bad.length ? "FAIL" : "PASS"}  ${f.name}  (${res.found}/${res.total} fields)`);
    for (const r of rows) {
      if (r.ok) continue;
      console.log(`        ${r.field}`);
      console.log(`          want: ${r.want}`);
      console.log(`          got : ${r.got || "—"}`);
    }
    if (res.overflow !== 0) {
      console.log(`        layout: ${res.overflow}px horizontal overflow`);
      bad.push({ field: "layout" });
    }
    if (bad.length) failures++;
  }

  /* 3. the owner's own file, if pointed at it. Assertions are generic on
        purpose: the repo must not carry anyone's personal data. */
  const real = process.env.CO_RESUME;
  if (real && existsSync(real)) {
    const res = await extract(page, base, real);
    const name = res.facts["Full name"] || "";
    const problems = [];
    if (res.found < res.total) problems.push(`${res.total - res.found} field(s) not found`);
    if (!/^[A-Za-z][A-Za-z.' -]+$/.test(name)) problems.push(`name is not a name: "${name}"`);
    if (name.split(/\s+/).length < 2) problems.push(`name has one word: "${name}"`);
    if (/\d|[+%@]/.test(name)) problems.push(`name contains a digit or symbol: "${name}"`);
    if (/^(managed|publication|operational|daily|verified|records|efficiency|platform|summits|indexed|users|gain)\b/i.test(name)) {
      problems.push(`name is a stat label: "${name}"`);
    }
    console.log(`\n${problems.length ? "FAIL" : "PASS"}  real resume  (${res.found}/${res.total} fields)`);
    console.log(`        name: ${name || "—"}`);
    console.log(`        title: ${res.facts["Current title"] || "—"} at ${res.facts["Current company"] || "—"}`);
    for (const p of problems) console.log(`        ${p}`);
    if (problems.length) failures++;
  } else {
    console.log("\nSKIP  real resume  (set CO_RESUME=<path> to include it)");
  }

  if (pageErrors.length) {
    console.log("\nPAGE ERRORS");
    for (const e of pageErrors) console.log("  " + e);
    failures++;
  }

  console.log(`\n${failures ? failures + " failing" : "all passing"}`);
} finally {
  await browser.close();
  server.close();
}

process.exit(failures ? 1 : 0);
