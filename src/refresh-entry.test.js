import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JOBS } from "./briefing-data.js";
import {
  ACTIONS_BUDGET_DEFAULTS, ACTIONS_CALL_TIMEOUT_MS, ACTIONS_MAX_DURATION_MS,
  ACTIONS_TAIL_RESERVE_MS, ACTIONS_TIMEOUT_MINUTES, ACTIONS_VALUATIONS_MIN_START_MS,
  budgetConfigFromEnv, callWindowMs,
} from "./refresh-budget.js";
import {
  DAILY_REFRESH_CRON, VALUATIONS_REFRESH_CRON, dailyJobIds, jobsForInvocation,
  resolveJobSelection, selectJobsFromEnv,
} from "./refresh-policy.js";
import { runRefresh } from "./refresh-run.js";
import { main } from "../scripts/refresh.js";

const workflow = readFileSync(new URL("../.github/workflows/refresh.yml", import.meta.url), "utf8");
const allIds = Object.keys(JOBS);

/* These tests swap global fetch. Keep them off each other if the file runs
   more than one at a time. */
let fetchQueue = Promise.resolve();
const exclusive = (fn) => {
  const run = fetchQueue.then(fn, fn);
  fetchQueue = run.then(() => {}, () => {});
  return run;
};

const githubFile = (sha, text) => ({
  ok: true,
  status: 200,
  json: async () => ({ sha, content: Buffer.from(text, "utf8").toString("base64") }),
  text: async () => "",
});

const githubFail = (status, body) => ({
  ok: false,
  status,
  text: async () => body,
  json: async () => {
    try { return JSON.parse(body); } catch (e) { return { message: body }; }
  },
});

/* Fake GitHub, Yahoo, and a refusing Anthropic. No request leaves the test. */
const drive = (options) => exclusive(() => driveOnce(options));

const driveOnce = async ({ jobs, env = {}, budget, now, valuesText = null, failRead = null } = {}) => {
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const puts = [];
  const anthropicBodies = [];
  const urls = [];
  const logs = [];
  console.log = (line) => { logs.push(String(line)); };
  globalThis.fetch = async (url, opts = {}) => {
    const href = String(url);
    const method = opts.method || "GET";
    urls.push(href);
    if (href.includes("api.anthropic.com")) {
      anthropicBodies.push(String(opts.body || ""));
      return {
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "test refusal" } }),
      };
    }
    if (href.includes("query1.finance.yahoo.com")) {
      const symbol = decodeURIComponent(href.split("/chart/")[1].split("?")[0]);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          chart: {
            result: [{
              meta: {
                symbol,
                currency: "USD",
                currentTradingPeriod: { regular: { start: 0, end: 1 } },
              },
              timestamp: [1_700_000_000],
              indicators: { quote: [{ close: [123.45] }] },
            }],
          },
        }),
      };
    }
    if (!href.includes("api.github.com")) throw new Error(`unexpected fetch ${href}`);
    const marker = "/contents/";
    const at = href.indexOf(marker);
    const path = at < 0 ? "" : decodeURIComponent(href.slice(at + marker.length).split("?")[0]);
    if (path === "dev/refresh-lock.json") throw new Error("refresh lock was touched");
    if (method === "GET") {
      if (failRead && path === failRead) return githubFail(500, "read failed");
      if (path === "public/data/values.json" && valuesText != null) return githubFile("values-sha", valuesText);
      return githubFail(404, "missing");
    }
    if (method === "PUT") {
      const body = JSON.parse(opts.body || "{}");
      puts.push({
        path,
        message: body.message,
        text: Buffer.from(body.content, "base64").toString("utf8"),
      });
      return { ok: true, status: 200, text: async () => "{}" };
    }
    throw new Error(`unexpected ${method} ${href}`);
  };
  const bag = {
    GITHUB_TOKEN: "token",
    GITHUB_REPO: "owner/repo",
    GITHUB_BRANCH: "main",
    ANTHROPIC_API_KEY: "test-key",
    ...env,
  };
  try {
    const result = await runRefresh({ jobs, env: bag, budget, now });
    return { result, puts, anthropicBodies, urls, logs };
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
  }
};

