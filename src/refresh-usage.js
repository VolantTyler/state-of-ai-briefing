/* Per-call Anthropic usage and a list-price estimate.

   The nightly handler used to keep the reply text and drop `usage`, so a
   run left no token or search counts anywhere. This module keeps the
   provider usage object, prices the fields Anthropic publishes, and says
   so when a field has no rate in the table. */

import { SEARCH_MAX_USES } from "./refresh-policy.js";

/* Claude API list prices, standard global inference.
   Not batch, and not the 1.1× US-only inference multiplier.
   Checked 2026-10-02 against:
     https://platform.claude.com/docs/en/about-claude/pricing
     https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool
   Token rates are USD per million tokens. Web search is $10 per 1,000 searches. */
export const PRICE_CHECKED = "2026-10-02";
export const PRICE_SOURCE = "https://platform.claude.com/docs/en/about-claude/pricing";
export const WEB_SEARCH_PRICE_SOURCE = "https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool";

export const MODEL_PRICES = {
  "claude-sonnet-4-6": {
    inputPerMTok: 3,
    cacheWrite5mPerMTok: 3.75,
    cacheWrite1hPerMTok: 6,
    cacheReadPerMTok: 0.3,
    outputPerMTok: 15,
  },
  /* Optional per-job override target. Not selected unless an env var says so. */
  "claude-haiku-4-5": {
    inputPerMTok: 1,
    cacheWrite5mPerMTok: 1.25,
    cacheWrite1hPerMTok: 2,
    cacheReadPerMTok: 0.1,
    outputPerMTok: 5,
  },
};

export const WEB_SEARCH_USD_PER_REQUEST = 10 / 1000;

/* These show up under usage.server_tool_use and have no per-call fee on
   top of tokens. Dynamic filtering's code execution is included when web
   search is on the request. Web fetch is token-only. Counts are still kept. */
export const SERVER_TOOLS_INCLUDED_IN_TOKENS = {
  code_execution_requests: "Code execution provisioned for dynamic filtering has no charge beyond input and output tokens.",
  web_fetch_requests: "Web fetch has no per-request fee; fetched content is billed as tokens.",
};

/* max_tokens sent on each Messages call. A server-side search loop can
   sample once per iteration, so output_tokens in `usage` can be up to
   max_uses × max_tokens, not max_tokens once. */
export const JOB_MAX_TOKENS = {
  valuations: 8000,
  models: 4000,
  users: 4000,
  share: 4000,
  capital: 4000,
  energy: 4000,
};

const MTOK = 1_000_000;

const round6 = (n) => Math.round((n + Number.EPSILON) * 1e6) / 1e6;

const finiteOrZero = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const modelForJob = (jobId, env = process.env) => {
  const specific = env[`ANTHROPIC_MODEL_${String(jobId || "").toUpperCase()}`];
  if (typeof specific === "string" && specific.trim()) return specific.trim();
  if (typeof env.ANTHROPIC_MODEL === "string" && env.ANTHROPIC_MODEL.trim()) return env.ANTHROPIC_MODEL.trim();
  return "claude-sonnet-4-6";
};

/* `cache_creation_input_tokens` is the total. The 5-minute / 1-hour split
   lives on `cache_creation` when Anthropic sends it. Pricing the total and
   the split would bill the write twice, so the split wins. Without a split,
   the total is priced as a 5-minute write — that is the API default — and
   `assumed5m` says the rate was inferred. */
export const cacheWriteTokens = (usage) => {
  if (!usage || typeof usage !== "object") {
    return { ephemeral5m: null, ephemeral1h: null, assumed5m: false };
  }
  const creation = usage.cache_creation;
  const hasSplit = creation && typeof creation === "object" && (
    Number.isFinite(Number(creation.ephemeral_5m_input_tokens))
    || Number.isFinite(Number(creation.ephemeral_1h_input_tokens))
  );
  if (hasSplit) {
    return {
      ephemeral5m: finiteOrZero(creation.ephemeral_5m_input_tokens),
      ephemeral1h: finiteOrZero(creation.ephemeral_1h_input_tokens),
      assumed5m: false,
    };
  }
  const total = Number(usage.cache_creation_input_tokens);
  if (Number.isFinite(total) && total > 0) {
    return { ephemeral5m: total, ephemeral1h: 0, assumed5m: true };
  }
  return { ephemeral5m: 0, ephemeral1h: 0, assumed5m: false };
};

