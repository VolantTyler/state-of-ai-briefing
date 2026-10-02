import { mkdir, writeFile } from "node:fs/promises";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import {
  BASELINE, JOBS, packValues, unpackValues, panelDigest,
  historyToCSV, csvToHistory, logHistory,
} from "../src/briefing-data.js";
import { appendStoreRankDay, fetchStoreRanks } from "../src/store-ranks.js";
import { fetchMarketQuotes } from "../src/market-quotes.js";
import { SHARE_SKIPPED, shareRefreshDue, webSearchTool } from "../src/refresh-policy.js";
import {
  attemptWithRetry, createBudget, settleWithinBudget, shouldRetry,
} from "../src/refresh-budget.js";
import {
  JOB_MAX_TOKENS, createUsageLog, modelForJob, postAnthropicMessage,
} from "../src/refresh-usage.js";
import {
  citationsFromContent, judgeValuations, renderJevActions,
} from "./valuation-judgment.js";

/* ————————————————————————————————————————————————
   Nightly refresh.

   Runs on Vercel Cron. Nothing in the browser ever touches the Anthropic
   API — the key lives only in this function's environment. The output is
   the panel files plus public/data/usage.json, committed back to the repo,
   which Vercel then serves as static assets from the CDN. Git history *is*
   the trend log: every refresh is a dated commit you can diff, replay or revert.
   ———————————————————————————————————————————————— */

const GH = "https://api.github.com";
const VALUES_PATH = "public/data/values.json";
const TREND_PATH = "public/data/trend.csv";
const STORE_RANKS_PATH = "public/data/store-ranks.json";
const JEV_LOG_PATH = "dev/jev-actions.md";
const USAGE_PATH = "public/data/usage.json";

/* Model-backed panels. Markets and store ranks are plain HTTP and may
   retry on a much shorter remainder. */
const MODEL_JOBS = new Set(["valuations", "models", "users", "share", "capital", "energy"]);

const VALUATION_SEARCH = `Search the web for recent reporting, in US dollars, on what each of these companies is worth: Anthropic, OpenAI, xAI, Databricks, Z.ai (also called Zhipu), DeepSeek, Anduril, Moonshot AI, MiniMax.

Cite the source passage for every dollar figure you mention, including funding-round valuations, the size of the round, market caps, and prices still being negotiated. Use the source's words for the figure. Cover every company.`;

const env = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`missing env var ${k}`);
  return v;
};

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
  const branch = process.env.GITHUB_BRANCH || "main";
  const res = await fetch(`${GH}/repos/${env("GITHUB_REPO")}/contents/${path}?ref=${branch}`, {
    headers: ghHeaders(),
  });
  if (res.status === 404) return { sha: null, text: null };
  if (!res.ok) throw new Error(`GitHub read ${path}: ${res.status}`);
  const j = await res.json();
  return { sha: j.sha, text: Buffer.from(j.content, "base64").toString("utf8") };
};

