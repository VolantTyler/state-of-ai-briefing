# What Jev did on the valuations refresh

This file is not served on the site. The nightly refresh rewrites it.
The dashboard copy does not describe these judgments.

Jev does not search and does not invent the number. Code finds dollar amounts in cited passages. Jev judges those passages. Code copies one parsed amount, or leaves the previous mark in place.

## The questions

Each company is one request. The Choice and every Noul see the same state and do not see each other's answers. State is the company name plus the candidates (`id`, the matched amount, the snippet, the source).

### Choice — which candidate is the latest completed price

> Which candidate is the latest completed price for the company in `company`? A completed price is a completed funding round's post-money valuation of that company, or the market capitalization of that company on an exchange where that company itself is listed.

The options are the candidate ids, plus `none` when no candidate is that price. Code records Choice confidence and does not use it as permission to write. A split between two real prices can lower confidence without making either price false.

### Noul — does this snippet report a completed price

One Noul per candidate. For candidate `c1` the question is:

> Does candidate c1 report a completed price for the company in `company`? Read that candidate's snippet in `candidates`.

- **Yes:** A completed funding round's post-money valuation of this company, or the market capitalization of this company on an exchange where this company itself is listed.
- **No:** The size of a round, a price still being negotiated, revenue or annualized revenue, the market cap of a parent or acquirer, an IPO offering price, or a price for a different company.

The answer is the probability of yes. Code writes the chosen amount only when Choice picks that candidate and this probability is above 0.8. Otherwise the panel keeps its previous number. 0.8 is the example gate from the TypeSafe docs. It is not fitted to these sources.

A yes covers a private last-round mark and the market cap of a company that itself trades. Whether a source is trustworthy is a different question.

## What code does before Jev

A regex pulls dollar amounts out of cited passages that name the company. Amounts under $1 billion are dropped. At most 12 candidates are sent. The number later written on the panel is one of those regex matches, normalized to billions of USD.

## Latest run

Ran 2026-09-25T08:26:24.149Z.

Cited passages: 33.

### Anthropic

Kept $965B. Choice selected c4, and the Noul on that snippet was 0.60, which is not above 0.8.

Model jev-1.13.0. 1855 input tokens, 156 output tokens.

Candidates code found:

- `c1` $13 billion → 13 billion USD · Noul 0.11 · https://sacra.com/c/anthropic/
  In September 2025, Anthropic closed a $13 billion Series F funding round, valuing it at $183 billion, up from $61.5B in March 2025.
- `c2` $183 billion → 183 billion USD · Noul 0.92 · https://sacra.com/c/anthropic/
  In September 2025, Anthropic closed a $13 billion Series F funding round, valuing it at $183 billion, up from $61.5B in March 2025.
- `c3` $61.5B → 61.5 billion USD · Noul 0.60 · https://sacra.com/c/anthropic/
  In September 2025, Anthropic closed a $13 billion Series F funding round, valuing it at $183 billion, up from $61.5B in March 2025.
- `c4` $65 billion → 65 billion USD · Noul 0.60 · https://www.anthropic.com/news/series-h
  Anthropic has raised $65 billion in Series H funding led by Altimeter Capital, Dragoneer, Greenoaks, and Sequoia Capital, valuing the company at $965 ...
- `c5` $65 billion → 65 billion USD · Noul 0.03 · https://www.forbes.com/sites/siladityaray/2026/09/16/openai-is-reportedly-weighing-new-funding-round-at-15-trillion-valuation/
  Last month, Bloomberg · reported that Anthropic disclosed to investors that it was on track to generate annualized revenue of more than $65 billion—wh...

Choice: c4 (confidence 0.39). Probabilities: c4 0.50, c2 0.49, none 0.01, c5 0.00, c3 0.00, c1 0.00.

### OpenAI

Kept $852B. No cited amount named this company, so Jev was not asked.

### xAI

Kept $250B. Choice selected c4, and the Noul on that snippet was 0.56, which is not above 0.8.

Model jev-1.13.0. 1785 input tokens, 156 output tokens.

Candidates code found:

- `c1` $20 billion → 20 billion USD · Noul 0.07 · https://sacra.com/c/xai/
  xAI last closed a $20 billion Series E in January 2026 at a $230 billion valuation, upsized from an initial $15 billion target. Participants included ...
