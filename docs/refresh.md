# Refreshing the briefing

The panels are refreshed by GitHub Actions, not by a Vercel function.
`scripts/refresh.js` calls `runRefresh` in `src/refresh-run.js`. That is the
same job that used to live in `api/refresh.js`: Claude for the model panels,
Yahoo for closes, the store charts, then commits of `public/data/values.json`,
`public/data/trend.csv`, `public/data/store-ranks.json`, and
`public/data/usage.json`. A valuations run also commits `dev/jev-actions.md`.
Failures still send the AgentMail email and the Grok Bot `refresh_failed`
webhook. A clean run still posts `refresh_succeeded`. Nothing in the browser
calls Anthropic.

Commits go through the GitHub contents API, as they did on Vercel. The token
is a fine-grained personal access token, so the commit author is that GitHub
user and Vercel's Git integration deploys production. The built-in
`GITHUB_TOKEN` is not used for those commits. Actions would author them as
`github-actions[bot]`, and Vercel does not deploy a commit whose author is
not a member of the project.

## Schedule

Cron is UTC. It does not move with US daylight time.

| Run | UTC cron | Eastern |
|---|---|---|
| Daily panels, except valuations | `0 8 * * *` | 4:00 AM EDT / 3:00 AM EST |
| Valuations only | `0 10 * * 0` (Sunday) | 6:00 AM EDT / 5:00 AM EST |

The daily run is every panel except valuations: models, users, share, capital,
energy, markets, and store ranks. Valuations is not in that list. Share keeps
its own weekly rule: it runs only when the last successful check is at least
seven UTC days earlier, and a skip is not a failure.

GitHub may start a scheduled run a few minutes late. The two Sunday runs are
two hours apart. `concurrency` group `state-of-ai-refresh` has
`cancel-in-progress: false`, so if one is still going the next one waits. They
do not overlap, and a waiting run is not cancelled.

The workflow file is `.github/workflows/refresh.yml`. It does not run on push
or on pull requests.

## Run it by hand

1. Open the repository on GitHub.
2. Actions → **Refresh briefing data** → **Run workflow**.
3. Leave **jobs** blank for the daily set. Type `valuations` to run that panel
   alone. Any other comma-separated panel id list is accepted
   (`models,users`). An unknown id fails before any paid call.
4. Run workflow. The branch does not matter for the data files: the job always
   commits to `main`.

There is no curl command. `/api/refresh` is gone, so a manual request cannot
start a second runner or hit the old 300 second limit.

## Secrets

Add these under **Settings → Secrets and variables → Actions → Secrets**.
The names have to match. Empty optional secrets are off, not errors.

| Secret | Required | What it is |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Anthropic key for the panel calls. Never reaches the browser. |
| `GH_CONTENTS_TOKEN` | Yes | Fine-grained PAT, this repository only, **Contents: Read and write**. The workflow maps it to `GITHUB_TOKEN` inside the job. Commits are made as the user who owns the token, which is what makes Vercel production deploy. Do not name this secret `GITHUB_TOKEN`; Actions reserves that name for the built-in token. |
| `TYPESAFE_API_KEY` | Yes for valuations | TypeSafe key used when the valuations panel judges cited passages. The daily run does not construct that client. |
| `AGENTMAIL_API_KEY` | Optional | AgentMail key. All three AgentMail values are required before a failure email is sent. |
| `AGENTMAIL_INBOX_ID` | Optional | AgentMail inbox the message is sent from. |
| `NOTIFY_EMAIL` | Optional | Address that receives the failure email. |
| `GROK_BOT_WEBHOOK_URL` | Optional | Grok Bot webhook URL. Both webhook values are required. Success and failure both post. |
| `GROK_BOT_WEBHOOK_KEY` | Optional | Bearer key for that webhook. |

`GITHUB_REPO` and `GITHUB_BRANCH` are set by the workflow (`github.repository`
and `main`). They are not secrets.

Repository **variables** (same settings page, Variables tab) override models
and budgets. Leave them unset to keep the defaults.

| Variable | Default |
|---|---|
| `REFRESH_MAX_USD` | `1` |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` (valuations only) |
| `ANTHROPIC_MODEL_VALUATIONS`, `ANTHROPIC_MODEL_MODELS`, `ANTHROPIC_MODEL_USERS`, `ANTHROPIC_MODEL_SHARE`, `ANTHROPIC_MODEL_CAPITAL`, `ANTHROPIC_MODEL_ENERGY` | unset; simple panels stay on Haiku 4.5 |
| `REFRESH_MAX_DURATION_MS` | `1500000` (25 minutes) |
| `REFRESH_TAIL_RESERVE_MS` | `120000` (2 minutes, kept for the commits and the alert) |
| `REFRESH_CALL_TIMEOUT_MS` | `600000` (10 minutes, every call except valuations) |
| `REFRESH_VALUATIONS_CALL_TIMEOUT_MS` | the job budget, 23 minutes unless the two clocks above change |
| `REFRESH_VALUATIONS_MIN_START_MS` | `600000` (valuations is not started with less than 10 minutes left) |

The Actions job timeout is 30 minutes, longer than the 25 minute internal
clock, so a hung call is aborted in JavaScript and the usage file can still
be committed. The per-run spend cap is unchanged: once the running estimate
reaches `REFRESH_MAX_USD`, later Claude calls are not started.

## What happened to Vercel and the lock

`vercel.json` has `crons: []`. Do not add the refresh cron back. `api/refresh.js`
has been removed, and `functions` no longer sets a 300 second `maxDuration`.
The site is still a static Vercel deploy of `main`.

`dev/refresh-lock.json` is not written anymore. Two lock commits per run were
how the Vercel function kept a second invocation from calling Claude. Actions
concurrency does that now. A stale lock file, if one is ever left on `main`,
does not block this job.

## Reading the cost

After a run, `public/data/usage.json` is the meter. `totals.estimatedUsd` is
the list-price estimate for the run. `totals.estimateComplete` is false when
a call was aborted before Anthropic returned `usage` (those rows say
`likelyBilled` and are not stored as `$0`). `spendCap` records the ceiling
and any panel that was not started because of it. `budget` records the clocks
this run actually used (`maxDurationMs`, `tailReserveMs`, `jobBudgetMs`,
`callTimeoutMs`, `valuationsCallTimeoutMs`, `valuationsMinStartMs`).

Each entry in `calls` has the model, token counts, `server_tool_use`
(including `web_search_requests`), `stop_reason`, and that call's
`estimatedUsd`. Git history of the file is the log. The same summary is on
`values.json` under `usage` and on the webhook body.
