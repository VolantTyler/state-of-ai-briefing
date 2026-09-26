/* ——— US store ranks for first-party AI apps ———
   The nightly job reads two live charts and appends that day's reading to
   public/data/store-ranks.json. The page turns those days into weekly
   points. Nothing here invents a rank the chart did not publish.

   Chart: US overall top free, the list a phone shows as "Top Free Apps".
   Apple's public RSS and Google Play's chart request both stop at 100.
   An app absent from a day's object was outside that published list —
   it is not estimated, and it is not carried forward from an earlier day.

   Who counts. The allowlist is the AI company's own assistant, matched by
   store id so a sibling product from the same company cannot sneak in:
   Muse (com.facebook.hatch / com.facebook.aura), not Facebook, Instagram,
   WhatsApp, or Messenger; Gemini, not the Google search app; Grok, not X;
   Copilot, not Teams or Word. Third-party clients (OpenRouter wrappers,
   photo-filter apps with "AI" in the name) are absent from the list, so
   they are dropped even when they outrank the assistants. */

export const STORE_RANK_IOS_URL = "https://itunes.apple.com/us/rss/topfreeapplications/limit=100/json";
export const STORE_RANK_ANDROID_URL = "https://play.google.com/_/PlayStoreUi/data/batchexecute?hl=en&gl=us";
export const STORE_RANK_CHART = "US overall top free";
export const STORE_RANK_DEPTH = 100;
export const STORE_RANK_WEEKS = 52;
export const STORE_RANK_KEEP_DAYS = 400;

/* Human-facing links for the source row. The Android chart is fetched from
   Play's chart request; the collection page is the same list a reader can open. */
export const STORE_RANK_SOURCES = [
  ["Apple — US Top Free Apps", STORE_RANK_IOS_URL],
  ["Google Play — US top free", "https://play.google.com/store/apps/collection/topselling_free?hl=en&gl=us"],
];

export const STORE_APPS = [
  { id: "muse", name: "Muse", defaultOn: true, ios: ["com.facebook.hatch"], android: ["com.facebook.aura"] },
  { id: "chatgpt", name: "ChatGPT", defaultOn: true, ios: ["com.openai.chat"], android: ["com.openai.chatgpt"] },
  { id: "claude", name: "Claude", defaultOn: true, ios: ["com.anthropic.claude"], android: ["com.anthropic.claude"] },
  { id: "gemini", name: "Gemini", defaultOn: true, ios: ["com.google.gemini"], android: ["com.google.android.apps.bard"] },
  { id: "grok", name: "Grok", defaultOn: true, ios: ["ai.x.GrokApp"], android: ["ai.x.grok"] },
  { id: "copilot", name: "Copilot", defaultOn: true, ios: ["com.microsoft.officemobile"], android: ["com.microsoft.copilot"] },
  /* Own-brand assistants that are not the default lines. They join the chart
     only once a real rank exists, and they start toggled off. */
  { id: "metaai", name: "Meta AI", defaultOn: false, ios: ["com.facebook.stellaapp"], android: ["com.facebook.stella"] },
  { id: "perplexity", name: "Perplexity", defaultOn: false, ios: ["ai.perplexity.app"], android: ["ai.perplexity.app.android"] },
  { id: "deepseek", name: "DeepSeek", defaultOn: false, cn: true, ios: ["com.deepseek.chat"], android: ["com.deepseek.chat"] },
  { id: "mistral", name: "Mistral", defaultOn: false, ios: ["ai.mistral.chat"], android: ["ai.mistral.chat"] },
  { id: "kimi", name: "Kimi", defaultOn: false, cn: true, ios: ["com.moonshot.kimichat"], android: ["com.moonshot.kimichat"] },
  { id: "pi", name: "Pi", defaultOn: false, ios: ["com.harrisonstreetlabs.ios.pi"], android: ["ai.inflection.pi"] },
];

export const STORE_APP_BY_ID = Object.fromEntries(STORE_APPS.map((app) => [app.id, app]));
export const DEFAULT_STORE_APP_IDS = STORE_APPS.filter((app) => app.defaultOn).map((app) => app.id);

const PACKAGE_ID = /^[A-Za-z][\w]*(\.[\w]+)+$/;

const indexFor = (platform) => {
  const index = new Map();
  for (const app of STORE_APPS) {
    for (const storeId of app[platform] || []) index.set(storeId, app.id);
  }
  return index;
};