- `c2` $230 billion → 230 billion USD · Noul 0.88 · https://sacra.com/c/xai/
  xAI last closed a $20 billion Series E in January 2026 at a $230 billion valuation, upsized from an initial $15 billion target. Participants included ...
- `c3` $15 billion → 15 billion USD · Noul 0.06 · https://sacra.com/c/xai/
  xAI last closed a $20 billion Series E in January 2026 at a $230 billion valuation, upsized from an initial $15 billion target. Participants included ...
- `c4` $250 billion → 250 billion USD · Noul 0.56 · https://sacra.com/c/xai/
  On February 2, 2026, SpaceX acquired xAI in an all-stock deal. Reuters reported the transaction valued xAI at $250 billion and SpaceX at $1 trillion, ...
- `c5` $1 trillion → 1000 billion USD · Noul 0.06 · https://sacra.com/c/xai/
  On February 2, 2026, SpaceX acquired xAI in an all-stock deal. Reuters reported the transaction valued xAI at $250 billion and SpaceX at $1 trillion, ...

Choice: c4 (confidence 0.74). Probabilities: c4 0.78, c2 0.20, none 0.02, c5 0.00, c3 0.00, c1 0.00.

### Databricks

Wrote $134B. Choice selected c4 and the Noul on that snippet was 0.83, above 0.8, so code copied the amount the regex had parsed.

Model jev-1.13.0. 1580 input tokens, 130 output tokens.

Candidates code found:

- `c1` $4 billion → 4 billion USD · Noul 0.05 · https://www.databricks.com/company/newsroom/press-releases/databricks-surpasses-4-8b-revenue-run-rate-growing-55-year-over-year
  SAN FRANCISCO, CA — December 16, 2025 — Databricks, the Data and AI company, today announced it is raising a &gt;$4 billion Series L investment, valui...
- `c2` $5 billion → 5 billion USD · Noul 0.24 · https://www.cnbc.com/2026/02/09/databricks-completes-5-billion-funding-round-with-2-billion-in-debt.html
  Databricks said it raised $5 billion in funding and $2 billion in new debt capacity at a $134 billion valuation. The company also said its annualized ...
- `c3` $2 billion → 2 billion USD · Noul 0.07 · https://www.cnbc.com/2026/02/09/databricks-completes-5-billion-funding-round-with-2-billion-in-debt.html
  Databricks said it raised $5 billion in funding and $2 billion in new debt capacity at a $134 billion valuation. The company also said its annualized ...
- `c4` $134 billion → 134 billion USD · Noul 0.83 · https://www.cnbc.com/2026/02/09/databricks-completes-5-billion-funding-round-with-2-billion-in-debt.html
  Databricks said it raised $5 billion in funding and $2 billion in new debt capacity at a $134 billion valuation. The company also said its annualized ...

Choice: c4 (confidence 0.97). Probabilities: c4 0.98, none 0.02, c1 0.00, c2 0.00, c3 0.00.

### DeepSeek

Kept $74B. Choice selected c3, and the Noul on that snippet was 0.29, which is not above 0.8.

Model jev-1.13.0. 1868 input tokens, 156 output tokens.

Candidates code found:

- `c1` $10 billion → 10 billion USD · Noul 0.09 · https://techfundingnews.com/deepseek-first-external-funding-10b-valuation-report/
  DeepSeek, the Hangzhou-based AI startup, is looking to raise at least $300 million at a valuation of over $10 billion, reports Reuters. This is DeepSe...
- `c2` $20 billion → 20 billion USD · Noul 0.07 · https://techcrunch.com/2026/05/06/deepseek-could-hit-45b-valuation-from-its-first-investment-round/
  DeepSeek is in talks to raise its first round of venture capital, and in just a few weeks, its potential valuation has soared from $20 billion to $45 ...
- `c3` $7B → 7 billion USD · Noul 0.29 · https://seekingalpha.com/news/4603859-deepseek-completes-record-7b-plus-fundraising-valuation-tops-50b---report
  Chinese AI startup DeepSeek (DEEPSEEK) has completed a record-breaking funding round of over $7B, bringing the company&#x27;s valuation to more than $...
