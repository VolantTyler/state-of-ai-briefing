import assert from "node:assert/strict";
import test from "node:test";
import { JOBS } from "./briefing-data.js";
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
  assert.equal(valuations.allowed_callers, undefined);
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
