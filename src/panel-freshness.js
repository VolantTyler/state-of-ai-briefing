import { panelTimes, checksStamp } from "./briefing-data.js";
import { SHARE_REFRESH_DAYS } from "./refresh-policy.js";

/* ——— How old is it? ———
   One vocabulary for every timestamp on the page. `span` is the bare
   magnitude ("9 days"), `ago` is the same thing as an age ("9 days ago").
   Everything spells the unit out: at 10px mono in a card corner "9d" reads
   as a code, and the whole point of these stamps is that a reader can tell
   at a glance whether a number is current. */
const span = (iso, now = Date.now()) => {
  if (!iso) return null;
  const mins = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (mins < 1) return null;
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"}`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"}`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"}`;
};

const ago = (iso, now = Date.now()) => {
  const s = span(iso, now);
  return s ? `${s} ago` : iso ? "just now" : null;
};

/* The nightly cron fires at 08:17 UTC, and GitHub may start it a few
   minutes late, so a panel checked inside the last two days is on schedule
   — one late run is not a fault. Past that, something is actually wrong.
   Web-share is checked weekly, so its line is that week plus the same
   two-day grace. Private-market valuations run on Sunday only, so a
   midweek card is still on schedule until the check is more than 8 days old. */
const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_MS = 2 * DAY_MS;
const SHARE_STALE_MS = (SHARE_REFRESH_DAYS + 2) * DAY_MS;
export const VALUATIONS_STALE_DAYS = 8;
export const VALUATIONS_STALE_MS = VALUATIONS_STALE_DAYS * DAY_MS;

const WEEKLY_VALUATION_IDS = new Set(["valuations", "race"]);

export const staleLimit = (id) => {
  if (id === "share") return SHARE_STALE_MS;
  if (id === "valuations") return VALUATIONS_STALE_MS;
  return STALE_MS;
};

export const isStale = (iso, id, now = Date.now()) =>
  !iso || now - new Date(iso).getTime() > staleLimit(id);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* "Oct 11" — the weekly label names the calendar day of the last check.
   The year is omitted; the card is about how current the figure is. */
export const stampDay = (iso) => {
  if (!iso || String(iso).length < 10) return iso || "";
  const [, m, d] = String(iso).slice(0, 10).split("-");
  const month = MONTHS[Number(m) - 1];
  return month ? `${month} ${Number(d)}` : String(iso).slice(0, 10);
};

export const valuationsFreshness = (checkedAt, now = Date.now()) => {
  const when = stampDay(checkedAt);
  const overdue = isStale(checkedAt, "valuations", now);
  if (overdue) {
    return {
      text: when ? `Updated weekly · last updated ${when} · overdue` : "Updated weekly · overdue",
      tone: "warn",
      title: "Private-market valuations are checked on Sunday. The last successful check is more than 8 days old.",
    };
  }
  return {
    text: `Updated weekly · last updated ${when}`,
    tone: "faint",
    title: "Private-market valuations are checked weekly, on Sunday.",
  };
};

/* ——— What the corner of a panel says ———

   The old stamp said "Refreshed 9d ago" whether the job had run nightly and
   found nothing new, or had not run at all since August. Those are opposite
   situations — one is the dashboard working, the other is the dashboard
   broken — and they read identically, so a healthy panel looked like a fault.

   Four states for a nightly panel, and only the last two are problems:

     Refreshed 5 hours ago                            checked, numbers moved
     Refreshed 5 hours ago · no change in 9 days      checked, nothing to move
     Last checked 9 days ago                          the check itself stopped
     Refresh failed 5 hours ago                       the check ran and errored

   Valuations refresh on Sunday, so a check from the last Sunday stays on
   the healthy line ("Updated weekly · last updated Oct 11") until it is
   more than 8 days old. The race chart uses the same check.

   Tone carries the same split as the words, so the distinction survives a
   glance that doesn't stop to read: faint for the healthy states, clay
   for a stalled check, brick for an outright failure. */
