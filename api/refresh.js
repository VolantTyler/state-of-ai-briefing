import {
  BASELINE, JOBS, packValues, unpackValues,
  historyToCSV, csvToHistory, logHistory,
} from "../src/briefing-data.js";

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

const askClaude = async (prompt) => {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env("ANTHROPIC_API_KEY"),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
      tools: [{ type: "web_search_20250305", name: "web_search" }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (!data.content) throw new Error("empty response");
  return extractJSON(data.content);
};

export default async function handler(req, res) {
  /* Vercel Cron signs its requests with CRON_SECRET. Without this check the
     endpoint is a public button that spends money. */
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || "";
  if (secret && auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "unauthorized" });
  }

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

    /* 2 — every panel in parallel. Each job is independent, so one failure
       keeps its prior values instead of aborting the run.

       One retry per job: a search-backed answer that comes back malformed
       is usually malformed by luck, not by rule, and a second ask is far
       cheaper than a stale panel for 24 hours. */
    const ids = Object.keys(JOBS);
    const runJob = async (id) => {
      try {
        return await askClaude(JOBS[id].prompt);
      } catch (first) {
        try {
          return await askClaude(JOBS[id].prompt);
        } catch (second) {
          throw new Error(`${first.message} (retry: ${second.message})`);
        }
      }
    };
    const results = await Promise.allSettled(ids.map(runJob));

    const meta = { ...prevMeta };
    const failures = [];
    results.forEach((r, i) => {
      const id = ids[i];
      let why = r.status === "rejected" ? String(r.reason && r.reason.message || r.reason) : null;
      if (r.status === "fulfilled") {
        try {
          data = JOBS[id].apply(data, r.value);
          meta[id] = { at: new Date().toISOString(), failed: false };
          return;
        } catch (e) {
          /* Reply parsed but didn't fit the panel's shape. */
          why = `bad shape: ${String(e.message || e)}`;
        }
      }
      /* Keep the last-good `at` so the panel can still say how old its
         numbers are, and record *why* this run failed — a bare boolean
         left the markets panel undiagnosable for weeks. */
      meta[id] = { ...(meta[id] || {}), failed: true, error: (why || "unknown").slice(0, 300), erroredAt: new Date().toISOString() };
      failures.push(id);
    });

    if (failures.length === ids.length) {
      /* Every job failed — almost certainly an API or network problem.
         Don't commit; leave yesterday's good data in place. */
      return res.status(502).json({
        ok: false, error: "all panels failed", failures,
        errors: Object.fromEntries(failures.map((id) => [id, meta[id].error])),
      });
    }

    /* 3 — write both files back */
    const nextValues = JSON.stringify(packValues(data, meta), null, 2) + "\n";
    const nextHistory = historyToCSV(logHistory(data, history)) + "\n";
    const stamp = new Date().toISOString().slice(0, 10);
    const note = failures.length ? ` (${failures.join(", ")} kept prior values)` : "";

    await ghWrite(VALUES_PATH, nextValues, vFile.sha, `data: refresh ${stamp}${note}`);
    await ghWrite(TREND_PATH, nextHistory, tFile.sha, `data: trend log ${stamp}`);

    return res.status(200).json({
      ok: true,
      refreshed: ids.filter((id) => !failures.includes(id)),
      failures,
      errors: Object.fromEntries(failures.map((id) => [id, meta[id].error])),
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}
