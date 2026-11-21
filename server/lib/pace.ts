// Human-like pacing, and one run per host at a time.
//
// Two different problems, one file:
//
//   1. A form filled in 40 ms is a bot. A form filled over a few seconds is a
//      person. The delay is jittered, not fixed, because a fixed interval is
//      its own fingerprint.
//   2. Two tabs hitting the same host at once is what actually trips a rate
//      limit. Serialising per host costs nothing when there is one run and
//      prevents the failure when there are two.
//
// Both are opt-out: CAREER_OPS_PACE_MS=0 disables the delays, which is what a
// test or a CI run wants.

const chains = new Map<string, Promise<unknown>>();

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function base(): number {
  const n = Number(process.env.CAREER_OPS_PACE_MS ?? 2000);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Between two fields: short, so a form does not take a minute. */
export function typeDelay(): number {
  const b = base();
  if (!b) return 0;
  return Math.round(b * 0.06 + Math.random() * b * 0.13);
}

/** Before a navigation or a click that changes the page: long enough to read. */
export function actionDelay(): number {
  const b = base();
  if (!b) return 0;
  return Math.round(b + Math.random() * b * 2);
}

export async function pause(ms: number): Promise<void> {
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
}

/**
 * Run `fn` after every earlier run on the same host has finished. A rejected
 * run does not poison the queue.
 */
export function serialise<T>(host: string, fn: () => Promise<T>): Promise<T> {
  const key = host || "_";
  const prev = chains.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  chains.set(key, next.catch(() => {}));
  return next;
}
