import assert from "node:assert/strict";
import test from "node:test";
import {
  BASELINE, JOBS, checksStamp, convertUserMillions, packValues, readChecks, unpackValues,
} from "./briefing-data.js";
import { gateWrittenValuation } from "../api/valuation-judgment.js";
import { summarizeUsage } from "./refresh-usage.js";
import {
  RELATION_CONTRADICTS, RELATION_NOTHING, RELATION_SUPPORTS,
  commitResolutions, judgeSecondSource, passageFromReply, rebalanceShareOthers,
  relationQuestions, resolveFlag, typesafeUsageRecord, verifyFlags,
} from "./flag-verify.js";

const flag = (over = {}) => ({
  field: "rev",
  panel: "capital",
  name: "OpenAI",
  prior: 40,
  candidate: 70,
  reason: "identical revenue rejected: Anthropic and OpenAI both 70; previous values kept",
  quantity: "annualized revenue run rate in billions of USD",
  unit: "billion USD",
  firstSource: { url: "https://www.reuters.com/technology/openai", text: "OpenAI nears $70 billion." },
  ...over,
});

test("a second passage from the first host is not independent", () => {
  assert.equal(passageFromReply({ passage: "", url: "https://other.test/a", figure: 70 }, "https://reuters.com/a"), null);
  assert.equal(
    passageFromReply(
      { passage: "OpenAI nears $70 billion.", url: "https://www.reuters.com/other", figure: 70 },
      "https://reuters.com/first",
    ),
    null,
  );
  const kept = passageFromReply(
    { passage: "OpenAI's run rate is $25 billion.", url: "https://www.axios.com/openai", figure: 25 },
    "https://reuters.com/first",
  );
  assert.equal(kept.figure, 25);
  assert.equal(kept.url, "https://www.axios.com/openai");
});

test("the three Choice labels publish or keep the previous value", () => {
  const sample = flag();
  const supported = resolveFlag(sample, {
    outcome: RELATION_SUPPORTS,
    secondUrl: "https://axios.com/o",
    secondFigure: 70,
  });
  assert.equal(supported.publish, 70);
  assert.equal(supported.check.status, "confirmed");
  assert.deepEqual(supported.check.sources, ["https://www.reuters.com/technology/openai", "https://axios.com/o"]);

  const contradicted = resolveFlag(sample, {
    outcome: RELATION_CONTRADICTS,
    secondUrl: "https://axios.com/o",
    secondFigure: 25,
  });
  assert.equal(contradicted.publish, 40);
  assert.equal(contradicted.check.status, "unconfirmed");
  assert.equal(contradicted.check.value, 40);
  assert.equal(contradicted.check.candidate, 70);
  assert.match(contradicted.check.reason, /40 billion USD/);
  assert.match(contradicted.check.reason, /70 billion USD/);
  assert.match(contradicted.check.reason, /25 billion USD/);
  assert.equal(contradicted.check.sources.length, 2);

  const silent = resolveFlag(sample, {
    outcome: RELATION_NOTHING,
    secondUrl: "https://axios.com/o",
    secondFigure: null,
  });
  assert.equal(silent.publish, 70);
  assert.equal(silent.check.status, "single source");
  assert.match(silent.check.reason, /does not address/);
  assert.deepEqual(silent.check.sources, ["https://www.reuters.com/technology/openai"]);
});

test("a skipped second check publishes the candidate as single source", async () => {
  const resolutions = await verifyFlags([flag()], {
    canStart: () => ({ ok: false, reason: "spend cap" }),
    lookup: async () => { throw new Error("should not run"); },
    judge: async () => { throw new Error("should not run"); },
  });
  assert.equal(resolutions.length, 1);
  assert.equal(resolutions[0].publish, 70);
  assert.equal(resolutions[0].check.status, "single source");
  assert.match(resolutions[0].check.reason, /spend cap/);

  const errored = await verifyFlags([flag()], {
    canStart: () => ({ ok: true }),
    lookup: async () => { throw new Error("network down"); },
    judge: async () => { throw new Error("should not run"); },
  });
  assert.equal(errored[0].check.status, "single source");
  assert.match(errored[0].check.reason, /network down/);
  assert.equal(errored[0].publish, 70);

  const noPassage = await verifyFlags([flag()], {
    canStart: () => ({ ok: true }),
    lookup: async () => null,
    judge: async () => { throw new Error("should not run"); },
  });
  assert.match(noPassage[0].check.reason, /no independent passage/);
});

