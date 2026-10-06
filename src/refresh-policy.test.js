import assert from "node:assert/strict";
import test from "node:test";
import {
  AA_INDEX_VERSION, BASELINE, JOBS, MIN_AA_ROWS, aaIndexVersion, packValues, parseAaVersion,
  snapshot, unpackValues,
} from "./briefing-data.js";
import {
  SEARCH_MAX_USES, SHARE_REFRESH_DAYS, SHARE_SKIPPED, VALUATIONS_FULL_RUN_SKIP,
  VALUATIONS_MIN_START_MS, WEB_SEARCH_TOOL, orderedModelJobs, parseJobsQuery,
  shareRefreshDue, shareSkipReason, valuationsTimeSkipReason, webSearchTool,
} from "./refresh-policy.js";

const SINGLE_TOPIC = ["models", "users", "share", "capital", "energy"];

test("web search uses the filtered tool and caps each call", () => {
  assert.equal(WEB_SEARCH_TOOL, "web_search_20260318");
  assert.equal(SEARCH_MAX_USES.valuations, 4);
  assert.equal(SEARCH_MAX_USES.models, 2);
  assert.equal(SEARCH_MAX_USES.share, 2);
  assert.equal(SEARCH_MAX_USES.energy, 2);
  assert.equal(SEARCH_MAX_USES.users, 3);
  assert.equal(SEARCH_MAX_USES.capital, 3);
  for (const id of SINGLE_TOPIC) {
    assert.ok(SEARCH_MAX_USES[id] >= 2 && SEARCH_MAX_USES[id] <= 3, id);
    const tool = webSearchTool(id);
    assert.equal(tool.type, WEB_SEARCH_TOOL);
    assert.equal(tool.name, "web_search");
    assert.equal(tool.max_uses, SEARCH_MAX_USES[id]);
    assert.equal(tool.response_inclusion, "excluded");
    assert.equal(tool.allowed_callers, undefined);
    assert.equal(tool.user_location, undefined);
    assert.equal(tool.max_content_tokens, undefined);
    assert.match(JOBS[id].prompt, /Do not search again/);
    assert.match(JOBS[id].prompt, /final text block must be a single JSON object/);
  }
  const models = webSearchTool("models");
  assert.deepEqual(models.allowed_domains, ["artificialanalysis.ai"]);
  assert.equal(webSearchTool("users").allowed_domains, undefined);
  const haiku = webSearchTool("models", "claude-haiku-4-5-20251001");
  assert.deepEqual(haiku.allowed_callers, ["direct"]);
  assert.deepEqual(webSearchTool("energy", "claude-haiku-4-5").allowed_callers, ["direct"]);
  const valuations = webSearchTool("valuations", "claude-sonnet-4-6");
  assert.equal(valuations.type, "web_search_20260318");
  assert.equal(valuations.max_uses, 4);
  assert.equal(valuations.response_inclusion, undefined);
  assert.deepEqual(valuations.allowed_callers, ["direct"]);
  assert.deepEqual(webSearchTool("valuations").allowed_callers, ["direct"]);
  assert.equal(valuations.allowed_domains, undefined);
  assert.equal(SEARCH_MAX_USES.markets, undefined);
  assert.throws(() => webSearchTool("markets"), /no search cap/);
});

test("jobs query selects a subset and the default run puts valuations last", () => {
  const all = Object.keys(JOBS);
  const implicit = parseJobsQuery(undefined, all);
  assert.equal(implicit.explicit, false);
  assert.deepEqual(implicit.ids, all);
  assert.deepEqual(orderedModelJobs(all, false), ["models", "users", "share", "capital", "energy", "valuations"]);

  const only = parseJobsQuery(" valuations ", all);
  assert.equal(only.explicit, true);
  assert.deepEqual(only.ids, ["valuations"]);
  assert.deepEqual(orderedModelJobs(only.ids, true), ["valuations"]);

  const ordered = parseJobsQuery("valuations,models,models", all);
  assert.deepEqual(ordered.ids, ["valuations", "models"]);
  assert.deepEqual(orderedModelJobs(ordered.ids, true), ["valuations", "models"]);
  assert.deepEqual(parseJobsQuery(["energy", "markets"], all).ids, ["energy", "markets"]);

  const unknown = parseJobsQuery("models,nope", all);
  assert.match(unknown.error, /unknown jobs: nope/);
  assert.equal(parseJobsQuery("", all).explicit, false);
});

test("web-share is skipped until seven UTC days after the last success", () => {
  assert.equal(SHARE_REFRESH_DAYS, 7);
  const meta = {
    share: {
      checkedAt: "2026-09-27T08:26:23.077Z",
      at: "2026-09-10T08:25:35.922Z",
      changedAt: "2026-09-10T08:25:35.922Z",
      failed: false,
    },
  };
  assert.equal(shareRefreshDue(meta, "2026-09-27T08:26:23.077Z"), false);
  assert.equal(shareRefreshDue(meta, "2026-10-03T08:00:00.000Z"), false);
  /* The check finished after the cron hour. Seven calendar days later the
     morning run is still short of 7×24h, and it is due anyway. */
  assert.equal(shareRefreshDue(meta, "2026-10-04T08:00:00.000Z"), true);
  assert.equal(shareRefreshDue(meta, "2026-10-05T08:00:00.000Z"), true);
});