/* Lowest rank wins if a store id is listed twice. Unknown ids are ignored,
   which is the whole filter: the chart is full of parent-company apps. */
export const matchStoreApps = (rows, platform) => {
  const index = indexFor(platform);
  const ranks = {};
  for (const row of rows || []) {
    const appId = index.get(row.id);
    const rank = Number(row.rank);
    if (!appId || !(rank > 0)) continue;
    if (ranks[appId] == null || rank < ranks[appId]) ranks[appId] = rank;
  }
  return ranks;
};

const labelOf = (node) => {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (typeof node.label === "string") return node.label;
  return "";
};

export const parseAppleChart = (json) => {
  let entries = json && json.feed && json.feed.entry;
  if (!entries) throw new Error("apple chart: no entries");
  if (!Array.isArray(entries)) entries = [entries];
  const rows = entries.map((entry, i) => {
    const idAttr = entry && entry.id && entry.id.attributes;
    return {
      rank: i + 1,
      id: idAttr && idAttr["im:bundleId"],
      name: labelOf(entry && entry["im:name"]),
      artist: labelOf(entry && entry["im:artist"]),
    };
  }).filter((row) => typeof row.id === "string" && row.id);
  if (!rows.length) throw new Error("apple chart: empty");
  return rows;
};

/* Play answers the chart request as an XSSI-prefixed JSON document. The
   ranked apps sit at a fixed path inside the vyAe2 payload. A shape change
   throws, so the nightly job keeps yesterday's file instead of writing a
   partial or scrambled list. */
export const parsePlayChart = (text) => {
  const raw = String(text || "").replace(/^\)\]\}'\s*/, "");
  let outer;
  try { outer = JSON.parse(raw); }
  catch (e) { throw new Error("play chart: response was not JSON"); }
  if (!Array.isArray(outer)) throw new Error("play chart: unexpected envelope");
  const row = outer.find((item) => Array.isArray(item) && item[1] === "vyAe2" && typeof item[2] === "string");
  if (!row) throw new Error("play chart: no vyAe2 payload");
  let payload;
  try { payload = JSON.parse(row[2]); }
  catch (e) { throw new Error("play chart: vyAe2 payload was not JSON"); }
  const apps = payload && payload[0] && payload[0][1] && payload[0][1][0] && payload[0][1][0][28] && payload[0][1][0][28][0];
  if (!Array.isArray(apps) || !apps.length) throw new Error("play chart: empty");
  const rows = apps.map((app, i) => {
    const id = app && app[0] && app[0][0] && app[0][0][0];
    const name = app && app[0] && app[0][3];
    if (typeof id !== "string" || !PACKAGE_ID.test(id)) throw new Error(`play chart: bad row ${i}`);
    return { rank: i + 1, id, name: typeof name === "string" ? name : "", artist: "" };
  });
  return rows;
};

const UA = "state-of-ai-briefing";