test("Jev says_nothing is single source and does not emit the number", async () => {
  const judged = await judgeSecondSource({
    flag: flag(),
    passage: { url: "https://other.test/a", text: "A profile of the lab.", figure: null },
    ask: async (request) => {
      assert.equal(request.model, "jev-latest");
      assert.equal(request.state.candidate, 70);
      assert.deepEqual(Object.keys(request.questions.relation.criteria), ["supports", "contradicts", "says_nothing"]);
      return {
        model: "jev-1.13.0",
        usage: { input_tokens: 420, output_tokens: 0 },
        answers: { relation: { choice: "says_nothing", confidence: 0.2 } },
      };
    },
  });
  assert.equal(judged.outcome, RELATION_NOTHING);
  assert.equal(judged.secondFigure, null);
  const published = resolveFlag(flag(), judged);
  assert.equal(published.check.status, "single source");
  assert.equal(published.publish, 70);

  const unknown = await judgeSecondSource({
    flag: flag(),
    passage: { url: "https://other.test/a", text: "words", figure: 1 },
    ask: async () => ({ answers: { relation: { choice: "maybe" } }, usage: { input_tokens: 10 } }),
  });
  assert.equal(unknown.outcome, RELATION_NOTHING);
  assert.ok(relationQuestions().relation);
});

test("a revenue tie is resolved by the mocked passage", async () => {
  const applied = JOBS.capital.apply(BASELINE, {
    revenue: { Anthropic: 70, OpenAI: 70, xAI: 0.5 },
  });
  assert.equal(applied.revenue.find((row) => row.name === "OpenAI").value, 40);
  const openai = applied.panelFlags.find((row) => row.name === "OpenAI");
  const resolutions = await verifyFlags([openai], {
    canStart: () => ({ ok: true }),
    lookup: async () => ({ url: "https://axios.com/openai", text: "OpenAI run rate is $25 billion.", figure: 25 }),
    judge: async () => ({ outcome: RELATION_CONTRADICTS, secondUrl: "https://axios.com/openai", secondFigure: 25 }),
  });
  const data = commitResolutions(
    { ...applied, panelFlags: undefined },
    resolutions,
  );
  assert.equal(data.revenue.find((row) => row.name === "OpenAI").value, 40);
  assert.equal(data.checks.rev.OpenAI.status, "unconfirmed");
  assert.match(data.checks.rev.OpenAI.reason, /70 billion USD/);
  assert.match(data.checks.rev.OpenAI.reason, /25 billion USD/);
});

test("one-third drop and round size stay candidates for a second source", () => {
  const dropped = gateWrittenValuation(
    { action: "picked", reason: "choice", picked: "c1", noul: 0.46, billions: 65 },
    { id: "c1", span: "$65 billion", billions: 65, snippet: "Anthropic is now valued at $65 billion." },
    965,
  );
  assert.equal(dropped.action, "flagged");
  assert.equal(dropped.reason, "absurd-drop");
  assert.equal(dropped.billions, 65);

  const round = gateWrittenValuation(
    { action: "picked", reason: "choice", picked: "c1", noul: 0.9, billions: 65 },
    {
      id: "c1",
      span: "$65 billion",
      billions: 65,
      snippet: "Anthropic has raised $65 billion in Series H funding led by Altimeter Capital, Dragoneer, Greenoaks, and Sequoia Capital, valuing the company at $965 billion post-money.",
    },
    965,
  );
  assert.equal(round.action, "flagged");
  assert.equal(round.reason, "round-size");
});

test("user counts inside the band publish, and 1e12 is flagged without a baseline fallback", () => {
  assert.equal(convertUserMillions(1.5e9), 1500);
  const inBand = JOBS.users.apply(BASELINE, { users: { "Meta AI": 1.5e9 } });
  assert.equal(inBand.users.find((row) => row.name === "Meta AI").users, 1500);
  assert.equal(inBand.panelFlags, undefined);

  const huge = JOBS.users.apply(BASELINE, { users: { Grok: 1e12 } });
  assert.equal(huge.users.find((row) => row.name === "Grok").users, 64);
  assert.equal(huge.panelFlags.length, 1);
  assert.equal(huge.panelFlags[0].candidate, 1_000_000);
  assert.match(huge.panelFlags[0].reason, /outside 1/);

  const unpacked = unpackValues(BASELINE, { users: { Grok: 1e12 } });
  assert.equal(unpacked.users.find((row) => row.name === "Grok").users, 1_000_000);
  assert.notEqual(unpacked.users.find((row) => row.name === "Grok").users, 64);
});

