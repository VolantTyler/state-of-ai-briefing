/* Workflow failure hook. Posts one small JSON body when the refresh job
   failed and the in-process hook did not already deliver it. Missing
   webhook secrets are a skip, not a second failure. */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildJobFailurePayload, failedStepFromOutcomes, grokSecretsArmed, outcomesFromEnv, truncateAlert,
} from "../src/grok-alert.js";

const NOTIFIED = ".refresh-grok-notified";
const SUMMARY = ".refresh-error-summary.txt";

export async function sendWorkflowFailureAlert({
  env = process.env,
  fetchImpl = fetch,
  notifiedPath = NOTIFIED,
  summaryPath = SUMMARY,
} = {}) {
  if (!grokSecretsArmed(env)) {
    console.log("Grok Bot alert skipped: GROK_BOT_WEBHOOK_URL or GROK_BOT_WEBHOOK_KEY is not set.");
    return { skipped: "unset" };
  }
  if (existsSync(notifiedPath)) {
    console.log("Grok Bot alert skipped: the refresh script already delivered it.");
    return { skipped: "already-sent" };
  }
  let summary = "Refresh job failed before a panel error was recorded.";
  if (existsSync(summaryPath)) {
    try {
      const text = readFileSync(summaryPath, "utf8");
      if (text.trim()) summary = text;
    } catch (e) { /* the generic line still posts */ }
  }
  const payload = buildJobFailurePayload({
    repo: env.ALERT_REPO || env.GITHUB_REPOSITORY || null,
    workflow: env.ALERT_WORKFLOW || env.GITHUB_WORKFLOW || null,
    runUrl: env.ALERT_RUN_URL || null,
    job: env.ALERT_JOB || env.GITHUB_JOB || "refresh",
    step: failedStepFromOutcomes(outcomesFromEnv(env)),
    error: truncateAlert(summary),
  });
  let res;
  try {
    res = await fetchImpl(String(env.GROK_BOT_WEBHOOK_URL).trim(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${String(env.GROK_BOT_WEBHOOK_KEY).trim()}`,
        "Content-Type": "application/json",
        "User-Agent": "state-of-ai-briefing",
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.log("Grok Bot alert failed: network");
    return { ok: false };
  }
  if (!res.ok) {
    console.log(`Grok Bot alert failed: HTTP ${res.status}`);
    return { ok: false, status: res.status };
  }
  console.log("Grok Bot alert posted.");
  return { ok: true, payload };
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  sendWorkflowFailureAlert().catch(() => {
    console.log("Grok Bot alert failed: Error");
    process.exitCode = 0;
  });
}
