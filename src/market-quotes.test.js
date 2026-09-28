import assert from "node:assert/strict";
import test from "node:test";
import { BASELINE, JOBS } from "./briefing-data.js";
import { QUOTE_TICKERS, fetchMarketQuotes, parseQuoteChart, quoteChartUrl } from "./market-quotes.js";

const chart = ({ symbol = "NVDA", currency = "USD", start = 1_000, end = 2_000, bars }) => ({
  chart: {
    result: [{
      meta: {
        currency,
        symbol,
        currentTradingPeriod: { regular: { start, end } },
      },
      timestamp: bars.map((b) => b.t),
      indicators: { quote: [{ close: bars.map((b) => b.close) }] },
    }],
  },
});

test("the quote parser keeps the last completed close and drops the live bar", () => {
  const json = chart({
    bars: [
      { t: 100, close: 225.07 },
      { t: 1_000, close: 232.53 },
    ],
  });
  assert.equal(parseQuoteChart(json, 1_500_000).close, 225.07);
  assert.equal(parseQuoteChart(json, 2_500_000).close, 232.53);
  /* Premarket: today's bar is already stamped at the open, and it is not a close. */
  assert.equal(parseQuoteChart(json, 500_000).close, 225.07);
});

test("a null or missing close is not filled in", () => {
  const json = chart({
    bars: [
      { t: 50, close: 210.5 },
      { t: 100, close: null },
      { t: 1_000, close: 232.53 },
    ],
  });
  assert.equal(parseQuoteChart(json, 1_500_000).close, 210.5);
  assert.throws(() => parseQuoteChart(chart({ bars: [{ t: 1_000, close: null }] }), 1_500_000), /no completed close/);
  assert.throws(() => parseQuoteChart({ chart: { error: { description: "No data found" } } }), /No data found/);
  assert.throws(() => parseQuoteChart(chart({ currency: "TWD", bars: [{ t: 100, close: 9 }] })), /currency TWD/);
});

test("fetch reads the seven tickers from the chart URL and returns panel-shaped closes", async () => {
  assert.deepEqual(QUOTE_TICKERS, ["NVDA", "MSFT", "GOOG", "META", "AMZN", "AVGO", "TSM"]);
  assert.match(quoteChartUrl("GOOG"), /\/GOOG\?/);
  assert.match(quoteChartUrl("GOOG"), /interval=1d/);
  assert.match(quoteChartUrl("GOOG"), /includePrePost=false/);

  const prices = { NVDA: 225.07, MSFT: 516.17, GOOG: 341.08, META: 751.66, AMZN: 249.67, AVGO: 352.81, TSM: 450.61 };
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(url);
    const ticker = QUOTE_TICKERS.find((t) => url.includes(`/chart/${t}?`));
    const json = chart({
      symbol: ticker,
      bars: [
        { t: 100, close: prices[ticker] },
        { t: 1_000, close: prices[ticker] + 10 },
      ],
    });
    return { ok: true, json: async () => json };
  };
  const got = await fetchMarketQuotes(fetchImpl, 1_500_000);
  assert.deepEqual(got.stocks, prices);
  assert.equal(seen.length, 7);

  const next = JOBS.markets.apply(BASELINE, got);
  assert.equal(next.stocks.find((s) => s.ticker === "NVDA").price, 225.07);
  assert.equal(next.stocks.find((s) => s.ticker === "GOOG").price, 341.08);
  const kept = JOBS.markets.apply(BASELINE, { stocks: { NVDA: 225.074 } });
  assert.equal(kept.stocks.find((s) => s.ticker === "NVDA").price, 225.07);
  assert.equal(kept.stocks.find((s) => s.ticker === "MSFT").price, BASELINE.stocks.find((s) => s.ticker === "MSFT").price);

  const failing = async () => ({ ok: false, status: 503, json: async () => ({}) });
  await assert.rejects(fetchMarketQuotes(failing, 1_500_000), /quotes: [A-Z.]+ 503/);
});