test("a share total of 140 is flagged and a spend-cap skip publishes it without clamping Others", async () => {
  const incoming = { ChatGPT: 70, Gemini: 30, Claude: 20, Grok: 10, Copilot: 5, Perplexity: 5 };
  const applied = JOBS.share.apply(BASELINE, { share: incoming });
  assert.equal(applied.webShare.find((row) => row.name === "ChatGPT").value, 54.8);
  assert.equal(applied.panelFlags.length, 6);
  assert.match(applied.panelFlags[0].reason, /140/);

  const resolutions = await verifyFlags(applied.panelFlags, {
    canStart: () => ({ ok: false, reason: "spend cap" }),
    lookup: async () => { throw new Error("should not run"); },
    judge: async () => { throw new Error("should not run"); },
  });
  const { panelFlags, ...rest } = applied;
  const data = commitResolutions(rest, resolutions);
  assert.equal(data.webShare.find((row) => row.name === "ChatGPT").value, 70);
  assert.equal(data.checks.share.ChatGPT.status, "single source");
  assert.equal(data.webShare.find((row) => row.name === "Others").value, 3.6);
  assert.equal(rebalanceShareOthers(data).webShare.find((row) => row.name === "Others").value, 3.6);
  assert.equal(panelFlags.length, 6);
});

test("checks pack and unpack, and confirmed values stay off the stamp", () => {
  const seeded = {
    ...BASELINE,
    checks: {
      users: {
        Grok: {
          status: "single source",
          value: 1_000_000,
          candidate: 1_000_000,
          reason: "Published 1000000 million from one source (spend cap).",
          sources: ["https://example.test/grok"],
        },
      },
      val: {
        Anthropic: {
          status: "confirmed",
          value: 965,
          candidate: 965,
          reason: "A second source agrees.",
          sources: ["https://cnbc.com/a", "https://other.test/b"],
        },
      },
      junk: { Nope: { status: "nope" } },
    },
  };
  const packed = packValues(seeded, { users: { checkedAt: "2026-10-08T00:00:00.000Z" } }, "2026-10-08T00:00:00.000Z");
  assert.equal(packed.checks.users.Grok.status, "single source");
  const unpacked = unpackValues(BASELINE, packed);
  assert.equal(unpacked.checks.users.Grok.status, "single source");
  assert.equal(unpacked.checks.val.Anthropic.status, "confirmed");
  assert.equal(unpacked.checks.junk, undefined);
  const stamp = checksStamp(unpacked.checks.users);
  assert.equal(stamp.text, "Grok · single source");
  assert.match(stamp.title, /spend cap/);
  assert.equal(checksStamp(unpacked.checks.val), null);

  const oldFile = unpackValues(BASELINE, { val: { Anthropic: 100 } });
  assert.equal(oldFile.checks, undefined);
  assert.equal(oldFile.valuations.find((row) => row.name === "Anthropic").value, 100);
  assert.deepEqual(readChecks(null), {});
  assert.deepEqual(readChecks({ users: { Grok: { status: "bogus", value: 1 } } }), {});
});

test("Typesafe tokens are logged and left out of the Anthropic estimate", () => {
  const row = typesafeUsageRecord({
    attempt: 2,
    model: "jev-1.13.0",
    usage: { input_tokens: 1190, output_tokens: 0 },
  });
  assert.equal(row.provider, "typesafe");
  assert.equal(row.jobId, "verify");
  assert.equal(row.attempt, 2);
  assert.equal(row.continuation, "judge");
  assert.equal(row.inputTokens, 1190);
  assert.equal(row.estimatedUsd, null);
  const haiku = {
    provider: undefined,
    jobId: "verify",
    attempt: 2,
    continuation: 0,
    inputTokens: 100,
    outputTokens: 20,
    estimatedUsd: 0.01,
    estimateComplete: true,
    unpriced: [],
    serverToolUse: { web_search_requests: 1 },
    billed: true,
  };
  const summary = summarizeUsage([haiku, row]);
  assert.equal(summary.calls.length, 2);
  assert.equal(summary.totals.calls, 1);
  assert.equal(summary.totals.estimatedUsd, 0.01);
  assert.equal(summary.totals.inputTokens, 100);
  assert.equal(summary.jobs.verify.inputTokens, 100);
  assert.equal(summary.totals.tokensIncomplete, false);
  assert.equal(summary.totals.estimateComplete, true);
});
