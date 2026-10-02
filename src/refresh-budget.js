/* Wall-clock budget for the nightly refresh.

   Vercel kills the isolate at maxDuration. That kill is not a JavaScript
   exception: the catch path never runs, so there is no commit and no
   failure alert. The deadline here is earlier, by a tail reserved for the
   git writes and the alert. */

export const MAX_DURATION_MS = 300_000;
export const TAIL_RESERVE_MS = 60_000;
/* A model retry is another search loop. Don't start one unless the tail
   can still hold a call at least this long, and at least as long as the
   attempt that just failed. */
export const MIN_MODEL_RETRY_MS = 120_000;
export const MIN_FAST_RETRY_MS = 15_000;

export const createBudget = ({
  startedAt = Date.now(),
  maxDurationMs = MAX_DURATION_MS,
  tailReserveMs = TAIL_RESERVE_MS,
  now = Date.now,
} = {}) => {
  const deadline = startedAt + maxDurationMs - tailReserveMs;
  return {
    startedAt,
    deadline,
    maxDurationMs,
    tailReserveMs,
    now,
    remainingMs() {
      return deadline - now();
    },
    expired() {
      return this.remainingMs() <= 0;
    },
  };
};

/* Retry only a failure that did not already spend the call, and only when
   the remaining budget can cover another attempt.

   Billed: any 2xx, or an error flagged billed (the body parsed as a
   message, or usage was present). A bad JSON reply and a valuation
   judgment that fails after a successful search are in this bucket — a
   second search would bill the job twice.
   Permanent: other 4xx, including the workspace-limit and empty-credit
   refusals. Those come back in well under a second and do not succeed
   on a second try.
   Aborted: the time budget already fired.
   Transient: network errors, 408, 429, and 5xx (including 529). */
export const shouldRetry = ({
  billed = false,
  aborted = false,
  spendCap = false,
  httpStatus = null,
  attemptDurationMs = 0,
  remainingMs = 0,
  kind = "model",
  minModelRetryMs = MIN_MODEL_RETRY_MS,
  minFastRetryMs = MIN_FAST_RETRY_MS,
} = {}) => {
  if (spendCap) return { retry: false, reason: "spend-cap" };
  if (aborted) return { retry: false, reason: "aborted" };
  if (billed || (typeof httpStatus === "number" && httpStatus >= 200 && httpStatus < 300)) {
    return { retry: false, reason: "billed" };
  }
  if (typeof httpStatus === "number" && httpStatus >= 400 && httpStatus < 500 && httpStatus !== 408 && httpStatus !== 429) {
    return { retry: false, reason: "permanent" };
  }
  if (typeof httpStatus === "number" && httpStatus >= 300 && httpStatus < 400) {
    return { retry: false, reason: "not-transient" };
  }
  const floor = kind === "fast" ? minFastRetryMs : minModelRetryMs;
  const needMs = Math.max(Number(attemptDurationMs) || 0, floor);
  if (!(remainingMs >= needMs)) return { retry: false, reason: "time", needMs };
  return { retry: true, reason: "transient" };
};

export const attemptWithRetry = async (run, { decide, remainingMs, now = Date.now }) => {
  const started = now();
  try {
    return await run(1);
  } catch (first) {
    const decision = decide({
      billed: Boolean(first && first.billed),
      aborted: Boolean(first && (first.aborted || first.timedOut)),
      spendCap: Boolean(first && first.spendCap),
      httpStatus: first && first.httpStatus != null ? first.httpStatus : null,
      attemptDurationMs: Math.max(0, now() - started),
      remainingMs: remainingMs(),
    });
    if (!decision.retry) {
      if (first && typeof first === "object") first.retrySkipped = decision.reason;
      throw first;
    }
    try {
      return await run(2);
    } catch (second) {
      const message = `${first && first.message ? first.message : first} (retry: ${second && second.message ? second.message : second})`;
      const error = new Error(message);
      error.billed = Boolean(second && second.billed);
      error.httpStatus = second && second.httpStatus != null ? second.httpStatus : null;
      throw error;
    }
  }
};

/* Run the panels together and stop waiting at the deadline. Slots already
   marked are not overwritten, so a result that landed is kept and a call
   still pending becomes `time budget exhausted`. `schedule` returns a
   cancel function; the timer is cleared when every job finishes first. */
export const settleWithinBudget = async (jobs, {
  remainingMs,
  schedule = (ms, fn) => {
    const timer = setTimeout(fn, ms);
    return () => clearTimeout(timer);
  },
} = {}) => {
  const slots = new Map();
  const controllers = new Map();
  for (const job of jobs) {
    slots.set(job.id, { status: "pending", value: undefined, error: null, timedOut: false });
  }

  const runners = jobs.map(async (job) => {
    const controller = new AbortController();
    controllers.set(job.id, controller);
    if (remainingMs() <= 0) {
      slots.set(job.id, {
        status: "rejected",
        value: undefined,
        error: Object.assign(new Error("time budget exhausted before start"), { aborted: true }),
        timedOut: true,
      });
      return;
    }
    try {
      const value = await job.run(controller.signal);
      const slot = slots.get(job.id);
      if (slot.status === "pending") {
        slots.set(job.id, { status: "fulfilled", value, error: null, timedOut: false });
      }
    } catch (error) {
      const slot = slots.get(job.id);
      if (slot.status === "pending") {
        slots.set(job.id, {
          status: "rejected",
          value: undefined,
          error,
          timedOut: Boolean(controller.signal.aborted) || Boolean(error && error.aborted),
        });
      }
    }
  });

  let cancel = () => {};
  const budgetHit = new Promise((resolve) => {
    cancel = schedule(Math.max(0, remainingMs()), () => {
      for (const [id, slot] of slots) {
        if (slot.status !== "pending") continue;
        slots.set(id, {
          status: "rejected",
          value: undefined,
          error: Object.assign(new Error("time budget exhausted"), { aborted: true }),
          timedOut: true,
        });
        const controller = controllers.get(id);
        if (controller) controller.abort();
      }
      resolve("budget");
    });
  });

  await Promise.race([Promise.all(runners).then(() => "done"), budgetHit]);
  cancel();
  return Object.fromEntries(slots);
};
