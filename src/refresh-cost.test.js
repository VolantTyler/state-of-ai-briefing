import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import handler, {
  JSON_REFORMAT_MAX_TOKENS, VALUATION_SEARCH, buildAlert, extractJSON, jobsQueryFromRequest,
  jsonReformatPrompt, partitionRefreshJobs, recoverJsonReply, successWebhookBody,
} from "../api/refresh.js";
import { lockText } from "./refresh-lock.js";
import {
  MAX_DURATION_MS, MIN_FAST_RETRY_MS, MIN_MODEL_RETRY_MS, TAIL_RESERVE_MS,
  attemptWithRetry, createBudget, settleWithinBudget, shouldRetry,
} from "./refresh-budget.js";
import { SEARCH_MAX_USES, VALUATIONS_FULL_RUN_SKIP, shareSkipReason } from "./refresh-policy.js";
import {
  DEFAULT_REFRESH_MAX_USD, HAIKU_MODEL, JOB_MAX_TOKENS, MODEL_PRICES, WEB_SEARCH_USD_PER_REQUEST,
  callWithPauseCap, createUsageLog, estimateCallCost, modelForJob, nightlyCapCeiling,
  postAnthropicMessage, refreshMaxUsd, spendCapBlocks, spendCapReason, summarizeUsage,
} from "./refresh-usage.js";

const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));

const message = (usage, extra = {}) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify({
    stop_reason: "end_turn",
    content: [{ type: "text", text: "{\"models\":[]}" }],
    usage,
    ...extra,
  }),
});

test("the job budget matches the Hobby maxDuration and reserves a tail", () => {
  assert.equal(vercel.functions["api/refresh.js"].maxDuration * 1000, MAX_DURATION_MS);
  assert.equal(TAIL_RESERVE_MS, 60_000);
  assert.ok(TAIL_RESERVE_MS < MAX_DURATION_MS);
  const budget = createBudget({ startedAt: 1_000, now: () => 1_000 });
  assert.equal(budget.remainingMs(), MAX_DURATION_MS - TAIL_RESERVE_MS);
  assert.equal(createBudget({ startedAt: 1_000, now: () => 1_000 + 240_000 }).remainingMs(), 0);
  assert.equal(createBudget({ startedAt: 1_000, now: () => 1_000 + 240_001 }).expired(), true);
});

test("prices Sonnet 4.6 and web search from the published table", () => {
  assert.equal(MODEL_PRICES["claude-sonnet-4-6"].inputPerMTok, 3);
  assert.equal(MODEL_PRICES["claude-sonnet-4-6"].outputPerMTok, 15);
  assert.equal(MODEL_PRICES["claude-sonnet-4-6"].cacheWrite5mPerMTok, 3.75);
  assert.equal(MODEL_PRICES["claude-sonnet-4-6"].cacheWrite1hPerMTok, 6);
  assert.equal(MODEL_PRICES["claude-sonnet-4-6"].cacheReadPerMTok, 0.3);
  assert.equal(WEB_SEARCH_USD_PER_REQUEST, 0.01);

  const cost = estimateCallCost({
    model: "claude-sonnet-4-6",
    inputTokens: 1000,
    outputTokens: 2000,
    cacheReadInputTokens: 500,
    cacheWrite: { ephemeral5m: 100, ephemeral1h: 50, assumed5m: false },
    serverToolUse: { web_search_requests: 3, code_execution_requests: 2 },
    serviceTier: "standard",
    usage: { input_tokens: 1000 },
  });
  /* 1000×$3 + 2000×$15 + 500×$0.30 + 100×$3.75 + 50×$6, per million, plus 3×$0.01.
     Code execution is recorded and not given a second fee. */
  assert.equal(cost.inputUsd, 0.003);
  assert.equal(cost.outputUsd, 0.03);
  assert.equal(cost.cacheReadUsd, 0.00015);
  assert.equal(cost.cacheWrite5mUsd, 0.000375);
  assert.equal(cost.cacheWrite1hUsd, 0.0003);
  assert.equal(cost.webSearchUsd, 0.03);
  assert.equal(cost.estimatedUsd, 0.063825);
  assert.equal(cost.estimateComplete, true);
  assert.deepEqual(cost.unpriced, []);
});

