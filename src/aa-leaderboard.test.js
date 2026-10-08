import assert from "node:assert/strict";
import test from "node:test";
import { JOBS, MIN_AA_ROWS } from "./briefing-data.js";
import {
  AA_INDEX_PAGE, AA_LEADERBOARD_PAGE, AA_TOP_FAMILIES,
  decodeLeaderboardText, fetchAaLeaderboard, isChineseLab, modelFamilyName,
  parseAaIndexVersionFromHtml, parseLeaderboardModels,
} from "./aa-leaderboard.js";

const row = (slug, name, lab, score, extra = {}) => ({
  slug,
  name,
  modelCreatorName: lab,
  intelligenceIndex: score,
  intelligenceIndexIsEstimated: false,
  deprecated: false,
  ...extra,
});

const boardHtml = (models) => {
  const payload = JSON.stringify(models);
  const script = `self.__next_f.push([1,${JSON.stringify(payload)}])`;
  return `<!doctype html><script>${script}</script>`;
};

const indexHtml = (version = "v4.3.2") =>
  `<title>Artificial Analysis Intelligence Index ${version} | Artificial Analysis</title>`;

const sampleModels = [
  row("claude-opus-5-5", "Claude Opus 5.5 (Max, Default Fallback)", "Anthropic", 57.622),
  row("claude-opus-5-5-xhigh", "Claude Opus 5.5 (Xhigh, Default Fallback)", "Anthropic", 55.99),
  row("claude-fable-5-1", "Claude Fable 5.1 (Max, Default Fallback)", "Anthropic", 53.355),
  row("gpt-6-astra", "GPT-6 Astra (Max)", "OpenAI", 52.674),
  row("gemini-4-argon", "Gemini 4 Argon (High)", "Google", 52.561),
  row("gpt-6-1-sol", "GPT-6.1 Sol (Max)", "OpenAI", 51.833),
  row("claude-opus-5", "Claude Opus 5 (Max)", "Anthropic", 60, { deprecated: true }),
  row("muse-spark-1-3", "Muse Spark 1.3 (Max)", "Meta", 48.092),
  row("grok-4-7", "Grok 4.7 (Xhigh)", "SpaceXAI", 46.447),
  row("kimi-k3", "Kimi K3 (Max)", "Kimi", 49.1),
  row("guess", "Guessed (Max)", "OpenAI", 99, { intelligenceIndexIsEstimated: true }),
  row("qwen", "Qwen3.8 Max (0902)", "Alibaba", 45.415),
];

test("the leaderboard parser keeps one current row per family, including Gemini 4 Argon", () => {
  assert.equal(modelFamilyName("Claude Opus 5.5 (Max, Default Fallback)"), "Claude Opus 5.5");
  assert.equal(modelFamilyName("Claude Fable 5 (Max, Opus 4.8 Fallback)"), "Claude Fable 5");
  assert.equal(modelFamilyName("Qwen3.8 Max (0902)"), "Qwen3.8 Max (0902)");
  assert.equal(isChineseLab("Kimi"), true);
  assert.equal(isChineseLab("Z AI"), true);
  assert.equal(isChineseLab("Meta"), false);
  assert.equal(isChineseLab("Institute of Foundation Models"), false);

  const html = boardHtml(sampleModels);
  assert.match(decodeLeaderboardText(html), /gemini-4-argon/);
  const models = parseLeaderboardModels(html);
  assert.equal(models.length, AA_TOP_FAMILIES);
  assert.equal(models.length >= MIN_AA_ROWS, true);
  assert.equal(models[0].model, "Claude Opus 5.5 (Max, Default Fallback)");
  assert.equal(models.some((item) => item.model === "Claude Opus 5.5 (Xhigh, Default Fallback)"), false);
  assert.equal(models.some((item) => item.model === "Claude Opus 5 (Max)"), false);
  assert.equal(models.some((item) => item.model === "Guessed (Max)"), false);
  const argon = models.find((item) => item.model === "Gemini 4 Argon (High)");
  assert.equal(argon.lab, "Google");
  assert.equal(argon.cn, false);
  assert.ok(argon.score > 52 && argon.score < 53);
  assert.equal(models.find((item) => item.lab === "Kimi").cn, true);
  assert.equal(parseAaIndexVersionFromHtml(indexHtml()), "v4.3.2");
  assert.equal(parseAaIndexVersionFromHtml("<html>no version</html>"), "");

  const applied = JOBS.models.apply({ aaIndex: [], aaVersion: "v4.2" }, {
    version: "v4.3.2",
    models,
  });
  assert.equal(applied.aaVersion, "v4.3.2");
  assert.equal(applied.aaIndex.find((item) => item.model.startsWith("Gemini 4 Argon")).score, 52.6);
  assert.equal(applied.aaIndex[0].score, 57.6);
});

test("a leaderboard fetch reads both public pages and does not invent a short board", async () => {
  assert.equal(AA_INDEX_PAGE.includes("artificialanalysis.ai"), true);
  assert.equal(AA_LEADERBOARD_PAGE.includes("/leaderboards/models"), true);
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(url);
    const body = url === AA_INDEX_PAGE ? indexHtml("v4.3.2") : boardHtml(sampleModels);
    return { ok: true, text: async () => body };
  };
  const board = await fetchAaLeaderboard(fetchImpl);
  assert.deepEqual(seen, [AA_INDEX_PAGE, AA_LEADERBOARD_PAGE]);
  assert.equal(board.version, "v4.3.2");
  assert.equal(board.models.some((item) => item.model === "Gemini 4 Argon (High)"), true);

  const missing = async () => ({ ok: false, status: 503, text: async () => "" });
  await assert.rejects(fetchAaLeaderboard(missing), /503/);

  const shortHtml = boardHtml([sampleModels[0], sampleModels[2]]);
  const shortFetch = async (url) => ({
    ok: true,
    text: async () => (url === AA_INDEX_PAGE ? indexHtml() : shortHtml),
  });
  await assert.rejects(fetchAaLeaderboard(shortFetch), /too few rows: 2/);
});