- `c4` 500 billion → 500 billion USD · Noul 0.11 · https://www.bloomberg.com/news/articles/2026-08-06/deepseek-resumes-8-billion-round-with-monolith-in-the-running
  DeepSeek is raising the funds at a valuation close to 500 billion yuan ($74 billion), the people said, asking not to be named as the details aren’t pu...
- `c5` $74 billion → 74 billion USD · Noul 0.10 · https://www.bloomberg.com/news/articles/2026-08-06/deepseek-resumes-8-billion-round-with-monolith-in-the-running
  DeepSeek is raising the funds at a valuation close to 500 billion yuan ($74 billion), the people said, asking not to be named as the details aren’t pu...

Choice: c3 (confidence 0.54). Probabilities: c3 0.62, none 0.34, c5 0.04, c4 0.00, c2 0.00, c1 0.00.

### Anduril

Wrote $61B. Choice selected c4 and the Noul on that snippet was 0.94, above 0.8, so code copied the amount the regex had parsed.

Model jev-1.13.0. 1829 input tokens, 156 output tokens.

Candidates code found:

- `c1` $2.5 billion → 2.5 billion USD · Noul 0.11 · https://www.cnbc.com/2025/06/05/anduril-valuation-founders-fund.html
  Anduril Chairman Trae Stephens told Bloomberg on Thursday that the defense tech company has just raised $2.5 billion at a $30.5 billion valuation. An...
- `c2` $30.5 billion → 30.5 billion USD · Noul 0.89 · https://www.cnbc.com/2025/06/05/anduril-valuation-founders-fund.html
  Anduril Chairman Trae Stephens told Bloomberg on Thursday that the defense tech company has just raised $2.5 billion at a $30.5 billion valuation. An...
- `c3` $5 billion → 5 billion USD · Noul 0.53 · https://finance.yahoo.com/news/anduril-raises-5-billion-valuation-141157547.html
  Anduril Industries raised $5 billion on Wednesday in a funding round that doubled its valuation to $61 billion, less than a year after the company was...
- `c4` $61 billion → 61 billion USD · Noul 0.94 · https://finance.yahoo.com/news/anduril-raises-5-billion-valuation-141157547.html
  Anduril Industries raised $5 billion on Wednesday in a funding round that doubled its valuation to $61 billion, less than a year after the company was...
- `c5` $40 billion → 40 billion USD · Noul 0.08 · https://techcrunch.com/2026/07/24/anduril-reportedly-in-talks-to-raise-funding-at-100b-valuation-more-than-3x-last-years-mark/
  Defense tech company Anduril is said to be raising a new round of capital that may push its valuation up by a whopping $40 billion to about $100 billi...

Choice: c4 (confidence 0.89). Probabilities: c4 0.91, c2 0.07, none 0.02, c5 0.00, c3 0.00, c1 0.00.

### Z.ai (Zhipu)

Kept $40.4B. Choice selected c4, and the Noul on that snippet was 0.79, which is not above 0.8.

Model jev-1.13.0. 1647 input tokens, 130 output tokens.

Candidates code found:

- `c1` $55.5 billion → 55.5 billion USD · Noul 0.46 · https://www.caixinglobal.com/2026-01-08/chinas-zhipu-ai-jumps-in-hong-kong-debut-102401610.html
  It raised ... Zhipu AI debuted on the Hong Kong stock exchange, reaching a valuation of HK$55.5 billion ($7.1 billion) and raising HK$4.17 billion in...
- `c2` $7.1 billion → 7.1 billion USD · Noul 0.85 · https://www.caixinglobal.com/2026-01-08/chinas-zhipu-ai-jumps-in-hong-kong-debut-102401610.html
  It raised ... Zhipu AI debuted on the Hong Kong stock exchange, reaching a valuation of HK$55.5 billion ($7.1 billion) and raising HK$4.17 billion in...
- `c3` $4.17 billion → 4.2 billion USD · Noul 0.08 · https://www.caixinglobal.com/2026-01-08/chinas-zhipu-ai-jumps-in-hong-kong-debut-102401610.html
  It raised ... Zhipu AI debuted on the Hong Kong stock exchange, reaching a valuation of HK$55.5 billion ($7.1 billion) and raising HK$4.17 billion in...
