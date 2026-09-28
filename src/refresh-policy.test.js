import assert from "node:assert/strict";
import test from "node:test";
import {
  SEARCH_MAX_USES, SHARE_REFRESH_DAYS, SHARE_SKIPPED, WEB_SEARCH_TOOL, shareRefreshDue, webSearchTool,
} from "./refresh-policy.js";

const SINGLE_TOPIC = ["models", "users", "share", "capital", "energy"];

test("web search uses the filtered tool and caps each call", () => {
  assert.equal(WEB_SEARCH_TOOL, "web_search_20260318");
  assert.equal(SEARCH_MAX_USES.valuations, 12);
  for (const id of SINGLE_TOPIC) {
    assert.ok(SEARCH_MAX_USES[id] >= 3 && SEARCH_MAX_USES[id] <= 5, id);
    const tool = webSearchTool(id);
    assert.equal(tool.type, WEB_SEARCH_TOOL);
    assert.equal(tool.name, "web_search");
    assert.equal(tool.max_uses, SEARCH_MAX_USES[id]);
    assert.equal(tool.allowed_callers, undefined);
  }
  const valuations = webSearchTool("valuations");
  assert.equal(valuations.type, "web_search_20260318");
  assert.equal(valuations.max_uses, 12);
  assert.equal(SEARCH_MAX_USES.markets, undefined);
  assert.throws(() => webSearchTool("markets"), /no search cap/);
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