test("a missing 5m/1h split is priced as a 5-minute write and an unknown tool is not invented", () => {
  const assumed = estimateCallCost({
    model: "claude-sonnet-4-6",
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 1_000_000,
    cacheReadInputTokens: 0,
    cacheWrite: { ephemeral5m: 1_000_000, ephemeral1h: 0, assumed5m: true },
    serverToolUse: { web_search_requests: 0, mystery_requests: 4 },
    usage: { cache_creation_input_tokens: 1_000_000 },
  });
  assert.equal(assumed.cacheWrite5mUsd, 3.75);
  assert.equal(assumed.estimateComplete, false);
  assert.ok(assumed.unpriced.includes("server_tool_use.mystery_requests"));
  assert.match(assumed.notes.join(" "), /5-minute/);

  const unknown = estimateCallCost({
    model: "openrouter/some-model",
    inputTokens: 5000,
    outputTokens: 500,
    cacheReadInputTokens: 0,
    cacheWrite: { ephemeral5m: 0, ephemeral1h: 0, assumed5m: false },
    serverToolUse: { web_search_requests: 2 },
    usage: { input_tokens: 5000 },
  });
  assert.equal(unknown.estimatedUsd, 0.02);
  assert.equal(unknown.inputUsd, null);
  assert.equal(unknown.estimateComplete, false);
  assert.ok(unknown.unpriced.includes("model:openrouter/some-model"));

  const haiku = estimateCallCost({
    model: "claude-haiku-4-5",
    inputTokens: 1_000_000,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheWrite: { ephemeral5m: 0, ephemeral1h: 0, assumed5m: false },
    serverToolUse: {},
    usage: { input_tokens: 1_000_000 },
  });
  assert.equal(haiku.estimatedUsd, 1);
  assert.equal(haiku.estimateComplete, true);
});

test("one nightly ceiling is the search cap plus max_tokens on every iteration, input excluded", () => {
  const quiet = nightlyCapCeiling({ includeShare: false });
  assert.equal(quiet.searches, 4 + 2 + 3 + 3 + 2);
  assert.equal(SEARCH_MAX_USES.valuations, 4);
  assert.equal(JOB_MAX_TOKENS.valuations, 4000);
  assert.equal(quiet.outputTokensAtCap, 4 * 4000 + (2 + 3 + 3 + 2) * 4000);
  assert.equal(quiet.byJob.valuations.model, "claude-sonnet-4-6");
  assert.equal(quiet.byJob.models.model, HAIKU_MODEL);
  assert.equal(quiet.byJob.energy.model, HAIKU_MODEL);
  /* Valuations stay on Sonnet output rates. Simple panels are Haiku.
     16_000 Sonnet tokens × $15 plus 40_000 Haiku tokens × $5, per million. */
  assert.equal(quiet.searchUsd, 0.14);
  assert.equal(quiet.outputUsd, 0.44);
  assert.equal(quiet.usdExcludingInput, 0.58);
  assert.equal(quiet.inputTokens, "uncapped");

  const withShare = nightlyCapCeiling({ includeShare: true });
  assert.equal(withShare.searches, 16);
  assert.equal(withShare.searchUsd, 0.16);
  assert.equal(withShare.outputUsd, 0.48);
  assert.equal(withShare.usdExcludingInput, 0.64);
  assert.equal(withShare.byJob.share.model, HAIKU_MODEL);
});

test("a per-job model env overrides only that job, and simple panels default to Haiku", () => {
  const env = { ANTHROPIC_MODEL: "claude-sonnet-4-6", ANTHROPIC_MODEL_MODELS: " claude-haiku-4-5 " };
  assert.equal(modelForJob("models", env), "claude-haiku-4-5");
  assert.equal(modelForJob("valuations", env), "claude-sonnet-4-6");
  assert.equal(modelForJob("energy", {}), HAIKU_MODEL);
  assert.equal(modelForJob("users", { ANTHROPIC_MODEL: "claude-sonnet-4-6" }), HAIKU_MODEL);
  assert.equal(modelForJob("capital", { ANTHROPIC_MODEL_CAPITAL: "claude-sonnet-4-6" }), "claude-sonnet-4-6");
  assert.equal(modelForJob("valuations", {}), "claude-sonnet-4-6");
  assert.equal(HAIKU_MODEL, "claude-haiku-4-5-20251001");
});

test("Haiku 4.5 list price covers the snapshot id and the alias", () => {
  for (const id of ["claude-haiku-4-5", "claude-haiku-4-5-20251001"]) {
    assert.equal(MODEL_PRICES[id].inputPerMTok, 1);
    assert.equal(MODEL_PRICES[id].outputPerMTok, 5);
    assert.equal(MODEL_PRICES[id].cacheWrite5mPerMTok, 1.25);
    assert.equal(MODEL_PRICES[id].cacheWrite1hPerMTok, 2);
    assert.equal(MODEL_PRICES[id].cacheReadPerMTok, 0.1);
  }
});

