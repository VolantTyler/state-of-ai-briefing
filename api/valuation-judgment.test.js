import assert from "node:assert/strict";
import test from "node:test";
import {
  NONE,
  citationsFromContent,
  decide,
  extractCandidates,
  judgeValuations,
  renderJevActions,
} from "./valuation-judgment.js";

const ANTHROPIC = "CNBC reported that Anthropic closed its Series H at a $965 billion valuation in May 2026, after raising $65 billion.";
const DATABRICKS = "Databricks jumped to a $190 billion valuation on a fresh $5 billion round in August.";
const XAI = "xAI's $250 billion figure is the last standalone mark. It merged into SpaceX, which now trades around a $1.87 trillion market cap.";
const ANDURIL = "Anduril is negotiating a leap to $100 billion from its confirmed $61 billion Series H mark.";
const ZHIPU = "Zhipu, listed in Hong Kong as Z.ai, has a market cap of about $64 billion.";

test("regex keeps company-scale amounts and the words around them", () => {
  const passages = [
    { url: "https://example.test/a", title: "A", text: ANTHROPIC },
    { url: "https://example.test/d", title: "D", text: DATABRICKS },
    { url: "https://example.test/x", title: "X", text: XAI },
  ];
  const anthropic = extractCandidates(passages, "Anthropic");
  assert.deepEqual(anthropic.candidates.map((c) => c.billions), [965, 65]);
  assert.equal(anthropic.candidates[0].source, "https://example.test/a");

  const databricks = extractCandidates(passages, "Databricks");
  assert.deepEqual(databricks.candidates.map((c) => c.billions), [190, 5]);

  const xai = extractCandidates(passages, "xAI");
  assert.deepEqual(xai.candidates.map((c) => c.billions), [250, 1870]);
});

test("a passage is a candidate only for a company it names", () => {
  const passages = [{ url: "", title: "", text: ZHIPU }];
  assert.equal(extractCandidates(passages, "Z.ai (Zhipu)").candidates.length, 1);
  assert.equal(extractCandidates(passages, "MiniMax").candidates.length, 0);
  assert.equal(extractCandidates([{ url: "", title: "", text: "MiniMax trades at $13 billion." }], "Moonshot AI").candidates.length, 0);
});

test("amounts under $1 billion are dropped before a question is built", () => {
  const text = "Moonshot AI raised $400 million and is valued at $35 billion.";
  const { candidates } = extractCandidates([{ url: "", title: "", text }], "Moonshot AI");
  assert.deepEqual(candidates.map((c) => c.billions), [35]);
});

test("citations are taken from cited source text", () => {
  const passages = citationsFromContent([
    { type: "text", text: "The model said $1 billion.", citations: [] },
    {
      type: "text",
      text: "ignored",
      citations: [{ type: "web_search_result_location", url: "https://src.test", title: "Src", cited_text: ANDURIL }],
    },
  ]);
  assert.equal(passages.length, 1);
  assert.deepEqual(extractCandidates(passages, "Anduril").candidates.map((c) => c.billions), [100, 61]);
});

test("code copies the parsed amount only when Choice and Noul agree", () => {
  const candidates = [
    { id: "c1", billions: 190 },
    { id: "c2", billions: 5 },
  ];
  const wrote = decide(candidates, {
    latest: { choice: "c1", confidence: 0.4, probabilities: { c1: 0.55, c2: 0.4, [NONE]: 0.05 } },
    completed_c1: { noul: 0.93 },
    completed_c2: { noul: 0.08 },
  });
  assert.equal(wrote.action, "wrote");
  assert.equal(wrote.billions, 190);

  const unsure = decide(candidates, {
    latest: { choice: "c1" },
    completed_c1: { noul: 0.8 },
  });
  assert.equal(unsure.action, "kept");
  assert.equal(unsure.reason, "noul-below-gate");

  const none = decide(candidates, {
    latest: { choice: NONE },
    completed_c1: { noul: 0.99 },
  });
  assert.equal(none.action, "kept");
  assert.equal(none.reason, "none");
});

test("a company with no cited amount does not call Jev", async () => {
  let calls = 0;
  const { accepted, results } = await judgeValuations({
    companies: [{ name: "OpenAI", value: 852 }],
    passages: [{ url: "", title: "", text: ANTHROPIC }],
    ask: async () => { calls += 1; return { answers: {}, model: "jev-1.13.0" }; },
  });
  assert.equal(calls, 0);
  assert.deepEqual(accepted, {});
  assert.equal(results[0].reason, "no-candidates");
});

test("the learning note quotes the questions and the action taken", () => {
  const note = renderJevActions({
    ran: true,
    at: "2026-09-22T12:00:00.000Z",
    passageCount: 1,
    results: [{
      company: "Databricks",
      prior: 190,
      candidates: [{ id: "c1", span: "$190 billion", billions: 190, snippet: DATABRICKS, source: "https://example.test/d" }],
      omitted: 0,
      action: "wrote",
      reason: "accepted",
      picked: "c1",
      noul: 0.91,
      billions: 190,
      choice: { choice: "c1", confidence: 0.88, probabilities: { c1: 0.9, none: 0.1 } },
      nouls: { c1: 0.91 },
      model: "jev-1.13.0",
      usage: { input_tokens: 400, output_tokens: 30 },
      error: null,
    }],
  });
  assert.match(note, /not served on the site/);
  assert.match(note, /latest completed price/);
  assert.match(note, /post-money valuation/);
  assert.match(note, /Wrote \$190B/);
  assert.match(note, /jev-1.13.0/);
  assert.match(renderJevActions({ ran: false }), /No refresh has written this file yet/);
});
