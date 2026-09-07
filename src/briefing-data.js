export const EDITION = {
  version: "v2.3",
  date: "2026-08-29",
  changelog: [
    ["v2.3", "2026-08-29", "Runtime state now syncs to Google Drive: current panel values and the dated trend log are written to ai-briefing-values.json and ai-briefing-trend.csv on every refresh, and pulled on load — so data accumulated in one place shows up everywhere the dashboard is opened. Local browser storage becomes a cache rather than the record."],
    ["v2.2", "2026-08-28", "Design pass: chart colors now match each company's brand color from the web-traffic-share chart throughout; Artificial Analysis Intelligence Index redrawn as a packed swarm on a zoomed axis to show frontier clustering; added a collapsible table of contents and per-section back-to-top buttons."],
    ["v2.1", "2026-08-26", "Data refresh: Databricks re-priced to $190B, Anthropic revenue run-rate to $65B, Gemini past 1B MAU, China's OpenRouter token share to ~60%, hyperscaler stock prices and capex updated. xAI valuation flagged as structurally uncertain after the SpaceX merger/IPO."],
    ["v2.0", "2026-08-22", "Added Chinese labs (toggleable) and energy & data centers. Per-panel refresh with independent timestamps. Trend log now accumulates across refreshes."],
    ["v1.0", "2026-08-21", "First edition — valuations, public markets, model capability, user bases, capital flows."],
  ],
};

export const INK = "#191714";
export const PAPER = "#FAF7F0";
export const FAINT = "#857D6F";
export const RULE_SOFT = "#E4DCCB";
export const C = {
  blue: "#7A93AC", ochre: "#C8A24E", sage: "#8AA07B", brick: "#B06A55",
  plum: "#8D7A96", slate: "#6E7B84", clay: "#A98C77", paperDeep: "#F1EBDD",
  neutral: "#CFC6B4",
};

/* ——— Brand colors, sourced from the web-traffic-share chart (§04) ———
   Every other bar/line/dot for a company or its product reuses this color,
   so "ochre" reads as Anthropic/Claude everywhere in the edition, etc. */
export const BRAND_COLOR = { Anthropic: C.ochre, OpenAI: C.sage, Google: C.blue, xAI: C.brick, Microsoft: C.plum, Perplexity: C.slate };
export const BRAND_OF = {
  Anthropic: "Anthropic", Claude: "Anthropic", "Claude Opus 5": "Anthropic", "Claude Fable 5": "Anthropic",
  OpenAI: "OpenAI", ChatGPT: "OpenAI", "GPT-5.6 Sol": "OpenAI",
  Google: "Google", Gemini: "Google", "Gemini 3.7 Flash": "Google", Alphabet: "Google", GOOG: "Google",
  xAI: "xAI", Grok: "xAI", "Grok 4.6": "xAI",
  Microsoft: "Microsoft", Copilot: "Microsoft", MSFT: "Microsoft",
  Perplexity: "Perplexity",
};
export const brandFill = (name, fallback) => (BRAND_OF[name] ? BRAND_COLOR[BRAND_OF[name]] : fallback);


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
    { ticker: "NVDA", name: "Nvidia", price: 213.05, cap: "≈ $5.16T", note: "reports Q2 FY27 after close today" },
    { ticker: "MSFT", name: "Microsoft", price: 491.71, cap: "≈ $3.65T", note: "capex revised to ≈$175B on accounting change" },
    { ticker: "GOOG", name: "Alphabet", price: 349.90, cap: "≈ $4.28T", note: "capex guide raised to $195–205B" },
    { ticker: "META", name: "Meta", price: 570.05, cap: "≈ $1.45T", note: "volatile Aug; +4% premarket on $22B compute deal report" },
    { ticker: "AMZN", name: "Amazon", price: 261.06, cap: "≈ $2.82T", note: "2026 capex raised to ~$220B" },
    { ticker: "AVGO", name: "Broadcom", price: 356.74, cap: "—", note: "custom accelerators; down from summer highs" },
    { ticker: "TSM", name: "TSMC", price: 417.41, cap: "—", note: "frontier fabrication" },
  ],
  aaIndex: [
    { model: "Claude Opus 5", lab: "Anthropic", score: 63.0 },
    { model: "Claude Fable 5", lab: "Anthropic", score: 62.1 },
    { model: "Grok 4.6", lab: "xAI", score: 60.9 },
    { model: "Kimi K3", lab: "Moonshot", score: 59.7, cn: true },
    { model: "GLM-5.3", lab: "Z.AI", score: 59.5, cn: true },
    { model: "GPT-5.6 Sol", lab: "OpenAI", score: 58.9 },
    { model: "Qwen3.8 Max", lab: "Alibaba", score: 58.1, cn: true },
    { model: "Gemini 3.7 Flash", lab: "Google", score: 56.0 },
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
};

