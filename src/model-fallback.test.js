import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { MIN_MODEL_RETRY_MS, shouldRetry } from "./refresh-budget.js";
import { createUsageLog } from "./refresh-usage.js";
import {
  DEFAULT_FALLBACK_MODEL, OPENROUTER_CHAT_URL, classifyFallback, fallbackModelFromEnv,
  modelPathLine, openRouterBody, planModelFallback, postModelMessage,
} from "./model-fallback.js";
import {
  buildDegradedAlert, buildJobFailurePayload, failedStepFromOutcomes, grokSecretsArmed, scrubSecrets,
} from "./grok-alert.js";
import { sendWorkflowFailureAlert } from "../scripts/grok-failure-alert.js";

const usageLimit = "You have reached your specified workspace API usage limits. You will regain access on 2026-11-01 at 00:00 UTC.";

const err = (httpStatus, message, extra = {}) => Object.assign(new Error(message), { httpStatus, ...extra });

test("fallback runs for usage-limit, credit, and non-retryable 4xx, and not for retryable or billed errors", () => {
  assert.equal(classifyFallback({ httpStatus: 400, message: `anthropic 400: ${usageLimit}` }).reason, "usage-limit");
  assert.equal(classifyFallback({ httpStatus: 400, message: "anthropic 400: credit balance is too low" }).fallback, true);
  assert.equal(classifyFallback({ httpStatus: 400, message: "anthropic 400: insufficient credit" }).reason, "usage-limit");
  assert.equal(classifyFallback({ httpStatus: 400, message: "anthropic 400: out of credits" }).fallback, true);
  assert.equal(classifyFallback({ httpStatus: 429, message: "anthropic 429: quota exceeded" }).reason, "usage-limit");

  for (const status of [400, 401, 403, 404, 402, 422]) {
    const decision = classifyFallback({ httpStatus: status, message: `anthropic ${status}: no` });
    assert.equal(decision.fallback, true, String(status));
    assert.equal(decision.reason, "client-error");
  }

  assert.equal(classifyFallback({ httpStatus: 429, message: "anthropic 429: overloaded", retriesExhausted: false }).reason, "rate-limit-retryable");
  assert.equal(classifyFallback({
    httpStatus: 429,
    message: "anthropic 429: overloaded",
    retriesExhausted: false,
    remainingMs: () => MIN_MODEL_RETRY_MS,
  }).fallback, false);
  assert.equal(classifyFallback({ httpStatus: 429, message: "anthropic 429: overloaded", retriesExhausted: true }).reason, "rate-limit-after-retries");
  assert.equal(classifyFallback({
    httpStatus: 429,
    message: "anthropic 429: overloaded",
    remainingMs: () => MIN_MODEL_RETRY_MS - 1,
  }).reason, "rate-limit-after-retries");

  assert.equal(classifyFallback({ httpStatus: 408, message: "anthropic 408: timeout" }).fallback, false);
  assert.equal(classifyFallback({ httpStatus: 500, message: "anthropic 500: boom" }).reason, "retryable");
  assert.equal(classifyFallback({ httpStatus: 529, message: "anthropic 529: overloaded" }).fallback, false);
  assert.equal(classifyFallback({ httpStatus: null, message: "anthropic network: reset" }).reason, "not-eligible");
  assert.equal(classifyFallback({ aborted: true, httpStatus: 400, message: usageLimit }).reason, "aborted");
  assert.equal(classifyFallback({ spendCap: true, httpStatus: 400, message: "credit balance is too low" }).reason, "spend-cap");
  assert.equal(classifyFallback({ billed: true, httpStatus: 200, message: "no JSON in reply" }).reason, "billed");
  assert.equal(classifyFallback({ billed: true, httpStatus: 200, message: usageLimit }).fallback, false);
});