test("the spend cap defaults to one dollar and blocks the next call at the line", () => {
  assert.equal(DEFAULT_REFRESH_MAX_USD, 1);
  assert.equal(refreshMaxUsd({}), 1);
  assert.equal(refreshMaxUsd({ REFRESH_MAX_USD: " 1.50 " }), 1.5);
  assert.equal(refreshMaxUsd({ REFRESH_MAX_USD: "0" }), 0);
  assert.throws(() => refreshMaxUsd({ REFRESH_MAX_USD: "nope" }), /REFRESH_MAX_USD/);
  assert.equal(spendCapBlocks(0.999999, 1), false);
  assert.equal(spendCapBlocks(1, 1), true);
  assert.match(spendCapReason(1.02, 1), /prior values kept/);
  assert.match(spendCapReason(1.02, 1), /REFRESH_MAX_USD 1/);
});

test("each Anthropic call logs one usage line and keeps server-tool counts", async () => {
  const lines = [];
  let t = 5_000;
  const usageLog = createUsageLog({ now: () => t, log: (line) => lines.push(line) });
  const seen = [];
  const fetchImpl = async (url, opts) => {
    seen.push({ url, body: JSON.parse(opts.body), key: opts.headers["x-api-key"] });
    t = 8_123;
    return message({
      input_tokens: 1200,
      output_tokens: 340,
      cache_creation_input_tokens: 80,
      cache_read_input_tokens: 20,
      cache_creation: { ephemeral_5m_input_tokens: 80, ephemeral_1h_input_tokens: 0 },
      server_tool_use: { web_search_requests: 2, code_execution_requests: 2, web_fetch_requests: 1 },
      service_tier: "standard",
    }, { stop_reason: "end_turn" });
  };

  const result = await postAnthropicMessage({
    fetchImpl,
    apiKey: "test-key",
    model: "claude-sonnet-4-6",
    prompt: "search",
    maxTokens: 4000,
    tool: { type: "web_search_20260318", name: "web_search", max_uses: 5 },
    jobId: "models",
    attempt: 1,
    usageLog,
    now: () => t,
  });

  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, "https://api.anthropic.com/v1/messages");
  assert.equal(seen[0].body.model, "claude-sonnet-4-6");
  assert.equal(seen[0].body.max_tokens, 4000);
  assert.equal(seen[0].body.tools[0].max_uses, 5);
  assert.equal(seen[0].key, "test-key");
  assert.equal(result.stopReason, "end_turn");
  assert.equal(result.usageRecord.inputTokens, 1200);
  assert.equal(result.usageRecord.outputTokens, 340);
  assert.equal(result.usageRecord.cacheCreationInputTokens, 80);
  assert.equal(result.usageRecord.cacheReadInputTokens, 20);
  /* The 5m/1h split is the same 80 tokens as the total. Price it once. */
  assert.equal(result.usageRecord.cacheWrite.ephemeral5m, 80);
  assert.equal(result.usageRecord.cacheWrite.ephemeral1h, 0);
  assert.equal(result.usageRecord.cacheWrite.assumed5m, false);
  assert.equal(result.usageRecord.cacheWrite5mUsd, 0.0003);
  assert.equal(result.usageRecord.serverToolUse.web_search_requests, 2);
  assert.equal(result.usageRecord.serverToolUse.web_fetch_requests, 1);
  assert.equal(result.usageRecord.durationMs, 3_123);
  assert.equal(result.usageRecord.billed, true);
  assert.equal(result.usageRecord.usage.server_tool_use.code_execution_requests, 2);
  assert.equal(lines.length, 1);
  const logged = JSON.parse(lines[0]);
  assert.equal(logged.event, "anthropic_usage");
  assert.equal(logged.jobId, "models");
  assert.equal(logged.attempt, 1);
  assert.equal(logged.stopReason, "end_turn");
  assert.equal(logged.serverToolUse.web_search_requests, 2);

  const summary = summarizeUsage(usageLog.calls, { runAt: "2026-10-02T08:00:00.000Z", wallClockMs: 4000 });
  assert.equal(summary.jobs.models.attempts, 1);
  assert.equal(summary.jobs.models.inputTokens, 1200);
  assert.equal(summary.totals.serverToolUse.web_search_requests, 2);
  assert.equal(summary.totals.serverToolUse.web_fetch_requests, 1);
  assert.equal(summary.totals.estimateComplete, true);
  assert.equal(summary.priceTable.checked, "2026-10-02");
});

test("a refused call keeps a null meter and is not marked billed", async () => {
  const usageLog = createUsageLog({ log: () => {} });
  const fetchImpl = async () => ({
    ok: false,
    status: 400,
    text: async () => JSON.stringify({
      type: "error",
      error: { type: "invalid_request_error", message: "credit balance is too low" },
    }),
  });
  await assert.rejects(
    () => postAnthropicMessage({
      fetchImpl,
      apiKey: "test-key",
      model: "claude-sonnet-4-6",
      prompt: "search",
      maxTokens: 4000,
      tool: { type: "web_search_20260318", name: "web_search", max_uses: 5 },
      jobId: "capital",
      attempt: 1,
      usageLog,
    }),
    (error) => {
      assert.equal(error.billed, false);
      assert.equal(error.httpStatus, 400);
      assert.match(error.message, /credit balance is too low/);
      return true;
    },
  );
  assert.equal(usageLog.calls.length, 1);
  assert.equal(usageLog.calls[0].billed, false);
  assert.equal(usageLog.calls[0].inputTokens, null);
  assert.equal(usageLog.calls[0].usage, null);
  assert.equal(usageLog.calls[0].estimateComplete, false);
});

