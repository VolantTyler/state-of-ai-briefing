import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checksStamp } from "./briefing-data.js";
import {
  VALUATIONS_STALE_DAYS, isStale, refreshStamp, runStamp, stampDay, valuationsFreshness,
} from "./panel-freshness.js";

const DAY = 24 * 60 * 60 * 1000;
const CHECKED = "2026-10-11T16:21:31.378Z";
const checkedMs = Date.parse(CHECKED);

const unconfirmed = {
  xAI: {
    status: "unconfirmed",
    value: 230,
    candidate: 250,
    reason: "Kept 230 billion USD. Candidate 250 billion USD was contradicted by 240 billion USD.",
    sources: ["https://first.example/a", "https://second.example/b"],
  },
};

test("a Sunday valuations check still reads as weekly on the following Friday", () => {
  const friday = checkedMs + 5 * DAY;
  const stamp = refreshStamp(
    { checkedAt: CHECKED, changedAt: "2026-10-11T08:25:17.604Z", failed: false },
    "valuations",
    unconfirmed,
    friday,
  );
  assert.equal(stamp.text, "Updated weekly · last updated Oct 11");
  assert.equal(stamp.tone, "faint");
  assert.equal(stamp.text.includes("unconfirmed"), false);
  assert.equal(stamp.text.includes("250"), false);
  assert.equal(stamp.title.includes("first.example"), false);
  assert.equal(checksStamp(unconfirmed), null);
  assert.equal(isStale(CHECKED, "valuations", friday), false);
});

test("the race chart uses the same weekly valuations label", () => {
  const stamp = refreshStamp({ checkedAt: CHECKED, failed: false }, "race", null, checkedMs + 3 * DAY);
  assert.equal(stamp.text, "Updated weekly · last updated Oct 11");
  assert.equal(stamp.tone, "faint");
});

test("valuations warn only once the check is older than 8 days", () => {
  assert.equal(VALUATIONS_STALE_DAYS, 8);
  const onTheLine = valuationsFreshness(CHECKED, checkedMs + 8 * DAY);
  assert.equal(onTheLine.text, "Updated weekly · last updated Oct 11");
  assert.equal(onTheLine.tone, "faint");

  const overdue = refreshStamp(
    { checkedAt: CHECKED, failed: false },
    "valuations",
    unconfirmed,
    checkedMs + 8 * DAY + 60 * 1000,
  );
  assert.equal(overdue.text, "Updated weekly · last updated Oct 11 · overdue");
  assert.equal(overdue.tone, "warn");
  assert.equal(isStale(CHECKED, "valuations", checkedMs + 8 * DAY), false);
  assert.equal(isStale(CHECKED, "valuations", checkedMs + 8 * DAY + 1), true);
});

test("a failed valuations check still reports the failure", () => {
  const stamp = refreshStamp({
    checkedAt: CHECKED,
    failed: true,
    error: "anthropic 400",
    erroredAt: "2026-10-16T08:21:25.855Z",
  }, "valuations", unconfirmed, Date.parse("2026-10-16T12:00:00.000Z"));
  assert.match(stamp.text, /^Refresh failed /);
  assert.equal(stamp.tone, "bad");
  assert.equal(stamp.text.includes("unconfirmed"), false);
});

test("a nightly panel is stale after two days and web-share keeps its longer grace", () => {
  const now = checkedMs + 5 * DAY;
  const nightly = refreshStamp({ checkedAt: CHECKED, failed: false }, "markets", null, now);
  assert.match(nightly.text, /^Last checked /);
  assert.equal(nightly.tone, "warn");
  const share = refreshStamp({ checkedAt: CHECKED, failed: false }, "share", null, now);
  assert.match(share.text, /^Refreshed /);
  assert.equal(share.tone, "faint");
  assert.equal(isStale(CHECKED, "markets", now), true);
  assert.equal(isStale(CHECKED, "share", now), false);
});

test("the masthead does not call a midweek valuations panel behind", () => {
  const now = Date.parse("2026-10-16T12:48:00.000Z");
  const meta = {
    valuations: { checkedAt: CHECKED, changedAt: "2026-10-11T08:25:17.604Z", failed: false },
    markets: { checkedAt: "2026-10-16T08:21:25.855Z", failed: false },
  };
  const line = runStamp("2026-10-16T08:21:24.508Z", "2026-10-16T08:21:27.078Z", meta, now);
  assert.equal(line.tone, "faint");
  assert.doesNotMatch(line.text, /behind/);

  const staleMeta = {
    ...meta,
    valuations: { checkedAt: "2026-10-03T16:21:31.378Z", failed: false },
  };
  const behind = runStamp("2026-10-16T08:21:24.508Z", "2026-10-16T08:21:27.078Z", staleMeta, now);
  assert.match(behind.text, /1 of 2 panels behind/);
  assert.equal(behind.tone, "warn");
});

test("the public page does not render unconfirmed notes or the brand-color bullets", () => {
  const app = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  assert.equal(app.includes("colored bars use each company's brand color"), false);
  assert.equal(app.includes("bars use each product's brand color"), false);
  assert.equal(app.includes("unconfirmed"), false);
  assert.equal(app.includes("noteHost"), false);
  assert.equal(stampDay(CHECKED), "Oct 11");
});