export const TRACKERS = [
  { name: "Artificial Analysis Intelligence Index", leader: "Claude Opus 5 — 63.0", detail: "Composite of 9 evals (v4.1.1): GDPval-AA v2, τ³-Banking, Terminal-Bench 2.1, HLE, GPQA Diamond, more.", url: "https://artificialanalysis.ai/evaluations/artificial-analysis-intelligence-index" },
  { name: "LMArena (Chatbot Arena)", leader: "Claude Fable 5 tops text Elo (~1508)", detail: "Crowd-sourced blind A/B preference voting — the subjective counterweight to static benchmarks.", url: "https://www.datalearner.com/en/leaderboards" },
  { name: "SWE-bench Verified", leader: "Claude Opus 5 — 96.0%", detail: "Real GitHub issue resolution — rose from 60% to the mid-90s in a single year, per Stanford's AI Index.", url: "https://hai.stanford.edu/ai-index/2026-ai-index-report/technical-performance" },
  { name: "Terminal-Bench 2.1 (agentic)", leader: "Grok 4.6 — 88.4%", detail: "Hard terminal-agent tasks; the field's new center of gravity as benchmarks shift toward agentic work.", url: "https://artificialanalysis.ai/articles/artificial-analysis-intelligence-index-v4-1" },
];

export const SRC = {
  valuations: [["CNBC — Anthropic Series H", "https://www.cnbc.com/2026/05/28/anthropic-open-ai-startup-value.html"], ["CNBC — Databricks $190B round", "https://www.cnbc.com/2026/08/13/databricks-funding-round-190-billion-valuation.html"], ["Fortune — China's AI IPO rush", "https://fortune.com/2026/07/23/moonshot-deepseek-great-chinese-ai-ipo-rush/"], ["Bloomberg — DeepSeek resumes $8B round", "https://www.bloomberg.com/news/articles/2026-08-06/deepseek-resumes-8-billion-round-with-monolith-in-the-running"]],
  markets: [["CNBC quotes", "https://www.cnbc.com/quotes/AAPL,AMZN,GOOGL,MSFT,META,NVDA,TSLA"], ["stockanalysis.com — market data", "https://stockanalysis.com/"], ["MLQ.ai — hyperscaler capex tracker", "https://mlq.ai/news/big-techs-2026-capex-range-reaches-720-billion-to-745-billion/"]],
  models: [["Artificial Analysis", "https://artificialanalysis.ai/evaluations/artificial-analysis-intelligence-index"], ["Stanford HAI — AI Index 2026", "https://hai.stanford.edu/ai-index/2026-ai-index-report"], ["tbench.ai — Terminal-Bench 2.1", "https://www.tbench.ai/leaderboard/terminal-bench/2.1"]],
  users: [["TechCrunch — Gemini passes 1B MAU", "https://techcrunch.com/2026/08/11/googles-gemini-app-surges-to-one-billion-users/"], ["Tech Insider — chatbot web-share, July ’26", "https://tech-insider.org/ie/claude-vs-chatgpt-vs-gemini-2026/"], ["Instant Press — AI statistics", "https://www.instantpress.co/ai-statistics"]],
  capital: [["TechCrunch — Anthropic ARR to $65B", "https://techcrunch.com/2026/08/17/anthropics-annualized-revenue-surges-to-65b/"], ["Bloomberg — OpenAI ARR tops $40B", "https://www.bloomberg.com/news/articles/2026-08-13/openai-s-revenue-run-rate-tops-40-billion-ahead-of-ipo"], ["MLQ.ai — capex roundup", "https://mlq.ai/news/big-techs-2026-capex-range-reaches-720-billion-to-745-billion/"]],
  energy: [["Gartner — data center power", "https://www.gartner.com/en/newsroom/press-releases/2026-06-10-gartner-says-data-center-electricity-demand-to-grow-26-percent-in-2026"], ["Forbes — US ~40% of global data-center power", "https://www.forbes.com/sites/rrapier/2026/08/23/the-us-now-uses-nearly-40-of-the-worlds-data-center-electricity/"], ["IEA — Energy and AI", "https://www.iea.org/reports/energy-and-ai/energy-demand-from-ai"], ["Goldman Sachs — US power demand", "https://www.goldmansachs.com/insights/articles/us-data-center-power-demand-projected-to-double-by-2027"]],
  china: [["Dataconomy — Chinese models take top 5 on OpenRouter", "https://dataconomy.com/2026/07/29/chinese-ai-models-openrouter-top-five/"], ["Officechai — US models' OpenRouter share collapses 70%→30%", "https://officechai.com/ai/share-of-us-models-being-used-on-openrouter-has-collapsed-from-70-to-30-over-the-past-year/"], ["Stanford HAI — AI Index 2026", "https://hai.stanford.edu/ai-index/2026-ai-index-report"]],
};