- `c4` $62 billion → 62 billion USD · Noul 0.79 · https://en.wikipedia.org/wiki/Z.ai
  [[7]](./Z.ai#cite_note-:14-8) With a [market capitalization](https://en.wikipedia.org/wiki/Market_capitalization) of US$62 billion as of August 2026, ...

Choice: c4 (confidence 0.94). Probabilities: c4 0.96, c2 0.04, c1 0.00, c3 0.00, none 0.00.

### Moonshot AI

Wrote $35B. Choice selected c5 and the Noul on that snippet was 0.91, above 0.8, so code copied the amount the regex had parsed.

Model jev-1.13.0. 2212 input tokens, 182 output tokens.

Candidates code found:

- `c1` $4.3 billion → 4.3 billion USD · Noul 0.61 · https://techcrunch.com/2026/05/07/chinas-moonshot-ai-raises-2b-at-20b-valuation-as-demand-for-open-source-ai-skyrockets/
  Moonshot was valued at $4.3 billion at the end of 2025, per reports, and by early 2026, that figure had more than doubled to $10 billion following a $...
- `c2` $10 billion → 10 billion USD · Noul 0.63 · https://techcrunch.com/2026/05/07/chinas-moonshot-ai-raises-2b-at-20b-valuation-as-demand-for-open-source-ai-skyrockets/
  Moonshot was valued at $4.3 billion at the end of 2025, per reports, and by early 2026, that figure had more than doubled to $10 billion following a $...
- `c3` $2 billion → 2 billion USD · Noul 0.12 · https://finance.biggo.com/news/daYsAZ4BNl__-4_Gq-k8
  Beijing-based AI unicorn Moonshot AI (Kimi) has closed a roughly $2 billion Series D funding round, pushing its post-money valuation past $20 billion ...
- `c4` $20 billion → 20 billion USD · Noul 0.90 · https://finance.biggo.com/news/daYsAZ4BNl__-4_Gq-k8
  Beijing-based AI unicorn Moonshot AI (Kimi) has closed a roughly $2 billion Series D funding round, pushing its post-money valuation past $20 billion ...
- `c5` $35 billion → 35 billion USD · Noul 0.91 · https://www.bloomberg.com/news/articles/2026-07-29/china-s-moonshot-ai-passes-funding-goal-to-hit-35-billion-value
  Moonshot AI secured a $35 billion valuation after raising a larger-than-anticipated $3.5 billion in a just-closed round of financing, riding the momen...
- `c6` $3.5 billion → 3.5 billion USD · Noul 0.09 · https://www.bloomberg.com/news/articles/2026-07-29/china-s-moonshot-ai-passes-funding-goal-to-hit-35-billion-value
  Moonshot AI secured a $35 billion valuation after raising a larger-than-anticipated $3.5 billion in a just-closed round of financing, riding the momen...

Choice: c5 (confidence 0.95). Probabilities: c5 0.96, c4 0.04, c3 0.00, c6 0.00, c2 0.00, none 0.00, c1 0.00.

### MiniMax

Wrote $4B. Choice selected c1 and the Noul on that snippet was 0.93, above 0.8, so code copied the amount the regex had parsed.

Model jev-1.13.0. 1205 input tokens, 104 output tokens.

Candidates code found:

- `c1` $4 billion → 4 billion USD · Noul 0.93 · https://sacra.com/c/minimax/
  MiniMax closed a $300 million Series B extension in July 2025 at a $4 billion valuation, led by Shanghai state-owned capital through Shanghai STVC Gro...
- `c2` $2 billion → 2 billion USD · Noul 0.05 · https://siliconangle.com/2026/07/10/open-source-ai-model-developer-minimax-raises-2b-funding/
  MiniMax Group Inc., a Shanghai-based artificial intelligence developer, is raising $2 billion in funding. Bloomberg reported on Thursday that more tha...
- `c3` $6.5 billion → 6.5 billion USD · Noul 0.05 · https://siliconangle.com/2026/07/10/open-source-ai-model-developer-minimax-raises-2b-funding/
  MiniMax reportedly plans to follow up the raise by selling $6.5 billion worth of zero-coupon convertible bonds, which are convertible bonds that don’t...

Choice: c1 (confidence 0.97). Probabilities: c1 0.98, none 0.02, c3 0.00, c2 0.00.