test("a missing OpenRouter key fails the original error and a set key selects the model", () => {
  const usage = err(400, `anthropic 400: ${usageLimit}`);
  const missing = planModelFallback({ error: usage, env: {} });
  assert.equal(missing.action, "raise");
  assert.equal(missing.reason, "no-fallback-configured");
  assert.equal(missing.prior, "usage-limit");

  const blank = planModelFallback({ error: usage, env: { OPENROUTER_API_KEY: "  " } });
  assert.equal(blank.reason, "no-fallback-configured");

  const ready = planModelFallback({ error: usage, env: { OPENROUTER_API_KEY: " sk-or-test " } });
  assert.equal(ready.action, "fallback");
  assert.equal(ready.model, DEFAULT_FALLBACK_MODEL);
  assert.equal(ready.apiKey, "sk-or-test");
  assert.equal(fallbackModelFromEnv({ FALLBACK_MODEL: " custom/model " }), "custom/model");
  assert.equal(fallbackModelFromEnv({}), DEFAULT_FALLBACK_MODEL);

  const rate = planModelFallback({
    error: err(429, "anthropic 429: slow down"),
    env: { OPENROUTER_API_KEY: "sk-or-test" },
    retriesExhausted: false,
    remainingMs: () => MIN_MODEL_RETRY_MS,
  });
  assert.equal(rate.action, "raise");
  assert.equal(rate.reason, "rate-limit-retryable");

  const after = planModelFallback({
    error: err(401, "anthropic 401: invalid x-api-key"),
    env: { OPENROUTER_API_KEY: "sk-or-test", FALLBACK_MODEL: "anthropic/claude-sonnet-4.6" },
  });
  assert.equal(after.action, "fallback");
  assert.equal(after.reason, "client-error");
  assert.equal(after.model, "anthropic/claude-sonnet-4.6");
});

test("a fallback attempt is not sent through Anthropic again", () => {
  const decision = shouldRetry({
    fallbackAttempted: true,
    httpStatus: 500,
    remainingMs: 300_000,
    attemptDurationMs: 1000,
  });
  assert.equal(decision.retry, false);
  assert.equal(decision.reason, "fallback-attempted");
});

const anthropicRefusal = (status, message) => async (url) => {
  assert.equal(url, "https://api.anthropic.com/v1/messages");
  return {
    ok: false,
    status,
    text: async () => JSON.stringify({
      type: "error",
      error: { type: "invalid_request_error", message },
    }),
  };
};

test("usage-limit falls back once, and a missing key does not call OpenRouter", async () => {
  const lines = [];
  const original = console.log;
  console.log = (line) => lines.push(String(line));
  try {
    const usageLog = createUsageLog({ log: () => {} });
    let openRouterCalls = 0;
    await assert.rejects(() => postModelMessage({
      fetchImpl: async (url) => {
        if (String(url).includes("openrouter.ai")) openRouterCalls += 1;
        return anthropicRefusal(400, usageLimit)(url);
      },
      env: {},
      apiKey: "anthropic-key",
      model: "claude-haiku-4-5-20251001",
      prompt: "Return JSON",
      maxTokens: 400,
      tool: { name: "web_search", max_uses: 2 },
      jobId: "capital",
      attempt: 1,
      usageLog,
    }), (error) => {
      assert.equal(error.httpStatus, 400);
      assert.match(error.message, /usage limits/);
      return true;
    });
    assert.equal(openRouterCalls, 0);
    assert.ok(lines.some((line) => line === "Model fallback: no fallback configured"));
    const skipped = lines.map((line) => {
      try { return JSON.parse(line); } catch (e) { return null; }
    }).find((row) => row && row.event === "model_fallback_skipped");
    assert.equal(skipped.reason, "no fallback configured");
    assert.equal(skipped.jobId, "capital");
  } finally {
    console.log = original;
  }
});