/* ——— Refresh jobs, one per panel ———
   Unchanged from the artifact edition. These now run server-side in
   api/refresh.js on a schedule; nothing in the browser ever calls the API. */
export const JOBS = {
  valuations: {
    prompt: 'Search the web for the latest reported valuations in billions USD for these AI companies: Anthropic, OpenAI, xAI, Databricks, Z.ai (Zhipu), DeepSeek, Anduril, Moonshot AI, MiniMax. Respond ONLY with compact JSON, no prose or fences: {"valuations":{"Anthropic":0,"OpenAI":0,"xAI":0,"Databricks":0,"Z.ai (Zhipu)":0,"DeepSeek":0,"Anduril":0,"Moonshot AI":0,"MiniMax":0}}',
    apply: (d, j) => {
      if (!j.valuations) return d;
      const v = d.valuations.map((x) => {
        const n = Number(j.valuations[x.name]);
        return n > 0 ? { ...x, value: n } : x;
      }).sort((a, b) => b.value - a.value);
      const race = [...d.race];
      const a = v.find((x) => x.name === "Anthropic"), o = v.find((x) => x.name === "OpenAI");
      race[race.length - 1] = { ...race[race.length - 1], Anthropic: a ? a.value : null, OpenAI: o ? o.value : null };
      return { ...d, valuations: v, race };
    },
  },
  markets: {
    prompt: 'Search the web for the latest stock prices in USD for NVDA, MSFT, GOOG, META, AMZN, AVGO, TSM. Respond ONLY with compact JSON, no prose or fences: {"stocks":{"NVDA":0,"MSFT":0,"GOOG":0,"META":0,"AMZN":0,"AVGO":0,"TSM":0}}',
    apply: (d, j) => (!j.stocks ? d : { ...d, stocks: d.stocks.map((s) => {
      const p = Number(j.stocks[s.ticker]);
      return p > 0 ? { ...s, price: Math.round(p * 100) / 100 } : s;
    }) }),
  },
  models: {
    prompt: 'Search the web for the current top 8 models on the Artificial Analysis Intelligence Index with their scores and labs. Include Chinese models if they rank. Respond ONLY with compact JSON, no prose or fences: {"models":[{"model":"","lab":"","score":0,"cn":false}]}',
    apply: (d, j) => {
      if (!Array.isArray(j.models) || !j.models.length) return d;
      const clean = j.models
        .filter((m) => m.model && Number(m.score) > 0)
        .map((m) => ({ model: String(m.model), lab: String(m.lab || "—"), score: Math.round(Number(m.score) * 10) / 10, cn: !!m.cn }))
        .sort((a, b) => b.score - a.score).slice(0, 8);
      return clean.length ? { ...d, aaIndex: clean } : d;
    },
  },
  users: {
    prompt: 'Search the web for the latest monthly active users in millions for AI assistants: Meta AI, ChatGPT, Gemini, Copilot, Claude, Grok. Respond ONLY with compact JSON, no prose or fences: {"users":{"Meta AI":0,"ChatGPT":0,"Gemini":0,"Copilot":0,"Claude":0,"Grok":0}}',
    apply: (d, j) => (!j.users ? d : { ...d, users: d.users.map((u) => {
      const n = Number(j.users[u.name]);
      return n > 0 ? { ...u, users: Math.round(n) } : u;
    }).sort((a, b) => b.users - a.users) }),
  },
  share: {
    prompt: 'Search the web for the latest global AI chatbot web-traffic share percentages (Similarweb) for ChatGPT, Gemini, Claude, Grok, Copilot, Perplexity. Respond ONLY with compact JSON, no prose or fences: {"share":{"ChatGPT":0,"Gemini":0,"Claude":0,"Grok":0,"Copilot":0,"Perplexity":0}}',
    apply: (d, j) => {
      if (!j.share) return d;
      let sum = 0;
      const next = d.webShare.map((s) => {
        if (s.name === "Others") return s;
        const n = Number(j.share[s.name]);
        const val = n > 0 ? Math.round(n * 10) / 10 : s.value;
        sum += val;
        return { ...s, value: val };
      });
      return { ...d, webShare: next.map((s) => s.name === "Others" ? { ...s, value: Math.max(0, Math.round((100 - sum) * 10) / 10) } : s) };
    },
  },
  capital: {
    prompt: 'Search the web for (a) 2026 planned capital expenditure in billions USD for Alphabet, Amazon, Microsoft, Meta and (b) latest annualized revenue run-rates in billions USD for Anthropic, OpenAI, xAI. Respond ONLY with compact JSON, no prose or fences: {"capex":{"Alphabet":0,"Amazon":0,"Microsoft":0,"Meta":0},"revenue":{"Anthropic":0,"OpenAI":0,"xAI":0}}',
    apply: (d, j) => {
      let n = { ...d };
      if (j.capex) n.capex = n.capex.map((c) => { const v = Number(j.capex[c.name]); return v > 0 ? { ...c, value: v, range: `≈${v}` } : c; });
      if (j.revenue) n.revenue = n.revenue.map((r) => { const v = Number(j.revenue[r.name]); return v > 0 ? { ...r, value: v } : r; });
      return n;
    },
  },
  energy: {
    prompt: 'Search the web for the latest global data center electricity forecasts: total TWh for 2026, peak power demand in GW for 2026, the US share of global data center consumption as a percent, and the AI-optimized server share of data center power as a percent. Respond ONLY with compact JSON, no prose or fences: {"energy":{"totalTWh":0,"peakGW":0,"usShare":0,"aiShareOfDC":0}}',
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
export const HIST_COLS = ["date", "anthropic", "openai", "nvda", "msft", "chatgpt", "claude", "gemini", "topScore"];

export const packValues = (d, meta) => ({
  updatedAt: new Date().toISOString(),
  meta,
  val: Object.fromEntries(d.valuations.map((x) => [x.name, x.value])),
  stocks: Object.fromEntries(d.stocks.map((x) => [x.ticker, x.price])),
  users: Object.fromEntries(d.users.map((x) => [x.name, x.users])),
  share: Object.fromEntries(d.webShare.map((x) => [x.name, x.value])),
  capex: Object.fromEntries(d.capex.map((x) => [x.name, x.value])),
  rev: Object.fromEntries(d.revenue.map((x) => [x.name, x.value])),
  energy: d.energyStats,
  aa: d.aaIndex.map((m) => [m.model, m.lab, m.score, m.cn ? 1 : 0]),
});

export const unpackValues = (d, p) => {
  if (!p || typeof p !== "object") return d;
  const n = { ...d };
  const num = (o, k, fb) => (o && Number(o[k]) > 0 ? Number(o[k]) : fb);
  n.valuations = d.valuations.map((x) => ({ ...x, value: num(p.val, x.name, x.value) }))
    .sort((a, b) => b.value - a.value);
  n.stocks = d.stocks.map((x) => ({ ...x, price: num(p.stocks, x.ticker, x.price) }));
  n.users = d.users.map((x) => ({ ...x, users: num(p.users, x.name, x.users) }))
    .sort((a, b) => b.users - a.users);
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
      row[c] = i === 0 ? raw : (raw === "" || raw == null ? null : Number(raw));
    });
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