export const normalizeAnthropicUsage = (data) => {
  const usage = data && data.usage && typeof data.usage === "object" ? data.usage : null;
  const serverToolUse = {};
  if (usage && usage.server_tool_use && typeof usage.server_tool_use === "object") {
    for (const [key, value] of Object.entries(usage.server_tool_use)) serverToolUse[key] = value;
  }
  return {
    inputTokens: usage ? finiteOrZero(usage.input_tokens) : null,
    outputTokens: usage ? finiteOrZero(usage.output_tokens) : null,
    cacheCreationInputTokens: usage ? finiteOrZero(usage.cache_creation_input_tokens) : null,
    cacheReadInputTokens: usage ? finiteOrZero(usage.cache_read_input_tokens) : null,
    cacheCreation: usage && usage.cache_creation && typeof usage.cache_creation === "object"
      ? { ...usage.cache_creation }
      : null,
    cacheWrite: cacheWriteTokens(usage),
    serverToolUse,
    serviceTier: usage && typeof usage.service_tier === "string" ? usage.service_tier : null,
    usage,
  };
};

const tokenUsd = (tokens, perMTok) => (Number(tokens) || 0) * perMTok / MTOK;

/* Prices one call from the table above. `estimatedUsd` is only the lines
   that have a rate. `estimateComplete` is false when the model is missing
   from the table, the provider omitted usage, a server-tool count has no
   rate, or the response says it was not standard global inference. */
export const estimateCallCost = (record) => {
  const unpriced = [];
  const notes = [];
  const normalized = record.inputTokens === undefined && record.usage
    ? { ...record, ...normalizeAnthropicUsage({ usage: record.usage }) }
    : record;
  const rates = MODEL_PRICES[normalized.model];
  const server = normalized.serverToolUse || {};
  const webSearchRequests = finiteOrZero(server.web_search_requests);
  const searchUsd = webSearchRequests * WEB_SEARCH_USD_PER_REQUEST;

  if (!normalized.usage && normalized.inputTokens == null && normalized.outputTokens == null) {
    unpriced.push("usage-not-reported");
  }
  if (normalized.serviceTier && normalized.serviceTier !== "standard") {
    unpriced.push(`service_tier:${normalized.serviceTier}`);
    notes.push("Table is standard-tier list price.");
  }
  if (normalized.cacheWrite && normalized.cacheWrite.assumed5m) {
    notes.push("cache_creation_input_tokens priced as a 5-minute cache write; the response had no 5m/1h split.");
  }

  for (const [key, value] of Object.entries(server)) {
    if (key === "web_search_requests") continue;
    if (Object.prototype.hasOwnProperty.call(SERVER_TOOLS_INCLUDED_IN_TOKENS, key)) {
      if (typeof value === "number" && value > 0) notes.push(SERVER_TOOLS_INCLUDED_IN_TOKENS[key]);
      continue;
    }
    if (typeof value === "number" && value > 0) unpriced.push(`server_tool_use.${key}`);
  }

  if (!rates) {
    if (normalized.model) unpriced.push(`model:${normalized.model}`);
    return {
      estimatedUsd: round6(searchUsd),
      estimateComplete: false,
      unpriced,
      notes,
      webSearchUsd: round6(searchUsd),
      inputUsd: null,
      outputUsd: null,
      cacheReadUsd: null,
      cacheWrite5mUsd: null,
      cacheWrite1hUsd: null,
    };
  }

  const cache = normalized.cacheWrite || { ephemeral5m: 0, ephemeral1h: 0 };
  const inputUsd = tokenUsd(normalized.inputTokens, rates.inputPerMTok);
  const outputUsd = tokenUsd(normalized.outputTokens, rates.outputPerMTok);
  const cacheReadUsd = tokenUsd(normalized.cacheReadInputTokens, rates.cacheReadPerMTok);
  const cacheWrite5mUsd = tokenUsd(cache.ephemeral5m, rates.cacheWrite5mPerMTok);
  const cacheWrite1hUsd = tokenUsd(cache.ephemeral1h, rates.cacheWrite1hPerMTok);
  const estimatedUsd = inputUsd + outputUsd + cacheReadUsd + cacheWrite5mUsd + cacheWrite1hUsd + searchUsd;
  return {
    estimatedUsd: round6(estimatedUsd),
    estimateComplete: unpriced.length === 0,
    unpriced,
    notes,
    webSearchUsd: round6(searchUsd),
    inputUsd: round6(inputUsd),
    outputUsd: round6(outputUsd),
    cacheReadUsd: round6(cacheReadUsd),
    cacheWrite5mUsd: round6(cacheWrite5mUsd),
    cacheWrite1hUsd: round6(cacheWrite1hUsd),
  };
};

const addCount = (into, key, value) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  into[key] = (into[key] || 0) + value;
  return true;
};

const blankJob = () => ({
  attempts: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationInputTokens: 0,
  cacheReadInputTokens: 0,
  serverToolUse: {},
  durationMs: 0,
  stopReasons: [],
  estimatedUsd: 0,
  estimateComplete: true,
  unpriced: [],
  timedOut: false,
  billedAttempts: 0,
  unbilledAttempts: 0,
});

