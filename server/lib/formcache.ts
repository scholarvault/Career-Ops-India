// A per-site memory of the fields an application form asks for.
//
// The first apply to a Greenhouse board discovers the fields. The second one
// already knows them, so it can fill without a discovery pass. Keyed by host,
// not by URL, because every posting on a board uses the same form.
//
// The cache is a hint, never a promise: a board can change its form, so a fill
// that matches nothing falls back to a fresh detection and rewrites the cache.
// Nothing here is sent anywhere; it is a JSON file under data/.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

export type CachedField = {
  selector: string;
  label: string;
  hint: string;
  type: string;
  required: boolean;
  options?: string[];
};

type Entry = { at: string; fields: CachedField[] };
type Cache = Record<string, Entry>;

function cachePath(dataDir: string): string {
  return join(dataDir, "form-cache.json");
}

async function readCache(dataDir: string): Promise<Cache> {
  try {
    const raw = await readFile(cachePath(dataDir), "utf8");
    /* A BOM from an editor or a PowerShell round-trip would make JSON.parse
       throw and silently empty the cache. Strip it. */
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, "")) as Cache;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** The fields this host asked for last time, or null when it is new. */
export async function getForm(dataDir: string, host: string): Promise<CachedField[] | null> {
  if (!host) return null;
  const cache = await readCache(dataDir);
  const hit = cache[host];
  if (!hit || !Array.isArray(hit.fields) || !hit.fields.length) return null;
  return hit.fields;
}

/** Remember what this host asked for, so the next apply skips discovery. */
export async function putForm(dataDir: string, host: string, fields: CachedField[]): Promise<void> {
  if (!host || !fields.length) return;
  const cache = await readCache(dataDir);
  cache[host] = { at: new Date().toISOString(), fields };
  await mkdir(dirname(cachePath(dataDir)), { recursive: true });
  await writeFile(cachePath(dataDir), JSON.stringify(cache, null, 2), "utf8");
}

/** A short, honest description of what the cache knows. */
export async function cacheSummary(dataDir: string): Promise<Array<{ host: string; at: string; fields: number }>> {
  const cache = await readCache(dataDir);
  return Object.entries(cache)
    .map(([host, e]) => ({ host, at: e.at, fields: e.fields.length }))
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** Drop one host, so the next apply reads its form again. */
export async function forgetForm(dataDir: string, host: string): Promise<boolean> {
  const cache = await readCache(dataDir);
  if (!(host in cache)) return false;
  delete cache[host];
  await mkdir(dirname(cachePath(dataDir)), { recursive: true });
  await writeFile(cachePath(dataDir), JSON.stringify(cache, null, 2), "utf8");
  return true;
}
