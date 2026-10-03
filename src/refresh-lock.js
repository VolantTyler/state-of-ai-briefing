/* Contents-API sha race, and the overlap guard the Vercel function used.

   The Actions runner does not acquire this lock. Workflow concurrency is
   the overlap guard there, so a run no longer writes dev/refresh-lock.json.
   `writeWithFreshSha` is still how data files are committed.

   Creating a file without a blob sha fails when the file exists (422
   "sha wasn't supplied"), which is an atomic acquire. A lock older than
   the old function maxDuration is stale; a live one is refused.

   Data writes are the other race: the sha has to be read immediately
   before the PUT, and a 409 or a sha 422 is retried once. The lock acquire
   must not use that retry. A retry that overwrites a file someone else
   just created would steal a fresh lock. */

export const LOCK_PATH = "dev/refresh-lock.json";
export const LOCK_STALE_MS = 6 * 60 * 1000;

export const isShaConflict = (status, body = "") => {
  if (status === 409) return true;
  if (status === 422 && /sha/i.test(String(body))) return true;
  return false;
};

const errorBody = (error) => `${error && error.body ? error.body : ""} ${error && error.message ? error.message : ""}`;

export const lockText = (runAt) => JSON.stringify({
  runAt,
  startedAt: runAt,
  holder: "api/refresh",
}) + "\n";

export const lockStartedMs = (text) => {
  try {
    const parsed = JSON.parse(text);
    const ms = Date.parse(parsed && (parsed.startedAt || parsed.runAt));
    return Number.isFinite(ms) ? ms : null;
  } catch (e) {
    return null;
  }
};

export const lockRunAt = (text) => {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed.runAt === "string" ? parsed.runAt : null;
  } catch (e) {
    return null;
  }
};

/* Missing or unreadable contents are stale so a corrupt lock cannot stick. */
export const lockIsStale = (text, nowMs, staleMs = LOCK_STALE_MS) => {
  const started = lockStartedMs(text);
  if (started == null) return true;
  return nowMs - started >= staleMs;
};

const lockedSince = (text, nowMs) => {
  const started = lockStartedMs(text);
  return started == null ? null : new Date(started).toISOString();
};

export async function acquireRefreshLock({
  read,
  create,
  update,
  runAt,
  nowMs,
  staleMs = LOCK_STALE_MS,
}) {
  const text = lockText(runAt);
  try {
    await create(text);
    return { acquired: true, stolen: false, lockedSince: null };
  } catch (error) {
    if (!isShaConflict(error && error.status, errorBody(error))) throw error;
  }

  const existing = await read();
  if (!existing || !existing.sha) {
    try {
      await create(text);
      return { acquired: true, stolen: false, lockedSince: null };
    } catch (error) {
      if (!isShaConflict(error && error.status, errorBody(error))) throw error;
      const latest = await read();
      return {
        acquired: false,
        stolen: false,
        lockedSince: lockedSince(latest && latest.text, nowMs),
      };
    }
  }

  if (!lockIsStale(existing.text, nowMs, staleMs)) {
    return { acquired: false, stolen: false, lockedSince: lockedSince(existing.text, nowMs) };
  }

  try {
    await update(existing.sha, text);
    return { acquired: true, stolen: true, lockedSince: null };
  } catch (error) {
    if (!isShaConflict(error && error.status, errorBody(error))) throw error;
    const latest = await read();
    if (!latest || !latest.sha || lockIsStale(latest.text, nowMs, staleMs)) throw error;
    return { acquired: false, stolen: false, lockedSince: lockedSince(latest.text, nowMs) };
  }
}

/* Delete only our lock. A sha miss is retried once; if the file now belongs
   to another run, leave it. */
export async function releaseRefreshLock({ read, remove, runAt }) {
  const once = async () => {
    const current = await read();
    if (!current || !current.sha) return { released: true, missing: true };
    const holder = lockRunAt(current.text);
    if (runAt && holder && holder !== runAt) return { released: false, reason: "not-holder" };
    await remove(current.sha);
    return { released: true };
  };
  try {
    return await once();
  } catch (error) {
    if (!isShaConflict(error && error.status, errorBody(error))) throw error;
    return await once();
  }
}

/* Read the blob sha and PUT. On a sha conflict, read again and PUT once more. */
export async function writeWithFreshSha({ read, write }) {
  const once = async () => {
    const current = await read();
    return write(current && current.sha ? current.sha : null);
  };
  try {
    return await once();
  } catch (error) {
    if (!isShaConflict(error && error.status, errorBody(error))) throw error;
    return await once();
  }
}