test("an aborted call is recorded once, with the bill unknown", async () => {
  const lines = [];
  let t = 10;
  const usageLog = createUsageLog({ now: () => t, log: (line) => lines.push(line) });
  const controller = new AbortController();
  const fetchImpl = async (_url, opts) => {
    t = 40;
    controller.abort();
    const error = new Error("aborted");
    error.name = "AbortError";
    if (opts.signal && opts.signal.aborted) throw error;
    throw error;
  };
  await assert.rejects(
    () => postAnthropicMessage({
      fetchImpl,
      apiKey: "test-key",
      model: "claude-sonnet-4-6",
      prompt: "search",
      maxTokens: 8000,
      tool: { type: "web_search_20260318", name: "web_search", max_uses: 12 },
      jobId: "valuations",
      attempt: 1,
      signal: controller.signal,
      usageLog,
      now: () => t,
    }),
    (error) => {
      assert.equal(error.aborted, true);
      assert.equal(error.billed, false);
      return true;
    },
  );
  usageLog.abortOpen();
  assert.equal(usageLog.calls.length, 1);
  assert.equal(lines.length, 1);
  assert.equal(usageLog.calls[0].billed, null);
  assert.equal(usageLog.calls[0].likelyBilled, true);
  assert.equal(usageLog.calls[0].aborted, true);
  assert.equal(usageLog.calls[0].estimatedUsd, null);
  assert.equal(usageLog.calls[0].durationMs, 30);
  assert.match(usageLog.calls[0].error, /likely billed/);
  assert.match(usageLog.calls[0].error, /30ms/);
  const summary = summarizeUsage(usageLog.calls, { timedOut: ["valuations"] });
  assert.equal(summary.totals.estimateComplete, false);
  assert.equal(summary.totals.estimatedUsd, 0);
  assert.equal(summary.totals.likelyBilledAttempts, 1);
  assert.ok(summary.totals.unpriced.includes("aborted-likely-billed"));
  assert.ok(summary.totals.unpriced.includes("timed-out") || summary.totals.unpriced.includes("usage-not-reported"));
});

test("retries skip a billed or permanent failure, and skip when the budget is short", async () => {
  assert.deepEqual(shouldRetry({ billed: true, httpStatus: 200, remainingMs: 300_000, attemptDurationMs: 1000 }).retry, false);
  assert.equal(shouldRetry({ billed: true, remainingMs: 300_000 }).reason, "billed");
  assert.equal(shouldRetry({ httpStatus: 200, remainingMs: 300_000 }).reason, "billed");
  assert.equal(shouldRetry({ httpStatus: 400, remainingMs: 300_000 }).reason, "permanent");
  assert.equal(shouldRetry({ httpStatus: 401, remainingMs: 300_000 }).reason, "permanent");
  assert.equal(shouldRetry({ aborted: true, remainingMs: 300_000 }).reason, "aborted");
  assert.equal(shouldRetry({ spendCap: true, remainingMs: 300_000 }).reason, "spend-cap");
  assert.equal(shouldRetry({ httpStatus: 529, remainingMs: MIN_MODEL_RETRY_MS, attemptDurationMs: 1000 }).retry, true);
  assert.equal(shouldRetry({ httpStatus: 529, remainingMs: MIN_MODEL_RETRY_MS - 1, attemptDurationMs: 1000 }).reason, "time");
  assert.equal(shouldRetry({ remainingMs: 100_000, attemptDurationMs: 180_000, kind: "model" }).reason, "time");
  assert.equal(shouldRetry({ httpStatus: 503, remainingMs: MIN_FAST_RETRY_MS, attemptDurationMs: 1000, kind: "fast" }).retry, true);
  assert.equal(shouldRetry({ httpStatus: 503, remainingMs: MIN_FAST_RETRY_MS - 1, kind: "fast" }).reason, "time");

  let billedRuns = 0;
  await assert.rejects(() => attemptWithRetry(async () => {
    billedRuns += 1;
    const error = new Error("no JSON in reply");
    error.billed = true;
    error.httpStatus = 200;
    throw error;
  }, {
    remainingMs: () => 300_000,
    decide: (info) => shouldRetry({ ...info, kind: "model" }),
  }), (error) => error.retrySkipped === "billed");
  assert.equal(billedRuns, 1);

  let permanentRuns = 0;
  await assert.rejects(() => attemptWithRetry(async () => {
    permanentRuns += 1;
    const error = new Error("anthropic 400: credit balance is too low");
    error.httpStatus = 400;
    throw error;
  }, {
    remainingMs: () => 300_000,
    decide: (info) => shouldRetry({ ...info, kind: "model" }),
  }), (error) => error.retrySkipped === "permanent");
  assert.equal(permanentRuns, 1);

  let shortRuns = 0;
  await assert.rejects(() => attemptWithRetry(async () => {
    shortRuns += 1;
    const error = new Error("anthropic network: reset");
    throw error;
  }, {
    remainingMs: () => 10_000,
    now: () => 0,
    decide: (info) => shouldRetry({ ...info, kind: "model" }),
  }), (error) => error.retrySkipped === "time");
  assert.equal(shortRuns, 1);

  let transientRuns = 0;
  const value = await attemptWithRetry(async (attempt) => {
    transientRuns += 1;
    if (attempt === 1) {
      const error = new Error("anthropic 529: overloaded");
      error.httpStatus = 529;
      throw error;
    }
    return "ok";
  }, {
    remainingMs: () => 200_000,
    now: (() => {
      let clock = 0;
      return () => {
        clock += 1000;
        return clock;
      };
    })(),
    decide: (info) => shouldRetry({ ...info, kind: "model" }),
  });
  assert.equal(value, "ok");
  assert.equal(transientRuns, 2);
});

