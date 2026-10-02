import assert from "node:assert/strict";
import test from "node:test";
import {
  LOCK_STALE_MS,
  acquireRefreshLock,
  isShaConflict,
  lockIsStale,
  lockText,
  releaseRefreshLock,
  writeWithFreshSha,
} from "./refresh-lock.js";

const shaError = (status, body) => Object.assign(new Error(body), { status, body });

test("a sha 409 or a 422 that mentions sha is a conflict, and other 422s are not", () => {
  assert.equal(isShaConflict(409, "is at abc but expected def"), true);
  assert.equal(isShaConflict(422, '{"message":"sha wasn\'t supplied"}'), true);
  assert.equal(isShaConflict(422, "Invalid request"), false);
  assert.equal(isShaConflict(500, "sha"), false);
});

test("a lock is stale at six minutes and unreadable contents are stale", () => {
  const started = Date.parse("2026-10-02T18:16:31.000Z");
  const text = lockText("2026-10-02T18:16:31.000Z");
  assert.equal(LOCK_STALE_MS, 360_000);
  assert.equal(lockIsStale(text, started + LOCK_STALE_MS - 1), false);
  assert.equal(lockIsStale(text, started + LOCK_STALE_MS), true);
  assert.equal(lockIsStale("not-json", started), true);
  assert.equal(lockIsStale("", started), true);
});

test("creating the lock file acquires it, and a fresh lock refuses without a second create", async () => {
  const created = [];
  const acquired = await acquireRefreshLock({
    read: async () => { throw new Error("should not read"); },
    create: async (text) => { created.push(text); },
    update: async () => { throw new Error("should not update"); },
    runAt: "2026-10-02T18:16:31.000Z",
    nowMs: Date.parse("2026-10-02T18:16:31.000Z"),
  });
  assert.equal(acquired.acquired, true);
  assert.equal(acquired.stolen, false);
  assert.equal(created.length, 1);
  assert.match(created[0], /2026-10-02T18:16:31.000Z/);

  let creates = 0;
  let reads = 0;
  const refused = await acquireRefreshLock({
    read: async () => {
      reads += 1;
      return { sha: "abc", text: lockText("2026-10-02T18:16:31.000Z") };
    },
    create: async () => {
      creates += 1;
      throw shaError(422, "sha wasn't supplied");
    },
    update: async () => { throw new Error("should not steal a fresh lock"); },
    runAt: "2026-10-02T18:17:16.000Z",
    nowMs: Date.parse("2026-10-02T18:17:16.000Z"),
  });
  assert.equal(creates, 1);
  assert.equal(reads, 1);
  assert.equal(refused.acquired, false);
  assert.equal(refused.lockedSince, "2026-10-02T18:16:31.000Z");
});

test("a stale lock is taken over once, and a lost race does not overwrite the winner", async () => {
  const updates = [];
  const stolen = await acquireRefreshLock({
    read: async () => ({ sha: "old", text: lockText("2026-10-02T18:10:00.000Z") }),
    create: async () => { throw shaError(422, "sha wasn't supplied"); },
    update: async (sha, text) => { updates.push({ sha, text }); },
    runAt: "2026-10-02T18:17:16.000Z",
    nowMs: Date.parse("2026-10-02T18:17:16.000Z"),
  });
  assert.equal(stolen.acquired, true);
  assert.equal(stolen.stolen, true);
  assert.equal(updates[0].sha, "old");

  let updateTries = 0;
  const lost = await acquireRefreshLock({
    read: async () => {
      if (updateTries === 0) return { sha: "old", text: lockText("2026-10-02T18:10:00.000Z") };
      return { sha: "new", text: lockText("2026-10-02T18:17:16.000Z") };
    },
    create: async () => { throw shaError(409, "conflict"); },
    update: async () => {
      updateTries += 1;
      throw shaError(409, "sha mismatch");
    },
    runAt: "2026-10-02T18:17:20.000Z",
    nowMs: Date.parse("2026-10-02T18:17:20.000Z"),
  });
  assert.equal(updateTries, 1);
  assert.equal(lost.acquired, false);
  assert.equal(lost.lockedSince, "2026-10-02T18:17:16.000Z");
});

test("a non-sha GitHub error while acquiring is not turned into a refusal", async () => {
  await assert.rejects(() => acquireRefreshLock({
    read: async () => { throw new Error("should not read"); },
    create: async () => { throw shaError(401, "bad credentials"); },
    update: async () => {},
    runAt: "2026-10-02T18:16:31.000Z",
    nowMs: Date.parse("2026-10-02T18:16:31.000Z"),
  }), (error) => error.status === 401);
});

test("release deletes only our lock and retries one sha miss", async () => {
  const removed = [];
  const released = await releaseRefreshLock({
    read: async () => ({ sha: "abc", text: lockText("2026-10-02T18:16:31.000Z") }),
    remove: async (sha) => { removed.push(sha); },
    runAt: "2026-10-02T18:16:31.000Z",
  });
  assert.equal(released.released, true);
  assert.deepEqual(removed, ["abc"]);

  const kept = await releaseRefreshLock({
    read: async () => ({ sha: "theirs", text: lockText("2026-10-02T18:20:00.000Z") }),
    remove: async () => { throw new Error("deleted someone else's lock"); },
    runAt: "2026-10-02T18:16:31.000Z",
  });
  assert.equal(kept.released, false);
  assert.equal(kept.reason, "not-holder");

  let reads = 0;
  const retried = await releaseRefreshLock({
    read: async () => {
      reads += 1;
      return { sha: reads === 1 ? "stale" : "fresh", text: lockText("2026-10-02T18:16:31.000Z") };
    },
    remove: async (sha) => {
      if (sha === "stale") throw shaError(409, "sha mismatch");
    },
    runAt: "2026-10-02T18:16:31.000Z",
  });
  assert.equal(retried.released, true);
  assert.equal(reads, 2);
});

test("a contents write reads the sha immediately before the PUT and retries one conflict", async () => {
  const shas = ["one", "two"];
  const writes = [];
  let reads = 0;
  const result = await writeWithFreshSha({
    read: async () => {
      reads += 1;
      return { sha: shas[reads - 1], text: "" };
    },
    write: async (sha) => {
      writes.push(sha);
      if (sha === "one") throw shaError(422, "sha wasn't supplied");
      return { ok: sha };
    },
  });
  assert.deepEqual(writes, ["one", "two"]);
  assert.equal(result.ok, "two");
  assert.equal(reads, 2);

  let otherReads = 0;
  await assert.rejects(() => writeWithFreshSha({
    read: async () => {
      otherReads += 1;
      return { sha: "x", text: "" };
    },
    write: async () => { throw shaError(500, "unavailable"); },
  }), (error) => error.status === 500);
  assert.equal(otherReads, 1);
});

test("a missing file is created without a sha, which is what the lock uses and what usage.json missed", async () => {
  const writes = [];
  await writeWithFreshSha({
    read: async () => ({ sha: null, text: null }),
    write: async (sha) => { writes.push(sha); return { created: true }; },
  });
  assert.deepEqual(writes, [null]);
});
