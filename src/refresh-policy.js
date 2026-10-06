/* Search budget, which panels are model calls, and the web-share cadence.

   Markets is not here: its closes are fetched directly, the same way store
   ranks fetch charts. */

/* `web_search_20260318` filters result pages in code before they reach the
   model, on models that support programmatic tool calling (Claude 4.6 and
   later). It also accepts `response_inclusion`. There is no parameter that
   truncates a result page. `max_uses` is the cap on how many result sets
   get fed back, and `allowed_domains` drops every other site. */
export const WEB_SEARCH_TOOL = "web_search_20260318";

/* Haiku 4.5 can send this tool version only as a direct caller. Dynamic
   filtering is the default `allowed_callers` on `web_search_20260209` and
   later, and Haiku 4.5 does not support programmatic tool calling. Leaving
   the default on makes the API return a 400 that says to set `direct`.
   The dated id is the snapshot; the alias is what an override often sends. */
export const DIRECT_WEB_SEARCH_MODELS = new Set([
  "claude-haiku-4-5",
  "claude-haiku-4-5-20251001",
]);

/* Simple panels are one topic. 2 is a single page; 3 covers a list that
   may not fit on one. Valuations names nine companies and is asked to batch
   them. The 2026-10-02 full run started that call with max_uses 8 and it was
   still going at 198s when the 240s budget aborted it, so the solo call is
   capped at 4. A full run does not start it at all. */
export const SEARCH_MAX_USES = {
  valuations: 4,
  models: 2,
  users: 3,
  share: 2,
  capital: 3,
  energy: 2,
};

/* The Intelligence Index leaderboard is one site. Other pages are where an
   older index scale gets mixed in, and they are extra input tokens.
   Subdomains are included.
   Share, users, capital, and energy are reported across outlets; a domain
   list there would miss the figure. `user_location` only re-ranks results,
   it does not shrink them, so it is not set. */
export const SEARCH_ALLOWED_DOMAINS = {
  models: ["artificialanalysis.ai"],
};

/* Simple panels run before valuations so a spend cap stops the long job
   first. An explicit `?jobs=` list keeps the caller's order instead. */
export const SIMPLE_MODEL_JOBS = ["models", "users", "share", "capital", "energy"];
export const MODEL_JOB_ORDER = [...SIMPLE_MODEL_JOBS, "valuations"];

export const webSearchTool = (jobId, model) => {
  const maxUses = SEARCH_MAX_USES[jobId];
  if (!maxUses) throw new Error(`no search cap for ${jobId}`);
  const tool = { type: WEB_SEARCH_TOOL, name: "web_search", max_uses: maxUses };
  /* Drops nested search-result blocks from the response after a completed
     dynamic-filtering search. Direct calls ignore it and still return
     results, which a pause_turn continuation has to send back unchanged.
     Valuations reads `cited_text` off the text blocks. The docs say that
     flag drops result blocks, not citations, but this panel is the one
     that cannot finish without those passages, so it keeps the default
     "full". */
  if (jobId !== "valuations") tool.response_inclusion = "excluded";
  const domains = SEARCH_ALLOWED_DOMAINS[jobId];
  if (domains) tool.allowed_domains = [...domains];
  /* Haiku 4.5 can send this tool only as a direct caller. Valuations is
     direct even on Sonnet: the default there is dynamic filtering, and that
     path's final text has no citation blocks. This panel reads cited_text. */
  if (jobId === "valuations" || (model && DIRECT_WEB_SEARCH_MODELS.has(model))) {
    tool.allowed_callers = ["direct"];
  }
  return tool;
};

export const parseJobsQuery = (raw, allIds) => {
  if (raw == null || (Array.isArray(raw) && raw.length === 0) || String(raw).trim() === "") {
    return { ids: [...allIds], explicit: false };
  }
  const text = Array.isArray(raw) ? raw.flat().join(",") : String(raw);
  const parts = text.split(/[\s,]+/).map((part) => part.trim().toLowerCase()).filter(Boolean);
  if (!parts.length) return { error: "jobs is empty" };
  const unknown = [...new Set(parts.filter((id) => !allIds.includes(id)))];
  if (unknown.length) return { error: `unknown jobs: ${unknown.join(", ")}` };
  const ids = [];
  for (const id of parts) if (!ids.includes(id)) ids.push(id);
  return { ids, explicit: true };
};

export const orderedModelJobs = (ids, explicit) => {
  const models = ids.filter((id) => MODEL_JOB_ORDER.includes(id));
  if (explicit) return models;
  return MODEL_JOB_ORDER.filter((id) => models.includes(id));
};

/* Weekly, measured in UTC dates. The cron fires at 08:00 and a check often
   finishes later that hour, so a 7×24h clock would skip the morning that
   is already seven calendar days on. A skipped night is not a failure:
   the caller leaves that panel's values and timestamps alone. */
export const SHARE_REFRESH_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

