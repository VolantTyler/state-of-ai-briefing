import { mkdir, writeFile } from "node:fs/promises";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import {
  BASELINE, JOBS, packValues, unpackValues, panelDigest,
  historyToCSV, csvToHistory, logHistory,
} from "./briefing-data.js";
import { appendStoreRankDay, fetchStoreRanks } from "./store-ranks.js";
import { fetchMarketQuotes } from "./market-quotes.js";
import {
  MODEL_JOB_ORDER, SHARE_SKIPPED, VALUATIONS_FULL_RUN_SKIP,
  orderedModelJobs, resolveJobSelection, shareRefreshDue, shareSkipReason,
  valuationsTimeSkipReason, webSearchTool,
} from "./refresh-policy.js";
import {
  attemptWithRetry, budgetConfigFromEnv, callWindowMs, createBudget, settleWithinBudget, shouldRetry,
} from "./refresh-budget.js";
import {
  JOB_MAX_TOKENS, callWithPauseCap, createUsageLog, modelForJob, postAnthropicMessage,
  refreshMaxUsd, spendCapBlocks, spendCapReason,
} from "./refresh-usage.js";
import { writeWithFreshSha } from "./refresh-lock.js";
import {
  citationsFromContent, judgeValuations, renderJevActions,
} from "../api/valuation-judgment.js";

/* ————————————————————————————————————————————————
   Data refresh.

   `runRefresh` is the job. `scripts/refresh.js` calls it from GitHub
   Actions. Nothing in the browser ever touches the Anthropic API. The
   output is the panel files plus public/data/usage.json, committed back
   through the GitHub contents API. A push by the contents token is what
   makes Vercel rebuild and serve the files from the CDN. Git history *is*
   the trend log: every refresh is a dated commit you can diff, replay or
   revert.

   Actions concurrency is the overlap guard. This path does not write
   dev/refresh-lock.json.
   ———————————————————————————————————————————————— */

const GH = "https://api.github.com";
const VALUES_PATH = "public/data/values.json";
const TREND_PATH = "public/data/trend.csv";
const STORE_RANKS_PATH = "public/data/store-ranks.json";
const JEV_LOG_PATH = "dev/jev-actions.md";
const USAGE_PATH = "public/data/usage.json";

/* Model-backed panels. Markets and store ranks are plain HTTP and may
   retry on a much shorter remainder. */
const MODEL_JOBS = new Set(MODEL_JOB_ORDER);

export const VALUATION_SEARCH = `Search the web for one recent US-dollar figure for each company: Anthropic, OpenAI, xAI, Databricks, Z.ai (also called Zhipu), DeepSeek, Anduril, Moonshot AI, MiniMax.

For each company report only the company name, the dollar figure, and whether it is a valuation, a round size, a market cap, or a price still being negotiated. Cite the source passage for that figure, in the source's words. Batch several companies into each query. Stop when every company has one cited figure. Do not search again to cross-check or add background.`;

/* `runRefresh` points this at the env it was given. Helpers below read it
   at call time, so a test can pass a bag without leaking into the next one. */
let activeEnv = process.env;

const env = (k) => {
  const v = activeEnv[k];
  if (!v) throw new Error(`missing env var ${k}`);
  return v;
};

const branchName = () => activeEnv.GITHUB_BRANCH || "main";

/* ——— GitHub contents API ———
   Reads carry the blob sha, and writes must echo it back. That sha is the
   optimistic lock: if anything else touched the file since we read it, the
   PUT is rejected rather than silently clobbering. */
