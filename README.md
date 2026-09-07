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

## Notes

- **Vercel Hobby runs cron once per day**, which is exactly the chosen cadence.
  The trigger time is approximate — Vercel fires within the hour.
- **A failed panel keeps its prior values** and is marked `failed` in
  `values.json`, so the dashboard shows "Last refresh failed · showing prior
  values" on that card rather than a gap. If *every* panel fails the job
  commits nothing at all, leaving yesterday's good data untouched.
- **Cost** is seven Sonnet calls with web search per day. Hosting is free on
  Hobby.
- **The commit loop is safe** — the cron only ever writes `public/data/`, and
  Vercel's build doesn't write to the repo, so there's no feedback loop.
- **`CRON_SECRET` is not optional.** Without it `/api/refresh` is a public
  button wired to your API key.

## Changing the schedule

Edit `vercel.json`. `"0 8 * * *"` is daily at 08:00 UTC. Twice-daily or hourly
needs a Vercel Pro plan.
