/* ——— Regular-session closes for the public-markets panel ———
   The nightly job reads Yahoo Finance's daily chart for each ticker and
   keeps the last completed regular-session close. Nothing here calls a
   model, and nothing here invents a price: a missing bar, a non-USD
   listing, or a failed response throws, and the cron keeps yesterday's
   closes the same way a failed panel always has.

   The chart's last bar is today's session while that session is still
   open (and during the premarket, if a bar is already stamped at the
   open). That bar's "close" is the latest print, not a close. It is
   dropped until the published regular session has ended. */

export const QUOTE_TICKERS = ["NVDA", "MSFT", "GOOG", "META", "AMZN", "AVGO", "TSM"];

export const quoteChartUrl = (ticker) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=10d&includePrePost=false`;

const completedClose = (result, nowMs) => {
  const meta = result.meta || {};
  const symbol = meta.symbol || "ticker";
  if (meta.currency !== "USD") throw new Error(`quotes: ${symbol} currency ${meta.currency || "missing"}`);
  const quote = result.indicators && result.indicators.quote && result.indicators.quote[0];
  const closes = quote && quote.close;
  const times = result.timestamp;
  if (!Array.isArray(closes) || !Array.isArray(times) || closes.length !== times.length || !times.length) {
    throw new Error(`quotes: ${symbol} missing daily closes`);
  }
  const regular = meta.currentTradingPeriod && meta.currentTradingPeriod.regular;
  const nowSec = nowMs / 1000;
  const sessionUnfinished = regular && nowSec < Number(regular.end);
  let close = null;
  for (let i = 0; i < times.length; i++) {
    const px = Number(closes[i]);
    if (!(px > 0)) continue;
    if (sessionUnfinished && Number(times[i]) >= Number(regular.start)) continue;
    close = px;
  }
  if (!(close > 0)) throw new Error(`quotes: ${symbol} has no completed close`);
  return { symbol, close };
};

export const parseQuoteChart = (json, nowMs = Date.now()) => {
  const err = json && json.chart && json.chart.error;
  if (err) throw new Error(`quotes: ${err.description || err.code || "chart error"}`);
  const result = json && json.chart && Array.isArray(json.chart.result) && json.chart.result[0];
  if (!result || !result.meta) throw new Error("quotes: no chart");
  return completedClose(result, nowMs);
};

const UA = "state-of-ai-briefing";

/* All seven tickers, or the whole fetch fails. A partial object would let
   the panel advance `checkedAt` while silently keeping a made-up gap. */
export const fetchMarketQuotes = async (fetchImpl = fetch, nowMs = Date.now()) => {
  const rows = await Promise.all(QUOTE_TICKERS.map(async (ticker) => {
    const res = await fetchImpl(quoteChartUrl(ticker), {
      headers: { Accept: "application/json", "User-Agent": UA },
    });
    if (!res.ok) throw new Error(`quotes: ${ticker} ${res.status}`);
    const parsed = parseQuoteChart(await res.json(), nowMs);
    if (parsed.symbol !== ticker) throw new Error(`quotes: expected ${ticker}, got ${parsed.symbol}`);
    return [ticker, parsed.close];
  }));
  const stocks = Object.fromEntries(rows);
  for (const ticker of QUOTE_TICKERS) {
    if (!(Number(stocks[ticker]) > 0)) throw new Error(`quotes: missing ${ticker}`);
  }
  return { stocks };
};
