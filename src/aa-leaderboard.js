/* The Intelligence Index board, read from Artificial Analysis's public pages.

   The models job used to ask Haiku to search artificialanalysis.ai. On
   2026-10-07 that reply was prose ("the FAQ lists top 5… Let me") with no
   JSON. The reformat only sees that text, and the models guard tells it to
   return an empty list rather than invent rows, so the panel kept the
   previous board (`too few rows: 0`). On 2026-10-08 Haiku did return JSON,
   and it still missed Gemini 4 Argon and mis-labeled a lab. The chart is
   rendered in the page; search snippets are not the board.

   The official data API (`/api/v2/language/models`) requires an
   `x-api-key` even on the free tier. These two public HTML pages do not.
   The leaderboard flight payload lists every scored model. The index page
   states the version string (v4.3.2 today). Haiku search stays the
   fallback when either fetch fails. */

import { MIN_AA_ROWS, parseAaVersion } from "./briefing-data.js";

export const AA_INDEX_PAGE =
  "https://artificialanalysis.ai/evaluations/artificial-analysis-intelligence-index";
export const AA_LEADERBOARD_PAGE = "https://artificialanalysis.ai/leaderboards/models";

export const AA_TOP_FAMILIES = 8;

/* Creator names on the leaderboard that the Chinese-labs toggle hides.
   Institute of Foundation Models is Abu Dhabi, not this set. */
const CHINESE_LABS = new Set([
  "alibaba",
  "deepseek",
  "kimi",
  "minimax",
  "moonshot",
  "moonshot ai",
  "stepfun",
  "xiaomi",
  "z ai",
  "z.ai",
  "zhipu",
]);

const EFFORT_PAREN = /\s*\((?:[^)]*\b(?:max|xhigh|high|medium|low|minimal|fallback|adaptive|reasoning|effort)\b[^)]*)\)\s*$/i;

export const isChineseLab = (name) =>
  CHINESE_LABS.has(String(name || "").trim().toLowerCase().replace(/\s+/g, " "));

/* "Claude Opus 5.5 (Max, Default Fallback)" and the xhigh row are one
   family. "Qwen3.8 Max (0902)" keeps the date: that parenthesis is the
   release, not an effort setting. */
export const modelFamilyName = (name) => {
  let cur = String(name || "").trim();
  let prev = "";
  while (cur && cur !== prev) {
    prev = cur;
    cur = cur.replace(EFFORT_PAREN, "").trim();
  }
  return cur;
};

const UA = "state-of-ai-briefing";

const readHtml = async (fetchImpl, url, signal) => {
  const res = await fetchImpl(url, {
    signal,
    headers: { Accept: "text/html", "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`aa leaderboard: ${res.status} ${url}`);
  const text = await res.text();
  if (!text) throw new Error(`aa leaderboard: empty ${url}`);
  return text;
};

/* Next.js writes the chart as `self.__next_f.push([1,"…escaped…"])`.
   The escaped string is JSON-string contents. A page that already has
   the objects in clear text still parses. */
export const decodeLeaderboardText = (html) => {
  const source = String(html || "");
  const scripts = source.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];
  const parts = [];
  for (const script of scripts) {
    const inner = script.replace(/^<script\b[^>]*>/i, "").replace(/<\/script>$/i, "");
    const pushed = inner.match(/self\.__next_f\.push\(\[1,"([\s\S]*)"\]\)\s*$/);
    if (pushed) {
      try {
        parts.push(JSON.parse(`"${pushed[1]}"`));
        continue;
      } catch (e) { /* fall through to the raw script */ }
    }
    if (inner.includes("intelligenceIndex") || inner.includes("Intelligence Index v")) parts.push(inner);
  }
  if (!parts.length) parts.push(source);
  return parts.join("\n");
};

export const parseAaIndexVersionFromHtml = (html) => {
  const text = `${html || ""}\n${decodeLeaderboardText(html)}`;
  const match = text.match(/Artificial Analysis Intelligence Index (v\d+(?:\.\d+)+)/i);
  return parseAaVersion(match && match[1]);
};

const extractJsonObject = (text, start) => {
  if (text[start] !== "{") return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === "\"") inStr = false;
      continue;
    }
    if (ch === "\"") { inStr = true; continue; }
    if (ch === "{") { depth += 1; continue; }
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
};

const labOf = (obj) => {
  if (obj && typeof obj.modelCreatorName === "string" && obj.modelCreatorName.trim()) {
    return obj.modelCreatorName.trim();
  }
  const creator = obj && obj.creator;
  if (creator && typeof creator.name === "string" && creator.name.trim()) return creator.name.trim();
  return "";
};

/* One row per model family: the highest scored configuration that is not
   deprecated and not an estimated index. The displayed name keeps the
   parenthesis the leaderboard prints. */
export const parseLeaderboardModels = (html) => {
  const text = decodeLeaderboardText(html);
  const bySlug = new Map();
  const needle = "{\"slug\":";
  let from = 0;
  while (from < text.length) {
    const start = text.indexOf(needle, from);
    if (start < 0) break;
    from = start + needle.length;
    const blob = extractJsonObject(text, start);
    if (!blob) continue;
    let obj;
    try { obj = JSON.parse(blob); } catch (e) { continue; }
    const score = Number(obj.intelligenceIndex);
    const name = typeof obj.name === "string" ? obj.name.trim() : "";
    const slug = typeof obj.slug === "string" ? obj.slug.trim() : "";
    const lab = labOf(obj);
    if (!slug || !name || !lab || !(score > 0)) continue;
    if (obj.intelligenceIndexIsEstimated || obj.deprecated) continue;
    const prev = bySlug.get(slug);
    if (!prev || score > prev.score) bySlug.set(slug, { slug, name, lab, score });
  }

  const byFamily = new Map();
  for (const row of bySlug.values()) {
    const family = modelFamilyName(row.name) || row.name;
    const prev = byFamily.get(family);
    if (!prev || row.score > prev.score) byFamily.set(family, { ...row, family });
  }

  return [...byFamily.values()]
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, AA_TOP_FAMILIES)
    .map((row) => ({
      model: row.name,
      lab: row.lab,
      score: row.score,
      cn: isChineseLab(row.lab),
    }));
};

/* `{ version, models }` is the shape `JOBS.models.apply` already accepts.
   Fewer than five families throws, and the caller keeps the Haiku path. */
export const fetchAaLeaderboard = async (fetchImpl = fetch, signal) => {
  const [indexHtml, boardHtml] = await Promise.all([
    readHtml(fetchImpl, AA_INDEX_PAGE, signal),
    readHtml(fetchImpl, AA_LEADERBOARD_PAGE, signal),
  ]);
  const version = parseAaIndexVersionFromHtml(indexHtml);
  if (!version) throw new Error("aa leaderboard: index version missing");
  const models = parseLeaderboardModels(boardHtml);
  if (models.length < MIN_AA_ROWS) throw new Error(`aa leaderboard: too few rows: ${models.length}`);
  return { version, models };
};
