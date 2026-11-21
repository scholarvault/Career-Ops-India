// Headless run, for a cron job or a CI step.
//
// The app is local-first, but "run this every morning and mail me the list" is
// a real workflow, and it should not need a window. This script runs discovery
// with the browser-backed sources off by default, writes a JSON report, and
// exits non-zero when nothing came back.
//
//   pnpm tsx scripts/ci-run.ts --role "Product Manager" --city Chennai --out report.json
//
// Flags:
//   --role <text>      required
//   --city <text>      optional, repeatable
//   --limit <n>        max postings, default 40
//   --min-score <n>    only keep postings at or above this score, default 0
//   --sources <list>   comma-separated: public,naukri,indeed (default public)
//   --out <file>       write the report here (default stdout)
//   --quiet            no progress line on stderr

import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { discoverJobs, type JobRequest } from "../server/lib/discovery";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

type Args = {
  role: string;
  cities: string[];
  limit: number;
  minScore: number;
  sources: string[];
  out: string;
  quiet: boolean;
};

function parse(argv: string[]): Args {
  const a: Args = {
    role: "",
    cities: [],
    limit: 40,
    minScore: 0,
    sources: ["public"],
    out: "",
    quiet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => argv[++i] ?? "";
    if (k === "--role") a.role = v();
    else if (k === "--city") a.cities.push(v());
    else if (k === "--limit") a.limit = Number(v()) || a.limit;
    else if (k === "--min-score") a.minScore = Number(v()) || 0;
    else if (k === "--sources") a.sources = v().split(",").map((s) => s.trim()).filter(Boolean);
    else if (k === "--out") a.out = v();
    else if (k === "--quiet") a.quiet = true;
  }
  return a;
}

async function main(): Promise<number> {
  const args = parse(process.argv.slice(2));
  if (!args.role) {
    process.stderr.write("ci-run: --role is required\n");
    return 2;
  }

  const req: JobRequest = {
    role: args.role,
    ...(args.cities.length ? { cities: args.cities } : {}),
    limit: args.limit,
    sources: args.sources,
    profileDir: join(ROOT, "data", "browser-profile"),
  };

  if (!args.quiet) process.stderr.write(`ci-run: ${args.role} · ${args.sources.join("+")}\n`);

  const result = await discoverJobs(req);
  /* `limit` is a per-source hint inside discovery; for a report it should mean
     "at most this many rows", best score first. */
  const kept = result.jobs
    .filter((j) => j.score >= args.minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, args.limit);

  const report = {
    ranAt: new Date().toISOString(),
    request: { role: args.role, cities: args.cities, sources: args.sources, limit: args.limit, minScore: args.minScore },
    total: result.total,
    matched: result.matched,
    kept: kept.length,
    connectors: result.connectors,
    jobs: kept.map((j) => ({
      id: j.id,
      title: j.title,
      company: j.company,
      location: j.location,
      source: j.source,
      score: j.score,
      url: j.sourceUrl,
      posted: j.datePosted ?? null,
      firstSeen: j.firstSeenAt,
      missing: j.miss ?? [],
    })),
  };

  const json = JSON.stringify(report, null, 2);
  if (args.out) {
    await writeFile(args.out, json, "utf8");
    if (!args.quiet) process.stderr.write(`ci-run: wrote ${kept.length} postings to ${args.out}\n`);
  } else {
    process.stdout.write(json + "\n");
  }

  /* A run that found nothing is a failed run for a cron job, not a success. */
  return kept.length ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(`ci-run: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  });
