import { STORE_RANK_SOURCES } from "./store-ranks.js";

export const EDITION = {
  version: "v2.6",
  date: "2026-10-06",
  changelog: [
    ["v2.6", "2026-10-06", "Intelligence Index locked to v4.3.2. Gemini 4 Argon is eligible for the models panel when it ranks in the top families. Scores on v4.3.2 are not comparable to v4.2."],
    ["v2.5", "2026-09-26", "App-store rankings: weekly US top-free rank for first-party AI apps on the iOS App Store and Google Play. Each point is the latest daily chart in that week. History starts when the nightly job began storing charts — earlier weeks were not reconstructed."],
    ["v2.4", "2026-09-07", "Model capability rebuilt around the September releases: Claude Fable 5.1 (Sep 1), GPT-6 Astra (Sep 3), Meta's Muse Spark 1.3 (Sep 3) and Gemini 3.8 Flash (Sep 2). The Artificial Analysis Intelligence Index moved to v4.2 — a re-anchored scale with two new evals and 40% private held-out data — so every score in §03 is restated on v4.2 and is NOT comparable to the v4.1.1 numbers in earlier editions. Meta joins the brand palette as it enters the frontier. Grok 4.7 is announced but unreleased and is deliberately absent."],
    ["v2.3", "2026-08-29", "Runtime state now syncs to Google Drive: current panel values and the dated trend log are written to ai-briefing-values.json and ai-briefing-trend.csv on every refresh, and pulled on load — so data accumulated in one place shows up everywhere the dashboard is opened. Local browser storage becomes a cache rather than the record."],
    ["v2.2", "2026-08-28", "Design pass: chart colors now match each company's brand color from the web-traffic-share chart throughout; Artificial Analysis Intelligence Index redrawn as a packed swarm on a zoomed axis to show frontier clustering; added a collapsible table of contents and per-section back-to-top buttons."],
    ["v2.1", "2026-08-26", "Data refresh: Databricks re-priced to $190B, Anthropic revenue run-rate to $65B, Gemini past 1B MAU, China's OpenRouter token share to ~60%, hyperscaler stock prices and capex updated. xAI valuation flagged as structurally uncertain after the SpaceX merger/IPO."],
    ["v2.0", "2026-08-22", "Added Chinese labs (toggleable) and energy & data centers. Per-panel refresh with independent timestamps. Trend log now accumulates across refreshes."],
    ["v1.0", "2026-08-21", "First edition — valuations, public markets, model capability, user bases, capital flows."],
  ],
};

export const INK = "#191714";
export const PAPER = "#FAF7F0";
/* #857D6F read at 4.19:1 on PAPER — under the 4.5:1 WCAG AA floor for text,
   which this token is used as ~35 times (captions, ticks, table cells).
   Darkened to hold ≥4.5:1 while keeping the same warm-gray hue. */
export const FAINT = "#70685A";
export const RULE_SOFT = "#E4DCCB";
export const C = {
  blue: "#7A93AC", ochre: "#C8A24E", sage: "#8AA07B", brick: "#B06A55",
  plum: "#8D7A96", slate: "#6E7B84", clay: "#A98C77", paperDeep: "#F1EBDD",
  neutral: "#CFC6B4",
  /* Added v2.4 for Meta. `clay` is spoken for as the China-tier fill, so a
     new tone was needed rather than a reuse. Teal sits far enough from
     `sage` (OpenAI) and `slate` (Perplexity) to read apart on the swarm. */
  teal: "#5F8A80",
};

/* `brick` and `clay` above are chart/dot fills (non-text, exempt from text
   contrast rules) and stay as-is so bars keep matching their §04 brand
   swatch. The few spots that set body text in those hues need darker,
   text-only variants to clear 4.5:1 on PAPER. */
export const TEXT_BRICK = "#965844";
export const TEXT_CLAY = "#7A6556";

/* ——— Brand colors, sourced from the web-traffic-share chart (§04) ———
   Every other bar/line/dot for a company or its product reuses this color,
   so "ochre" reads as Anthropic/Claude everywhere in the edition, etc. */
export const BRAND_COLOR = { Anthropic: C.ochre, OpenAI: C.sage, Google: C.blue, xAI: C.brick, Microsoft: C.plum, Perplexity: C.slate, Meta: C.teal };
export const BRAND_OF = {
  Anthropic: "Anthropic", Claude: "Anthropic", "Claude Opus 5": "Anthropic", "Claude Fable 5": "Anthropic",
  "Claude Fable 5.1": "Anthropic", "Claude Mythos 5.1": "Anthropic",
  OpenAI: "OpenAI", ChatGPT: "OpenAI", "GPT-5.6 Sol": "OpenAI", "GPT-5.6 Terra": "OpenAI", "GPT-6 Astra": "OpenAI",
  Google: "Google", Gemini: "Google", "Gemini 3.7 Flash": "Google", "Gemini 3.8 Flash": "Google",
  "Gemini 4 Argon": "Google", "Gemini-4 Argon": "Google", "Gemini 4.0 Argon": "Google", "gemini-4-argon": "Google",
  Alphabet: "Google", GOOG: "Google",
  xAI: "xAI", Grok: "xAI", "Grok 4.6": "xAI", SpaceXAI: "xAI",
  Microsoft: "Microsoft", Copilot: "Microsoft", MSFT: "Microsoft",
  Meta: "Meta", "Meta AI": "Meta", Muse: "Meta", "Muse Spark": "Meta", "Muse Spark 1.3": "Meta", META: "Meta",
  Perplexity: "Perplexity",
};
/* Exact keys miss a qualifier or a hyphenated slug. Any Gemini name is
   Google, the same as Gemini 3.8 Flash and Gemini 4 Argon. */
