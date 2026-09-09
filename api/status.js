/* ————————————————————————————————————————————————
   Configuration self-check.

   `env()` in refresh.js throws on the *first* falsy variable it reaches, so a
   misconfigured deployment reveals its problems one redeploy at a time. Worse,
   it can't tell "absent" from "present but empty" — both are falsy, and
   `vercel env ls` renders an empty variable identically to a populated one.
   That combination cost a day of guessing.

   This reports every expected variable at once, and never returns a value —
   only whether one is set and how many characters long it is. Length alone
   catches the failures that matter here: 0 is empty, and a value one longer
   than it should be is usually a trailing newline from `echo`.
   ———————————————————————————————————————————————— */

const REQUIRED = ["ANTHROPIC_API_KEY", "GITHUB_TOKEN", "GITHUB_REPO", "CRON_SECRET"];
const OPTIONAL = ["ANTHROPIC_MODEL", "GITHUB_BRANCH"];

const describe = (k) => {
  const raw = process.env[k];
  if (raw === undefined) return { state: "missing", len: 0 };
  /* Distinguish empty from whitespace-only: both are useless, but they point
     at different mistakes — a blank paste versus a stray space or newline. */
  if (raw === "") return { state: "empty", len: 0 };
  if (!raw.trim()) return { state: "whitespace", len: raw.length };
  return { state: "ok", len: raw.length, trimmed: raw.length !== raw.trim().length || undefined };
};

export default async function handler(req, res) {
  /* Same guard as refresh.js, deliberately including its one quirk: when
     CRON_SECRET is itself unset the check is skipped, so this endpoint still
     answers and can tell you *that* is what's wrong. It only ever discloses
     variable names — which are already public in .env.example and the README
     — plus booleans and lengths. */
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || "";
  if (secret && auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const vars = {};
  [...REQUIRED, ...OPTIONAL].forEach((k) => { vars[k] = describe(k); });
  const blocking = REQUIRED.filter((k) => vars[k].state !== "ok");

  return res.status(200).json({
    ok: blocking.length === 0,
    /* Which deployment answered. A production alias still pointing at a build
       that predates a variable looks exactly like a missing variable. */
    deployment: {
      env: process.env.VERCEL_ENV || null,
      region: process.env.VERCEL_REGION || null,
      branch: process.env.VERCEL_GIT_COMMIT_REF || null,
      commit: (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7) || null,
      node: process.version,
    },
    blocking,
    vars,
  });
}