const addCallToJob = (job, call) => {
  job.attempts += 1;
  job.inputTokens += call.inputTokens || 0;
  job.outputTokens += call.outputTokens || 0;
  job.cacheCreationInputTokens += call.cacheCreationInputTokens || 0;
  job.cacheReadInputTokens += call.cacheReadInputTokens || 0;
  job.durationMs += call.durationMs || 0;
  if (call.stopReason && !job.stopReasons.includes(call.stopReason)) job.stopReasons.push(call.stopReason);
  if (call.estimatedUsd != null) job.estimatedUsd = round6(job.estimatedUsd + call.estimatedUsd);
  if (call.estimateComplete === false) job.estimateComplete = false;
  for (const item of call.unpriced || []) {
    if (!job.unpriced.includes(item)) job.unpriced.push(item);
  }
  for (const [key, value] of Object.entries(call.serverToolUse || {})) addCount(job.serverToolUse, key, value);
  if (call.billed === true) job.billedAttempts += 1;
  else if (call.billed === false) job.unbilledAttempts += 1;
  if (call.aborted) job.timedOut = true;
};

export const priceTableStamp = () => ({
  source: PRICE_SOURCE,
  webSearchSource: WEB_SEARCH_PRICE_SOURCE,
  checked: PRICE_CHECKED,
  label: "Estimate from Claude API standard list prices, global inference, not batch. USD.",
  models: MODEL_PRICES,
  webSearchUsdPerRequest: WEB_SEARCH_USD_PER_REQUEST,
  serverToolsIncludedInTokens: SERVER_TOOLS_INCLUDED_IN_TOKENS,
});

export const summarizeUsage = (calls, {
  runAt = null,
  timedOut = [],
  wallClockMs = null,
  fatal = false,
  budget = null,
} = {}) => {
  const jobs = {};
  const totals = blankJob();
  const unpriced = [];
  for (const call of calls) {
    if (!jobs[call.jobId]) jobs[call.jobId] = blankJob();
    addCallToJob(jobs[call.jobId], call);
    addCallToJob(totals, call);
    for (const item of call.unpriced || []) {
      if (!unpriced.includes(item)) unpriced.push(item);
    }
  }
  for (const id of timedOut) {
    if (!jobs[id]) jobs[id] = blankJob();
    jobs[id].timedOut = true;
  }
  const tokensIncomplete = calls.some((call) => call.inputTokens == null || call.outputTokens == null);
  let estimateComplete = totals.estimateComplete && !tokensIncomplete;
  /* A job cut off before its response was read has no meter reading.
     Anthropic may still have billed the in-flight request. */
  for (const id of timedOut) {
    const job = jobs[id];
    const recorded = job && job.attempts > 0 && !job.unpriced.includes("usage-not-reported");
    if (!recorded) {
      estimateComplete = false;
      if (!unpriced.includes("timed-out")) unpriced.push("timed-out");
    }
  }
  return {
    runAt,
    fatal: Boolean(fatal),
    wallClockMs,
    budget,
    timedOut: [...timedOut],
    priceTable: priceTableStamp(),
    calls,
    jobs,
    totals: {
      calls: calls.length,
      inputTokens: totals.inputTokens,
      outputTokens: totals.outputTokens,
      cacheCreationInputTokens: totals.cacheCreationInputTokens,
      cacheReadInputTokens: totals.cacheReadInputTokens,
      serverToolUse: totals.serverToolUse,
      summedCallDurationMs: totals.durationMs,
      wallClockMs,
      estimatedUsd: totals.estimatedUsd,
      estimateComplete,
      unpriced,
      tokensIncomplete,
      billedAttempts: totals.billedAttempts,
      unbilledAttempts: totals.unbilledAttempts,
    },
  };
};

/* Search-fee and output-token ceiling for one attempt and no retry.
   Output assumes every search iteration emits a full max_tokens and that
   usage.output_tokens sums those iterations. Input tokens are not capped
   by this code and are not in the figure. */
export const nightlyCapCeiling = ({ includeShare = false, model = "claude-sonnet-4-6" } = {}) => {
  const jobs = ["valuations", "models", "users", "capital", "energy"];
  if (includeShare) jobs.push("share");
  let searches = 0;
  let outputTokensAtCap = 0;
  for (const id of jobs) {
    const uses = SEARCH_MAX_USES[id];
    const maxTokens = JOB_MAX_TOKENS[id];
    searches += uses;
    outputTokensAtCap += uses * maxTokens;
  }
  const rates = MODEL_PRICES[model];
  const searchUsd = round6(searches * WEB_SEARCH_USD_PER_REQUEST);
  const outputUsd = rates ? round6(outputTokensAtCap * rates.outputPerMTok / MTOK) : null;
  return {
    model,
    jobs,
    searches,
    searchUsd,
    outputTokensAtCap,
    outputUsd,
    usdExcludingInput: outputUsd == null ? null : round6(searchUsd + outputUsd),
    inputTokens: "uncapped",
    attempts: 1,
  };
};

