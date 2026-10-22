/* Failure and degraded alerts for the refresh job.

   Secret names are the ones the refresh script already reads. The workflow
   step and the in-process hook both post to that webhook. Bodies carry the
   run coordinates and a short error. They do not carry credentials. */

export const GROK_WEBHOOK_URL_ENV = "GROK_BOT_WEBHOOK_URL";
export const GROK_WEBHOOK_KEY_ENV = "GROK_BOT_WEBHOOK_KEY";

export const scrubSecrets = (value) => String(value || "")
  .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[redacted]")
  .replace(/sk-ant-[A-Za-z0-9_-]+/g, "[redacted]")
  .replace(/sk-or-v1-[A-Za-z0-9_-]+/g, "[redacted]")
  .replace(/sk-or-[A-Za-z0-9_-]+/g, "[redacted]")
  .replace(/github_pat_[A-Za-z0-9_]+/g, "[redacted]")
  .replace(/Bearer\s+\S+/gi, "Bearer [redacted]");

export const truncateAlert = (value, n = 500) => {
  const text = scrubSecrets(value).replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
};

export const grokSecretsArmed = (env = process.env) => {
  const url = String((env && env[GROK_WEBHOOK_URL_ENV]) || "").trim();
  const key = String((env && env[GROK_WEBHOOK_KEY_ENV]) || "").trim();
  return Boolean(url && key);
};

export const runContextFromEnv = (env = process.env) => {
  const repo = String((env && (env.GITHUB_REPOSITORY || env.GITHUB_REPO)) || "").trim() || null;
  const workflow = String((env && env.GITHUB_WORKFLOW) || "").trim() || null;
  const runId = String((env && env.GITHUB_RUN_ID) || "").trim();
  const server = String((env && env.GITHUB_SERVER_URL) || "https://github.com").replace(/\/$/, "");
  const runUrl = repo && runId ? `${server}/${repo}/actions/runs/${runId}` : null;
  return {
    repo,
    workflow,
    runUrl,
    job: String((env && env.GITHUB_JOB) || "refresh").trim() || "refresh",
    step: "Refresh",
  };
};

export const buildJobFailurePayload = ({
  repo = null,
  workflow = null,
  runUrl = null,
  job = null,
  step = null,
  error = "",
} = {}) => ({
  source: "state-of-ai-briefing",
  event: "refresh_failed",
  urgency: "high",
  repo: repo || null,
  workflow: workflow || null,
  runUrl: runUrl || null,
  job: job || null,
  step: step || null,
  error: truncateAlert(error || "refresh failed", 500) || "refresh failed",
});

export const buildDegradedAlert = ({
  runAt = null,
  fallbacks = [],
  repo = null,
  workflow = null,
  runUrl = null,
  job = "refresh",
  step = "Refresh",
} = {}) => {
  const rows = Array.isArray(fallbacks) ? fallbacks : [];
  const sections = rows.map((row) => row && row.jobId).filter(Boolean);
  const summary = sections.length
    ? `Primary Anthropic call failed; OpenRouter fallback succeeded for ${sections.join(", ")}`
    : "Primary Anthropic call failed; OpenRouter fallback succeeded";
  return {
    source: "state-of-ai-briefing",
    event: "refresh_degraded",
    severity: "degraded",
    urgency: "low",
    runAt: runAt || null,
    repo: repo || null,
    workflow: workflow || null,
    runUrl: runUrl || null,
    job: job || "refresh",
    step: step || "Refresh",
    error: null,
    errorSummary: summary,
    fallbacks: rows.map((row) => ({
      jobId: row && row.jobId || null,
      provider: "openrouter",
      model: row && row.model || null,
      anthropicModel: row && row.anthropicModel || null,
      reason: row && row.reason || null,
      httpStatus: row && row.httpStatus != null ? row.httpStatus : null,
    })),
    message: summary,
  };
};

/* First real failure in workflow order. The app-token step uses
   continue-on-error, so it is not in this list: a mint failure that falls
   back to the PAT is not a failed refresh. */
export const failedStepFromOutcomes = (outcomes = []) => {
  for (const step of outcomes) {
    if (step && step.outcome === "failure" && step.name) return step.name;
  }
  return "refresh";
};

export const WORKFLOW_STEP_OUTCOMES = [
  ["checkout", "CHECKOUT_OUTCOME"],
  ["setup-node", "SETUP_NODE_OUTCOME"],
  ["npm ci", "NPM_OUTCOME"],
  ["Note GitHub App secret presence", "APP_SECRETS_OUTCOME"],
  ["Select contents token", "CONTENTS_OUTCOME"],
  ["Refresh", "REFRESH_OUTCOME"],
];

export const outcomesFromEnv = (env = process.env) => WORKFLOW_STEP_OUTCOMES.map(([name, key]) => ({
  name,
  outcome: env && env[key] ? String(env[key]) : "",
}));