const geminiName = (name) => /^gemini(?:[\s._-]|$|\d)/i.test(String(name ?? "").trim());
export const brandFill = (name, fallback) => {
  const brand = BRAND_OF[name] || (geminiName(name) ? "Google" : null);
  return brand ? BRAND_COLOR[brand] : fallback;
};


/* Fallback when a values file or the baseline has no stored index version.
   The models job writes the version the leaderboard returned (`aaVersion`).
   snapshot() stamps that stored version onto the trend log so the chart can
   break its line where the scale changed. Scores are not comparable across
   versions. */
export const AA_INDEX_VERSION = "v4.3.2";

/* A one-row reply is not a leaderboard. Fewer valid rows than this keeps the
   previous `aa` list and fails the panel. */
export const MIN_AA_ROWS = 5;

/* User bases are stored in millions. A model often returns the raw count
   for the largest products (1200000000) and millions for the rest (420).
   Anything at or above this threshold is a raw count. */
export const USER_RAW_COUNT_AT = 100_000;
/* After that conversion, a figure outside this band is not a monthly user
   base for these assistants: under 1 million, or over 10 billion. */
export const USER_MILLIONS_MIN = 1;
export const USER_MILLIONS_MAX = 10_000;

/* Unit repair only. A raw count becomes millions. The 1–10,000 band is not
   applied here: an out-of-band figure is a flag at refresh time, and a stored
   number outside that band is still shown. */
export const convertUserMillions = (raw) => {
  let n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= USER_RAW_COUNT_AT) n /= 1_000_000;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
};

export const userCountInBand = (millions) =>
  Number.isFinite(millions) && millions >= USER_MILLIONS_MIN && millions <= USER_MILLIONS_MAX;

export const normalizeUserMillions = (raw) => {
  const n = convertUserMillions(raw);
  if (!userCountInBand(n)) return null;
  return n;
};

export const formatUserMillions = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return `${Math.round(n).toLocaleString("en-US")}M`;
};

/* An exact tie across companies is flagged, not dropped. Callers still
   publish a company that is not in one of these groups. */
export const identicalCompanyGroups = (incoming) => {
  const groups = new Map();
  for (const [name, raw] of Object.entries(incoming || {})) {
    const v = Number(raw);
    if (!Number.isFinite(v) || !(v > 0)) continue;
    const key = String(Math.round(v * 1000) / 1000);
    const names = groups.get(key) || [];
    names.push(name);
    groups.set(key, names);
  }
  const ties = [];
  for (const [key, names] of groups) {
    if (names.length < 2) continue;
    ties.push({ value: Number(key), names: [...names] });
  }
  return ties;
};

export const SHARE_SUM_MIN = 90;
export const SHARE_SUM_MAX = 110;

const CHECK_FIELDS = ["val", "rev", "users", "share"];
const CHECK_STATUS = new Set(["confirmed", "unconfirmed", "single source"]);

export const readChecks = (raw) => {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  for (const field of CHECK_FIELDS) {
    const group = raw[field];
    if (!group || typeof group !== "object") continue;
    const next = {};
    for (const [name, row] of Object.entries(group)) {
      if (!row || typeof row !== "object" || !CHECK_STATUS.has(row.status)) continue;
      const candidate = row.candidate == null || row.candidate === "" ? null : Number(row.candidate);
      next[name] = {
        status: row.status,
        value: Number.isFinite(Number(row.value)) ? Number(row.value) : null,
        candidate: Number.isFinite(candidate) ? candidate : null,
        reason: typeof row.reason === "string" ? row.reason : "",
        sources: Array.isArray(row.sources) ? row.sources.filter((url) => typeof url === "string" && url) : [],
      };
    }
    if (Object.keys(next).length) out[field] = next;
  }
  return out;
};

export const dropCheck = (data, field, name) => {
  const group = data.checks && data.checks[field];
  if (!group || !Object.prototype.hasOwnProperty.call(group, name)) return data;
  const nextGroup = { ...group };
  delete nextGroup[name];
  const checks = { ...data.checks };
  if (Object.keys(nextGroup).length) checks[field] = nextGroup;
  else delete checks[field];
  return { ...data, checks };
};

/* Stamp for one wire field. Confirmed values stay quiet. The reason is the
   tooltip; the per-value note under the chart carries the same words. */
export const checksStamp = (group) => {
  const rows = Object.entries(group || {}).filter(([, row]) =>
    row && (row.status === "unconfirmed" || row.status === "single source"));
  if (!rows.length) return null;
  const text = rows.length === 1
    ? `${rows[0][0]} · ${rows[0][1].status}`
    : rows.map(([name, row]) => `${name} · ${row.status}`).join("; ");
  return {
    text,
    title: rows.map(([name, row]) => `${name}: ${row.reason}`).join("\n"),
    tone: "warn",
  };
};

