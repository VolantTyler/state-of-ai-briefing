# The State of AI — a living briefing

A periodically refreshed industry dashboard, deployed as a public static site
with a nightly server-side refresh.

## How it works

```
Vercel Cron (daily, 08:00 UTC)
        │
        ▼
  /api/refresh ──── Anthropic API (web search) ──── 7 panel jobs in parallel
        │
        ▼
  commits public/data/values.json + public/data/trend.csv to this repo
        │
        ▼
  Vercel rebuilds ──── static files served from the CDN
        │
        ▼
  Browser reads /data/*.json — no API key, no database, no per-visitor state
```

The inversion is the point. In the artifact edition the browser did the
refreshing, which on a public URL would mean either shipping an API key or
exposing an endpoint any stranger could loop. Here the browser only ever reads
two files, so page loads cost nothing and can't be abused.

Git history *is* the trend log. Every refresh is a dated commit you can diff,
replay or revert — the same job a database would do, for free, with better
auditability.

## Layout

| Path | Role |
|---|---|
| `src/App.jsx` | The dashboard. See `PATCH.md`. |
| `src/briefing-data.js` | Baseline dataset, sources, refresh jobs, wire format. Shared by the app and the cron so they can't drift. |
| `src/useBriefingData.js` | Reads the published files. Replaces `window.storage` + Drive sync. |
| `api/refresh.js` | The nightly job. The only place the API key exists. |
| `public/data/` | Published state, seeded from the existing Drive files. |
| `public/icon.svg` | The mark — three lines converging on one exponential curve. Source of every raster icon. |
| `public/site.webmanifest` | Homescreen name, colors and icon set. |

## Icons and metadata

The mark is three lines — brick, blue and ochre, the same brand colors §04
uses — fanning out at the left and converging as they climb. `public/icon.svg`
is the light edition used for the browser tab; `public/icon-dark.svg` is the
ink edition the homescreen and app-switcher icons are cut from, because a cream
tile disappears against a light wallpaper.

The rasters (`favicon.ico`, `apple-touch-icon.png`, `icon-192.png`,
`icon-512.png`, `icon-maskable-512.png`, `og.png`) are committed build output.
To regenerate them after editing an SVG, rasterize with any SVG renderer —
nothing in the build does it, so the icons cost the deploy nothing.
`icon-maskable-512.png` is the ink mark scaled to 72% so Android's mask can
crop to a circle without clipping the curve.

Canonical, `og:url` and `og:image` need absolute URLs — most scrapers drop
relative ones. `vite.config.js` substitutes `%SITE_URL%` at build time from
Vercel's `VERCEL_PROJECT_PRODUCTION_URL`, so it is correct on deploy with no
configuration. Attach a custom domain and set `SITE_URL` to override it.

## Deploy

**1. Push to GitHub**

```bash
git init && git add -A && git commit -m "Initial commit"
gh repo create state-of-ai-briefing --public --source=. --push
```

**2. Import into Vercel** — framework preset Vite, everything else default.

**3. Create a GitHub token.** Settings → Developer settings → Personal access
tokens → Fine-grained. Scope it to *this repository only*, with
**Contents: Read and write**. Nothing else.

**4. Set environment variables** in Vercel (Settings → Environment Variables),
all four from `.env.example`:

- `ANTHROPIC_API_KEY`
- `GITHUB_TOKEN`
- `GITHUB_REPO` — `your-username/state-of-ai-briefing`
- `CRON_SECRET` — `openssl rand -hex 32`

**5. Redeploy** so the cron registers.

**6. Test the job by hand** before waiting for 3am:

```bash
curl -X POST https://<your-app>.vercel.app/api/refresh \
  -H "Authorization: Bearer $CRON_SECRET"
```

Expect `{"ok":true,"refreshed":[...],"failures":[]}` and two new commits.

## Secrets

`.env.example` lists six environment variables; three of them are secret. That
file says what the shape is. This section says where each one *lives* and how
to replace it — the part that matters at 3am, and the part a password manager
cannot tell you on its own.

| Variable | Issued by | Source of truth | Sensitive in Vercel | Blast radius of a rotation |
|---|---|---|---|---|
| `ANTHROPIC_API_KEY` | Anthropic | Anthropic console | Yes | Anything else using the same key |
| `GITHUB_TOKEN` | GitHub | GitHub → fine-grained PATs | Yes | This repo only, if scoped correctly |
| `CRON_SECRET` | You — `openssl rand -hex 32` | Vercel | Yes | This app alone; nothing external consumes it |
| `ANTHROPIC_MODEL` | — | This README | No | Not a secret |
| `GITHUB_REPO`, `GITHUB_BRANCH` | — | This README | No | Not secrets |