const ghHeaders = () => ({
  Authorization: `Bearer ${env("GITHUB_TOKEN")}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "state-of-ai-briefing",
});

const ghRead = async (path) => {
  const branch = branchName();
  const res = await fetch(`${GH}/repos/${env("GITHUB_REPO")}/contents/${path}?ref=${branch}`, {
    headers: ghHeaders(),
  });
  if (res.status === 404) return { sha: null, text: null };
  if (!res.ok) throw new Error(`GitHub read ${path}: ${res.status}`);
  const j = await res.json();
  return { sha: j.sha, text: Buffer.from(j.content, "base64").toString("utf8") };
};

const ghRequest = async (path, method, body) => {
  const res = await fetch(`${GH}/repos/${env("GITHUB_REPO")}/contents/${path}`, {
    method,
    headers: { ...ghHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    const error = new Error(`GitHub ${method} ${path}: ${res.status} ${text}`);
    error.status = res.status;
    error.body = text;
    throw error;
  }
  return text ? JSON.parse(text) : null;
};

const ghPut = (path, text, sha, message) => ghRequest(path, "PUT", {
  message,
  content: Buffer.from(text, "utf8").toString("base64"),
  branch: branchName(),
  ...(sha ? { sha } : {}),
});

/* Data files re-read the blob sha immediately before the PUT and retry once
   on a 409 or a sha 422. */
const ghWrite = (path, text, message) => writeWithFreshSha({
  read: () => ghRead(path),
  write: (sha) => ghPut(path, text, sha, message),
});

/* ——— Anthropic ——— */

/* Text the model actually wrote. Tool-result blocks are not included: those
   are search pages, and a brace inside one is not the panel's answer. */
const textPieces = (blocks) => (blocks || [])
  .filter((block) => block && typeof block.text === "string" && block.text)
  .map((block) => block.text);

const balancedObjects = (text) => {
  const found = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === "{") { if (depth === 0) start = i; depth++; continue; }
    if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) { found.push(text.slice(start, i + 1)); start = -1; }
      else if (depth < 0) depth = 0;
    }
  }
  return { found, open: depth > 0 || inStr };
};

const fencedBodies = (text) => {
  const out = [];
  const re = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match = re.exec(text);
  while (match) {
    if (match[1] && match[1].trim()) out.push(match[1].trim());
    match = re.exec(text);
  }
  return out;
};

/* Last parseable object across every text block, a ```json fence, and the
   blocks joined together. Joining alone drops a later object when an earlier
   block leaves a quote open. A trailing unclosed brace does not throw away
   an object that already parsed. */
export const extractJSON = (blocks) => {
  const pieces = textPieces(blocks);
  const sources = pieces.length > 1 ? [...pieces, pieces.join("\n")] : pieces;
  const candidates = [];
  let open = false;
  for (const source of sources) {
    for (const body of fencedBodies(source)) {
      const fenced = balancedObjects(body);
      candidates.push(...(fenced.found.length ? fenced.found : [body]));
      if (fenced.open) open = true;
    }
    const scan = balancedObjects(source.replace(/```json|```/gi, ""));
    candidates.push(...scan.found);
    if (scan.open) open = true;
  }
  for (let i = candidates.length - 1; i >= 0; i--) {
    try { return JSON.parse(candidates[i]); } catch (e) { /* an earlier object may be the real one */ }
  }
  if (open) throw new Error("truncated JSON in reply (raise max_tokens?)");
  throw new Error("no JSON in reply");
};

export const RAW_REPLY_LOG_CHARS = 300;

export const replyPreview = (blocks, n = RAW_REPLY_LOG_CHARS) => {
  const text = textPieces(blocks).join("\n");
  const body = text || (blocks || []).map((block) => block && block.type).filter(Boolean).join(",");
  return body.length > n ? body.slice(0, n) : body;
};

export const JSON_REFORMAT_MAX_TOKENS = 1500;

export const VALUATIONS_REPLY_LOG_CHARS = 1500;

/* Actions can show this when the valuations search returns text and no
   citation blocks. The preview is the model's text, not a second search. */
export const valuationsNoCitationsRecord = (blocks) => ({
  source: "state-of-ai-briefing",
  event: "valuations_no_citations",
  blockTypes: (blocks || []).map((block) => String((block && block.type) || "unknown")),
  rawReply: replyPreview(blocks, VALUATIONS_REPLY_LOG_CHARS),
});

/* Citations win. A pause_turn with none is continued, not logged. A finished
   reply with none is a failure: log the text, then throw. Do not mine the
   prose for passages. */
export const takeValuationPassages = (content, stopReason) => {
  const found = citationsFromContent(content);
  if (found.length) return found;
  if (stopReason === "pause_turn") return null;
  console.log(JSON.stringify(valuationsNoCitationsRecord(content)));
  throw new Error("no cited passages in reply");
};

export const jsonReformatPrompt = (raw, shape = "") => {
  const hint = shape
    ? `Use this shape, and only values the answer already states:\n${shape}\n\n`
    : "";
  /* The models reformat only sees the reply text, not the search results.
     An empty list fails the min-rows check and keeps the previous board,
     which is safer than a row the text never stated. */
  const modelsGuard = /"models"\s*:/.test(shape)
    ? 'If the answer does not already contain a full models list, return {"version":"","models":[]} and do not invent rows.\n\n'
    : "";
  return `Reformat the answer below as one JSON object and nothing else. No prose and no markdown fence. Use only facts already in the answer. Do not search.\n\n${hint}${modelsGuard}${raw}`;
};

const jsonShape = (prompt) => {
  const match = String(prompt || "").match(/\{[\s\S]*\}\s*$/);
  return match ? match[0].trim() : "";
};

/* One cheap follow-up when the searched reply has no parseable object.
   `reformat` is omitted on pause_turn so the caller can continue the search
   first. The follow-up must not call web search. */
export const recoverJsonReply = async ({ blocks, stopReason, reformat, onUnparsed }) => {
  try {
    return { value: extractJSON(blocks), reformatted: false };
  } catch (error) {
    if (stopReason === "pause_turn") return { value: null, reformatted: false };
    const rawReply = replyPreview(blocks);
    error.rawReply = rawReply;
    if (onUnparsed) onUnparsed(error);
    if (!reformat) throw error;
    const raw = textPieces(blocks).join("\n").slice(0, 12_000);
    if (!raw.trim()) throw error;
    let secondBlocks;
    try {
      secondBlocks = await reformat(raw, error);
    } catch (reformatError) {
      const wrapped = new Error(`${error.message}; reformat failed (${reformatError.message}); raw: ${rawReply}`);
      wrapped.billed = true;
      wrapped.aborted = Boolean(reformatError && reformatError.aborted);
      wrapped.spendCap = Boolean(reformatError && reformatError.spendCap);
      wrapped.rawReply = rawReply;
      throw wrapped;
    }
    try {
      return { value: extractJSON(secondBlocks), reformatted: true };
    } catch (second) {
      const wrapped = new Error(`${error.message}; reformat failed (${second.message}); raw: ${rawReply}`);
      wrapped.billed = true;
      wrapped.rawReply = replyPreview(secondBlocks) || rawReply;
      throw wrapped;
    }
  }
};

/* Every selected id is in exactly one of the three. A hole is a bug, not
   a quiet success. `ok` is true only when nothing failed. `partial` is
   true when at least one selected panel was refreshed and at least one
   failed. A weekly skip is not a failure. */
export const partitionRefreshJobs = ({ ids, refreshed, failures, skipped }) => {
  const skipIds = Object.keys(skipped || {});
  const listed = [...refreshed, ...failures, ...skipIds];
  const counts = new Map();
  for (const id of listed) counts.set(id, (counts.get(id) || 0) + 1);
  const duplicates = [...counts].filter(([, n]) => n > 1).map(([id]) => id);
  const missing = ids.filter((id) => !counts.has(id));
  const extra = [...new Set(listed.filter((id) => !ids.includes(id)))];
  if (duplicates.length || missing.length || extra.length) {
    throw new Error(
      `selected jobs must be in exactly one of refreshed, failures, skipped; missing=${missing.join(",") || "-"}; extra=${extra.join(",") || "-"}; duplicates=${duplicates.join(",") || "-"}`,
    );
  }
  return {
    ok: failures.length === 0,
    partial: failures.length > 0 && refreshed.length > 0,
    jobs: [...ids],
    refreshed: [...refreshed],
    failures: [...failures],
    skipped: { ...skipped },
  };
};

const fetchWithSignal = (signal) => (url, options = {}) => fetch(url, { ...options, signal });

const billError = (error) => {
  const billed = error instanceof Error ? error : new Error(String(error));
  billed.billed = true;
  if (billed.httpStatus == null) billed.httpStatus = 200;
  return billed;
};

/* `pause_turn` means the server-side search loop stopped. Continuing
   re-sends the whole assistant message, including search results, as input.
   At most one continuation, and none when the partial reply already parses
   or the spend cap / time budget says not to start another call.
   A finished reply that still has no JSON gets one Haiku reformat with no
   tools. That second call is logged on its own. It is not another search. */
const askClaude = async ({ prompt, jobId, attempt, signal, usageLog, allowContinuation }) => {
  const model = modelForJob(jobId, activeEnv);
  const logUnparsed = (error) => {
    console.log(JSON.stringify({
      source: "state-of-ai-briefing",
      event: "refresh_json_unparsed",
      jobId,
      error: String(error && error.message || error),
      rawReply: error && error.rawReply || "",
    }));
  };
  return callWithPauseCap({
    initialMessages: [{ role: "user", content: prompt }],
    allowContinuation,
    request: ({ messages, continuation }) => postAnthropicMessage({
      fetchImpl: fetch,
      apiKey: env("ANTHROPIC_API_KEY"),
      model,
      messages,
      maxTokens: JOB_MAX_TOKENS[jobId],
      tool: webSearchTool(jobId, model),
      jobId,
      attempt,
      continuation,
      signal,
      usageLog,
    }),
    accept: async (content, stopReason) => {
      if (stopReason === "pause_turn") {
        try { return extractJSON(content); } catch (e) { return null; }
      }
      const decision = await allowContinuation();
      const outcome = await recoverJsonReply({
        blocks: content,
        stopReason,
        onUnparsed: logUnparsed,
        reformat: decision && decision.ok !== false
          ? async (raw) => {
            const reformatted = await postAnthropicMessage({
              fetchImpl: fetch,
              apiKey: env("ANTHROPIC_API_KEY"),
              model,
              messages: [{ role: "user", content: jsonReformatPrompt(raw, jsonShape(prompt)) }],
              maxTokens: JSON_REFORMAT_MAX_TOKENS,
              tool: null,
              jobId,
              attempt,
              continuation: "reformat",
              signal,
              usageLog,
            });
            return reformatted.content;
          }
          : null,
      });
      return outcome.value;
    },
  });
};

/* The trace is for reading the judgments. It is not part of the site.
   A local write helps a manual run; the GitHub write is what lasts on Vercel. */
const persistJevLog = async (markdown) => {
  if (!markdown) return;
  try {
    await mkdir("dev", { recursive: true });
    await writeFile(JEV_LOG_PATH, markdown);
  } catch (e) { /* the deployment filesystem may be read-only */ }
  await ghWrite(JEV_LOG_PATH, markdown, `data: valuation trace ${new Date().toISOString().slice(0, 10)}`);
};

/* ——— Failure alerts ———
   Email via AgentMail + wake a Cursor Grok Bot webhook routine. Both channels
   are optional and best-effort: a notify failure must never mask the refresh
   result. Alerts fire on total failure, partial panel failure, and crashes.
   When every panel succeeds, the same Grok Bot webhook gets a
   `refresh_succeeded` ping (same auth, silent skip when unset, and a notify
   error still must not change the refresh result or response) so a deduped
   failure can clear. That ping does not send email.
   Set these as GitHub Actions secrets. There is no repo `.env`. A notify
   error never changes the refresh result. */

const truncate = (s, n = 400) => {
  const t = String(s || "");
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

export const buildAlert = ({ severity, runAt, failures = [], errors = {}, error, usage = null, timedOut = [], skipped = null }) => {
  const stamp = (runAt || new Date().toISOString()).slice(0, 10);
  const subject =
    severity === "fatal" ? `State of AI refresh crashed · ${stamp}`
    : severity === "all" ? `State of AI refresh failed (all panels) · ${stamp}`
    : `State of AI refresh partial failure · ${stamp}`;

  const lines = [
    `severity: ${severity}`,
    `runAt: ${runAt || "(unknown)"}`,
  ];
  if (failures.length) lines.push(`failures: ${failures.join(", ")}`);
  if (skipped && Object.keys(skipped).length) lines.push(`skipped: ${JSON.stringify(skipped)}`);
  if (timedOut.length) lines.push(`timedOut: ${timedOut.join(", ")}`);
  if (error) lines.push(`error: ${truncate(error)}`);
  if (usage && usage.totals && usage.totals.estimatedUsd != null) {
    const complete = usage.totals.estimateComplete ? "complete" : "incomplete";
    lines.push(`estimatedUsd: ${usage.totals.estimatedUsd} (${complete})`);
  }
  for (const id of failures) {
    if (errors[id]) lines.push(`  ${id}: ${truncate(errors[id], 240)}`);
  }
  lines.push("", "Dashboard keeps prior values until the next successful refresh.");

  return {
    source: "state-of-ai-briefing",
    event: "refresh_failed",
    severity,
    runAt: runAt || null,
    failures,
    errors: Object.fromEntries(
      Object.entries(errors).map(([k, v]) => [k, truncate(v, 500)]),
    ),
    error: error ? truncate(error, 500) : null,
    subject,
    message: lines.join("\n"),
    usage,
    timedOut,
    ...(skipped && Object.keys(skipped).length ? { skipped } : {}),
  };
};

const sendEmailAlert = async (alert) => {
  const key = activeEnv.AGENTMAIL_API_KEY;
  const inbox = activeEnv.AGENTMAIL_INBOX_ID;
  const to = activeEnv.NOTIFY_EMAIL;
  if (!key || !inbox || !to) return { skipped: "email unset" };

  const res = await fetch(
    `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(inbox)}/messages/send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: [to],
        subject: alert.subject,
        text: alert.message,
        labels: ["state-of-ai", "refresh-failed", alert.severity],
      }),
    },
  );
  if (!res.ok) throw new Error(`agentmail ${res.status}: ${truncate(await res.text(), 200)}`);
  return { ok: true };
};

const notifyGrokBot = async (body) => {
  const url = activeEnv.GROK_BOT_WEBHOOK_URL;
  const key = activeEnv.GROK_BOT_WEBHOOK_KEY;
  if (!url || !key) return { skipped: "grok bot unset" };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "User-Agent": "state-of-ai-briefing",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`grok bot ${res.status}: ${truncate(await res.text(), 200)}`);
  return { ok: true };
};

/* Webhook only. Email stays on the failure path. Errors are swallowed so a
   bad webhook cannot turn a finished refresh into a 500. */
export const successWebhookBody = ({ runAt, panels, usage, skipped = null }) => ({
  source: "state-of-ai-briefing",
  event: "refresh_succeeded",
  runAt,
  panels,
  usage: usage || null,
  ...(skipped && Object.keys(skipped).length ? { skipped } : {}),
});

const notifySuccess = async ({ runAt, panels, usage, skipped = null }) => {
  try {
    await notifyGrokBot(successWebhookBody({ runAt, panels, usage, skipped }));
  } catch (e) { /* a notify error must never change the refresh result or response */ }
};

const notifyFailure = async (payload) => {
  const alert = buildAlert(payload);
  const results = await Promise.allSettled([
    sendEmailAlert(alert),
    notifyGrokBot(alert),
  ]);
  return {
    email: results[0].status === "fulfilled" ? results[0].value : { error: String(results[0].reason?.message || results[0].reason) },
    grokBot: results[1].status === "fulfilled" ? results[1].value : { error: String(results[1].reason?.message || results[1].reason) },
  };
};

export const jobsQueryFromRequest = (req) => {
  if (req && req.query && Object.prototype.hasOwnProperty.call(req.query, "jobs")) {
    return req.query.jobs;
  }
  const raw = req && req.url;
  if (!raw) return null;
  try {
    return new URL(raw, "http://localhost").searchParams.get("jobs");
  } catch (e) {
    return null;
  }
};

export async function runRefresh({
  jobs = null,
  env: envBag = null,
  budget: budgetOverride = null,
  now = Date.now,
  startedAt = null,
} = {}) {
  const previousEnv = activeEnv;
  activeEnv = envBag || process.env;
  try {
    return await runRefreshWithEnv({ jobs, budget: budgetOverride, now, startedAt });
  } finally {
    activeEnv = previousEnv;
  }
}

async function runRefreshWithEnv({ jobs, budget: budgetOverride, now, startedAt }) {
  const fromEnv = budgetConfigFromEnv(activeEnv);
  const merged = { ...fromEnv, ...(budgetOverride || {}) };
  const jobBudgetMs = merged.maxDurationMs - merged.tailReserveMs;
  if (!(jobBudgetMs > 0)) {
    throw new Error("REFRESH_TAIL_RESERVE_MS must be shorter than REFRESH_MAX_DURATION_MS");
  }
  const budgetSettings = { ...merged, jobBudgetMs };
  const allIds = Object.keys(JOBS);
  const selected = resolveJobSelection(jobs, allIds);
  if (selected.error) return { status: 400, body: { ok: false, error: selected.error } };
  if (selected.preset === "daily") selected.ids = selected.ids.filter((id) => id !== "valuations");
  console.log(JSON.stringify({
    source: "state-of-ai-briefing",
    event: "refresh_start",
    preset: selected.preset,
    jobs: selected.ids,
    budget: budgetSettings,
  }));

  let jevMarkdown = null;
  const saveTrace = async () => {
    if (!jevMarkdown) return;
    try { await persistJevLog(jevMarkdown); } catch (e) { /* the panel data still stands */ }
  };
  const runAt = new Date(now()).toISOString();
  const usageLog = createUsageLog({ now });
  const budget = createBudget({
    startedAt: startedAt == null ? now() : startedAt,
    maxDurationMs: budgetSettings.maxDurationMs,
    tailReserveMs: budgetSettings.tailReserveMs,
    now,
  });
  const callCapMs = budgetSettings.callTimeoutMs;
  const valuationsCallCapMs = budgetSettings.valuationsCallTimeoutMs;
  const valuationsMinStartMs = budgetSettings.valuationsMinStartMs;
  let usageSummary = null;
  let maxUsd = null;
  const skippedForSpend = [];
  const noteSpendSkip = (jobId, estimatedUsd, reason) => {
    if (skippedForSpend.some((row) => row.jobId === jobId)) return;
    skippedForSpend.push({ jobId, estimatedUsd, reason });
    console.log(JSON.stringify({
      source: "state-of-ai-briefing",
      event: "refresh_spend_cap",
      runAt,
      jobId,
      estimatedUsd,
      maxUsd,
      reason,
    }));
  };
  const spendCapSummary = () => (maxUsd == null ? null : {
    maxUsd,
    estimatedUsd: usageLog.estimatedUsd(),
    skipped: skippedForSpend,
  });
  const publishUsage = (extra = {}) => {
    if (usageSummary) return usageSummary;
    usageLog.abortOpen();
    usageSummary = usageLog.summary({
      runAt,
      wallClockMs: now() - budget.startedAt,
      budget: {
        maxDurationMs: budget.maxDurationMs,
        tailReserveMs: budget.tailReserveMs,
        jobBudgetMs: budget.maxDurationMs - budget.tailReserveMs,
        callTimeoutMs: callCapMs,
        valuationsCallTimeoutMs: valuationsCallCapMs,
        valuationsMinStartMs,
      },
      spendCap: spendCapSummary(),
      ...extra,
    });
    console.log(JSON.stringify({
      source: "state-of-ai-briefing",
      event: "refresh_usage",
      runAt,
      timedOut: usageSummary.timedOut,
      totals: usageSummary.totals,
      spendCap: usageSummary.spendCap || null,
    }));
    return usageSummary;
  };

  let vFile = null;
  let tFile = null;
  let rankFile = null;
  let data = null;
  let meta = null;
  let history = null;
  let usageWritten = false;

  const writeUsage = async (summary, note) => {
    if (usageWritten) return;
    await ghWrite(
      USAGE_PATH,
      JSON.stringify(summary, null, 2) + "\n",
      `data: usage ${runAt.slice(0, 10)}${note || ""}`,
    );
    usageWritten = true;
  };

  const finish = (status, body) => ({ status, body });

  const valuesText = (summary) => {
    const packed = packValues(data, meta, runAt);
    packed.usage = summary;
    return JSON.stringify(packed, null, 2) + "\n";
  };

  try {
    maxUsd = refreshMaxUsd(activeEnv);

    /* 1 — current state from the repo, falling back to the baseline */
    [vFile, tFile] = await Promise.all([
      ghRead(VALUES_PATH), ghRead(TREND_PATH),
    ]);
    let prevMeta = {};
    data = BASELINE;
    if (vFile.text) {
      try {
        const parsed = JSON.parse(vFile.text);
        data = unpackValues(BASELINE, parsed);
        prevMeta = parsed.meta && typeof parsed.meta === "object" ? parsed.meta : {};
      } catch (e) { /* corrupt file — fall through to baseline */ }
    }
    history = tFile.text ? csvToHistory(tFile.text) : [];
    rankFile = await ghRead(STORE_RANKS_PATH);

    /* 2 — panels. Fast HTTP jobs run together. Model jobs run one at a time
       so the spend cap can refuse the next Claude call after the estimate
       crosses REFRESH_MAX_USD. A blank job list is the daily set, which
       does not include valuations. `jobs=valuations` runs that panel alone.
       Any other explicit list keeps the caller's order. A non-explicit
       selection still refuses to start valuations.

       The wall clock is the configured job budget. A single non-valuation
       call also stops at the per-call cap. Valuations may use the rest of
       the job budget, and it is not started when less than its minimum
       remains. Whatever is still running at that deadline is aborted,
       written as `time budget exhausted`, and included in the failure
       alert. Stopping here, ahead of the Actions job timeout, is what
       leaves a commit and an email. A platform kill would not.

       Retry once only when the first attempt was not billed (network, 429,
       5xx) and the deadline still has room for another attempt of at least
       as long as the first one. A 200 whose JSON or valuation judgment
       failed has already paid for its search; a second call would bill that
       job twice. A 400 such as the workspace limit or an empty credit
       balance will not succeed on a retry either. A spend-cap refusal is
       not a retry either. */
    const ids = selected.ids;
    const allowContinuation = (signal) => {
      if ((signal && signal.aborted) || budget.expired()) {
        return { ok: false, message: "time budget exhausted", aborted: true };
      }
      const spent = usageLog.estimatedUsd();
      if (spendCapBlocks(spent, maxUsd)) {
        return { ok: false, message: spendCapReason(spent, maxUsd), spendCap: true };
      }
      return { ok: true };
    };
    const runValuations = async (attempt, signal) => {
      const model = modelForJob("valuations", activeEnv);
      const passages = await callWithPauseCap({
        initialMessages: [{ role: "user", content: VALUATION_SEARCH }],
        allowContinuation: () => allowContinuation(signal),
        request: ({ messages, continuation }) => postAnthropicMessage({
          fetchImpl: fetch,
          apiKey: env("ANTHROPIC_API_KEY"),
          model,
          messages,
          maxTokens: JOB_MAX_TOKENS.valuations,
          tool: webSearchTool("valuations", model),
          jobId: "valuations",
          attempt,
          continuation,
          signal,
          usageLog,
        }),
        accept: (content, stopReason) => takeValuationPassages(content, stopReason),
      });
      const at = new Date().toISOString();
      let client;
      try {
        client = new TypeSafeClient({ timeout: 30_000 });
      } catch (e) {
        jevMarkdown = renderJevActions({
          ran: true, at, passageCount: passages.length,
          error: String(e.message || e), results: [],
        });
        throw billError(e);
      }
      const judgmentMs = Math.max(0, Math.min(30_000, budget.remainingMs() - 1000));
      let timer;
      const judgment = judgeValuations({
        companies: data.valuations.map((row) => ({ name: row.name, value: row.value })),
        passages,
        ask: (request) => client.systemOne(request),
      }).then(
        (value) => ({ ok: true, value }),
        (error) => ({ ok: false, error }),
      );
      try {
        const outcome = await Promise.race([
          judgment,
          new Promise((resolve) => {
            timer = setTimeout(() => {
              resolve({
                ok: false,
                error: Object.assign(
                  billError(new Error("time budget exhausted during valuation judgment")),
                  { aborted: true },
                ),
              });
            }, judgmentMs);
          }),
        ]);
        if (!outcome.ok) {
          const failure = outcome.error;
          jevMarkdown = renderJevActions({
            ran: true, at, passageCount: passages.length,
            error: String(failure && failure.message || failure), results: failure && failure.results || [],
          });
          throw billError(failure);
        }
        jevMarkdown = renderJevActions({
          ran: true, at, passageCount: passages.length, results: outcome.value.results,
        });
        return { valuations: outcome.value.accepted };
      } finally {
        clearTimeout(timer);
      }
    };
    const runJob = (id, signal) => attemptWithRetry(async (attempt) => {
      if (signal.aborted || budget.expired()) {
        throw Object.assign(new Error("time budget exhausted"), { aborted: true });
      }
      /* A share week that is not due never calls the model. The sentinel is
         not a result and not an error — the panel's prior values and
         timestamps stay where the last successful check left them. */
      if (id === "share" && !shareRefreshDue(prevMeta, runAt)) return SHARE_SKIPPED;
      if (id === "storeRanks") return fetchStoreRanks(fetchWithSignal(signal));
      if (id === "markets") return fetchMarketQuotes(fetchWithSignal(signal));
      if (MODEL_JOBS.has(id)) {
        const spent = usageLog.estimatedUsd();
        if (spendCapBlocks(spent, maxUsd)) {
          throw Object.assign(new Error(spendCapReason(spent, maxUsd)), { spendCap: true });
        }
      }
      if (id === "valuations") return runValuations(attempt, signal);
      return askClaude({
        prompt: JOBS[id].prompt,
        jobId: id,
        attempt,
        signal,
        usageLog,
        allowContinuation: () => allowContinuation(signal),
      });
    }, {
      remainingMs: () => budget.remainingMs(),
      decide: (info) => shouldRetry({ ...info, kind: MODEL_JOBS.has(id) ? "model" : "fast" }),
    });
    const fastIds = ids.filter((id) => !MODEL_JOBS.has(id));
    const modelIds = orderedModelJobs(ids, selected.explicit);
    const fastSettledPromise = settleWithinBudget(
      fastIds.map((id) => ({ id, run: (signal) => runJob(id, signal) })),
      { remainingMs: () => callWindowMs(budget.remainingMs(), callCapMs) },
    );
    const modelSettled = {};
    const skipReasons = {};
    const rememberSkip = (id, reason) => {
      skipReasons[id] = reason;
      modelSettled[id] = { status: "fulfilled", value: { skipped: id }, error: null, timedOut: false };
    };
    for (const id of modelIds) {
      if (id === "share" && !shareRefreshDue(prevMeta, runAt)) {
        rememberSkip(id, shareSkipReason(prevMeta, runAt));
        continue;
      }
      if (id === "valuations" && !selected.explicit) {
        rememberSkip(id, VALUATIONS_FULL_RUN_SKIP);
        continue;
      }
      if (id === "valuations" && budget.remainingMs() < valuationsMinStartMs) {
        rememberSkip(id, valuationsTimeSkipReason(budget.remainingMs()));
        continue;
      }
      const spent = usageLog.estimatedUsd();
      if (spendCapBlocks(spent, maxUsd)) {
        const reason = spendCapReason(spent, maxUsd);
        noteSpendSkip(id, spent, reason);
        rememberSkip(id, reason);
        continue;
      }
      const slot = await settleWithinBudget(
        [{ id, run: (signal) => runJob(id, signal) }],
        {
          remainingMs: () => callWindowMs(
            budget.remainingMs(),
            id === "valuations" ? valuationsCallCapMs : callCapMs,
          ),
        },
      );
      modelSettled[id] = slot[id];
      if (slot[id] && slot[id].error && slot[id].error.spendCap) {
        const reason = slot[id].error.message;
        noteSpendSkip(id, usageLog.estimatedUsd(), reason);
        skipReasons[id] = reason;
      }
    }
    const fastSettled = await fastSettledPromise;
    const settled = { ...fastSettled, ...modelSettled };
    const timedOut = ids.filter((id) => settled[id] && settled[id].timedOut);
    const summary = publishUsage({ timedOut });

    meta = { ...prevMeta };
    const failures = [];
    const refreshed = [];
    const skipped = { ...skipReasons };
    let storeRankDay = null;
    ids.forEach((id) => {
      if (Object.prototype.hasOwnProperty.call(skipped, id)) return;
      const slot = settled[id];
      if (!slot) {
        failures.push(id);
        meta[id] = { ...(meta[id] || {}), failed: true, error: "no result recorded", erroredAt: new Date().toISOString() };
        return;
      }
      if (slot.status === "fulfilled" && slot.value === SHARE_SKIPPED) {
        skipped[id] = shareSkipReason(prevMeta, runAt);
        return;
      }
      if (slot.error && slot.error.spendCap) {
        skipped[id] = slot.error.message;
        return;
      }
      let why = slot.status === "rejected" ? String(slot.error && slot.error.message || slot.error) : null;
      if (slot.timedOut && !(why && /time budget/.test(why))) why = "time budget exhausted";
      if (slot.status === "fulfilled") {
        try {
          /* A successful fetch always advances `checkedAt`; `changedAt` only
             moves if the panel's slice of the wire format actually differs.
             A panel checked nightly that finds no new number therefore reads
             as current, not as abandoned — which is the whole point of the
             split. `at` is still written as the old alias so anything reading
             the previous shape keeps working. */
          const before = panelDigest(data, id);
          data = JOBS[id].apply(data, slot.value);
          if (id === "storeRanks" && slot.value && slot.value.day) storeRankDay = slot.value.day;
          const changed = panelDigest(data, id) !== before;
          const prior = meta[id] || {};
          const now = new Date().toISOString();
          meta[id] = {
            at: now,
            checkedAt: now,
            /* Falling back to `now` matters on a panel that has never been
               seen to move: without it `changedAt` stays null forever and
               the page can never say "checked nightly, still nothing new" —
               which is the one message a genuinely steady panel needs. The
               clock therefore starts at the first check we can vouch for,
               and "no change in 9 days" means nine days of checks that all
               came back with the same number. */
            changedAt: changed ? now : (prior.changedAt || now),
            failed: false,
          };
          refreshed.push(id);
          return;
        } catch (e) {
          /* Reply parsed but didn't fit the panel's shape. The model call,
             when there was one, is already in the usage log. A panelError
             already says why (for example "too few rows: 1"); other throws
             stay under the bad-shape prefix. */
          const message = String((e && e.message) || e);
          why = e && e.panelError ? message : `bad shape: ${message}`;
        }
      }
      /* Keep the last-good timestamps so the panel can still say how old its
         numbers are, and record *why* this run failed — a bare boolean
         left the markets panel undiagnosable for weeks. `checkedAt` is
         deliberately not advanced: the run happened, but it did not
         successfully check this panel. */
      meta[id] = { ...(meta[id] || {}), failed: true, error: (why || "unknown").slice(0, 300), erroredAt: new Date().toISOString() };
      failures.push(id);
    });

    const outcome = partitionRefreshJobs({ ids, refreshed, failures, skipped });
    if (failures.length > 0 && refreshed.length === 0) {
      /* Every attempted job failed — almost certainly an API or network
         problem. A skipped web-share week, a spend-cap stop, and a
         valuations skip are not attempts and not failures.
         Yesterday's values stay exactly as they are; `data` is untouched
         because no `apply` succeeded, so this write moves only `meta` and
         `lastRunAt`.

         It is still worth writing. Bailing out entirely, which is what this
         used to do, left a totally failed night with no trace anywhere in
         the repo — indistinguishable from a cron that never fired, which is
         the ambiguity the page is now trying to resolve. One commit a night
         is a cheap price for being able to tell those apart. */
      const errors = Object.fromEntries(failures.map((id) => [id, meta[id].error]));
      try { await writeUsage(summary, " (all panels failed)"); } catch (e) { /* the alert still fires */ }
      try {
        await ghWrite(
          VALUES_PATH,
          valuesText(summary),
          `data: refresh ${runAt.slice(0, 10)} (all panels failed, values unchanged)`,
        );
      } catch (e) { /* the run already failed; a failed write changes nothing */ }
      await saveTrace();
      const notified = await notifyFailure({
        severity: "all", runAt, failures, errors, usage: summary, timedOut, skipped: outcome.skipped,
      });
      return finish(502, {
        ...outcome,
        error: "all panels failed",
        errors,
        timedOut,
        usage: summary,
        notified,
      });
    }

    /* 3 — write the files back. Usage goes first so a later write failure
       still leaves the meter reading in git. */
    const nextHistory = historyToCSV(logHistory(data, history)) + "\n";
    const stamp = runAt.slice(0, 10);
    const note = failures.length ? ` (${failures.join(", ")} kept prior values)` : "";
    const errors = Object.fromEntries(failures.map((id) => [id, meta[id].error]));

    await writeUsage(summary);
    await ghWrite(VALUES_PATH, valuesText(summary), `data: refresh ${stamp}${note}`);
    await ghWrite(TREND_PATH, nextHistory, `data: trend log ${stamp}`);
    if (storeRankDay) {
      let prevRanks = { days: [] };
      if (rankFile.text) {
        try { prevRanks = JSON.parse(rankFile.text); } catch (e) { prevRanks = { days: [] }; }
      }
      const nextRanks = JSON.stringify(appendStoreRankDay(prevRanks, storeRankDay), null, 2) + "\n";
      await ghWrite(STORE_RANKS_PATH, nextRanks, `data: store ranks ${stamp}`);
    }
    await saveTrace();

    const notified = failures.length
      ? await notifyFailure({
        severity: "partial", runAt, failures, errors, usage: summary, timedOut, skipped: outcome.skipped,
      })
      : undefined;

    if (!failures.length) {
      await notifySuccess({ runAt, panels: ids.length, usage: summary, skipped: outcome.skipped });
    }

    return finish(200, {
      ...outcome,
      errors,
      timedOut,
      usage: summary,
      ...(notified ? { notified } : {}),
    });
  } catch (e) {
    await saveTrace();
    const error = String(e.message || e);
    const summary = publishUsage({ fatal: true });
    try { await writeUsage(summary, " (fatal)"); } catch (writeError) { /* the alert still fires */ }
    if (vFile && data && meta) {
      try {
        await ghWrite(
          VALUES_PATH,
          valuesText(summary),
          `data: refresh ${runAt.slice(0, 10)} (fatal)`,
        );
      } catch (writeError) { /* the alert still fires */ }
    }
    const notified = await notifyFailure({
      severity: "fatal", runAt, error, usage: summary, timedOut: summary.timedOut || [],
    });
    return finish(500, {
      ok: false, error, jobs: selected.ids, usage: summary, notified,
    });
  }
}