const ghWrite = async (path, text, sha, message) => {
  const res = await fetch(`${GH}/repos/${env("GITHUB_REPO")}/contents/${path}`, {
    method: "PUT",
    headers: { ...ghHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      content: Buffer.from(text, "utf8").toString("base64"),
      branch: process.env.GITHUB_BRANCH || "main",
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) throw new Error(`GitHub write ${path}: ${res.status} ${await res.text()}`);
  return res.json();
};

/* ——— Anthropic ——— */

/* Scan for balanced top-level {...} spans and return the last one that
   parses.

   The naive version of this — first "{" to last "}" — is what kept the
   markets panel dark. With web search on, the reply is interleaved text
   blocks, and models hedge around financial figures ("prices are delayed
   and may not reflect…"). Any stray brace in that prose, before or after
   the real object, makes the slice span text that isn't JSON, and the
   whole job fails even though the model answered correctly. Taking the
   last *parseable* object tolerates prose on both sides. */
const extractJSON = (blocks) => {
  const text = (blocks || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .replace(/```json|```/g, "");

  const found = [];
  let depth = 0, start = -1, inStr = false, esc = false;
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
  if (depth > 0) throw new Error("truncated JSON in reply (raise max_tokens?)");
  if (!found.length) throw new Error("no JSON in reply");

  for (let i = found.length - 1; i >= 0; i--) {
    try { return JSON.parse(found[i]); } catch (e) { /* try the next one out */ }
  }
  throw new Error("no parseable JSON object in reply");
};

const fetchWithSignal = (signal) => (url, options = {}) => fetch(url, { ...options, signal });

const markBilled = (error) => {
  const billed = error instanceof Error ? error : new Error(String(error));
  billed.billed = true;
  billed.httpStatus = 200;
  return billed;
};

/* `pause_turn` means the search loop stopped before a final answer. Continuing
   it is another paid request, so a run that is already near the time budget
   does not. The usage object from the paused response is already recorded. */
const askClaude = async ({ prompt, jobId, attempt, signal, usageLog }) => {
  const { content, stopReason } = await postAnthropicMessage({
    fetchImpl: fetch,
    apiKey: env("ANTHROPIC_API_KEY"),
    model: modelForJob(jobId),
    prompt,
    maxTokens: JOB_MAX_TOKENS[jobId],
    tool: webSearchTool(jobId),
    jobId,
    attempt,
    signal,
    usageLog,
  });
  if (stopReason === "pause_turn") {
    throw markBilled(new Error("anthropic pause_turn before a final answer; not continued"));
  }
  try {
    return extractJSON(content);
  } catch (e) {
    throw markBilled(e);
  }
};

/* The trace is for reading the judgments. It is not part of the site.
   A local write helps a manual run; the GitHub write is what lasts on Vercel. */
const persistJevLog = async (markdown) => {
  if (!markdown) return;
  try {
    await mkdir("dev", { recursive: true });
    await writeFile(JEV_LOG_PATH, markdown);
  } catch (e) { /* the deployment filesystem may be read-only */ }
  const existing = await ghRead(JEV_LOG_PATH);
  await ghWrite(JEV_LOG_PATH, markdown, existing.sha, `data: valuation trace ${new Date().toISOString().slice(0, 10)}`);
};

/* ——— Failure alerts ———
   Email via AgentMail + wake a Cursor Grok Bot webhook routine. Both channels
   are optional and best-effort: a notify failure must never mask the refresh
   result. Alerts fire on total failure, partial panel failure, and crashes.
   When every panel succeeds, the same Grok Bot webhook gets a
   `refresh_succeeded` ping (same auth, silent skip when unset, and a notify
   error still must not change the refresh result or response) so a deduped
   failure can clear. That ping does not send email.
   Set these in the Vercel project env (Settings → Environment Variables) —
   there is no repo `.env`; cron only sees what Vercel injects at runtime. */

const truncate = (s, n = 400) => {
  const t = String(s || "");
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

export const buildAlert = ({ severity, runAt, failures = [], errors = {}, error, usage = null, timedOut = [] }) => {
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
  };
};

const sendEmailAlert = async (alert) => {
  const key = process.env.AGENTMAIL_API_KEY;
  const inbox = process.env.AGENTMAIL_INBOX_ID;
  const to = process.env.NOTIFY_EMAIL;
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
  const url = process.env.GROK_BOT_WEBHOOK_URL;
  const key = process.env.GROK_BOT_WEBHOOK_KEY;
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
export const successWebhookBody = ({ runAt, panels, usage }) => ({
  source: "state-of-ai-briefing",
  event: "refresh_succeeded",
  runAt,
  panels,
  usage: usage || null,
});

const notifySuccess = async ({ runAt, panels, usage }) => {
  try {
    await notifyGrokBot(successWebhookBody({ runAt, panels, usage }));
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

export default async function handler(req, res) {
  /* Vercel Cron signs its requests with CRON_SECRET. Without this check the
     endpoint is a public button that spends money. */
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || "";
  if (secret && auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "unauthorized" });
  }

  let jevMarkdown = null;
  const saveTrace = async () => {
    if (!jevMarkdown) return;
    try { await persistJevLog(jevMarkdown); } catch (e) { /* the panel data still stands */ }
  };
  const runAt = new Date().toISOString();
  const usageLog = createUsageLog();
  const budget = createBudget();
  let usageSummary = null;
  const publishUsage = (extra = {}) => {
    if (usageSummary) return usageSummary;
    usageLog.abortOpen();
    usageSummary = usageLog.summary({
      runAt,
      wallClockMs: Date.now() - budget.startedAt,
      budget: {
        maxDurationMs: budget.maxDurationMs,
        tailReserveMs: budget.tailReserveMs,
        jobBudgetMs: budget.maxDurationMs - budget.tailReserveMs,
      },
      ...extra,
    });
    console.log(JSON.stringify({
      source: "state-of-ai-briefing",
      event: "refresh_usage",
      runAt,
      timedOut: usageSummary.timedOut,
      totals: usageSummary.totals,
    }));
    return usageSummary;
  };

  let vFile = null;
  let tFile = null;
  let usageFile = null;
  let rankFile = null;
  let data = null;
  let meta = null;
  let history = null;
  let usageWritten = false;

  const writeUsage = async (summary, note) => {
    if (usageWritten) return;
    let sha = usageFile ? usageFile.sha : null;
    if (!usageFile) {
      try {
        const existing = await ghRead(USAGE_PATH);
        sha = existing.sha;
      } catch (e) { sha = null; }
    }
    await ghWrite(
      USAGE_PATH,
      JSON.stringify(summary, null, 2) + "\n",
      sha,
      `data: usage ${runAt.slice(0, 10)}${note || ""}`,
    );
    usageWritten = true;
  };

  const valuesText = (summary) => {
    const packed = packValues(data, meta, runAt);
    packed.usage = summary;
    return JSON.stringify(packed, null, 2) + "\n";
  };

  try {
    /* 1 — current state from the repo, falling back to the baseline */
    [vFile, tFile, usageFile] = await Promise.all([
      ghRead(VALUES_PATH), ghRead(TREND_PATH), ghRead(USAGE_PATH),
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

    /* 2 — every panel in parallel. Each job is independent, so one failure
       keeps its prior values instead of aborting the run.

       The wall clock is capped under maxDuration. Whatever is still running
       at that deadline is aborted, written as `time budget exhausted`, and
       included in the failure alert. A kill at the platform limit never
       reaches this code, which is how a paid night used to leave no commit
       and no email.

       Retry once only when the first attempt was not billed (network, 429,
       5xx) and the deadline still has room for another attempt of at least
       as long as the first one. A 200 whose JSON or valuation judgment
       failed has already paid for its search; a second call would bill that
       job twice. A 400 such as the workspace limit or an empty credit
       balance will not succeed on a retry either. */
    const ids = Object.keys(JOBS);
    const runValuations = async (attempt, signal) => {
      const { content, stopReason } = await postAnthropicMessage({
        fetchImpl: fetch,
        apiKey: env("ANTHROPIC_API_KEY"),
        model: modelForJob("valuations"),
        prompt: VALUATION_SEARCH,
        maxTokens: JOB_MAX_TOKENS.valuations,
        tool: webSearchTool("valuations"),
        jobId: "valuations",
        attempt,
        signal,
        usageLog,
      });
      if (stopReason === "pause_turn") {
        throw markBilled(new Error("anthropic pause_turn before a final answer; not continued"));
      }
      const passages = citationsFromContent(content);
      const at = new Date().toISOString();
      let client;
      try {
        client = new TypeSafeClient({ timeout: 30_000 });
      } catch (e) {
        jevMarkdown = renderJevActions({
          ran: true, at, passageCount: passages.length,
          error: String(e.message || e), results: [],
        });
        throw markBilled(e);
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
                  markBilled(new Error("time budget exhausted during valuation judgment")),
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
          throw markBilled(failure);
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
      /* A share week that is not due never calls Sonnet. The sentinel is
         not a result and not an error — the panel's prior values and
         timestamps stay where the last successful check left them. */
      if (id === "share" && !shareRefreshDue(prevMeta, runAt)) return SHARE_SKIPPED;
      if (id === "storeRanks") return fetchStoreRanks(fetchWithSignal(signal));
      if (id === "markets") return fetchMarketQuotes(fetchWithSignal(signal));
      if (id === "valuations") return runValuations(attempt, signal);
      return askClaude({ prompt: JOBS[id].prompt, jobId: id, attempt, signal, usageLog });
    }, {
      remainingMs: () => budget.remainingMs(),
      decide: (info) => shouldRetry({ ...info, kind: MODEL_JOBS.has(id) ? "model" : "fast" }),
    });
    const settled = await settleWithinBudget(
      ids.map((id) => ({ id, run: (signal) => runJob(id, signal) })),
      { remainingMs: () => budget.remainingMs() },
    );
    const timedOut = ids.filter((id) => settled[id] && settled[id].timedOut);
    const summary = publishUsage({ timedOut });

    meta = { ...prevMeta };
    const failures = [];
    const skipped = [];
    let storeRankDay = null;
    ids.forEach((id) => {
      const slot = settled[id];
      if (slot.status === "fulfilled" && slot.value === SHARE_SKIPPED) {
        skipped.push(id);
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
          return;
        } catch (e) {
          /* Reply parsed but didn't fit the panel's shape. The model call,
             when there was one, is already in the usage log. */
          why = `bad shape: ${String(e.message || e)}`;
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

    const attempted = ids.length - skipped.length;
    if (attempted > 0 && failures.length === attempted) {
      /* Every attempted job failed — almost certainly an API or network
         problem. A skipped web-share week is not an attempt and not a
         failure, so it is not in this list.
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
          vFile.sha,
          `data: refresh ${runAt.slice(0, 10)} (all panels failed, values unchanged)`,
        );
      } catch (e) { /* the run already failed; a failed write changes nothing */ }
      await saveTrace();
      const notified = await notifyFailure({ severity: "all", runAt, failures, errors, usage: summary, timedOut });
      return res.status(502).json({
        ok: false, error: "all panels failed", failures, errors, timedOut, usage: summary, notified,
        ...(skipped.length ? { skipped } : {}),
      });
    }

    /* 3 — write the files back. Usage goes first so a later write failure
       still leaves the meter reading in git. */
    const nextHistory = historyToCSV(logHistory(data, history)) + "\n";
    const stamp = runAt.slice(0, 10);
    const note = failures.length ? ` (${failures.join(", ")} kept prior values)` : "";
    const errors = Object.fromEntries(failures.map((id) => [id, meta[id].error]));

    await writeUsage(summary);
    await ghWrite(VALUES_PATH, valuesText(summary), vFile.sha, `data: refresh ${stamp}${note}`);
    await ghWrite(TREND_PATH, nextHistory, tFile.sha, `data: trend log ${stamp}`);
    if (storeRankDay) {
      let prevRanks = { days: [] };
      if (rankFile.text) {
        try { prevRanks = JSON.parse(rankFile.text); } catch (e) { prevRanks = { days: [] }; }
      }
      const nextRanks = JSON.stringify(appendStoreRankDay(prevRanks, storeRankDay), null, 2) + "\n";
      await ghWrite(STORE_RANKS_PATH, nextRanks, rankFile.sha, `data: store ranks ${stamp}`);
    }
    await saveTrace();

    const notified = failures.length
      ? await notifyFailure({ severity: "partial", runAt, failures, errors, usage: summary, timedOut })
      : undefined;

    if (!failures.length) await notifySuccess({ runAt, panels: ids.length, usage: summary });

    return res.status(200).json({
      ok: true,
      refreshed: ids.filter((id) => !failures.includes(id) && !skipped.includes(id)),
      failures,
      errors,
      timedOut,
      usage: summary,
      ...(skipped.length ? { skipped } : {}),
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
          vFile.sha,
          `data: refresh ${runAt.slice(0, 10)} (fatal)`,
        );
      } catch (writeError) { /* the alert still fires */ }
    }
    const notified = await notifyFailure({
      severity: "fatal", runAt, error, usage: summary, timedOut: summary.timedOut || [],
    });
    return res.status(500).json({ ok: false, error, usage: summary, notified });
  }
}
