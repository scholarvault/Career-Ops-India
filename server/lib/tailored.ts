// The tailored resume, kept on disk so auto-apply can attach the exact PDF the
// user reviewed. sessionStorage dies with the tab; this does not.
//
// One record per job id:
//   data/tailored/<id>.json  { jobId, savedAt, data, pdf, pdfSha256 }
//   data/tailored/<id>.pdf   the printed A4 resume
//
// The hash is the guard: if the PDF on disk no longer matches the record, the
// engine refuses to attach it rather than send a stale CV.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { CHROME_PATH } from "./browser";

export type TailoredRecord = {
  jobId: string;
  savedAt: string;
  data: any;
  pdf: string;
  pdfSha256: string;
};

const safe = (id: string) => String(id || "job").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
const dirOf = (root: string) => join(root, "data", "tailored");

export async function saveTailored(
  root: string,
  jobId: string,
  data: any,
  html: string
): Promise<TailoredRecord> {
  if (!CHROME_PATH) throw new Error("Chrome or Edge was not found on this machine.");
  const dir = dirOf(root);
  await mkdir(dir, { recursive: true });
  const key = safe(jobId);
  const pdfPath = join(dir, `${key}.pdf`);

  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.pdf({
      path: pdfPath,
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
  } finally {
    await browser.close().catch(() => {});
  }

  const buf = await readFile(pdfPath);
  const pdfSha256 = createHash("sha256").update(buf).digest("hex");
  const rec: TailoredRecord = {
    jobId: String(jobId),
    savedAt: new Date().toISOString(),
    data,
    pdf: pdfPath,
    pdfSha256,
  };
  await writeFile(join(dir, `${key}.json`), JSON.stringify(rec, null, 2), "utf8");
  return rec;
}

export async function loadTailored(root: string, jobId: string): Promise<TailoredRecord | null> {
  const p = join(dirOf(root), `${safe(jobId)}.json`);
  if (!existsSync(p)) return null;
  try {
    const rec = JSON.parse(await readFile(p, "utf8")) as TailoredRecord;
    if (!rec || !rec.pdf || !existsSync(rec.pdf)) return null;
    return rec;
  } catch {
    return null;
  }
}

/** True when the PDF on disk still matches the hash recorded with it. */
export async function tailoredPdfIsCurrent(rec: TailoredRecord): Promise<boolean> {
  try {
    const buf = await readFile(rec.pdf);
    return createHash("sha256").update(buf).digest("hex") === rec.pdfSha256;
  } catch {
    return false;
  }
}
