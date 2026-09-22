import { TypeSafeClient } from "@typesafe-ai/sdk";
import { judgeValuations, renderJevActions } from "./valuation-judgment.js";

/* A fixed set of cited passages, so this checks the key and the judgments
   without searching the web or writing the panel. */
const PASSAGES = [
  { url: "https://example.test/anthropic", title: "Anthropic", text: "CNBC reported that Anthropic closed its Series H at a $965 billion valuation in May 2026, after raising $65 billion." },
  { url: "https://example.test/databricks", title: "Databricks", text: "Databricks jumped to a $190 billion valuation on a fresh $5 billion round in August." },
  { url: "https://example.test/xai", title: "xAI", text: "xAI's $250 billion figure is the last standalone mark. It merged into SpaceX, which now trades around a $1.87 trillion market cap." },
];

const COMPANIES = [
  { name: "Anthropic", value: 965 },
  { name: "Databricks", value: 190 },
  { name: "xAI", value: 250 },
];

const client = new TypeSafeClient({ timeout: 30_000 });
const judged = await judgeValuations({
  companies: COMPANIES,
  passages: PASSAGES,
  ask: (request) => client.systemOne(request),
});
process.stdout.write(renderJevActions({
  ran: true,
  at: new Date().toISOString(),
  passageCount: PASSAGES.length,
  results: judged.results,
}));
if (judged.results.some((result) => result.error)) process.exit(1);