test("the deadline keeps a finished panel and records the one still running", async () => {
  let hungSignal = null;
  const slots = await settleWithinBudget([
    { id: "markets", run: async () => "quote" },
    { id: "models", run: (signal) => { hungSignal = signal; return new Promise(() => {}); } },
  ], {
    remainingMs: () => 10_000,
    schedule: (_ms, fn) => {
      queueMicrotask(fn);
      return () => {};
    },
  });
  assert.equal(slots.markets.status, "fulfilled");
  assert.equal(slots.markets.value, "quote");
  assert.equal(slots.markets.timedOut, false);
  assert.equal(slots.models.status, "rejected");
  assert.equal(slots.models.timedOut, true);
  assert.equal(slots.models.error.message, "time budget exhausted");
  assert.equal(hungSignal.aborted, true);
});

test("a job does not start after the budget is gone", async () => {
  let started = false;
  const slots = await settleWithinBudget([
    { id: "models", run: async () => { started = true; return "late"; } },
  ], {
    remainingMs: () => 0,
    schedule: (_ms, fn) => {
      fn();
      return () => {};
    },
  });
  assert.equal(started, false);
  assert.equal(slots.models.timedOut, true);
  assert.match(slots.models.error.message, /before start/);
});

test("a fast panel is not held for a sibling that finishes inside the budget", async () => {
  const slots = await settleWithinBudget([
    { id: "markets", run: async () => "quote" },
    { id: "storeRanks", run: async () => "ranks" },
  ], { remainingMs: () => 50_000 });
  assert.equal(slots.markets.value, "quote");
  assert.equal(slots.storeRanks.value, "ranks");
  assert.equal(slots.markets.timedOut, false);
});

test("webhook bodies keep their old fields and add usage", () => {
  const usage = { totals: { estimatedUsd: 0.32, estimateComplete: false } };
  const alert = buildAlert({
    severity: "partial",
    runAt: "2026-10-02T08:00:00.000Z",
    failures: ["models"],
    errors: { models: "time budget exhausted" },
    usage,
    timedOut: ["models"],
  });
  assert.equal(alert.source, "state-of-ai-briefing");
  assert.equal(alert.event, "refresh_failed");
  assert.equal(alert.severity, "partial");
  assert.equal(alert.runAt, "2026-10-02T08:00:00.000Z");
  assert.deepEqual(alert.failures, ["models"]);
  assert.equal(alert.errors.models, "time budget exhausted");
  assert.equal(alert.error, null);
  assert.equal(alert.usage, usage);
  assert.deepEqual(alert.timedOut, ["models"]);
  assert.match(alert.subject, /partial failure/);

  const fatal = buildAlert({ severity: "fatal", runAt: "2026-10-02T08:00:00.000Z", error: "boom" });
  assert.equal(fatal.event, "refresh_failed");
  assert.equal(fatal.usage, null);
  assert.deepEqual(fatal.timedOut, []);
  assert.equal(fatal.error, "boom");

  const success = successWebhookBody({ runAt: "2026-10-02T08:00:00.000Z", panels: 8, usage });
  assert.equal(success.event, "refresh_succeeded");
  assert.equal(success.source, "state-of-ai-briefing");
  assert.equal(success.runAt, "2026-10-02T08:00:00.000Z");
  assert.equal(success.panels, 8);
  assert.equal(success.usage, usage);
  assert.equal(success.failures, undefined);
  assert.equal(success.skipped, undefined);

  const withSkip = buildAlert({
    severity: "partial",
    runAt: "2026-10-02T21:00:03.208Z",
    failures: ["capital"],
    errors: { capital: "no JSON in reply" },
    skipped: { share: "weekly; last run 2026-09-27, next due 2026-10-04" },
  });
  assert.equal(withSkip.event, "refresh_failed");
  assert.match(withSkip.message, /weekly; last run 2026-09-27/);
  assert.match(withSkip.skipped.share, /next due 2026-10-04/);

  const successSkip = successWebhookBody({
    runAt: "2026-10-02T21:00:03.208Z",
    panels: 8,
    usage,
    skipped: { valuations: VALUATIONS_FULL_RUN_SKIP },
  });
  assert.equal(successSkip.event, "refresh_succeeded");
  assert.match(successSkip.skipped.valuations, /\?jobs=valuations/);
});