test("an eligible 4xx is retried on OpenRouter and a 429 or 500 is not, until retries are exhausted", async () => {
  const seen = [];
  const fetchImpl = async (url, opts) => {
    const href = String(url);
    seen.push({ href, body: opts.body ? JSON.parse(opts.body) : null, headers: opts.headers });
    if (href.includes("api.anthropic.com")) {
      return {
        ok: false,
        status: 403,
        text: async () => JSON.stringify({ type: "error", error: { message: "forbidden" } }),
      };
    }
    assert.equal(href, OPENROUTER_CHAT_URL);
    assert.equal(opts.headers.Authorization, "Bearer sk-or-test");
    assert.equal(opts.headers["x-api-key"], undefined);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        model: DEFAULT_FALLBACK_MODEL,
        choices: [{
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: "{\"capex\":{\"Alphabet\":185}}",
            annotations: [{
              type: "url_citation",
              url_citation: {
                url: "https://example.test/capex",
                title: "Capex",
                content: "Alphabet planned 185 billion.",
              },
            }],
          },
        }],
        usage: { prompt_tokens: 20, completion_tokens: 8, cost: 0.0123 },
      }),
    };
  };

  const lines = [];
  const original = console.log;
  console.log = (line) => lines.push(String(line));
  const fallbacks = [];
  try {
    const usageLog = createUsageLog({ log: () => {} });
    const result = await postModelMessage({
      fetchImpl,
      env: { OPENROUTER_API_KEY: "sk-or-test" },
      apiKey: "anthropic-key",
      model: "claude-haiku-4-5-20251001",
      prompt: "Return JSON",
      messages: [{ role: "user", content: "Return JSON" }],
      maxTokens: 400,
      tool: { name: "web_search", type: "web_search_20260318", max_uses: 2, allowed_domains: ["example.test"] },
      jobId: "capital",
      attempt: 1,
      usageLog,
      onFallback: (info) => fallbacks.push(info),
    });
    assert.equal(result.content[0].text, "{\"capex\":{\"Alphabet\":185}}");
    assert.equal(result.content[0].citations[0].cited_text, "Alphabet planned 185 billion.");
    assert.equal(result.stopReason, "end_turn");
    assert.equal(result.usageRecord.provider, "openrouter");
    assert.equal(result.usageRecord.estimatedUsd, 0.0123);
    assert.equal(result.usageRecord.estimateComplete, false);
    assert.equal(usageLog.calls.length, 2);
    assert.equal(usageLog.calls[0].billed, false);
    assert.equal(usageLog.calls[1].continuation, "openrouter");
    const sent = seen[1].body;
    assert.equal(sent.model, DEFAULT_FALLBACK_MODEL);
    assert.equal(sent.messages[0].content, "Return JSON");
    assert.equal(sent.plugins[0].id, "web");
    assert.equal(sent.plugins[0].max_results, 2);
    assert.deepEqual(sent.plugins[0].include_domains, ["example.test"]);
    assert.deepEqual(sent.reasoning, { effort: "low" });
    assert.equal(sent.response_format, undefined);
    assert.equal(JSON.stringify(sent).includes("anthropic-key"), false);
    assert.ok(lines.some((line) => line === `Model path: OpenRouter fallback (${DEFAULT_FALLBACK_MODEL}) section capital`));
    assert.equal(fallbacks[0].reason, "client-error");
    assert.equal(fallbacks[0].httpStatus, 403);
  } finally {
    console.log = original;
  }

  const rateSeen = [];
  const usageLog = createUsageLog({ log: () => {} });
  await assert.rejects(() => postModelMessage({
    fetchImpl: async (url) => {
      rateSeen.push(String(url));
      return { ok: false, status: 429, text: async () => "slow down" };
    },
    env: { OPENROUTER_API_KEY: "sk-or-test" },
    apiKey: "anthropic-key",
    model: "claude-haiku-4-5-20251001",
    prompt: "Return JSON",
    maxTokens: 400,
    jobId: "users",
    attempt: 1,
    retriesExhausted: false,
    remainingMs: () => MIN_MODEL_RETRY_MS,
    usageLog,
  }), (error) => error.httpStatus === 429);
  assert.equal(rateSeen.some((url) => url.includes("openrouter.ai")), false);

  const exhausted = [];
  await postModelMessage({
    fetchImpl: async (url) => {
      exhausted.push(String(url));
      if (String(url).includes("api.anthropic.com")) {
        return { ok: false, status: 429, text: async () => "slow down" };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          choices: [{ finish_reason: "stop", message: { content: "{\"ok\":true}" } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.001 },
        }),
      };
    },
    env: { OPENROUTER_API_KEY: "sk-or-test", FALLBACK_MODEL: "anthropic/claude-sonnet-4.6" },
    apiKey: "anthropic-key",
    model: "claude-haiku-4-5-20251001",
    prompt: "Return JSON",
    maxTokens: 1500,
    tool: null,
    jobId: "users",
    attempt: 2,
    retriesExhausted: true,
    usageLog: createUsageLog({ log: () => {} }),
  });
  assert.equal(exhausted.filter((url) => url.includes("openrouter.ai")).length, 1);
  const reformats = openRouterBody({
    model: "anthropic/claude-sonnet-4.6",
    messages: [{ role: "user", content: "Return JSON" }],
    maxTokens: 1500,
    tool: null,
  });
  assert.deepEqual(reformats.response_format, { type: "json_object" });
  assert.equal(reformats.reasoning, undefined);
  assert.equal(reformats.plugins, undefined);

  const serverSeen = [];
  await assert.rejects(() => postModelMessage({
    fetchImpl: async (url) => {
      serverSeen.push(String(url));
      return { ok: false, status: 529, text: async () => "overloaded" };
    },
    env: { OPENROUTER_API_KEY: "sk-or-test" },
    apiKey: "anthropic-key",
    model: "claude-haiku-4-5-20251001",
    prompt: "Return JSON",
    maxTokens: 400,
    jobId: "energy",
    attempt: 1,
    usageLog: createUsageLog({ log: () => {} }),
  }), (error) => error.httpStatus === 529);
  assert.equal(serverSeen.some((url) => url.includes("openrouter.ai")), false);
});