test("blank jobs is the daily set and the Sunday cron is valuations only", () => {
  const daily = resolveJobSelection("", allIds);
  assert.equal(daily.preset, "daily");
  assert.equal(daily.explicit, true);
  assert.deepEqual(daily.ids, dailyJobIds(allIds));
  assert.equal(daily.ids.includes("valuations"), false);
  assert.deepEqual(daily.ids, allIds.filter((id) => id !== "valuations"));

  const sunday = resolveJobSelection(jobsForInvocation({
    eventName: "schedule",
    schedule: VALUATIONS_REFRESH_CRON,
    jobsInput: "models",
  }), allIds);
  assert.deepEqual(sunday.ids, ["valuations"]);
  assert.equal(sunday.preset, "valuations");

  const morning = jobsForInvocation({
    eventName: "schedule",
    schedule: DAILY_REFRESH_CRON,
    jobsInput: "valuations",
  });
  assert.equal(morning, "");
  assert.equal(resolveJobSelection(morning, allIds).ids.includes("valuations"), false);

  assert.equal(jobsForInvocation({ eventName: "workflow_dispatch", jobsInput: "" }), "");
  assert.equal(jobsForInvocation({ eventName: "workflow_dispatch", jobsInput: "valuations" }), "valuations");
  assert.equal(jobsForInvocation({
    eventName: "workflow_dispatch",
    schedule: VALUATIONS_REFRESH_CRON,
    jobsInput: "markets",
  }), "markets");

  assert.equal(selectJobsFromEnv({ REFRESH_EVENT: "schedule", REFRESH_SCHEDULE: VALUATIONS_REFRESH_CRON }, ["models"]), "valuations");
  assert.equal(selectJobsFromEnv({ REFRESH_EVENT: "workflow_dispatch", REFRESH_JOBS: "" }, ["valuations"]), "");
  assert.equal(selectJobsFromEnv({}, ["valuations"]), "valuations");
  assert.equal(selectJobsFromEnv({ REFRESH_JOBS: "markets" }, []), "markets");
  assert.equal(selectJobsFromEnv({}, []), "");

  const unknown = resolveJobSelection("models,nope", allIds);
  assert.match(unknown.error, /unknown jobs: nope/);

  const typed = resolveJobSelection("Valuations", allIds);
  assert.deepEqual(typed.ids, ["valuations"]);
  assert.equal(typed.preset, "valuations");
  const mixed = resolveJobSelection("models, Energy", allIds);
  assert.deepEqual(mixed.ids, ["models", "energy"]);
  assert.equal(mixed.preset, "custom");
});

test("the Actions budget is configurable and the defaults fit under the job timeout", () => {
  assert.equal(ACTIONS_TIMEOUT_MINUTES, 30);
  assert.ok(ACTIONS_MAX_DURATION_MS < ACTIONS_TIMEOUT_MINUTES * 60 * 1000);
  assert.equal(ACTIONS_MAX_DURATION_MS, 25 * 60 * 1000);
  assert.equal(ACTIONS_TAIL_RESERVE_MS, 2 * 60 * 1000);
  assert.equal(ACTIONS_CALL_TIMEOUT_MS, 10 * 60 * 1000);
  assert.equal(ACTIONS_VALUATIONS_MIN_START_MS, 10 * 60 * 1000);
  assert.equal(
    ACTIONS_BUDGET_DEFAULTS.valuationsCallTimeoutMs,
    ACTIONS_MAX_DURATION_MS - ACTIONS_TAIL_RESERVE_MS,
  );
  assert.ok(ACTIONS_VALUATIONS_MIN_START_MS <= ACTIONS_BUDGET_DEFAULTS.valuationsCallTimeoutMs);
  assert.ok(ACTIONS_CALL_TIMEOUT_MS < ACTIONS_BUDGET_DEFAULTS.valuationsCallTimeoutMs);

  const configured = budgetConfigFromEnv({});
  assert.deepEqual(configured, {
    ...ACTIONS_BUDGET_DEFAULTS,
    jobBudgetMs: ACTIONS_MAX_DURATION_MS - ACTIONS_TAIL_RESERVE_MS,
  });

  const overridden = budgetConfigFromEnv({
    REFRESH_MAX_DURATION_MS: "1200000",
    REFRESH_TAIL_RESERVE_MS: "60000",
    REFRESH_CALL_TIMEOUT_MS: "180000",
    REFRESH_VALUATIONS_MIN_START_MS: "300000",
    REFRESH_VALUATIONS_CALL_TIMEOUT_MS: "900000",
  });
  assert.equal(overridden.maxDurationMs, 1_200_000);
  assert.equal(overridden.tailReserveMs, 60_000);
  assert.equal(overridden.jobBudgetMs, 1_140_000);
  assert.equal(overridden.callTimeoutMs, 180_000);
  assert.equal(overridden.valuationsMinStartMs, 300_000);
  assert.equal(overridden.valuationsCallTimeoutMs, 900_000);

  const clamped = budgetConfigFromEnv({ REFRESH_MAX_DURATION_MS: String(12 * 60 * 1000) });
  assert.equal(clamped.jobBudgetMs, 12 * 60 * 1000 - ACTIONS_TAIL_RESERVE_MS);
  assert.equal(clamped.valuationsCallTimeoutMs, clamped.jobBudgetMs);

  assert.throws(() => budgetConfigFromEnv({ REFRESH_MAX_DURATION_MS: "0" }), /REFRESH_MAX_DURATION_MS/);
  assert.throws(() => budgetConfigFromEnv({ REFRESH_CALL_TIMEOUT_MS: "soon" }), /REFRESH_CALL_TIMEOUT_MS/);
  assert.throws(
    () => budgetConfigFromEnv({ REFRESH_MAX_DURATION_MS: "60000", REFRESH_TAIL_RESERVE_MS: "60000" }),
    /shorter than/,
  );
  assert.equal(callWindowMs(23 * 60 * 1000, ACTIONS_CALL_TIMEOUT_MS), ACTIONS_CALL_TIMEOUT_MS);
  assert.equal(callWindowMs(30_000, ACTIONS_CALL_TIMEOUT_MS), 30_000);
  assert.equal(callWindowMs(0, ACTIONS_CALL_TIMEOUT_MS), 0);
});