test("pause_turn continues at most once, and a usable partial answer is not continued", async () => {
  assert.match(VALUATION_SEARCH, /Do not search again/);
  const paused = { type: "text", text: "still looking" };
  const done = { type: "text", text: '{"models":[{"model":"A","lab":"B","score":1,"cn":false}]}' };
  let calls = 0;
  const value = await callWithPauseCap({
    initialMessages: [{ role: "user", content: "search" }],
    request: async ({ messages, continuation }) => {
      calls += 1;
      if (continuation === 0) {
        assert.equal(messages.length, 1);
        return { content: [paused], stopReason: "pause_turn" };
      }
      assert.equal(continuation, 1);
      assert.equal(messages[1].role, "assistant");
      assert.equal(messages[1].content[0], paused);
      return { content: [done], stopReason: "end_turn" };
    },
    accept: (content, stopReason) => {
      const text = content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
      try { return JSON.parse(text); }
      catch (e) {
        if (stopReason === "pause_turn") return null;
        throw e;
      }
    },
  });
  assert.equal(calls, 2);
  assert.equal(value.models[0].model, "A");

  let early = 0;
  const partial = await callWithPauseCap({
    initialMessages: [{ role: "user", content: "search" }],
    request: async () => {
      early += 1;
      return { content: [done], stopReason: "pause_turn" };
    },
    accept: (content) => JSON.parse(content[0].text),
  });
  assert.equal(early, 1);
  assert.equal(partial.models[0].model, "A");

  let capped = 0;
  await assert.rejects(() => callWithPauseCap({
    initialMessages: [{ role: "user", content: "search" }],
    request: async () => {
      capped += 1;
      return { content: [paused], stopReason: "pause_turn" };
    },
    accept: () => null,
  }), (error) => {
    assert.equal(error.billed, true);
    assert.match(error.message, /continuation cap/);
    return true;
  });
  assert.equal(capped, 2);

  let blocked = 0;
  await assert.rejects(() => callWithPauseCap({
    initialMessages: [{ role: "user", content: "search" }],
    request: async () => {
      blocked += 1;
      return { content: [paused], stopReason: "pause_turn" };
    },
    accept: () => null,
    allowContinuation: () => ({ ok: false, message: "spend cap", spendCap: true }),
  }), (error) => error.spendCap === true && error.billed === true);
  assert.equal(blocked, 1);
});

test("a pause_turn continuation re-sends the assistant message and is its own usage row", async () => {
  const lines = [];
  const usageLog = createUsageLog({ log: (line) => lines.push(line) });
  let n = 0;
  const fetchImpl = async (_url, opts) => {
    n += 1;
    const body = JSON.parse(opts.body);
    if (n === 1) {
      assert.equal(body.messages.length, 1);
      return message({
        input_tokens: 1000,
        output_tokens: 10,
        server_tool_use: { web_search_requests: 1 },
        service_tier: "standard",
      }, {
        stop_reason: "pause_turn",
        content: [{ type: "text", text: "not json yet" }, { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "q" } }],
      });
    }
    assert.equal(body.messages.length, 2);
    assert.equal(body.messages[1].role, "assistant");
    assert.equal(body.messages[1].content[1].id, "srvtoolu_1");
    return message({
      input_tokens: 50,
      output_tokens: 20,
      server_tool_use: { web_search_requests: 0 },
      service_tier: "standard",
    }, { stop_reason: "end_turn", content: [{ type: "text", text: "{\"ok\":true}" }] });
  };

  const result = await callWithPauseCap({
    initialMessages: [{ role: "user", content: "search" }],
    request: ({ messages, continuation }) => postAnthropicMessage({
      fetchImpl,
      apiKey: "test-key",
      model: "claude-haiku-4-5-20251001",
      messages,
      maxTokens: 4000,
      tool: { type: "web_search_20260318", name: "web_search", max_uses: 2, allowed_callers: ["direct"] },
      jobId: "models",
      attempt: 1,
      continuation,
      usageLog,
    }),
    accept: (content, stopReason) => {
      const text = (content || []).filter((block) => block.type === "text").map((block) => block.text).join("\n");
      try { return JSON.parse(text); }
      catch (e) {
        if (stopReason === "pause_turn") return null;
        throw e;
      }
    },
  });
  assert.equal(result.ok, true);
  assert.equal(usageLog.calls.length, 2);
  assert.equal(usageLog.calls[0].continuation, 0);
  assert.equal(usageLog.calls[1].continuation, 1);
  assert.equal(usageLog.calls[0].stopReason, "pause_turn");
  assert.equal(lines.length, 2);
  assert.equal(usageLog.estimatedUsd() > 0, true);
  const summary = summarizeUsage(usageLog.calls, {
    spendCap: { maxUsd: 1, estimatedUsd: usageLog.estimatedUsd(), skipped: [] },
  });
  assert.equal(summary.jobs.models.attempts, 2);
  assert.equal(summary.spendCap.maxUsd, 1);
});