test("a successful Anthropic call is logged with the Anthropic model path", async () => {
  const lines = [];
  const original = console.log;
  console.log = (line) => lines.push(String(line));
  try {
    const result = await postModelMessage({
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          content: [{ type: "text", text: "{\"ok\":true}" }],
          stop_reason: "end_turn",
          usage: { input_tokens: 3, output_tokens: 2 },
        }),
      }),
      env: { OPENROUTER_API_KEY: "sk-or-test" },
      apiKey: "anthropic-key",
      model: "claude-haiku-4-5-20251001",
      prompt: "Return JSON",
      maxTokens: 400,
      jobId: "share",
      attempt: 1,
      usageLog: createUsageLog({ log: () => {} }),
    });
    assert.equal(result.stopReason, "end_turn");
    assert.ok(lines.includes(modelPathLine({
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      jobId: "share",
    })));
  } finally {
    console.log = original;
  }
});

test("OpenRouter failure stays on the fallback and does not look like a fresh Anthropic retry", async () => {
  const usageLog = createUsageLog({ log: () => {} });
  await assert.rejects(() => postModelMessage({
    fetchImpl: async (url) => {
      if (String(url).includes("api.anthropic.com")) {
        return { ok: false, status: 400, text: async () => usageLimit };
      }
      return { ok: false, status: 500, text: async () => "upstream" };
    },
    env: { OPENROUTER_API_KEY: "sk-or-test" },
    apiKey: "anthropic-key",
    model: "claude-haiku-4-5-20251001",
    prompt: "Return JSON",
    maxTokens: 400,
    jobId: "models",
    attempt: 1,
    usageLog,
  }), (error) => {
    assert.equal(error.fallbackAttempted, true);
    assert.equal(error.httpStatus, 500);
    assert.match(error.message, /OpenRouter fallback failed/);
    return true;
  });
  assert.equal(shouldRetry({
    fallbackAttempted: true,
    httpStatus: 500,
    remainingMs: 300_000,
    kind: "model",
  }).retry, false);
});