export const fetchAppleTopFree = async (fetchImpl = fetch) => {
  const res = await fetchImpl(STORE_RANK_IOS_URL, {
    headers: { Accept: "application/json", "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`apple chart ${res.status}`);
  return parseAppleChart(await res.json());
};

const playChartBody = () => {
  const inner = JSON.stringify([[null, [[null, [null, STORE_RANK_DEPTH]], null, null, [113]], [2, "topselling_free", "APPLICATION"]]]);
  return `f.req=${JSON.stringify([[["vyAe2", inner]]])}`;
};

export const fetchPlayTopFree = async (fetchImpl = fetch) => {
  const res = await fetchImpl(STORE_RANK_ANDROID_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      "User-Agent": UA,
    },
    body: playChartBody(),
  });
  if (!res.ok) throw new Error(`play chart ${res.status}`);
  return parsePlayChart(await res.text());
};

/* Both charts have to come back. A failed Android read must not be stored
   as "every Android app left the chart". */
export const fetchStoreRanks = async (fetchImpl = fetch) => {
  const [ios, android] = await Promise.all([fetchAppleTopFree(fetchImpl), fetchPlayTopFree(fetchImpl)]);
  const day = {
    date: new Date().toISOString().slice(0, 10),
    iosDepth: ios.length,
    androidDepth: android.length,
    ios: matchStoreApps(ios, "ios"),
    android: matchStoreApps(android, "android"),
  };
  if (!Object.keys(day.ios).length && !Object.keys(day.android).length) {
    throw new Error("store charts parsed but no first-party apps matched");
  }
  return { ranks: { ios: day.ios, android: day.android }, day };
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const parseUTCDate = (iso) => {
  if (!DATE.test(iso || "")) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

export const formatUTCDate = (date) => date.toISOString().slice(0, 10);

/* Weeks end on Sunday, UTC. The snapshot for a week is the latest daily
   reading inside it — that day's whole chart, not a blend of the days. */
export const weekEndingSunday = (iso) => {
  const date = parseUTCDate(iso);
  if (!date) return null;
  const day = date.getUTCDay();
  if (day !== 0) date.setUTCDate(date.getUTCDate() + (7 - day));
  return formatUTCDate(date);
};

/* 52 week-ending Sundays, counting the week that contains `asOf`. Days
   before the Monday of the oldest of those weeks are out of range. */
export const storeRankWindowStart = (asOf) => {
  const end = parseUTCDate(weekEndingSunday(asOf));
  if (!end) return null;
  const oldestSunday = new Date(end);
  oldestSunday.setUTCDate(end.getUTCDate() - (STORE_RANK_WEEKS - 1) * 7);
  const monday = new Date(oldestSunday);
  monday.setUTCDate(oldestSunday.getUTCDate() - 6);
  return formatUTCDate(monday);
};

const cleanRanks = (ranks) => {
  const out = {};
  if (!ranks || typeof ranks !== "object") return out;
  for (const [id, rank] of Object.entries(ranks)) {
    if (!STORE_APP_BY_ID[id]) continue;
    const n = Number(rank);
    if (n > 0) out[id] = n;
  }
  return out;
};

export const normalizeStoreRankDay = (day) => {
  if (!day || !DATE.test(day.date || "")) throw new Error("store rank day needs a YYYY-MM-DD date");
  return {
    date: day.date,
    iosDepth: Number(day.iosDepth) > 0 ? Number(day.iosDepth) : null,
    androidDepth: Number(day.androidDepth) > 0 ? Number(day.androidDepth) : null,
    ios: cleanRanks(day.ios),
    android: cleanRanks(day.android),
  };
};

export const appendStoreRankDay = (file, day) => {
  const next = normalizeStoreRankDay(day);
  const days = (file && Array.isArray(file.days) ? file.days : [])
    .filter((row) => row && row.date !== next.date)
    .map((row) => normalizeStoreRankDay(row));
  days.push(next);
  days.sort((a, b) => a.date.localeCompare(b.date));
  return {
    chart: STORE_RANK_CHART,
    country: "us",
    list: "top-free",
    days: days.slice(-STORE_RANK_KEEP_DAYS),
  };
};

/* One point per week that actually has a reading. Missing weeks stay
   missing — they are not filled with nulls, averages, or copied ranks. */
export const weeklyRankSeries = (days, { asOf, weeks = STORE_RANK_WEEKS } = {}) => {
  const today = asOf || new Date().toISOString().slice(0, 10);
  const start = storeRankWindowStart(today);
  const end = today;
  const byWeek = new Map();
  for (const day of days || []) {
    if (!day || !DATE.test(day.date || "")) continue;
    if (start && day.date < start) continue;
    if (day.date > end) continue;
    const week = weekEndingSunday(day.date);
    if (!week) continue;
    const prev = byWeek.get(week);
    if (!prev || day.date > prev.date) byWeek.set(week, day);
  }
  const snapshots = [...byWeek.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-weeks)
    .map(([week, day]) => ({
      week,
      asOf: day.date,
      ios: cleanRanks(day.ios),
      android: cleanRanks(day.android),
    }));
  const present = new Set();
  for (const snap of snapshots) {
    for (const id of Object.keys(snap.ios)) present.add(id);
    for (const id of Object.keys(snap.android)) present.add(id);
  }
  const toRows = (platform) => snapshots.map((snap) => {
    const row = { asOf: snap.asOf, week: snap.week };
    for (const id of present) row[id] = snap[platform][id] ?? null;
    return row;
  });
  return {
    ios: toRows("ios"),
    android: toRows("android"),
    appIds: STORE_APPS.map((app) => app.id).filter((id) => present.has(id)),
  };
};
