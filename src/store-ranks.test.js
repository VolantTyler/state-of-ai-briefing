import assert from "node:assert/strict";
import test from "node:test";
import {
  appendStoreRankDay,
  matchStoreApps,
  parseAppleChart,
  parsePlayChart,
  storeRankWindowStart,
  weekEndingSunday,
  weeklyRankSeries,
} from "./store-ranks.js";

const iosRows = [
  { rank: 1, id: "com.facebook.hatch", name: "Muse from Meta" },
  { rank: 3, id: "com.openai.chat", name: "ChatGPT" },
  { rank: 7, id: "com.google.gemini", name: "Google Gemini" },
  { rank: 11, id: "com.google.GoogleMobile", name: "Google" },
  { rank: 13, id: "com.anthropic.claude", name: "Claude by Anthropic" },
  { rank: 15, id: "net.whatsapp.WhatsApp", name: "WhatsApp Messenger" },
  { rank: 22, id: "com.burbn.instagram", name: "Instagram" },
  { rank: 27, id: "com.facebook.Facebook", name: "Facebook" },
  { rank: 44, id: "com.atebits.Tweetie2", name: "X" },
  { rank: 45, id: "ai.x.GrokApp", name: "Grok AI" },
  { rank: 46, id: "co.anysphere.sand", name: "Grok Bot" },
  { rank: 50, id: "com.kolch.openrouterchat", name: "RouterChat" },
  { rank: 67, id: "com.microsoft.officemobile", name: "Microsoft Copilot" },
  { rank: 70, id: "com.canva.canvaeditor", name: "Canva AI Photo & Video Editor" },
  { rank: 77, id: "com.facebook.stellaapp", name: "Meta AI" },
];

test("first-party filter keeps own-brand assistants and drops everything else", () => {
  const ranks = matchStoreApps(iosRows, "ios");
  assert.deepEqual(ranks, {
    muse: 1,
    chatgpt: 3,
    gemini: 7,
    claude: 13,
    grok: 45,
    copilot: 67,
    metaai: 77,
  });
  for (const id of ["facebook", "whatsapp", "instagram", "google", "x", "openrouter", "canva", "grokbot"]) {
    assert.equal(ranks[id], undefined);
  }
});

test("apple parser reads bundle id and chart order", () => {
  const entry = (name, bundle) => ({
    "im:name": { label: name },
    "im:artist": { label: "Someone" },
    id: { attributes: { "im:bundleId": bundle } },
  });
  const rows = parseAppleChart({
    feed: { entry: [entry("Muse from Meta", "com.facebook.hatch"), entry("Facebook", "com.facebook.Facebook")] },
  });
  assert.equal(rows[0].rank, 1);
  assert.equal(rows[0].id, "com.facebook.hatch");
  assert.deepEqual(matchStoreApps(rows, "ios"), { muse: 1 });
});

test("play parser reads package order and rejects a scrambled payload", () => {
  /* The parser indexes [0][0][0] and [0][3]. Build that shape directly. */
  const row = (pkg, name) => {
    const head = [];
    head[0] = [pkg];
    head[3] = name;
    return [head];
  };
  const payload = [];
  payload[0] = [];
  payload[0][1] = [];
  payload[0][1][0] = [];
  payload[0][1][0][28] = [[row("com.facebook.aura", "Muse from Meta"), row("com.facebook.katana", "Facebook"), row("com.openai.chatgpt", "ChatGPT")]];
  const text = `)]}'\n${JSON.stringify([["wrb.fr", "vyAe2", JSON.stringify(payload)]])}`;
  const rows = parsePlayChart(text);
  assert.deepEqual(rows.map((r) => r.id), ["com.facebook.aura", "com.facebook.katana", "com.openai.chatgpt"]);
  assert.deepEqual(matchStoreApps(rows, "android"), { muse: 1, chatgpt: 3 });
  assert.throws(() => parsePlayChart("not json"), /not JSON/);
});

test("a week keeps the latest day's chart and does not average ranks", () => {
  const days = [
    { date: "2026-09-21", ios: { chatgpt: 10, claude: 20 }, android: { chatgpt: 8 } },
    { date: "2026-09-23", ios: { chatgpt: 2 }, android: { chatgpt: 4 } },
    { date: "2026-09-26", ios: { chatgpt: 4, claude: 13 }, android: { chatgpt: 3 } },
  ];
  const series = weeklyRankSeries(days, { asOf: "2026-09-26" });
  assert.equal(series.ios.length, 1);
  assert.equal(series.ios[0].asOf, "2026-09-26");
  assert.equal(series.ios[0].week, "2026-09-27");
  assert.equal(series.ios[0].chatgpt, 4);
  assert.equal(series.ios[0].claude, 13);
  assert.equal(series.android[0].chatgpt, 3);
  assert.equal(series.android[0].claude, null);
});

test("missing weeks are not invented", () => {
  const days = [
    { date: "2026-01-05", ios: { muse: 40 }, android: {} },
    { date: "2026-09-26", ios: { muse: 1 }, android: { muse: 1 } },
  ];
  const series = weeklyRankSeries(days, { asOf: "2026-09-26" });
  assert.equal(series.ios.length, 2);
  assert.deepEqual(series.ios.map((row) => row.asOf), ["2026-01-05", "2026-09-26"]);
  assert.equal(series.ios[0].muse, 40);
  assert.equal(series.android[0].muse, null);
});

test("readings older than a year fall outside the window", () => {
  assert.equal(weekEndingSunday("2026-09-26"), "2026-09-27");
  assert.equal(weekEndingSunday("2026-09-27"), "2026-09-27");
  assert.equal(weekEndingSunday("2026-09-28"), "2026-10-04");
  const start = storeRankWindowStart("2026-09-26");
  assert.equal(start, "2025-09-29");
  const series = weeklyRankSeries([
    { date: "2025-09-26", ios: { muse: 80 }, android: {} },
    { date: "2025-09-29", ios: { muse: 70 }, android: {} },
    { date: "2026-09-26", ios: { muse: 1 }, android: {} },
  ], { asOf: "2026-09-26" });
  assert.deepEqual(series.ios.map((row) => row.asOf), ["2025-09-29", "2026-09-26"]);
});

test("a same-day rerun replaces that day's row", () => {
  const first = appendStoreRankDay(null, {
    date: "2026-09-26",
    iosDepth: 99,
    androidDepth: 100,
    ios: { muse: 2 },
    android: { muse: 2 },
  });
  const second = appendStoreRankDay(first, {
    date: "2026-09-26",
    iosDepth: 99,
    androidDepth: 100,
    ios: { muse: 1, chatgpt: 3 },
    android: { muse: 1 },
  });
  assert.equal(second.days.length, 1);
  assert.equal(second.days[0].ios.muse, 1);
  assert.equal(second.days[0].ios.chatgpt, 3);
  const withStranger = appendStoreRankDay(second, {
    date: "2026-09-27",
    ios: { muse: 1, facebook: 4, notAnApp: 9 },
    android: {},
  });
  assert.deepEqual(withStranger.days[1].ios, { muse: 1 });
});
