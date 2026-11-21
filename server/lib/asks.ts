// Pending questions the agent must ask the user mid-run.
//
// The old model paused the whole queue and told the user to go answer in the
// browser panel. That is the interface this replaces: an ask is a first-class
// object with an id, a kind and an input type, and the run waits on a promise
// that the answer endpoint resolves. The console (and the MCP server) render
// the ask wherever the user actually is.
//
// Rules:
//   - an ask expires; the job is parked and the batch moves on
//   - a password is never asked for and never stored (ADR-003)
//   - a captcha is never solved; the ask is "clear it, then press Done"
//
// Nothing here touches the network or the disk. It is a small in-memory
// rendezvous with a timeout.

export type AskKind =
  | "email"
  | "otp"
  | "field"
  | "consent"
  | "captcha"
  | "password"
  | "login";

export type AskInput =
  | "text"
  | "email"
  | "tel"
  | "otp"
  | "password"
  | "select"
  | "textarea"
  /** No value to type: the user does something in the browser, then presses Done. */
  | "none";

export type PendingAsk = {
  id: string;
  jobId: string;
  jobTitle?: string;
  kind: AskKind;
  label: string;
  detail?: string;
  inputType: AskInput;
  options?: string[];
  /** Hostname the form is on, so the card can say "Indeed asks for a code". */
  site?: string;
  selector?: string;
  createdAt: string;
  expiresAt: string;
  status: "open" | "answered" | "expired" | "cancelled";
  value?: string;
};

type Waiter = {
  ask: PendingAsk;
  resolve: (value: string) => void;
  timer: ReturnType<typeof setTimeout>;
};

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const HISTORY_LIMIT = 40;

const waiters = new Map<string, Waiter>();
const history: PendingAsk[] = [];
let seq = 0;

const now = () => new Date().toISOString();

function remember(ask: PendingAsk): void {
  history.unshift(ask);
  if (history.length > HISTORY_LIMIT) history.length = HISTORY_LIMIT;
}

/**
 * Ask the user something and wait for the answer.
 *
 * Resolves with the typed value, or with "" when the ask expires or is
 * cancelled. Callers treat "" as "no answer" and park the job; they never
 * guess a value.
 */
export function ask(
  opts: Omit<PendingAsk, "id" | "createdAt" | "expiresAt" | "status"> & {
    timeoutMs?: number;
  }
): Promise<string> {
  const id = `ask_${Date.now().toString(36)}_${++seq}`;
  const timeoutMs = Math.max(5_000, Number(opts.timeoutMs) || DEFAULT_TIMEOUT_MS);
  const ask: PendingAsk = {
    id,
    jobId: opts.jobId,
    ...(opts.jobTitle ? { jobTitle: opts.jobTitle } : {}),
    kind: opts.kind,
    label: opts.label,
    ...(opts.detail ? { detail: opts.detail } : {}),
    inputType: opts.inputType,
    ...(opts.options ? { options: opts.options } : {}),
    ...(opts.site ? { site: opts.site } : {}),
    ...(opts.selector ? { selector: opts.selector } : {}),
    createdAt: now(),
    expiresAt: new Date(Date.now() + timeoutMs).toISOString(),
    status: "open",
  };

  return new Promise<string>((resolve) => {
    const timer = setTimeout(() => {
      const w = waiters.get(id);
      if (!w) return;
      waiters.delete(id);
      w.ask.status = "expired";
      remember(w.ask);
      w.resolve("");
    }, timeoutMs);
    /* Do not keep the process alive just because a question is open. */
    if (typeof timer.unref === "function") timer.unref();
    waiters.set(id, { ask, resolve, timer });
  });
}

export function answerAsk(
  id: string,
  value: string
): { ok: boolean; ask?: PendingAsk; error?: string } {
  const w = waiters.get(String(id || ""));
  if (!w) return { ok: false, error: "That question is no longer open." };
  clearTimeout(w.timer);
  waiters.delete(w.ask.id);
  w.ask.status = "answered";
  w.ask.value = String(value ?? "");
  remember(w.ask);
  w.resolve(w.ask.value);
  return { ok: true, ask: w.ask };
}

export function cancelAsk(id: string): boolean {
  const w = waiters.get(String(id || ""));
  if (!w) return false;
  clearTimeout(w.timer);
  waiters.delete(w.ask.id);
  w.ask.status = "cancelled";
  remember(w.ask);
  w.resolve("");
  return true;
}

/** Cancel every open ask, e.g. when the user stops the run. */
export function cancelAll(): number {
  const ids = [...waiters.keys()];
  for (const id of ids) cancelAsk(id);
  return ids.length;
}

export function openAsks(): PendingAsk[] {
  return [...waiters.values()].map((w) => w.ask);
}

export function askState(): { open: PendingAsk[]; recent: PendingAsk[] } {
  return { open: openAsks(), recent: history.slice(0, 12) };
}