const utcDay = (ms) => {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

/* Due when there is no successful check to count from, or when that check's
   UTC date is at least seven days behind `now`. `checkedAt` is the last
   success; a later failure does not move it and does not by itself make
   the panel due. */
export const shareRefreshDue = (meta, now = new Date()) => {
  const share = meta && meta.share;
  const checked = share && (share.checkedAt || share.at);
  if (!checked) return true;
  const then = Date.parse(checked);
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(then) || !Number.isFinite(nowMs)) return true;
  return (utcDay(nowMs) - utcDay(then)) / DAY_MS >= SHARE_REFRESH_DAYS;
};

/* Identity check in the cron: a skipped share call returns this object and
   nothing else, so it cannot be applied as data or recorded as a failure. */
export const SHARE_SKIPPED = Object.freeze({ skipped: "share" });

/* A full run does not start valuations. On 2026-10-02 it began about 40s
   in, on Sonnet with max_uses 8, and was aborted unread at 198s. The solo
   `?jobs=valuations` call gets the whole 240s budget and the lower cap. */
export const VALUATIONS_FULL_RUN_SKIP =
  "skipped on a full run; it does not finish inside the shared 240s budget. Call ?jobs=valuations";

/* Do not start the Sonnet search when the remaining job budget is shorter
   than this. Aborting an in-flight non-streaming Messages call never
   returns usage, so a start that cannot finish is a likely bill with no
   meter reading. 120s matches the model-retry floor. */
export const VALUATIONS_MIN_START_MS = 120_000;

export const valuationsTimeSkipReason = (remainingMs) =>
  `not started; ${remainingMs}ms left is not enough to finish and read usage`;

/* `next due` is the UTC date on which shareRefreshDue flips true: seven
   midnights after the last successful check's UTC date. */
export const shareSkipReason = (meta, now = new Date()) => {
  const share = meta && meta.share;
  const checked = share && (share.checkedAt || share.at);
  const then = checked ? Date.parse(checked) : NaN;
  if (!Number.isFinite(then)) return "weekly; no successful check on record";
  const last = new Date(then).toISOString().slice(0, 10);
  const next = new Date(utcDay(then) + SHARE_REFRESH_DAYS * DAY_MS).toISOString().slice(0, 10);
  return `weekly; last run ${last}, next due ${next}`;
};

/* GitHub Actions cron is UTC and does not follow US daylight time.
   08:00 UTC is 4:00 AM EDT and 3:00 AM EST.
   10:00 UTC on Sunday is 6:00 AM EDT and 5:00 AM EST. */
export const DAILY_REFRESH_CRON = "0 8 * * *";
export const VALUATIONS_REFRESH_CRON = "0 10 * * 0";

/* Every panel except valuations. The daily Actions run uses this list.
   Valuations has its own weekly run and must not be started here. */
export const dailyJobIds = (allIds) => allIds.filter((id) => id !== "valuations");

/* Blank means the daily set, and it is explicit so a later change cannot
   treat "no argument" as "run every panel, including valuations".
   Any other string is the caller's list, in the caller's order. */
export const resolveJobSelection = (raw, allIds) => {
  if (raw == null || (Array.isArray(raw) && raw.length === 0) || String(raw).trim() === "") {
    return { ids: dailyJobIds(allIds), explicit: true, preset: "daily" };
  }
  const parsed = parseJobsQuery(raw, allIds);
  if (parsed.error) return parsed;
  const preset = parsed.ids.length === 1 && parsed.ids[0] === "valuations" ? "valuations" : "custom";
  return { ...parsed, preset };
};

/* Schedule events ignore REFRESH_JOBS. The Sunday valuations cron is the
   only schedule that selects that panel. workflow_dispatch passes the input
   through; parseJobsQuery trims it, lowercases it, and splits on commas or
   spaces. A blank input is the daily set. */
export const jobsForInvocation = ({
  eventName = "",
  schedule = "",
  jobsInput = "",
  valuationsCron = VALUATIONS_REFRESH_CRON,
} = {}) => {
  if (eventName === "workflow_dispatch") {
    return jobsInput == null ? "" : String(jobsInput);
  }
  if (String(schedule || "") === valuationsCron) return "valuations";
  return "";
};

/* Actions sets REFRESH_EVENT. A local run can pass ids as argv, then
   REFRESH_JOBS, and otherwise gets the daily set. */
export const selectJobsFromEnv = (env = process.env, argv = []) => {
  const eventName = env && env.REFRESH_EVENT ? String(env.REFRESH_EVENT) : "";
  if (eventName === "workflow_dispatch" || eventName === "schedule") {
    return jobsForInvocation({
      eventName,
      schedule: env.REFRESH_SCHEDULE || "",
      jobsInput: env.REFRESH_JOBS ?? "",
    });
  }
  const arg = argv.length ? String(argv[0]) : "";
  if (arg.trim()) return arg.trim();
  if (env && env.REFRESH_JOBS != null && String(env.REFRESH_JOBS).trim()) {
    return String(env.REFRESH_JOBS).trim();
  }
  return "";
};
