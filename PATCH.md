# Porting `ai-industry-briefing-v2.jsx` → `src/App.jsx`

Everything that made the artifact edition *work as an artifact* is exactly what
has to come out: `window.storage` only exists inside the sandbox, and the
keyless `fetch` to `api.anthropic.com` only worked because the artifact runtime
injected auth. Neither survives on a public URL.

The good news is that all of it is deletion. Nothing in the layout, the charts,
the swarm, the TOC, the scroll navigation or the commentary changes.

Copy your v2.3 file over `src/App.jsx`, then make these five edits.

---

## 1 — Replace the top-of-file constants with imports

Delete from the top of the file:

- `const EDITION = { … }`
- `const INK / PAPER / FAINT / RULE_SOFT / C`
- `const BRAND_COLOR / BRAND_OF / brandFill`
- `const K_STATE` and `const K_HISTORY`
- `const BASELINE = { … }`
- `const TRACKERS = [ … ]`
- `const SRC = { … }`
- `const JOBS = { … }`

They all now live in `src/briefing-data.js`, byte-identical, shared with the
cron function so the browser and the refresh job can never drift apart.

Replace with:

```js
import { useBriefingData } from "./useBriefingData.js";
import {
  EDITION, INK, PAPER, FAINT, RULE_SOFT, C,
  BRAND_COLOR, BRAND_OF, brandFill,
  BASELINE, TRACKERS, SRC, snapshot,
} from "./briefing-data.js";
```

Keep `useState` and `useMemo` in the React import; `useEffect` and
`useCallback` are no longer needed.

## 2 — Delete the entire Drive sync section

Everything from the `/* ——— Google Drive sync ——— */` comment down to the end
of `mergeHistory`, plus `askDrive`, `driveLoad`, `driveSave`, `askClaude`,
`extractJSON`, and the constants `DRIVE_FOLDER_ID`, `F_VALUES`, `F_TREND`,
`SYNC_HISTORY_ROWS`, `DRIVE_MCP`, `HIST_COLS`.

`packValues`, `unpackValues`, `historyToCSV`, `csvToHistory` and `snapshot`
moved to `briefing-data.js` unchanged — the wire format is identical, which is
why your existing Drive files seeded `public/data/` without conversion.

Keep `relTime`, `reducedMotion`, `scrollerFor`, `isDocScroller`, `moveTo`,
`scrollToId` and `scrollToTop` exactly as they are. The sandboxed-frame
reasoning no longer applies on a real page, but the code is harmless there and
still correct if you ever re-open it as an artifact.

## 3 — Replace the state block in `App()`

Delete `persist`, the mount `useEffect`, `logHistory`, `runJob`, `pushToDrive`,
`syncNow`, `refreshOne`, `refreshAll`, `resetAll`, and the `data` / `meta` /
`history` / `busy` / `status` / `sync` `useState` calls.

Replace with:

```js
const { data, meta, history, updatedAt, status: loadStatus } = useBriefingData();
const [showCN, setShowCN] = useState(true);
const [tocOpen, setTocOpen] = useState(true);
```

`busy` is gone, so delete `cursor: busy ? "wait" : "pointer"` from the `btn`
style object (or delete `btn` entirely — see edit 5).

## 4 — `Panel` becomes read-only

Drop `onRefresh` and `busy` from the props and delete the `<button>` and the
`isBusy` line. Keep the timestamp span:

```jsx
const Panel = ({ id, label, meta, children, sources }) => {
  const stamp = meta && meta.at ? `Refreshed ${relTime(meta.at)}` : "Baseline data";
  return (
    /* …same card markup… */
      <Eyebrow>{label}</Eyebrow>
      <span style={{ ...mono, fontSize: 10, color: meta && meta.failed ? C.brick : FAINT }}>
        {meta && meta.failed ? "Last refresh failed · showing prior values" : stamp}
      </span>
    /* … */
  );
};
```

Then remove `onRefresh={refreshOne} busy={busy}` from all seven `<Panel>` call
sites. The `meta={meta.valuations}` props stay — per-panel timestamps still
work, they're just written by the cron now instead of by a click.

## 5 — Masthead: drop the controls

Remove the three buttons (`⟳ Refresh all panels`, `Reset to baseline`,
`⇅ Sync Drive`) and the whole `sync.state` status block. Keep the China
toggle exactly as is.

In their place:

```jsx
<div style={{ ...mono, fontSize: 10, color: FAINT, marginTop: 10 }}>
  {loadStatus === "loading" && "Loading…"}
  {loadStatus === "ok" && `Refreshed nightly · last run ${relTime(updatedAt)}`}
  {loadStatus === "baseline" && "Showing compiled-in baseline — published data unavailable"}
</div>
```

Also worth updating the colophon paragraph: it currently says values live in
Google Drive. They live in the repo now, and the trend log is the commit
history.

---

## What you get back

- No API key anywhere near the browser, and no way for a visitor to spend money
- One shared trend log instead of a separate history per browser
- Instant page loads — two static files off the CDN, zero API calls on render
- Every refresh is a dated commit, so the trend log is diffable and revertible
