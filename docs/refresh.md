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

Commits go through the GitHub contents API. `.github/workflows/refresh.yml`
mints a GitHub App installation token with
`actions/create-github-app-token@v3` when `GH_APP_ID` and
`GH_APP_PRIVATE_KEY` are both set. The token is scoped to this repository,
with contents write, and the workflow passes it to the script as
`GITHUB_TOKEN`. That is the name `src/refresh-run.js` reads. If
`GITHUB_TOKEN` is empty, the script uses `GH_CONTENTS_TOKEN`. The workflow
does the same when the app secrets are missing or minting fails, and it
logs which path it used. It does not log the token. Minting failure does
not fail the refresh job when `GH_CONTENTS_TOKEN` is set.

The installation token authenticates as the app bot (`<app-slug>[bot]`).
The contents API uses that user as author and committer when the request
omits them. Every contents PUT sets both to Tyler Stahl
`tylerstahl@gmail.com`, the identity on the data commits already on `main`.
`GITHUB_COMMIT_NAME` and `GITHUB_COMMIT_EMAIL` override that pair, and they
have to be set together. The built-in Actions token is not used for these
commits. Do not create an Actions secret named `GITHUB_TOKEN`.

Removing `GH_CONTENTS_TOKEN` waits until a real app-token run has committed
and Vercel has deployed that commit.

## Schedule

Cron is UTC. It does not move with US daylight time.

| Run | UTC cron | Eastern |
|---|---|---|
| Daily panels, except valuations | `17 8 * * *` | 4:17 AM EDT / 3:17 AM EST |
| Valuations only | `23 10 * * 0` (Sunday) | 6:23 AM EDT / 5:23 AM EST |

The daily run is every panel except valuations: models, users, share, capital,
energy, markets, and store ranks. Valuations is not in that list. Share keeps
its own weekly rule: it runs only when the last successful check is at least
seven UTC days earlier, and a skip is not a failure.

The minutes are 17 and 23 so the runs miss the top of the hour. GitHub delays
or drops scheduled workflows that start then, when Actions is under load. A
run can still begin a few minutes late. The two Sunday runs are two hours
apart. `concurrency` group `state-of-ai-refresh` has
`cancel-in-progress: false`, so if one is still going the next one waits. They
do not overlap, and a waiting run is not cancelled.

The workflow file is `.github/workflows/refresh.yml`. It does not run on push
or on pull requests.

## Run it by hand

1. Open the repository on GitHub.
2. Actions → **Refresh briefing data** → **Run workflow**.
3. Leave **jobs** blank for the daily set. Type `valuations` to run that panel
   alone. Any other panel id list is accepted (`models,users` or
   `models Energy`). Entries are trimmed and lowercased, so `Valuations`
   works. An unknown id fails before any paid call.
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
| `GH_APP_ID` | App path | Numeric App ID. Passed to `actions/create-github-app-token@v3` as `app-id`. v3 prints a deprecation annotation that prefers the app's client id. The App ID still mints the token. |
| `GH_APP_PRIVATE_KEY` | App path | PEM private key for that app. The contents of the downloaded `.pem`, not a path. Delete the `.pem` after the secret is set. |
| `GH_CONTENTS_TOKEN` | Fallback | Fine-grained PAT, this repository only, **Contents: Read and write**. Used when the app secrets are missing or minting fails. The script also accepts this name when `GITHUB_TOKEN` is unset. Removing it is a follow-up after the app path has deployed. Do not name a secret `GITHUB_TOKEN`; Actions reserves that name for the built-in token. |
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

## Vercel and the commit author

The Vercel project `state-of-ai-briefing` is on the Hobby team
`volanttyler's projects`. The GitHub repository is public.

Vercel's collaboration docs say collaboration is free for public
repositories. For a private repository on Hobby, a deployment is created
when the commit author is the owner of that Hobby team. Vercel compares
that author with the Git login connected to the owner. The same page says
a private-repository deployment can fail when Vercel cannot identify the
commit author. The bot section says to configure bots so their commits are
clearly automated.

Data commits on `main` are author and committer Tyler Stahl
`tylerstahl@gmail.com`. GitHub links that email to VolantTyler. Those
commits are unsigned, and Vercel has production deployments for them. The
contents API left author and committer unset, so the PAT user became both.