test("the 21:00Z share skip names the last success and the next due date", () => {
  const meta = {
    share: {
      at: "2026-09-27T08:26:23.077Z",
      checkedAt: "2026-09-27T08:26:23.077Z",
      changedAt: "2026-09-10T08:25:35.922Z",
    },
  };
  assert.equal(shareRefreshDue(meta, "2026-10-02T21:00:03.208Z"), false);
  assert.equal(
    shareSkipReason(meta, "2026-10-02T21:00:03.208Z"),
    "weekly; last run 2026-09-27, next due 2026-10-04",
  );
  assert.match(VALUATIONS_FULL_RUN_SKIP, /\?jobs=valuations/);
  assert.equal(VALUATIONS_MIN_START_MS, 120_000);
  assert.match(valuationsTimeSkipReason(30_000), /30000ms/);
});

test("a skipped share night is not a failure and does not move the clock", () => {
  assert.equal(SHARE_SKIPPED.skipped, "share");
  const recentFailure = {
    share: {
      checkedAt: "2026-09-27T08:26:23.077Z",
      failed: true,
      error: "anthropic 400: credit balance is too low",
      erroredAt: "2026-09-28T08:25:03.882Z",
    },
  };
  assert.equal(shareRefreshDue(recentFailure, "2026-09-28T08:25:03.882Z"), false);
  assert.equal(shareRefreshDue({ share: { at: "2026-09-20T08:00:00.000Z" } }, "2026-09-27T08:00:00.000Z"), true);
  assert.equal(shareRefreshDue({}, "2026-09-28T08:00:00.000Z"), true);
  assert.equal(shareRefreshDue({ share: { checkedAt: "not-a-date" } }, "2026-09-28T08:00:00.000Z"), true);
  assert.equal(shareRefreshDue(null, "2026-09-28T08:00:00.000Z"), true);
});

test("job names are trimmed, lowercased, and split on commas or spaces", () => {
  const all = Object.keys(JOBS);
  assert.deepEqual(parseJobsQuery("Valuations", all).ids, ["valuations"]);
  assert.deepEqual(parseJobsQuery(" valuations ", all).ids, ["valuations"]);
  assert.deepEqual(parseJobsQuery("models, Energy", all).ids, ["models", "energy"]);
  assert.deepEqual(parseJobsQuery("models Energy", all).ids, ["models", "energy"]);
  assert.deepEqual(parseJobsQuery("models,, energy", all).ids, ["models", "energy"]);
  assert.deepEqual(parseJobsQuery([" Models ", "energy"], all).ids, ["models", "energy"]);
  const unknown = parseJobsQuery("models, Nope", all);
  assert.match(unknown.error, /unknown jobs: nope/);
  assert.equal(parseJobsQuery(" , ", all).error, "jobs is empty");
});

test("models apply keeps a current index version and rejects fewer than five rows", () => {
  const prompt = JOBS.models.prompt;
  assert.match(prompt, /current index version/);
  assert.match(prompt, /"version":"v4\.3\.2"/);
  assert.match(prompt, /at most once/);
  assert.match(prompt, /parentheses/);
  assert.match(prompt, /Chinese models/);
  assert.match(prompt, /eight distinct model families/);
  assert.match(prompt, /Do not search again/);
  assert.match(prompt, /final text block must be a single JSON object/);
  assert.doesNotMatch(prompt, /v4\.2/);
  assert.equal(MIN_AA_ROWS, 5);

  const row = (model, score, extra = {}) => ({ model, lab: "Lab", score, cn: false, ...extra });
  const namesBefore = BASELINE.aaIndex.map((item) => item.model);
  assert.throws(
    () => JOBS.models.apply(BASELINE, { version: "v4.3.2", models: [row("Claude Fable 5.1", 66)] }),
    (error) => error.message === "too few rows: 1" && error.panelError === true,
  );
  assert.deepEqual(BASELINE.aaIndex.map((item) => item.model), namesBefore);

  assert.throws(() => JOBS.models.apply(BASELINE, {
    models: [
      row("A", 10),
      { model: "", lab: "Lab", score: 9 },
      { model: "B", lab: "Lab", score: 0 },
      row("C", 8),
      row("D", 7),
      row("E", 6),
    ],
  }), /too few rows: 4/);

  const five = [1, 2, 3, 4, 5].map((n) => row(`Model ${n}`, 40 + n));
  const next = JOBS.models.apply({ ...BASELINE, aaVersion: "v4.2" }, { version: "4.3.2", models: five });
  assert.equal(next.aaIndex.length, 5);
  assert.equal(next.aaIndex[0].model, "Model 5");
  assert.equal(next.aaIndex[0].score, 45);
  assert.equal(next.aaVersion, "v4.3.2");
  assert.equal(parseAaVersion("not a version"), "");

  const kept = JOBS.models.apply({ ...BASELINE, aaVersion: "v4.2" }, { models: five });
  assert.equal(kept.aaVersion, "v4.2");

  const nine = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => row(`M${n}`, n));
  assert.equal(JOBS.models.apply(BASELINE, { version: "v4.3.2", models: nine }).aaIndex.length, 8);

  const packed = packValues(next, null);
  assert.equal(packed.aaVersion, "v4.3.2");
  assert.equal(packed.aa.length, 5);
  const unpacked = unpackValues(BASELINE, { aa: packed.aa, aaVersion: packed.aaVersion });
  assert.equal(unpacked.aaVersion, "v4.3.2");
  assert.equal(unpacked.aaIndex[0].score, 45);
  assert.equal(snapshot(unpacked).scale, "v4.3.2");
  assert.equal(snapshot(BASELINE).scale, AA_INDEX_VERSION);
  assert.equal(aaIndexVersion({}), AA_INDEX_VERSION);
});