export const refreshStamp = (meta, id, checks, now = Date.now()) => {
  const t = panelTimes(meta);
  if (!t) return { text: "Baseline data", tone: "faint" };

  if (t.failed) {
    /* A panel with no `checkedAt` at all has never once come back clean, so
       there are no "prior values" from a refresh to point at — it is showing
       the seeded baseline. Saying "failed 5 hours ago" there would imply a
       working panel that had one bad night. */
    if (!t.checkedAt) {
      return {
        text: "Refresh has never succeeded · showing seeded values",
        tone: "bad",
        title: t.error ? `Reason: ${t.error}` : "This panel has no successful refresh on record.",
      };
    }
    return {
      text: `Refresh failed ${ago(t.erroredAt || t.checkedAt, now)} · showing values from ${ago(t.checkedAt, now)}`,
      tone: "bad",
      title: t.error ? `Reason: ${t.error}` : undefined,
    };
  }

  const flagged = checksStamp(checks);
  if (flagged) {
    const when = t.checkedAt ? `Refreshed ${ago(t.checkedAt, now)} · ` : "";
    return { text: `${when}${flagged.text}`, tone: "warn", title: flagged.title };
  }

  if (t.suspicious) {
    const when = t.checkedAt ? `Refreshed ${ago(t.checkedAt, now)} · ` : "";
    return {
      text: `${when}needs a second look`,
      tone: "warn",
      title: t.error || "A figure on this panel was held.",
    };
  }

  if (!t.checkedAt) return { text: "Awaiting first refresh", tone: "warn" };

  if (WEEKLY_VALUATION_IDS.has(id)) return valuationsFreshness(t.checkedAt, now);

  if (isStale(t.checkedAt, id, now)) {
    return {
      text: `Last checked ${ago(t.checkedAt, now)}`,
      tone: "warn",
      title: id === "share"
        ? "Web-share is checked weekly. This panel has not had a successful check since then — the values shown are that old."
        : "The nightly refresh has not successfully checked this panel since then — the values shown are that old.",
    };
  }

  /* Checked on schedule. If the numbers themselves haven't moved, say so
     rather than letting the reader assume the check is what went quiet.

     Only worth saying once a full day has passed without a move, though: on
     a nightly job every panel is trivially "unchanged since this morning",
     and a suffix that never goes away stops carrying information.
     `changedAt` is also null for panels last written before the two
     timestamps were split, where there is nothing truthful to add. */
  const heldSince = t.changedAt && t.changedAt < t.checkedAt ? t.changedAt : null;
  const held = heldSince && now - new Date(heldSince).getTime() >= DAY_MS
    ? span(heldSince, now) : null;
  return {
    text: `Refreshed ${ago(t.checkedAt, now)}${held ? ` · no change in ${held}` : ""}`,
    tone: "faint",
    title: held ? `Checked ${id === "share" ? "weekly" : "nightly"}. The last time any figure in this panel moved was ${ago(heldSince, now)}.` : undefined,
  };
};

/* ——— The masthead line ———
   Reads off the panels rather than off `updatedAt`, because `updatedAt` also
   moves when a human edits the file by hand — which would report a nightly
   job as healthy on a day it never ran. The newest successful panel check is
   the honest answer to "when did this last refresh". */
export const runStamp = (lastRunAt, updatedAt, meta, now = Date.now()) => {
  const panels = Object.entries(meta || {}).flatMap(([id, entry]) => {
    const t = panelTimes(entry);
    return t ? [{ id, ...t }] : [];
  });
  if (!panels.length) return { text: `Refreshed nightly · last successful check ${ago(updatedAt, now)}`, tone: "faint" };

  const checks = panels.map((p) => p.checkedAt).filter(Boolean);
  const newest = checks.length ? checks.reduce((a, b) => (a > b ? a : b)) : null;
  const behind = panels.filter((p) => p.failed || isStale(p.checkedAt, p.id, now)).length;

  /* The job fired and every panel came back empty. Worth its own sentence:
     the fix is upstream — an API key, a rate limit — not in the data. */
  if (lastRunAt && !isStale(lastRunAt, undefined, now) && behind === panels.length) {
    return { text: `Nightly refresh ran ${ago(lastRunAt, now)} · every panel failed`, tone: "bad" };
  }

  if (isStale(newest, undefined, now)) {
    return {
      text: newest ? `Nightly refresh has not run in ${span(newest, now)}` : "Nightly refresh has not run yet",
      tone: "warn",
    };
  }

  const lead = `Refreshed nightly · last successful check ${ago(newest, now)}`;
  return behind
    ? { text: `${lead} · ${behind} of ${panels.length} panels behind`, tone: "warn" }
    : { text: lead, tone: "faint" };
};