test("a spend-cap error is not retried", async () => {
  let runs = 0;
  await assert.rejects(() => attemptWithRetry(async () => {
    runs += 1;
    throw Object.assign(new Error("spend cap: prior values kept"), { spendCap: true });
  }, {
    remainingMs: () => 300_000,
    decide: (info) => shouldRetry({ ...info, kind: "model" }),
  }), (error) => error.retrySkipped === "spend-cap");
  assert.equal(runs, 1);
});

test("jobs can be read from the query object or the request URL", () => {
  assert.equal(jobsQueryFromRequest({ query: { jobs: "valuations" } }), "valuations");
  assert.equal(jobsQueryFromRequest({ url: "/api/refresh?jobs=models,users" }), "models,users");
  assert.equal(jobsQueryFromRequest({ query: {}, url: "/api/refresh?jobs=energy" }), "energy");
  assert.equal(jobsQueryFromRequest({ url: "/api/refresh" }), null);
});

test("JSON extraction takes a fence or the last object in any text block", () => {
  assert.equal(
    extractJSON([{ type: "text", text: "note first {\"nope\":1} then {\"capex\":{\"Alphabet\":185}}" }]).capex.Alphabet,
    185,
  );
  assert.equal(
    extractJSON([{ type: "text", text: "```json\n{\"energy\":{\"totalTWh\":565}}\n```" }]).energy.totalTWh,
    565,
  );
  /* An unclosed quote in an earlier block must not swallow the object in the next one. */
  const split = extractJSON([
    { type: "text", text: "still quoting \"" },
    { type: "text", text: "{\"users\":{\"ChatGPT\":1000}}" },
  ]);
  assert.equal(split.users.ChatGPT, 1000);
  assert.throws(() => extractJSON([{ type: "text", text: "Alphabet planned about 185 billion, no object" }]), /no JSON in reply/);
});

test("a JSON miss is reformatted once from the reply text, with no second search", async () => {
  let raw = null;
  const outcome = await recoverJsonReply({
    blocks: [{ type: "text", text: "Alphabet capex is 185. Anthropic revenue is 3." }],
    stopReason: "end_turn",
    reformat: async (text) => {
      raw = text;
      return [{ type: "text", text: "{\"capex\":{\"Alphabet\":185},\"revenue\":{\"Anthropic\":3}}" }];
    },
  });
  assert.equal(outcome.reformatted, true);
  assert.match(raw, /Alphabet capex is 185/);
  assert.equal(outcome.value.revenue.Anthropic, 3);
  assert.match(jsonReformatPrompt("x"), /Do not search/);
  assert.equal(JSON_REFORMAT_MAX_TOKENS, 1500);

  let reformats = 0;
  const paused = await recoverJsonReply({
    blocks: [{ type: "text", text: "still looking" }],
    stopReason: "pause_turn",
    reformat: async () => { reformats += 1; return []; },
  });
  assert.equal(paused.value, null);
  assert.equal(reformats, 0);

  const bodies = [];
  const usageLog = createUsageLog({ log: () => {} });
  const fetchImpl = async (_url, opts) => {
    bodies.push(JSON.parse(opts.body));
    return message({
      input_tokens: 40,
      output_tokens: 20,
      server_tool_use: { web_search_requests: 0 },
      service_tier: "standard",
    }, { content: [{ type: "text", text: "{\"ok\":true}" }] });
  };
  await postAnthropicMessage({
    fetchImpl,
    apiKey: "test-key",
    model: "claude-haiku-4-5-20251001",
    messages: [{ role: "user", content: jsonReformatPrompt("prose") }],
    maxTokens: JSON_REFORMAT_MAX_TOKENS,
    tool: null,
    jobId: "capital",
    attempt: 1,
    continuation: "reformat",
    usageLog,
  });
  assert.equal(bodies[0].tools, undefined);
  assert.equal(bodies[0].max_tokens, 1500);
  assert.equal(usageLog.calls[0].continuation, "reformat");
  assert.equal(usageLog.calls[0].serverToolUse.web_search_requests, 0);
  assert.equal(usageLog.calls[0].estimatedUsd > 0, true);
});

