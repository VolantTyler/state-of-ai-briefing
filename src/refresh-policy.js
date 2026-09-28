/* Search budget and the web-share cadence.

   The prompts stay as they are. These two knobs only change how a search is
   billed, and how often the share question is asked. Markets is not here:
   its closes are fetched directly, the same way store ranks fetch charts. */

/* `web_search_20260318` is the current tool that filters result pages in
   code before they reach the model. `web_search_20260209` is the first
   version that does that; this one adds response-inclusion control and
   leaves the default at "full", so citations still come back. */
export const WEB_SEARCH_TOOL = "web_search_20260318";

/* Valuations names nine companies, so a cap under that can drop one.
   The other prompts are a single topic; 5 is the top of the 3–5 range. */
export const SEARCH_MAX_USES = {
  valuations: 12,
  models: 5,
  users: 5,
  share: 5,
  capital: 5,
  energy: 5,
};

export const webSearchTool = (jobId) => {
  const maxUses = SEARCH_MAX_USES[jobId];
  if (!maxUses) throw new Error(`no search cap for ${jobId}`);
  return { type: WEB_SEARCH_TOOL, name: "web_search", max_uses: maxUses };
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
