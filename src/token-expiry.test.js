import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("../.github/workflows/token-expiry.yml", import.meta.url), "utf8");
const docs = readFileSync(new URL("../docs/refresh.md", import.meta.url), "utf8");

test("the token expiry workflow checks GH_CONTENTS_TOKEN on Monday morning Eastern", () => {
  assert.match(workflow, /cron:\s*"41 12 \* \* 1"/);
  assert.match(workflow, /8:41 AM EDT/);
  assert.match(workflow, /7:41 AM EST/);
  assert.match(workflow, /12:41 UTC/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.equal(workflow.includes("pull_request"), false);
  assert.equal(workflow.includes("push:"), false);
  assert.match(workflow, /^permissions:\s*\{\}\s*$/m);
  assert.equal(workflow.includes("actions/checkout"), false);
  assert.equal(workflow.includes("set -x"), false);
  assert.equal(workflow.includes("--trace"), false);
  assert.equal(workflow.includes("curl -v"), false);
  assert.equal(/echo[^\n]*\$\{?GH_CONTENTS_TOKEN\}?/.test(workflow), false);
  assert.equal(workflow.includes("secrets.GITHUB_TOKEN"), false);
  assert.equal((workflow.match(/secrets\.GH_CONTENTS_TOKEN/g) || []).length, 1);
  assert.match(workflow, /EXPIRY_MIN_DAYS:\s*"14"/);
  assert.match(workflow, /github-authentication-token-expiration/);
  assert.match(workflow, /::error::/);
  assert.match(workflow, /api\.github\.com\/repos\/\$\{REPO\}/);
  assert.match(workflow, /Authorization: Bearer \$\{GH_CONTENTS_TOKEN\}/);
  const run = workflow.split("run: |")[1];
  assert.equal(/\b14\b/.test(run), false);
});

test("the refresh doc says to rotate the PAT when the expiry check fails", () => {
  assert.match(docs, /\.github\/workflows\/token-expiry\.yml/);
  assert.match(docs, /8:41 AM EDT/);
  assert.match(docs, /7:41 AM EST/);
  assert.match(docs, /12:41 UTC/);
  assert.match(docs, /under 14 days/);
  assert.match(docs, /rotate the fine-grained PAT/i);
  assert.match(docs, /GH_CONTENTS_TOKEN/);
});