test("every selected job is refreshed, failed, or skipped with a reason", () => {
  const ids = ["valuations", "models", "users", "share", "capital", "energy", "markets", "storeRanks"];
  const shareReason = shareSkipReason(
    { share: { checkedAt: "2026-09-27T08:26:23.077Z" } },
    "2026-10-02T21:00:03.208Z",
  );
  const partial = partitionRefreshJobs({
    ids,
    refreshed: ["models", "users", "energy", "markets", "storeRanks"],
    failures: ["capital"],
    skipped: { share: shareReason, valuations: VALUATIONS_FULL_RUN_SKIP },
  });
  assert.equal(partial.ok, false);
  assert.equal(partial.partial, true);
  for (const id of ids) {
    const places = [
      partial.refreshed.includes(id),
      partial.failures.includes(id),
      Object.prototype.hasOwnProperty.call(partial.skipped, id),
    ].filter(Boolean);
    assert.equal(places.length, 1, id);
  }
  assert.equal(partial.skipped.share, "weekly; last run 2026-09-27, next due 2026-10-04");

  const clean = partitionRefreshJobs({
    ids,
    refreshed: ids.filter((id) => id !== "share" && id !== "valuations"),
    failures: [],
    skipped: { share: shareReason, valuations: VALUATIONS_FULL_RUN_SKIP },
  });
  assert.equal(clean.ok, true);
  assert.equal(clean.partial, false);

  assert.throws(
    () => partitionRefreshJobs({
      ids,
      refreshed: ["models"],
      failures: ["capital"],
      skipped: { share: shareReason },
    }),
    /missing=/,
  );
  assert.throws(
    () => partitionRefreshJobs({
      ids: ["share"],
      refreshed: ["share"],
      failures: [],
      skipped: { share: shareReason },
    }),
    /duplicates=share/,
  );
});

const mockRes = () => ({
  statusCode: 0,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

test("an in-progress refresh is refused before any Claude call, and a bad jobs list never calls GitHub", async () => {
  const previous = {
    CRON_SECRET: process.env.CRON_SECRET,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    GITHUB_REPO: process.env.GITHUB_REPO,
  };
  const originalFetch = globalThis.fetch;
  process.env.CRON_SECRET = "secret";
  process.env.GITHUB_TOKEN = "token";
  process.env.GITHUB_REPO = "owner/repo";
  const urls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const href = String(url);
    urls.push(href);
    if (href.includes("api.anthropic.com")) throw new Error("Claude was called");
    if (opts.method === "PUT" && href.includes("refresh-lock")) {
      return { ok: false, status: 422, text: async () => JSON.stringify({ message: "sha wasn't supplied" }) };
    }
    if (href.includes("refresh-lock")) {
      const started = new Date().toISOString();
      return {
        ok: true,
        status: 200,
        json: async () => ({
          sha: "abc",
          content: Buffer.from(lockText(started), "utf8").toString("base64"),
        }),
      };
    }
    throw new Error(`unexpected fetch ${href}`);
  };
  try {
    const unauth = mockRes();
    await handler({ headers: {}, query: { jobs: "valuations" } }, unauth);
    assert.equal(unauth.statusCode, 401);
    assert.equal(urls.length, 0);

    const bad = mockRes();
    await handler({
      headers: { authorization: "Bearer secret" },
      query: { jobs: "nope" },
    }, bad);
    assert.equal(bad.statusCode, 400);
    assert.match(bad.body.error, /unknown jobs: nope/);
    assert.equal(urls.length, 0);

    const locked = mockRes();
    await handler({
      headers: { authorization: "Bearer secret" },
      query: { jobs: "valuations" },
    }, locked);
    assert.equal(locked.statusCode, 409);
    assert.equal(locked.body.ok, false);
    assert.equal(locked.body.error, "refresh already in progress");
    assert.ok(locked.body.lockedSince);
    assert.equal(locked.body.staleAfterMs, 360_000);
    assert.deepEqual(locked.body.jobs, ["valuations"]);
    assert.equal(urls.some((url) => url.includes("api.anthropic.com")), false);
    assert.equal(urls.some((url) => url.includes("refresh-lock")), true);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