export const identicalRevenueNote = (ties) => {
  if (!ties || !ties.length) return null;
  const parts = ties.map((tie) => {
    const names = tie.names;
    const listed = names.length === 2
      ? `${names[0]} and ${names[1]}`
      : `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
    const verb = names.length === 2 ? "both" : "all";
    return `${listed} ${verb} ${tie.value}`;
  });
  return `identical revenue rejected: ${parts.join("; ")}; previous values kept`;
};

/* The version field is a token such as v4.3.2. Anything else is absent, and
   the display falls back to AA_INDEX_VERSION. */
export const parseAaVersion = (raw) => {
  const text = String(raw ?? "").trim();
  const match = /^v?(\d+(?:\.\d+)+)$/.exec(text);
  return match ? `v${match[1]}` : "";
};

export const aaIndexVersion = (d) => {
  const stored = d && typeof d.aaVersion === "string" ? d.aaVersion.trim() : "";
  return stored || AA_INDEX_VERSION;
};

/* ——— Baseline dataset, researched 2026-08-21/22, refreshed 2026-08-26 ——— */
export const BASELINE = {
  valuations: [
    { name: "Anthropic", value: 965, note: "Series H, May ’26" },
    { name: "OpenAI", value: 852, note: "Mar ’26 round" },
    { name: "xAI", value: 250, note: "last standalone mark; now inside public SpaceX ($1.87T)" },
    { name: "Databricks", value: 190, note: "$5B round, Aug ’26" },
    { name: "DeepSeek", value: 74, note: "resumed $8B round, Aug ’26", cn: true },
    { name: "Z.ai (Zhipu)", value: 64, note: "HK-listed mkt cap, Aug ’26", cn: true },
    { name: "Anduril", value: 61, note: "Series H, May ’26 · $100B round in talks" },
    { name: "Moonshot AI", value: 35, note: "confirmed, July ’26", cn: true },
    { name: "MiniMax", value: 13, note: "HK-listed mkt cap, well below IPO mark", cn: true },
  ],
  race: [
    { t: "Oct ’24", OpenAI: 157, Anthropic: null },
    { t: "Mar ’25", OpenAI: 300, Anthropic: 61.5 },
    { t: "Sep ’25", OpenAI: null, Anthropic: 183 },
    { t: "Oct ’25", OpenAI: 500, Anthropic: null },
    { t: "Feb ’26", OpenAI: null, Anthropic: 380 },
    { t: "Mar ’26", OpenAI: 852, Anthropic: null },
    { t: "May ’26", OpenAI: 852, Anthropic: 965 },
  ],
  stocks: [
    { ticker: "NVDA", name: "Nvidia", price: 213.05, cap: "≈ $5.16T", note: "Q2 FY27 reported 2026-09-07" },
    { ticker: "MSFT", name: "Microsoft", price: 491.71, cap: "≈ $3.65T", note: "capex revised to ≈$175B on accounting change" },
    { ticker: "GOOG", name: "Alphabet", price: 349.90, cap: "≈ $4.28T", note: "capex guide raised to $195–205B" },
    { ticker: "META", name: "Meta", price: 570.05, cap: "≈ $1.45T", note: "volatile Aug; +4% premarket on $22B compute deal report" },
    { ticker: "AMZN", name: "Amazon", price: 261.06, cap: "≈ $2.82T", note: "2026 capex raised to ~$220B" },
    { ticker: "AVGO", name: "Broadcom", price: 356.74, cap: "—", note: "custom accelerators; down from summer highs" },
    { ticker: "TSM", name: "TSMC", price: 417.41, cap: "—", note: "frontier fabrication" },
  ],
  /* The locked fallback is Intelligence Index v4.3.2. These rows are the
     restored v4.2 board and stay until the models job writes a live table.
     A score on v4.3.2 is not comparable to one of these v4.2 numbers. */
  /* Names carry the scored configuration in parentheses where the source
     states it: §03 splits that off, putting the base name on the axis and
     the variant in the fine print. Muse Spark 1.3 is left bare because the
     source table doesn't say which of its variants was measured — guessing a
     qualifier would read as sourced when it isn't. */
  aaIndex: [
    { model: "Claude Fable 5.1 (Adaptive Reasoning, Max Effort)", lab: "Anthropic", score: 57.0 },
    { model: "GPT-6 Astra (max)", lab: "OpenAI", score: 55.0 },
    { model: "Claude Opus 5 (max)", lab: "Anthropic", score: 54.0 },
    { model: "Claude Fable 5 (max)", lab: "Anthropic", score: 53.0 },
    { model: "Muse Spark 1.3", lab: "Meta", score: 53.0 },
    { model: "GPT-5.6 Sol (max)", lab: "OpenAI", score: 51.0 },
    { model: "Grok 4.6 (high)", lab: "xAI", score: 51.0 },
    { model: "Kimi K3 (max)", lab: "Moonshot", score: 50.0, cn: true },
  ],
  users: [
    { name: "Meta AI", users: 1200, basis: "MAU · embedded in apps" },
    { name: "ChatGPT", users: 1110, basis: "MAU · 900M+ weekly" },
    { name: "Gemini", users: 1000, basis: "MAU · passed 1B Aug ’26" },
    { name: "Copilot", users: 420, basis: "MAU" },
    { name: "Claude", users: 245, basis: "MAU" },
    { name: "Grok", users: 64, basis: "MAU" },
  ],
  webShare: [
    { name: "ChatGPT", value: 54.8, color: C.sage },
    { name: "Gemini", value: 26.8, color: C.blue },
    { name: "Claude", value: 9.7, color: C.ochre },
    { name: "Grok", value: 2.5, color: C.brick },
    { name: "Copilot", value: 1.3, color: C.plum },
    { name: "Perplexity", value: 1.3, color: C.slate },
    { name: "Others", value: 3.6, color: "#CFC6B4" },
  ],
  capex: [
    { name: "Alphabet", value: 200, range: "195–205" },
    { name: "Amazon", value: 220, range: "≈220" },
    { name: "Microsoft", value: 175, range: "≈175" },
    { name: "Meta", value: 137, range: "130–145" },
  ],
  revenue: [
    { name: "Anthropic", value: 65 },
    { name: "OpenAI", value: 40 },
    { name: "xAI", value: 0.5 },
  ],
  energy: [
    { year: "2025", ai: 95, conventional: 193, cooling: 159 },
    { year: "2026", ai: 175, conventional: 195, cooling: 195 },
    { year: "2027", ai: 258, conventional: 200, cooling: 243 },
  ],
  energyStats: { totalTWh: 565, peakGW: 132, usShare: 40, aiShareOfDC: 31 },
  china: {
    tokenShare: 60,
    gap: 2.7,
    investRatio: "23×",
    costRatio: "≈57×",
  },
  /* Latest US top-free ranks, filled by the nightly chart fetch. Empty until
     a run succeeds — the chart itself reads public/data/store-ranks.json,
     which is the daily record. Do not seed invented ranks here. */
  storeRanks: { ios: {}, android: {} },
};

export const TRACKERS = [
  { name: "Artificial Analysis Intelligence Index", leader: "Claude Opus 5.5 — 57.6", detail: "Composite of 10 evals (v4.3.2): AA-Briefcase v1.1, GDPval-AA v2.1, AutomationBench-AA, Terminal-Bench 4.0, SciCode, Humanity's Last Exam, GDP.pdf, CritPt, AA-Omniscience, and AA-LCR v1.1. Scores on v4.3.2 are not comparable to v4.2.", url: "https://artificialanalysis.ai/evaluations/artificial-analysis-intelligence-index" },
  { name: "LMArena (Chatbot Arena)", leader: "Claude Fable 5 holds text Elo (1507)", detail: "Crowd-sourced blind A/B voting. Fable 5.1 entered at 1504 ±11 — inside the noise of the top four, and still accumulating votes; GPT-6 Astra has not yet placed.", url: "https://arena.ai/leaderboard/text" },
  { name: "SWE-bench Verified", leader: "Claude Opus 5 — 96.0%", detail: "Real GitHub issue resolution — rose from 60% to the mid-90s in a single year, per Stanford's AI Index. No published re-run yet for the September models.", url: "https://hai.stanford.edu/ai-index/2026-ai-index-report/technical-performance" },
  { name: "Terminal-Bench 2.1 (agentic)", leader: "Claude Fable 5.1 — 91.4%", detail: "Hard terminal-agent tasks; the field's center of gravity as benchmarks shift toward agentic work. First score above 90 — Grok 4.6's 88.4% held the top for most of the summer.", url: "https://artificialanalysis.ai/evaluations/terminalbench-v2-1" },
];

export const SRC = {
  valuations: [["CNBC — Anthropic Series H", "https://www.cnbc.com/2026/05/28/anthropic-open-ai-startup-value.html"], ["CNBC — Databricks $190B round", "https://www.cnbc.com/2026/08/13/databricks-funding-round-190-billion-valuation.html"], ["Fortune — China's AI IPO rush", "https://fortune.com/2026/07/23/moonshot-deepseek-great-chinese-ai-ipo-rush/"], ["Bloomberg — DeepSeek resumes $8B round", "https://www.bloomberg.com/news/articles/2026-08-06/deepseek-resumes-8-billion-round-with-monolith-in-the-running"]],
  markets: [["CNBC quotes", "https://www.cnbc.com/quotes/AAPL,AMZN,GOOGL,MSFT,META,NVDA,TSLA"], ["stockanalysis.com — market data", "https://stockanalysis.com/"], ["MLQ.ai — hyperscaler capex tracker", "https://mlq.ai/news/big-techs-2026-capex-range-reaches-720-billion-to-745-billion/"]],
  models: [["Artificial Analysis — Intelligence Index v4.3.2", "https://artificialanalysis.ai/evaluations/artificial-analysis-intelligence-index"], ["Artificial Analysis — Claude Fable 5.1 tops the Index", "https://artificialanalysis.ai/articles/claude-fable-5-1"], ["Artificial Analysis — benchmarking GPT-6 Astra", "https://artificialanalysis.ai/articles/benchmarking-gpt-6-astra"], ["Artificial Analysis — Muse Spark 1.3: Meta reaches the frontier", "https://artificialanalysis.ai/articles/muse-spark-1-3"], ["OpenAI — GPT-6 Astra", "https://openai.com/index/gpt-6-astra/"], ["Stanford HAI — AI Index 2026", "https://hai.stanford.edu/ai-index/2026-ai-index-report"], ["tbench.ai — Terminal-Bench 2.1", "https://www.tbench.ai/leaderboard/terminal-bench/2.1"]],
  users: [["TechCrunch — Gemini passes 1B MAU", "https://techcrunch.com/2026/08/11/googles-gemini-app-surges-to-one-billion-users/"], ["Tech Insider — chatbot web-share, July ’26", "https://tech-insider.org/ie/claude-vs-chatgpt-vs-gemini-2026/"], ["Instant Press — AI statistics", "https://www.instantpress.co/ai-statistics"]],
  capital: [["Reuters — Anthropic run rate tops $65B, 17 Aug 2026", "https://www.reuters.com/technology/anthropic-revenue-run-rate-tops-65-billion-source-says-2026-08-17/"], ["CNBC — Anthropic $65B in July, 17 Aug 2026", "https://www.cnbc.com/2026/08/17/anthropic-says-annualized-revenue-climbed-to-65-billion-in-july.html"], ["Axios — OpenAI ARR nears $70B, 29 Sep 2026", "https://www.axios.com/2026/09/29/scoop-openais-annual-recurring-revenue-nears-70b"], ["MLQ.ai — capex roundup", "https://mlq.ai/news/big-techs-2026-capex-range-reaches-720-billion-to-745-billion/"]],
  energy: [["Gartner — data center power", "https://www.gartner.com/en/newsroom/press-releases/2026-06-10-gartner-says-data-center-electricity-demand-to-grow-26-percent-in-2026"], ["Forbes — US ~40% of global data-center power", "https://www.forbes.com/sites/rrapier/2026/08/23/the-us-now-uses-nearly-40-of-the-worlds-data-center-electricity/"], ["IEA — Energy and AI", "https://www.iea.org/reports/energy-and-ai/energy-demand-from-ai"], ["Goldman Sachs — US power demand", "https://www.goldmansachs.com/insights/articles/us-data-center-power-demand-projected-to-double-by-2027"]],
  china: [["Dataconomy — Chinese models take top 5 on OpenRouter", "https://dataconomy.com/2026/07/29/chinese-ai-models-openrouter-top-five/"], ["Officechai — US models' OpenRouter share collapses 70%→30%", "https://officechai.com/ai/share-of-us-models-being-used-on-openrouter-has-collapsed-from-70-to-30-over-the-past-year/"], ["Stanford HAI — AI Index 2026", "https://hai.stanford.edu/ai-index/2026-ai-index-report"]],
  storeRanks: STORE_RANK_SOURCES,
};

/* ——— Refresh jobs, one per panel ———
   Unchanged from the artifact edition. These now run server-side in
   src/refresh-run.js on a schedule; nothing in the browser ever calls the API.

   `keys` names the wire-format fields the job writes, which is what lets the
   cron tell a check that found nothing new from a check that never happened.
   See `panelDigest` below. */
export const JOBS = {
  valuations: {
    keys: ["val"],
    /* Cited passages are collected in src/refresh-run.js. Which amount is the
       company's completed price is decided in api/valuation-judgment.js.
       This panel does not ask a model to emit the number. */
    apply: (d, j) => {
      if (!j.valuations && !Array.isArray(j.flagged) && !Array.isArray(j.kept)) return d;
      const flaggedByName = new Map((j.flagged || []).map((row) => [row.company, row]));
      const keptByName = new Map((j.kept || []).map((row) => [row.company, row]));
      const panelFlags = [];
      const panelNotes = [];
      let next = d;
      const v = d.valuations.map((x) => {
        const flagged = flaggedByName.get(x.name);
        if (flagged && Number(flagged.billions) > 0) {
          panelFlags.push({
            field: "val",
            panel: "valuations",
            name: x.name,
            prior: x.value,
            candidate: Number(flagged.billions),
            reason: flagged.reasonText || flagged.reason || "The figure needs a second source.",
            quantity: "completed valuation or market capitalization in billions of USD",
            unit: "billion USD",
            firstSource: flagged.source ? { url: flagged.source, text: flagged.snippet || "" } : null,
          });
          return x;
        }
        const kept = keptByName.get(x.name);
        if (kept) {
          panelNotes.push({
            field: "val",
            name: x.name,
            publish: x.value,
            check: {
              status: "unconfirmed",
              value: x.value,
              candidate: null,
              reason: kept.reasonText || "No completed price was cited, so the previous mark stays.",
              sources: [],
            },
          });
          return x;
        }
        const n = j.valuations ? Number(j.valuations[x.name]) : NaN;
        if (!(n > 0)) return x;
        next = dropCheck(next, "val", x.name);
        return { ...x, value: n };
      }).sort((a, b) => b.value - a.value);
      const race = [...d.race];
      const a = v.find((x) => x.name === "Anthropic"), o = v.find((x) => x.name === "OpenAI");
      race[race.length - 1] = { ...race[race.length - 1], Anthropic: a ? a.value : null, OpenAI: o ? o.value : null };
      return {
        ...next,
        valuations: v,
        race,
        ...(panelFlags.length ? { panelFlags } : {}),
        ...(panelNotes.length ? { panelNotes } : {}),
      };
    },
  },
  markets: {
    keys: ["stocks"],
    /* No model prompt. src/refresh-run.js fetches the seven regular-session
       closes directly (src/market-quotes.js) and passes `{ stocks }` keyed
       by ticker. A missing or non-positive price keeps that ticker's prior
       close — a price is never filled in. */
    apply: (d, j) => (!j.stocks ? d : { ...d, stocks: d.stocks.map((s) => {
      const p = Number(j.stocks[s.ticker]);
      return p > 0 ? { ...s, price: Math.round(p * 100) / 100 } : s;
    }) }),
  },
  models: {
    keys: ["aa", "aaVersion"],
    /* Two constraints that pull in opposite directions, both deliberate.
       Dedupe by family: an earlier run returned Claude Opus 5 three times at
       three effort settings, spending three of eight slots on one model. But
       KEEP the parenthesised configuration — §03 splits it off and shows it
       as the variant qualifier, so stripping it would blank a real column.
       The index version is whatever the leaderboard shows now. Do not pin a
       version number: Artificial Analysis re-anchors the scale, and a pinned
       version makes the model answer in prose instead of JSON. */
    prompt: 'Search the web for the current top 8 models on the Artificial Analysis Intelligence Index, with their scores, labs, and the current index version. Report the version the leaderboard shows now; the version string in the JSON example is only a shape. Use scores from that current version only, and do not mix in scores from an older index version. Search only the Artificial Analysis leaderboard. List each model family at most once, choosing its highest-scoring configuration; do not return the same model at several effort levels. Keep the scored configuration in parentheses after the model name exactly as the leaderboard writes it, e.g. "Claude Fable 5.1 (Adaptive Reasoning, Max Effort)" or "GPT-6 Astra (max)"; if the leaderboard names no configuration, give the model name alone. Include Chinese models if they rank. Stop when eight distinct model families are in hand. If you already have at least five distinct families, stop and emit the JSON even if eight are not in hand. Do not search again to confirm a score you already have. Your final text block must be a single JSON object and no other characters: {"version":"v4.3.2","models":[{"model":"","lab":"","score":0,"cn":false}]}',
    apply: (d, j) => {
      const rows = j && Array.isArray(j.models) ? j.models : [];
      const clean = rows
        .filter((m) => m && m.model && Number(m.score) > 0)
        .map((m) => ({ model: String(m.model), lab: String(m.lab || "—"), score: Math.round(Number(m.score) * 10) / 10, cn: !!m.cn }))
        .sort((a, b) => b.score - a.score).slice(0, 8);
      if (clean.length < MIN_AA_ROWS) {
        const error = new Error(`too few rows: ${clean.length}`);
        error.panelError = true;
        throw error;
      }
      const version = parseAaVersion(j && j.version);
      return { ...d, aaIndex: clean, ...(version ? { aaVersion: version } : {}) };
    },
  },
  users: {
    keys: ["users"],
    prompt: 'Search the web for the latest monthly active users in millions for AI assistants: Meta AI, ChatGPT, Gemini, Copilot, Claude, Grok. Every number is millions of people: 1.2 billion monthly users is 1200, not 1200000000 and not 1.2. Stop when each assistant has a monthly-active figure. Do not search again to confirm a number you already have. Your final text block must be a single JSON object and no other characters: {"users":{"Meta AI":0,"ChatGPT":0,"Gemini":0,"Copilot":0,"Claude":0,"Grok":0}}',
    apply: (d, j) => {
      if (!j.users) return d;
      const panelFlags = [];
      let next = d;
      const users = d.users.map((u) => {
        if (!Object.prototype.hasOwnProperty.call(j.users, u.name)) return u;
        const n = convertUserMillions(j.users[u.name]);
        if (n == null) return u;
        if (!userCountInBand(n)) {
          panelFlags.push({
            field: "users",
            panel: "users",
            name: u.name,
            prior: u.users,
            candidate: n,
            reason: `${n} million is outside 1–${USER_MILLIONS_MAX.toLocaleString("en-US")} million.`,
            quantity: "monthly active users in millions",
            unit: "million",
            firstSource: null,
          });
          return u;
        }
        next = dropCheck(next, "users", u.name);
        return { ...u, users: n };
      }).sort((a, b) => b.users - a.users);
      return { ...next, users, ...(panelFlags.length ? { panelFlags } : {}) };
    },
  },
  share: {
    keys: ["share"],
    prompt: 'Search the web for the latest global AI chatbot web-traffic share percentages (Similarweb) for ChatGPT, Gemini, Claude, Grok, Copilot, Perplexity. Stop when each product has a share percentage. Do not search again to confirm a number you already have. Your final text block must be a single JSON object and no other characters: {"share":{"ChatGPT":0,"Gemini":0,"Claude":0,"Grok":0,"Copilot":0,"Perplexity":0}}',
    apply: (d, j) => {
      if (!j.share) return d;
      const named = d.webShare.filter((s) => s.name !== "Others");
      const parsed = [];
      for (const s of named) {
        if (!Object.prototype.hasOwnProperty.call(j.share, s.name)) continue;
        const n = Number(j.share[s.name]);
        if (!(n > 0)) continue;
        parsed.push({ name: s.name, prior: s.value, candidate: Math.round(n * 10) / 10 });
      }
      const sum = Math.round(parsed.reduce((total, row) => total + row.candidate, 0) * 10) / 10;
      const complete = parsed.length === named.length;
      const broken = sum > SHARE_SUM_MAX || (complete && sum < SHARE_SUM_MIN);
      if (broken) {
        return {
          ...d,
          panelFlags: parsed.map((row) => ({
            field: "share",
            panel: "share",
            name: row.name,
            prior: row.prior,
            candidate: row.candidate,
            reason: `Named shares sum to ${sum}, outside ${SHARE_SUM_MIN}–${SHARE_SUM_MAX}.`,
            quantity: "global chatbot web-traffic share percent",
            unit: "percent",
            firstSource: null,
          })),
        };
      }
      let next = d;
      let total = 0;
      const webShare = d.webShare.map((s) => {
        if (s.name === "Others") return s;
        const hit = parsed.find((row) => row.name === s.name);
        const val = hit ? hit.candidate : s.value;
        total += val;
        if (hit) next = dropCheck(next, "share", s.name);
        return { ...s, value: val };
      });
      total = Math.round(total * 10) / 10;
      const withOthers = webShare.map((s) => (
        s.name === "Others"
          ? { ...s, value: Math.max(0, Math.round((100 - total) * 10) / 10) }
          : s
      ));
      return { ...next, webShare: withOthers };
    },
  },
  capital: {
    keys: ["capex", "rev"],
    prompt: 'Search the web for (a) 2026 planned capital expenditure in billions USD for Alphabet, Amazon, Microsoft, Meta and (b) latest annualized revenue run-rates in billions USD for Anthropic, OpenAI, xAI. Give each company the revenue figure from its own source. Do not copy one company\'s run rate onto another. Stop when each company has its figure. Do not search again to confirm a number you already have. Your final text block must be a single JSON object and no other characters: {"capex":{"Alphabet":0,"Amazon":0,"Microsoft":0,"Meta":0},"revenue":{"Anthropic":0,"OpenAI":0,"xAI":0}}',
    apply: (d, j) => {
      let n = { ...d };
      if (j.capex) n.capex = n.capex.map((c) => { const v = Number(j.capex[c.name]); return v > 0 ? { ...c, value: v, range: `≈${v}` } : c; });
      const panelFlags = [];
      if (j.revenue) {
        const ties = identicalCompanyGroups(j.revenue);
        const tied = new Set(ties.flatMap((tie) => tie.names));
        const note = identicalRevenueNote(ties);
        const cleared = [];
        const revenue = n.revenue.map((r) => {
          if (!Object.prototype.hasOwnProperty.call(j.revenue, r.name)) return r;
          const v = Number(j.revenue[r.name]);
          if (!(v > 0)) return r;
          if (tied.has(r.name)) {
            panelFlags.push({
              field: "rev",
              panel: "capital",
              name: r.name,
              prior: r.value,
              candidate: v,
              reason: note,
              quantity: "annualized revenue run rate in billions of USD",
              unit: "billion USD",
              firstSource: null,
            });
            return r;
          }
          cleared.push(r.name);
          return { ...r, value: v };
        });
        for (const name of cleared) n = dropCheck(n, "rev", name);
        n = { ...n, revenue };
      }
      return panelFlags.length ? { ...n, panelFlags } : n;
    },
  },
  storeRanks: {
    keys: ["ranks"],
    /* No model prompt. src/refresh-run.js fetches the two charts directly and
       passes `{ ranks, day }`. Ranks are already filtered to first-party apps. */
    apply: (d, j) => {
      if (!j.ranks || typeof j.ranks !== "object") return d;
      const keep = (ranks) => {
        const out = {};
        if (!ranks || typeof ranks !== "object") return out;
        for (const [id, rank] of Object.entries(ranks)) {
          const n = Number(rank);
          if (n > 0) out[id] = n;
        }
        return out;
      };
      return { ...d, storeRanks: { ios: keep(j.ranks.ios), android: keep(j.ranks.android) } };
    },
  },
  energy: {
    keys: ["energy"],
    prompt: 'Search the web for the latest global data center electricity forecasts: total TWh for 2026, peak power demand in GW for 2026, the US share of global data center consumption as a percent, and the AI-optimized server share of data center power as a percent. Stop when all four figures are in hand. Do not search again to confirm a number you already have. Your final text block must be a single JSON object and no other characters: {"energy":{"totalTWh":0,"peakGW":0,"usShare":0,"aiShareOfDC":0}}',
    apply: (d, j) => {
      if (!j.energy) return d;
      const e = { ...d.energyStats };
      ["totalTWh", "peakGW", "usShare", "aiShareOfDC"].forEach((k) => {
        const v = Number(j.energy[k]);
        if (v > 0) e[k] = Math.round(v * 10) / 10;
      });
      return { ...d, energyStats: e };
    },
  },
};

/* ——— Wire format ———
   Byte-identical to the Drive files the artifact edition wrote, so the
   seeded public/data/*.json and *.csv carry the existing record forward.
   Only *values* travel; labels, notes and sources live in the code. */
/* `scale` is appended last so older CSVs — which end at topScore — still parse:
   missing trailing fields simply read back as null. */
export const HIST_COLS = ["date", "anthropic", "openai", "nvda", "msft", "chatgpt", "claude", "gemini", "topScore", "scale"];
const TEXT_COLS = new Set(["date", "scale"]);

export const packValues = (d, meta, lastRunAt) => ({
  updatedAt: new Date().toISOString(),
  /* Written only by src/refresh-run.js, so it is evidence the refresh actually
     fired — including on a night when every panel failed and no value
     moved. `updatedAt` can't do that job: it also advances when the file is
     edited by hand, so a stale cron behind a recent hand edit reads as
     healthy. */
  ...(lastRunAt ? { lastRunAt } : {}),
  meta,
  val: Object.fromEntries(d.valuations.map((x) => [x.name, x.value])),
  stocks: Object.fromEntries(d.stocks.map((x) => [x.ticker, x.price])),
  users: Object.fromEntries(d.users.map((x) => [x.name, x.users])),
  share: Object.fromEntries(d.webShare.map((x) => [x.name, x.value])),
  capex: Object.fromEntries(d.capex.map((x) => [x.name, x.value])),
  rev: Object.fromEntries(d.revenue.map((x) => [x.name, x.value])),
  energy: d.energyStats,
  aa: d.aaIndex.map((m) => [m.model, m.lab, m.score, m.cn ? 1 : 0]),
  ...(d.aaVersion ? { aaVersion: d.aaVersion } : {}),
  ...(d.checks && Object.keys(d.checks).length ? { checks: d.checks } : {}),
  ranks: {
    ios: (d.storeRanks && d.storeRanks.ios) || {},
    android: (d.storeRanks && d.storeRanks.android) || {},
  },
});

/* ——— Panel freshness ———

   `at` used to be the only timestamp, and it moved on every successful run,
   so a panel that had been checked faithfully every night but had found no
   new number read exactly like a panel nobody had looked at in nine days.
   The two are now recorded separately:

     checkedAt — the last run that successfully fetched this panel
     changedAt — the last run whose fetch actually moved a number

   `panelDigest` is what decides "actually moved": the job's own slice of the
   wire format, serialized. Comparing the published shape rather than the
   in-memory objects means rounding and re-sorting are already applied, so a
   value that survives a round trip unchanged doesn't register as news. */
export const panelDigest = (d, id) => {
  const job = JOBS[id];
  if (!job || !job.keys) return null;
  const packed = packValues(d, null);
  return JSON.stringify(job.keys.map((k) => packed[k]));
};

/* Files written before the split carry only `at`, which meant "last
   successful run" — that is `checkedAt`. There is no way to know when those
   values last moved, so `changedAt` reads back null and the UI says how long
   it has been since the check rather than inventing a change date. */
export const panelTimes = (m) => {
  if (!m || typeof m !== "object") return null;
  return {
    checkedAt: m.checkedAt || m.at || null,
    changedAt: m.changedAt || null,
    failed: !!m.failed,
    suspicious: !!m.suspicious,
    error: m.error || null,
    erroredAt: m.erroredAt || null,
  };
};

export const unpackValues = (d, p) => {
  if (!p || typeof p !== "object") return d;
  const n = { ...d };
  const num = (o, k, fb) => (o && Number(o[k]) > 0 ? Number(o[k]) : fb);
  n.valuations = d.valuations.map((x) => ({ ...x, value: num(p.val, x.name, x.value) }))
    .sort((a, b) => b.value - a.value);
  n.stocks = d.stocks.map((x) => ({ ...x, price: num(p.stocks, x.ticker, x.price) }));
  n.users = d.users.map((x) => {
    if (!p.users || !Object.prototype.hasOwnProperty.call(p.users, x.name)) return x;
    const converted = convertUserMillions(p.users[x.name]);
    return { ...x, users: converted == null ? x.users : converted };
  }).sort((a, b) => b.users - a.users);
  n.webShare = d.webShare.map((x) => ({ ...x, value: num(p.share, x.name, x.value) }));
  n.capex = d.capex.map((x) => { const v = num(p.capex, x.name, x.value); return { ...x, value: v, range: v === x.value ? x.range : `≈${v}` }; });
  n.revenue = d.revenue.map((x) => ({ ...x, value: num(p.rev, x.name, x.value) }));
  if (p.energy) {
    const e = { ...d.energyStats };
    ["totalTWh", "peakGW", "usShare", "aiShareOfDC"].forEach((k) => { if (Number(p.energy[k]) > 0) e[k] = Number(p.energy[k]); });
    n.energyStats = e;
  }
  if (Array.isArray(p.aa) && p.aa.length) {
    n.aaIndex = p.aa.filter((r) => Array.isArray(r) && r[0] && Number(r[2]) > 0)
      .map((r) => ({ model: String(r[0]), lab: String(r[1] || "—"), score: Number(r[2]), cn: !!r[3] }))
      .sort((a, b) => b.score - a.score);
  }
  if (typeof p.aaVersion === "string" && p.aaVersion.trim()) n.aaVersion = p.aaVersion.trim();
  const checks = readChecks(p.checks);
  if (Object.keys(checks).length) n.checks = checks;
  if (p.ranks && typeof p.ranks === "object") {
    const keep = (ranks) => {
      const out = {};
      if (!ranks || typeof ranks !== "object") return out;
      for (const [id, rank] of Object.entries(ranks)) {
        const v = Number(rank);
        if (v > 0) out[id] = v;
      }
      return out;
    };
    n.storeRanks = { ios: keep(p.ranks.ios), android: keep(p.ranks.android) };
  }
  const race = [...n.race];
  const a = n.valuations.find((x) => x.name === "Anthropic"), o = n.valuations.find((x) => x.name === "OpenAI");
  race[race.length - 1] = { ...race[race.length - 1], Anthropic: a ? a.value : null, OpenAI: o ? o.value : null };
  n.race = race;
  return n;
};

export const snapshot = (d) => {
  const val = (arr, key, name, field) => { const x = arr.find((i) => i[key] === name); return x ? x[field] : null; };
  return {
    anthropic: val(d.valuations, "name", "Anthropic", "value"),
    openai: val(d.valuations, "name", "OpenAI", "value"),
    nvda: val(d.stocks, "ticker", "NVDA", "price"),
    msft: val(d.stocks, "ticker", "MSFT", "price"),
    chatgpt: val(d.users, "name", "ChatGPT", "users"),
    claude: val(d.users, "name", "Claude", "users"),
    gemini: val(d.users, "name", "Gemini", "users"),
    topScore: d.aaIndex.length ? d.aaIndex[0].score : null,
    scale: d.aaIndex.length ? aaIndexVersion(d) : null,
  };
};

export const historyToCSV = (h) => [HIST_COLS.join(",")]
  .concat(h.map((r) => HIST_COLS.map((c) => (r[c] == null ? "" : r[c])).join(",")))
  .join("\n");

export const csvToHistory = (text) => {
  if (!text) return [];
  const lines = String(text).trim().split(/\r?\n/).filter(Boolean);
  const start = lines[0] && lines[0].startsWith("date") ? 1 : 0;
  return lines.slice(start).map((ln) => {
    const parts = ln.split(",");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(parts[0])) return null;
    const row = {};
    HIST_COLS.forEach((c, i) => {
      const raw = parts[i];
      if (raw === "" || raw == null) { row[c] = null; return; }
      row[c] = TEXT_COLS.has(c) ? raw : Number(raw);
    });
    /* Older rows stored ChatGPT and Gemini as raw counts. The chart is millions. */
    for (const c of ["chatgpt", "claude", "gemini"]) {
      const converted = convertUserMillions(row[c]);
      if (converted != null) row[c] = converted;
    }
    return row;
  }).filter(Boolean);
};

/* One row per calendar day; a same-day rerun replaces that day's row. */
export const logHistory = (d, h) => {
  const date = new Date().toISOString().slice(0, 10);
  const entry = { date, ...snapshot(d) };
  const rest = (h || []).filter((e) => e.date !== date);
  return [...rest, entry].sort((a, b) => a.date.localeCompare(b.date)).slice(-400);
};
