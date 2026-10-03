import path from "node:path";
import { pathToFileURL } from "node:url";
import { selectJobsFromEnv } from "../src/refresh-policy.js";
import { runRefresh } from "../src/refresh-run.js";

/* Blank jobs is the daily set. `node scripts/refresh.js valuations` runs
   that panel alone. GitHub Actions sets REFRESH_EVENT and ignores argv. */
export async function main(env = process.env, argv = process.argv.slice(2)) {
  const jobs = selectJobsFromEnv(env, argv);
  return runRefresh({ jobs, env });
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  main().then((result) => {
    const body = result && result.body ? result.body : { ok: false, error: "refresh returned no body" };
    console.log(JSON.stringify(body));
    if (!body.ok) process.exitCode = 1;
  }).catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
}