test("the workflow cron, concurrency, timeout, and secret names match the runner", () => {
  const cronLine = (cron) => workflow.includes(`cron: "${cron}"`);
  assert.equal(cronLine(DAILY_REFRESH_CRON), true);
  assert.equal(cronLine(VALUATIONS_REFRESH_CRON), true);
  assert.match(workflow, /4:00 AM EDT/);
  assert.match(workflow, /3:00 AM EST/);
  assert.match(workflow, /6:00 AM EDT/);
  assert.match(workflow, /5:00 AM EST/);
  assert.match(workflow, /cancel-in-progress:\s*false/);
  assert.match(workflow, /group:\s*state-of-ai-refresh/);
  assert.match(workflow, new RegExp(`timeout-minutes:\\s*${ACTIONS_TIMEOUT_MINUTES}`));
  assert.match(workflow, /contents:\s*read/);
  assert.match(workflow, /persist-credentials:\s*false/);
  assert.equal(workflow.includes("pull_request"), false);
  for (const name of [
    "ANTHROPIC_API_KEY",
    "GH_CONTENTS_TOKEN",
    "TYPESAFE_API_KEY",
    "AGENTMAIL_API_KEY",
    "AGENTMAIL_INBOX_ID",
    "NOTIFY_EMAIL",
    "GROK_BOT_WEBHOOK_URL",
    "GROK_BOT_WEBHOOK_KEY",
  ]) {
    assert.match(workflow, new RegExp(`secrets\\.${name}\\b`));
  }
  assert.match(workflow, /GITHUB_TOKEN: \$\{\{ secrets\.GH_CONTENTS_TOKEN \}\}/);
  assert.match(workflow, /node scripts\/refresh\.js/);
});

test("an unknown job list never calls GitHub or Claude", async () => {
  const run = await drive({ jobs: "nope" });
  assert.equal(run.result.status, 400);
  assert.match(run.result.body.error, /unknown jobs: nope/);
  assert.equal(run.urls.length, 0);
  assert.equal(run.anthropicBodies.length, 0);
});

test("the daily entry point does not start valuations and does not write the lock", async () => {
  const run = await drive({ jobs: "" });
  assert.equal(run.result.body.jobs.includes("valuations"), false);
  assert.equal(run.result.body.skipped.valuations, undefined);
  assert.equal(run.anthropicBodies.some((body) => body.includes("Batch several companies")), false);
  assert.equal(run.puts.some((put) => put.path === "dev/refresh-lock.json"), false);
  assert.equal(run.puts.some((put) => String(put.message).startsWith("lock:")), false);
  assert.ok(run.puts.some((put) => put.path === "public/data/usage.json"));
  assert.ok(run.puts.some((put) => put.path === "public/data/values.json"));
  assert.ok(run.puts.some((put) => put.path === "public/data/trend.csv"));
  const usage = JSON.parse(run.puts.filter((put) => put.path === "public/data/usage.json").at(-1).text);
  assert.equal(usage.budget.maxDurationMs, ACTIONS_MAX_DURATION_MS);
  assert.equal(usage.budget.tailReserveMs, ACTIONS_TAIL_RESERVE_MS);
  assert.equal(usage.budget.callTimeoutMs, ACTIONS_CALL_TIMEOUT_MS);
  assert.equal(usage.budget.valuationsMinStartMs, ACTIONS_VALUATIONS_MIN_START_MS);
  assert.equal(usage.lockReleased, undefined);
  const start = run.logs.map((line) => JSON.parse(line)).find((row) => row.event === "refresh_start");
  assert.equal(start.preset, "daily");
  assert.equal(start.jobs.includes("valuations"), false);
});