An installation token would otherwise author the commit as `<app-slug>[bot]`.
The contents API documents the alternative: set `author` and `committer`
name and email, and those values are the commit identity. Omitting them
uses the authenticated user. The PUT now sets both to the VolantTyler
identity above. An unsigned commit with that identity is the path that
already deploys.

The first real run that mints an app token still has to confirm two facts
this change cannot check without pushing: GitHub attributes that commit's
author and committer to VolantTyler, and Vercel creates a production
deployment for that SHA. If the commit is attributed to the app bot and no
deployment appears, the author fields did not stick.

## Contents credentials

`.github/workflows/token-expiry.yml` runs every Monday at 12:41 UTC
(8:41 AM EDT / 7:41 AM EST), and when someone runs it from Actions. The
minute is 41 so the run misses :00 and :30. The workflow name is **Check
contents credentials**.

Installation tokens expire about an hour after minting.
`actions/create-github-app-token@v3` also revokes the token when the job
finishes. The refresh mints one in that same job, after `npm ci`, and the
script runs before the revocation. The private key and the installation can still be
revoked, so the Monday job mints a token when `GH_APP_ID` and
`GH_APP_PRIVATE_KEY` are both set, with contents write scoped to this
repository, and reads `public/data/values.json`. Minting or that read
failing fails the job. This check does not use `continue-on-error`. The
refresh job does, so a mint failure there still falls back to the PAT.

When the app secrets are missing, refresh is on the PAT fallback, and the
Monday job checks `GH_CONTENTS_TOKEN` as before. It fails if the secret is
empty, the response is not 2xx (including 401 and 403), the
`github-authentication-token-expiration` header is missing, or the token
expires in under 14 days. Rotate the fine-grained PAT and update the
Actions secret. The next refresh reads the new value.

When the app token minted and the contents read succeeded, the same PAT
check is a warning. Refresh will use the app, so an expired fallback
secret does not fail the Monday job. Rotate or remove that secret in the
follow-up that drops the fallback.

When neither credential is set, the job fails.

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

The models panel does not start with Haiku. It reads two public Artificial
Analysis pages: the Intelligence Index page for the version string, and the
models leaderboard for the rows. Deprecated generations are left out, one
row is kept per model family, and fewer than five families keeps the
previous board. Haiku with `web_search` runs only when those pages cannot
be read. The official API (`/api/v2/language/models`) needs an
`x-api-key` even on the free tier, so there is no
`ARTIFICIAL_ANALYSIS_API_KEY` secret. User counts are stored in millions.
A raw count of 100,000 or more is divided by one million once. A converted
count outside 1–10,000 million is flagged. On read, that stored number is
kept; it is not replaced with the seeded baseline.

An exact revenue tie, a named share total outside 90–110, and a valuation
that moves, that the snippet marks as a round size or a run rate, or that
falls to under one third of the stored mark, are flagged the same way.
The candidate is not written until the check below finishes. A Choice of
`none`, or no cited amount, keeps the previous mark and records why. Noul
is recorded and is not a write gate.

## A flagged figure is checked

After the primary jobs, each flag gets one Haiku call
(`claude-haiku-4-5-20251001`, `web_search` with `max_uses` 1, no pause
continuation) inside the same `REFRESH_MAX_USD`. One System One Choice
then says whether that passage supports the candidate, contradicts it, or
says nothing. Supports publishes the candidate as confirmed. Contradicts
keeps the previous value and marks it unconfirmed, naming both figures.
If the lookup cannot run — spend cap, time budget, error, no independent
passage, or the Choice says nothing — the candidate is published as single
source. Typesafe input tokens are logged on the usage row and are not
added to `estimatedUsd`.

`checks` on `values.json` holds that status per value (`val`, `rev`,
`users`, `share`). Older files without `checks` still load. The page
shows a short note on single-source and unconfirmed values. Confirmed
values are stored and not stamped.

Each entry in `calls` has the model, token counts, `server_tool_use`
(including `web_search_requests`), `stop_reason`, and that call's
`estimatedUsd`. Git history of the file is the log. The same summary is on
`values.json` under `usage` and on the webhook body.
