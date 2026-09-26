import { mkdir, writeFile } from "node:fs/promises";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import {
  BASELINE, JOBS, packValues, unpackValues, panelDigest,
  historyToCSV, csvToHistory, logHistory,
} from "../src/briefing-data.js";
import { appendStoreRankDay, fetchStoreRanks } from "../src/store-ranks.js";
import {
  citationsFromContent, judgeValuations, renderJevActions,
} from "./valuation-judgment.js";

/* ————————————————————————————————————————————————
   Nightly refresh.

   Runs on Vercel Cron. Nothing in the browser ever touches the Anthropic
   API — the key lives only in this function's environment. The output is
   two small files committed back to the repo, which Vercel then serves
   as static assets from the CDN. Git history *is* the trend log: every
   refresh is a dated commit you can diff, replay or revert.
   ———————————————————————————————————————————————— */

const GH = "https://api.github.com";
const VALUES_PATH = "public/data/values.json";
const TREND_PATH = "public/data/trend.csv";
const STORE_RANKS_PATH = "public/data/store-ranks.json";
const JEV_LOG_PATH = "dev/jev-actions.md";

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

const anthropicMessage = async (prompt, maxTokens) => {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env("ANTHROPIC_API_KEY"),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
      tools: [{ type: "web_search_20250305", name: "web_search" }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (!data.content) throw new Error("empty response");
  return data.content;
};

const askClaude = async (prompt) => extractJSON(await anthropicMessage(prompt, 4000));

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
   Set these in the Vercel project env (Settings → Environment Variables) —
   there is no repo `.env`; cron only sees what Vercel injects at runtime. */

const truncate = (s, n = 400) => {
  const t = String(s || "");
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

const buildAlert = ({ severity, runAt, failures = [], errors = {}, error }) => {
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
  if (error) lines.push(`error: ${truncate(error)}`);
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

const notifyGrokBot = async (alert) => {
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
    body: JSON.stringify(alert),
  });
  if (!res.ok) throw new Error(`grok bot ${res.status}: ${truncate(await res.text(), 200)}`);
  return { ok: true };
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

  try {
    /* 1 — current state from the repo, falling back to the baseline */
    const [vFile, tFile] = await Promise.all([ghRead(VALUES_PATH), ghRead(TREND_PATH)]);
    let prevMeta = {};
    let data = BASELINE;
    if (vFile.text) {
      try {
        const parsed = JSON.parse(vFile.text);
        data = unpackValues(BASELINE, parsed);
        prevMeta = parsed.meta && typeof parsed.meta === "object" ? parsed.meta : {};
      } catch (e) { /* corrupt file — fall through to baseline */ }
    }
    const history = tFile.text ? csvToHistory(tFile.text) : [];
    const rankFile = await ghRead(STORE_RANKS_PATH);

    /* 2 — every panel in parallel. Each job is independent, so one failure
       keeps its prior values instead of aborting the run.

       One retry per job: a search-backed answer that comes back malformed
       is usually malformed by luck, not by rule, and a second ask is far
       cheaper than a stale panel for 24 hours. */
    const ids = Object.keys(JOBS);
    const runValuations = async () => {
      const content = await anthropicMessage(VALUATION_SEARCH, 8000);
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
        throw e;
      }
      try {
        const judged = await judgeValuations({
          companies: data.valuations.map((row) => ({ name: row.name, value: row.value })),
          passages,
          ask: (request) => client.systemOne(request),
        });
        jevMarkdown = renderJevActions({
          ran: true, at, passageCount: passages.length, results: judged.results,
        });
        return { valuations: judged.accepted };
      } catch (e) {
        jevMarkdown = renderJevActions({
          ran: true, at, passageCount: passages.length,
          error: String(e.message || e), results: e.results || [],
        });
        throw e;
      }
    };
    const runJob = async (id) => {
      const once = () => {
        if (id === "storeRanks") return fetchStoreRanks();
        if (id === "valuations") return runValuations();
        return askClaude(JOBS[id].prompt);
      };
      try {
        return await once();
      } catch (first) {
        try {
          return await once();
        } catch (second) {
          throw new Error(`${first.message} (retry: ${second.message})`);
        }
      }
    };
    const results = await Promise.allSettled(ids.map(runJob));

    const meta = { ...prevMeta };
    const failures = [];
    let storeRankDay = null;
    results.forEach((r, i) => {
      const id = ids[i];
      let why = r.status === "rejected" ? String(r.reason && r.reason.message || r.reason) : null;
      if (r.status === "fulfilled") {
        try {
          /* A successful fetch always advances `checkedAt`; `changedAt` only
             moves if the panel's slice of the wire format actually differs.
             A panel checked nightly that finds no new number therefore reads
             as current, not as abandoned — which is the whole point of the
             split. `at` is still written as the old alias so anything reading
             the previous shape keeps working. */
          const before = panelDigest(data, id);
          data = JOBS[id].apply(data, r.value);
          if (id === "storeRanks" && r.value && r.value.day) storeRankDay = r.value.day;
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
          /* Reply parsed but didn't fit the panel's shape. */
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

    if (failures.length === ids.length) {
      /* Every job failed — almost certainly an API or network problem.
         Yesterday's values stay exactly as they are; `data` is untouched
         because no `apply` succeeded, so this write moves only `meta` and
         `lastRunAt`.

         It is still worth writing. Bailing out entirely, which is what this
         used to do, left a totally failed night with no trace anywhere in
         the repo — indistinguishable from a cron that never fired, which is
         the ambiguity the page is now trying to resolve. One commit a night
         is a cheap price for being able to tell those apart. */
      const errors = Object.fromEntries(failures.map((id) => [id, meta[id].error]));
      try {
        await ghWrite(
          VALUES_PATH,
          JSON.stringify(packValues(data, meta, runAt), null, 2) + "\n",
          vFile.sha,
          `data: refresh ${runAt.slice(0, 10)} (all panels failed, values unchanged)`,
        );
      } catch (e) { /* the run already failed; a failed write changes nothing */ }
      await saveTrace();
      const notified = await notifyFailure({ severity: "all", runAt, failures, errors });
      return res.status(502).json({
        ok: false, error: "all panels failed", failures, errors, notified,
      });
    }

    /* 3 — write both files back */
    const nextValues = JSON.stringify(packValues(data, meta, runAt), null, 2) + "\n";
    const nextHistory = historyToCSV(logHistory(data, history)) + "\n";
    const stamp = runAt.slice(0, 10);
    const note = failures.length ? ` (${failures.join(", ")} kept prior values)` : "";
    const errors = Object.fromEntries(failures.map((id) => [id, meta[id].error]));

    await ghWrite(VALUES_PATH, nextValues, vFile.sha, `data: refresh ${stamp}${note}`);
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
      ? await notifyFailure({ severity: "partial", runAt, failures, errors })
      : undefined;

    return res.status(200).json({
      ok: true,
      refreshed: ids.filter((id) => !failures.includes(id)),
      failures,
      errors,
      ...(notified ? { notified } : {}),
    });
  } catch (e) {
    await saveTrace();
    const error = String(e.message || e);
    const notified = await notifyFailure({ severity: "fatal", runAt, error });
    return res.status(500).json({ ok: false, error, notified });
  }
}