test("degraded and workflow failure payloads name the run and omit secrets", () => {
  const degraded = buildDegradedAlert({
    runAt: "2026-10-19T08:17:00.000Z",
    repo: "VolantTyler/state-of-ai-briefing",
    workflow: "Refresh briefing data",
    runUrl: "https://github.com/VolantTyler/state-of-ai-briefing/actions/runs/1",
    fallbacks: [{
      jobId: "capital",
      model: DEFAULT_FALLBACK_MODEL,
      anthropicModel: "claude-haiku-4-5-20251001",
      reason: "usage-limit",
      httpStatus: 400,
    }],
  });
  assert.equal(degraded.event, "refresh_degraded");
  assert.equal(degraded.urgency, "low");
  assert.equal(degraded.severity, "degraded");
  assert.match(degraded.errorSummary, /capital/);
  assert.equal(degraded.fallbacks[0].provider, "openrouter");
  assert.equal(JSON.stringify(degraded).includes("sk-"), false);

  const payload = buildJobFailurePayload({
    repo: "VolantTyler/state-of-ai-briefing",
    workflow: "Refresh briefing data",
    runUrl: "https://github.com/VolantTyler/state-of-ai-briefing/actions/runs/9",
    job: "refresh",
    step: "Refresh",
    error: `anthropic 400: ${usageLimit} sk-ant-secret github_pat_abc Bearer sk-or-live`,
  });
  assert.equal(payload.event, "refresh_failed");
  assert.equal(payload.urgency, "high");
  assert.equal(payload.repo, "VolantTyler/state-of-ai-briefing");
  assert.equal(payload.workflow, "Refresh briefing data");
  assert.equal(payload.runUrl, "https://github.com/VolantTyler/state-of-ai-briefing/actions/runs/9");
  assert.equal(payload.job, "refresh");
  assert.equal(payload.step, "Refresh");
  assert.match(payload.error, /usage limits/);
  assert.equal(payload.error.includes("sk-ant-secret"), false);
  assert.equal(payload.error.includes("github_pat_abc"), false);
  assert.equal(payload.error.includes("sk-or-live"), false);
  assert.equal(scrubSecrets("Bearer abc.def").includes("abc.def"), false);

  assert.equal(grokSecretsArmed({}), false);
  assert.equal(grokSecretsArmed({ GROK_BOT_WEBHOOK_URL: "https://example.test", GROK_BOT_WEBHOOK_KEY: "" }), false);
  assert.equal(grokSecretsArmed({ GROK_BOT_WEBHOOK_URL: "https://example.test", GROK_BOT_WEBHOOK_KEY: "k" }), true);
  assert.equal(failedStepFromOutcomes([
    { name: "checkout", outcome: "success" },
    { name: "npm ci", outcome: "failure" },
    { name: "Refresh", outcome: "skipped" },
  ]), "npm ci");
  assert.equal(failedStepFromOutcomes([]), "refresh");
});

test("the workflow alert posts the failure body, and skips when unset, already sent, or not a fallback case", async () => {
  const posts = [];
  const lines = [];
  const original = console.log;
  console.log = (line) => lines.push(String(line));
  try {
    const skipped = await sendWorkflowFailureAlert({
      env: {},
      fetchImpl: async () => { throw new Error("should not post"); },
      notifiedPath: "missing-notified-file",
      summaryPath: "missing-summary-file",
    });
    assert.equal(skipped.skipped, "unset");
    assert.match(lines.at(-1), /GROK_BOT_WEBHOOK_URL or GROK_BOT_WEBHOOK_KEY is not set/);

    const sent = await sendWorkflowFailureAlert({
      env: {
        GROK_BOT_WEBHOOK_URL: "https://hooks.example.test/grok",
        GROK_BOT_WEBHOOK_KEY: "hook-key",
        ALERT_REPO: "VolantTyler/state-of-ai-briefing",
        ALERT_WORKFLOW: "Refresh briefing data",
        ALERT_RUN_URL: "https://github.com/VolantTyler/state-of-ai-briefing/actions/runs/9",
        ALERT_JOB: "refresh",
        REFRESH_OUTCOME: "failure",
        CONTENTS_OUTCOME: "success",
      },
      fetchImpl: async (url, opts) => {
        posts.push({ url, body: JSON.parse(opts.body), auth: opts.headers.Authorization });
        return { ok: true, status: 200 };
      },
      notifiedPath: "missing-notified-file",
      summaryPath: "missing-summary-file",
    });
    assert.equal(sent.ok, true);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].url, "https://hooks.example.test/grok");
    assert.equal(posts[0].auth, "Bearer hook-key");
    assert.equal(posts[0].body.step, "Refresh");
    assert.equal(posts[0].body.repo, "VolantTyler/state-of-ai-briefing");
    assert.equal(posts[0].body.runUrl, "https://github.com/VolantTyler/state-of-ai-briefing/actions/runs/9");
    assert.equal(JSON.stringify(posts[0].body).includes("hook-key"), false);
    assert.match(lines.at(-1), /Grok Bot alert posted/);

    const dir = mkdtempSync(path.join(tmpdir(), "grok-alert-"));
    const notified = path.join(dir, "notified");
    writeFileSync(notified, "sent\n");
    const again = await sendWorkflowFailureAlert({
      env: {
        GROK_BOT_WEBHOOK_URL: "https://hooks.example.test/grok",
        GROK_BOT_WEBHOOK_KEY: "hook-key",
      },
      fetchImpl: async () => { throw new Error("should not post"); },
      notifiedPath: notified,
      summaryPath: path.join(dir, "missing"),
    });
    assert.equal(again.skipped, "already-sent");
    assert.match(lines.at(-1), /already delivered/);
  } finally {
    console.log = original;
  }
});