Every secret is mirrored in 1Password as **one item per project** —
`state-of-ai-briefing — Vercel`, one field per variable — not one item per
secret. Forty entries you can no longer map back to anything is how a vault
becomes as useless as no vault.

### When a variable should be marked Sensitive

Vercel's **Sensitive** flag is not a judgment about how secret a value is —
every secret here is equally secret. It makes the variable *write-only*:
nobody, including you, can read it back out of the dashboard afterwards.

So the question is never "is this sensitive?" It is **"does a second copy
exist?"** Sensitive is correct whenever you have a recovery path, and a trap
when you don't: a write-only variable stored nowhere else is a value you have
already lost — you just won't find out until you need it.

Which fixes the order, and the order is the whole lesson. **Store the value
elsewhere first, prove that copy works, and only then mark it Sensitive.**
Test the backup before destroying the original.

### Rotating

`CRON_SECRET` is the cheap one. You invented it and only this app consumes it,
so there is nobody to coordinate with:

1. `openssl rand -hex 32`
2. Update the 1Password field.
3. Vercel → Settings → Environment Variables, with **Production** ticked.
4. **Redeploy** — functions read the values baked in at deploy time, so an
   edit alone changes nothing.
5. Verify with the manual run below, then mark it Sensitive.

`ANTHROPIC_API_KEY` and `GITHUB_TOKEN` rotate at the issuer first, then follow
steps 2–5. Fine-grained GitHub PATs expire — 30 days by default — so record
the expiry date in 1Password next to the value. A cron that goes quiet is
often just an expired token.

### Reading a secret without putting it on disk

`vercel env pull` writes *every* production secret into a local file, which is
a poor trade for needing one string. Read the single value straight out of
1Password instead, so it never reaches shell history or the filesystem:

```bash
curl -i -X POST https://<your-app>.vercel.app/api/refresh \
  -H "Authorization: Bearer $(op read 'op://Private/state-of-ai-briefing/CRON_SECRET')"
```

`vercel env ls` is the safe companion command: it prints variable names and
which environments they target, never values. That is usually the check you
actually wanted — cron runs against Production, and a variable set only for
Preview is invisible to it while looking present in the dashboard.

## Notes

- **Vercel Hobby runs cron once per day**, which is exactly the chosen cadence.
  The trigger time is approximate — Vercel fires within the hour.
- **A failed panel keeps its prior values** and is marked `failed` in
  `values.json`, so the dashboard shows "Refresh failed 5 hours ago" on that
  card rather than a gap. If *every* panel fails, the values are still left
  untouched — but the job now writes `meta` and `lastRunAt` anyway, so a
  totally failed night is visible in the repo instead of looking exactly like
  a cron that never fired.
- **Cost** is seven Sonnet calls with web search per day. Hosting is free on
  Hobby.
- **The commit loop is safe** — the cron only ever writes `public/data/`, and
  Vercel's build doesn't write to the repo, so there's no feedback loop.
- **`CRON_SECRET` is not optional.** Without it `/api/refresh` is a public
  button wired to your API key.

## Reading the freshness stamps

Each panel carries two timestamps in `values.json`, and the difference
between them is the whole point:

| Field | Meaning |
|---|---|
| `checkedAt` | The last run that successfully fetched this panel. |
| `changedAt` | The last run whose fetch actually moved a number. |
| `at` | Legacy alias of `checkedAt`, still written for older readers. |
| `failed`, `error`, `erroredAt` | The last failure and why, for the tooltip. |

`changedAt` is decided by `panelDigest` in `src/briefing-data.js`: it
serializes just this job's slice of the wire format, so a value that
survives a round trip unchanged doesn't count as news.

One timestamp couldn't tell these apart, and that made a working dashboard
look broken:

| Card says | Means |
|---|---|
| `Refreshed 5 hours ago` | Checked on schedule; a figure moved. |
| `Refreshed 5 hours ago · no change in 9 days` | Checked on schedule every night; the world hasn't moved. **Not an error.** |
| `Last checked 9 days ago` | The check itself stopped running. Clay-colored. |
| `Refresh failed 5 hours ago` | The check ran and errored. Brick-colored, reason in the tooltip. |
| `Refresh has never succeeded` | No successful refresh on record; the card is showing seeded values. |

The masthead summarizes the same thing across all seven panels, and reads
from `lastRunAt`/`checkedAt` rather than `updatedAt`, because `updatedAt`
also advances on a hand edit — which would report a dead cron as healthy.

"Behind" is more than two days without a successful check. The cron is
daily and Vercel fires it within the hour, so one late run is not a fault.

## Changing the schedule

Edit `vercel.json`. `"0 8 * * *"` is daily at 08:00 UTC. Twice-daily or hourly
needs a Vercel Pro plan.