test("a markets refresh writes the same data files and records the Actions budget", async () => {
  const run = await drive({ jobs: "markets" });
  assert.equal(run.result.status, 200);
  assert.equal(run.result.body.ok, true);
  assert.deepEqual(run.result.body.jobs, ["markets"]);
  assert.equal(run.anthropicBodies.length, 0);
  assert.equal(run.result.body.lockReleased, undefined);
  const usagePut = run.puts.filter((put) => put.path === "public/data/usage.json").at(-1);
  assert.match(usagePut.message, /^data: usage /);
  assert.match(run.puts.find((put) => put.path === "public/data/trend.csv").message, /^data: trend log /);
});

test("web-share stays on its weekly clock through the new entry point", async () => {
  const frozen = Date.parse("2026-10-03T08:00:00.000Z");
  const run = await drive({
    jobs: "share",
    now: () => frozen,
    valuesText: JSON.stringify({
      meta: { share: { checkedAt: "2026-09-27T08:26:23.077Z", at: "2026-09-27T08:26:23.077Z" } },
    }),
  });
  assert.equal(run.result.status, 200);
  assert.equal(run.result.body.ok, true);
  assert.equal(run.result.body.refreshed.includes("share"), false);
  assert.match(run.result.body.skipped.share, /weekly; last run 2026-09-27, next due 2026-10-04/);
  assert.equal(run.anthropicBodies.length, 0);
});

test("valuations does not start when the remaining window is under the minimum", async () => {
  const frozen = 5_000;
  const run = await drive({
    jobs: "valuations",
    now: () => frozen,
    budget: {
      maxDurationMs: 179_000,
      tailReserveMs: 60_000,
      callTimeoutMs: 60_000,
      valuationsCallTimeoutMs: 120_000,
      valuationsMinStartMs: 120_000,
    },
  });
  assert.equal(run.result.status, 200);
  assert.equal(run.result.body.ok, true);
  assert.match(run.result.body.skipped.valuations, /not started/);
  assert.equal(run.anthropicBodies.length, 0);
});

test("a valuations run with room left calls Claude and does not call it twice on a 400", async () => {
  const run = await drive({ jobs: "valuations" });
  assert.equal(run.result.body.ok, false);
  assert.deepEqual(run.result.body.failures, ["valuations"]);
  assert.equal(run.anthropicBodies.length, 1);
  assert.match(run.anthropicBodies[0], /Batch several companies/);
  const sent = JSON.parse(run.anthropicBodies[0]);
  assert.equal(sent.model, "claude-sonnet-4-6");
  assert.equal(sent.tools[0].type, "web_search_20260318");
  assert.deepEqual(sent.tools[0].allowed_callers, ["direct"]);
  assert.equal(sent.tools[0].response_inclusion, undefined);
  assert.equal(run.urls.filter((url) => url.includes("api.anthropic.com")).length, 1);
});

test("a failed read still records usage and does not call Claude", async () => {
  const run = await drive({ jobs: "markets", failRead: "public/data/values.json" });
  assert.equal(run.result.status, 500);
  assert.equal(run.result.body.ok, false);
  assert.equal(run.anthropicBodies.length, 0);
  assert.ok(run.puts.some((put) => put.path === "public/data/usage.json"));
  assert.equal(run.puts.some((put) => put.path === "dev/refresh-lock.json"), false);
});

test("the script entry point selects jobs from argv and does not call Claude for markets", async () => {
  await exclusive(async () => {
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  console.log = () => {};
  globalThis.fetch = async (url, opts = {}) => {
    const href = String(url);
    const method = opts.method || "GET";
    if (href.includes("api.anthropic.com")) throw new Error("Claude was called");
    if (href.includes("query1.finance.yahoo.com")) {
      const symbol = decodeURIComponent(href.split("/chart/")[1].split("?")[0]);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          chart: {
            result: [{
              meta: {
                symbol,
                currency: "USD",
                currentTradingPeriod: { regular: { start: 0, end: 1 } },
              },
              timestamp: [1_700_000_000],
              indicators: { quote: [{ close: [10] }] },
            }],
          },
        }),
      };
    }
    if (!href.includes("api.github.com")) throw new Error(`unexpected fetch ${href}`);
    if (method === "GET") return githubFail(404, "missing");
    return { ok: true, status: 200, text: async () => "{}" };
  };
  try {
    const result = await main({
      GITHUB_TOKEN: "token",
      GITHUB_REPO: "owner/repo",
      ANTHROPIC_API_KEY: "test-key",
    }, ["markets"]);
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.deepEqual(result.body.refreshed, ["markets"]);
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
  }
  });
});