const usageLogLine = (record) => JSON.stringify({
  source: "state-of-ai-briefing",
  event: "anthropic_usage",
  ...record,
});

export const createUsageLog = ({ now = Date.now, log = (line) => console.log(line) } = {}) => {
  const calls = [];
  const open = new Map();
  const keyOf = (record) => `${record.jobId}:${record.attempt}`;
  return {
    calls,
    start(partial) {
      open.set(keyOf(partial), { ...partial, startedAt: now() });
    },
    finish(record) {
      const key = keyOf(record);
      open.delete(key);
      if (calls.some((call) => call.jobId === record.jobId && call.attempt === record.attempt)) return;
      calls.push(record);
      log(usageLogLine(record));
    },
    abortOpen() {
      for (const [key, partial] of open) {
        const record = {
          jobId: partial.jobId,
          attempt: partial.attempt,
          model: partial.model || null,
          durationMs: Math.max(0, now() - partial.startedAt),
          stopReason: null,
          httpStatus: null,
          inputTokens: null,
          outputTokens: null,
          cacheCreationInputTokens: null,
          cacheReadInputTokens: null,
          cacheCreation: null,
          cacheWrite: { ephemeral5m: null, ephemeral1h: null, assumed5m: false },
          serverToolUse: {},
          serviceTier: null,
          usage: null,
          estimatedUsd: 0,
          estimateComplete: false,
          unpriced: ["usage-not-reported"],
          billed: null,
          aborted: true,
          error: "aborted: time budget exhausted before the response was read",
        };
        open.delete(key);
        calls.push(record);
        log(usageLogLine(record));
      }
    },
    summary(extra) {
      return summarizeUsage(calls, extra);
    },
  };
};

const truncate = (value, n = 500) => {
  const text = String(value || "");
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
};

/* One Messages call. Records provider usage whether the reply parsed or
   not. A non-2xx body that itself carries `usage` is kept and marked billed. */
export const postAnthropicMessage = async ({
  fetchImpl = fetch,
  apiKey,
  model,
  prompt,
  maxTokens,
  tool,
  jobId,
  attempt,
  signal,
  usageLog,
  now = Date.now,
}) => {
  const started = now();
  usageLog.start({ jobId, attempt, model });
  const finishError = (fields) => {
    const normalized = normalizeAnthropicUsage(fields.data);
    const cost = estimateCallCost({ model, ...normalized });
    const record = {
      jobId,
      attempt,
      model,
      durationMs: Math.max(0, now() - started),
      stopReason: fields.data && fields.data.stop_reason || null,
      httpStatus: fields.httpStatus ?? null,
      ...normalized,
      ...cost,
      billed: fields.billed,
      aborted: Boolean(fields.aborted),
      error: fields.error ? truncate(fields.error) : null,
    };
    usageLog.finish(record);
    const error = new Error(fields.message);
    error.httpStatus = record.httpStatus;
    error.billed = fields.billed === true;
    error.aborted = Boolean(fields.aborted);
    error.usageRecord = record;
    return error;
  };

  let res;
  try {
    res = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
        tools: [tool],
      }),
    });
  } catch (e) {
    const aborted = Boolean(signal && signal.aborted) || e.name === "AbortError";
    throw finishError({
      data: null,
      httpStatus: null,
      billed: null,
      aborted,
      error: aborted ? "aborted: time budget exhausted before the response was read" : e.message,
      message: aborted ? "time budget exhausted" : `anthropic network: ${e.message}`,
    });
  }

  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (e) { data = null; }
  const sawUsage = Boolean(data && data.usage);
  if (!res.ok) {
    throw finishError({
      data,
      httpStatus: res.status,
      billed: sawUsage,
      aborted: false,
      error: text,
      message: `anthropic ${res.status}: ${text}`,
    });
  }
  if (!data || !data.content) {
    throw finishError({
      data,
      httpStatus: res.status,
      billed: sawUsage,
      aborted: false,
      error: "empty response",
      message: "empty response",
    });
  }

  const normalized = normalizeAnthropicUsage(data);
  const cost = estimateCallCost({ model, ...normalized });
  const record = {
    jobId,
    attempt,
    model,
    durationMs: Math.max(0, now() - started),
    stopReason: data.stop_reason || null,
    httpStatus: res.status,
    ...normalized,
    ...cost,
    billed: true,
    aborted: false,
    error: null,
  };
  usageLog.finish(record);
  return { content: data.content, stopReason: data.stop_reason || null, usageRecord: record };
};
