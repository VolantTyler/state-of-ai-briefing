import { useState, useEffect } from "react";
import { BASELINE, unpackValues, csvToHistory, snapshot } from "./briefing-data.js";

/* ————————————————————————————————————————————————
   Replaces the whole window.storage + Drive sync layer.

   In the artifact edition the browser was the thing that refreshed data,
   so it needed somewhere to persist state. Here the nightly cron does the
   refreshing and commits the result, so the browser only ever reads two
   static files off the CDN. That means no API key in the client, no
   per-visitor storage, and one shared trend log instead of a different
   history in every browser.

   Both files are served from /data/ and are the same wire format the
   Drive sync wrote, so the existing record carried over intact.
   ———————————————————————————————————————————————— */

const BASE_HISTORY = [{ date: "2026-08-26", ...snapshot(BASELINE) }];

export function useBriefingData() {
  const [state, setState] = useState({
    data: BASELINE,
    meta: {},
    history: BASE_HISTORY,
    updatedAt: null,
    lastRunAt: null,
    status: "loading",
  });

  useEffect(() => {
    let live = true;

    (async () => {
      /* Cache-bust so a fresh deploy is never served a stale edge copy. */
      const bust = `?v=${Date.now()}`;
      const [vRes, tRes] = await Promise.allSettled([
        fetch(`/data/values.json${bust}`).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
        fetch(`/data/trend.csv${bust}`).then((r) => (r.ok ? r.text() : Promise.reject(r.status))),
      ]);
      if (!live) return;

      let data = BASELINE;
      let meta = {};
      let updatedAt = null;
      let lastRunAt = null;
      if (vRes.status === "fulfilled" && vRes.value) {
        data = unpackValues(BASELINE, vRes.value);
        meta = vRes.value.meta && typeof vRes.value.meta === "object" ? vRes.value.meta : {};
        updatedAt = vRes.value.updatedAt || null;
        lastRunAt = vRes.value.lastRunAt || null;
      }

      let history = BASE_HISTORY;
      if (tRes.status === "fulfilled") {
        const rows = csvToHistory(tRes.value);
        if (rows.length) history = rows;
      }

      setState({
        data,
        meta,
        history,
        updatedAt,
        lastRunAt,
        /* "baseline" means the published files couldn't be read and the page
           is showing compiled-in values — worth saying out loud rather than
           quietly rendering stale numbers as if they were live. */
        status: vRes.status === "fulfilled" ? "ok" : "baseline",
      });
    })();

    return () => { live = false; };
  }, []);

  return state;
}
