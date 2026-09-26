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

Ran 2026-09-26T08:26:24.500Z.

Cited passages: 44.

### Anthropic

Wrote $65B. Choice selected c7 and the Noul on that snippet was 0.85, above 0.8, so code copied the amount the regex had parsed.

Model jev-1.13.0. 2937 input tokens, 260 output tokens.

Candidates code found:

- `c1` $61.5 billion → 61.5 billion USD · Noul 0.85 · https://www.forbes.com/sites/jonmarkman/2026/05/04/anthropics-900b-funding-round-set-to-surpass-openai/
  In March 2025, Anthropic raised at a $61.5 billion valuation. In September 2025, it raised at $183 billion.
- `c2` $183 billion → 183 billion USD · Noul 0.88 · https://www.forbes.com/sites/jonmarkman/2026/05/04/anthropics-900b-funding-round-set-to-surpass-openai/
  In March 2025, Anthropic raised at a $61.5 billion valuation. In September 2025, it raised at $183 billion.
- `c3` $13 billion → 13 billion USD · Noul 0.60 · https://www.anthropic.com/news/anthropic-raises-series-f-at-usd183b-post-money-valuation
  Anthropic has completed a $13 billion Series F led by ICONIQ, co-led by Fidelity and Lightspeed, valuing the company at $183 billion post-money.
- `c4` $183 billion → 183 billion USD · Noul 0.95 · https://www.anthropic.com/news/anthropic-raises-series-f-at-usd183b-post-money-valuation
  Anthropic has completed a $13 billion Series F led by ICONIQ, co-led by Fidelity and Lightspeed, valuing the company at $183 billion post-money.
- `c5` $5 billion → 5 billion USD · Noul 0.05 · https://sacra.com/c/anthropic/
  Alongside the primary fundraising, Anthropic launched an employee tender offer in February 2026 sized at $5 billion to $6 billion, allowing current an...
- `c6` $6 billion → 6 billion USD · Noul 0.06 · https://sacra.com/c/anthropic/
  Alongside the primary fundraising, Anthropic launched an employee tender offer in February 2026 sized at $5 billion to $6 billion, allowing current an...
- `c7` $65 billion → 65 billion USD · Noul 0.85 · https://www.anthropic.com/news/series-h
  Anthropic has raised $65 billion in Series H funding led by Altimeter Capital, Dragoneer, Greenoaks, and Sequoia Capital, valuing the company at $965 ...
- `c8` $50B → 50 billion USD · Noul 0.06 · https://www.the-ai-corner.com/p/anthropic-1-trillion-valuation-dario-amodei-2026-breakdown
  Anthropic is in talks for a $50B raise at $1T valuation.
- `c9` $1T → 1000 billion USD · Noul 0.06 · https://www.the-ai-corner.com/p/anthropic-1-trillion-valuation-dario-amodei-2026-breakdown
  Anthropic is in talks for a $50B raise at $1T valuation.

Choice: c7 (confidence 0.62). Probabilities: c7 0.66, c4 0.27, c2 0.06, none 0.01, c5 0.00, c8 0.00, c9 0.00, c3 0.00, c6 0.00, c1 0.00.

### OpenAI

Kept $852B. Choice selected c3, and the Noul on that snippet was 0.65, which is not above 0.8.

Model jev-1.13.0. 1677 input tokens, 130 output tokens.

Candidates code found:

- `c1` $500 Billion → 500 billion USD · Noul 0.71 · https://www.bloomberg.com/news/videos/2025-10-02/the-pulse-10-02-2025-video
  Oct 2nd, 2025 OpenAI Hits $500 Billion Valuation, Overtaking Elon Musk's SpaceX | The Pulse 10/02/2025 OpenAI has completed a deal to help employees s...
- `c2` $28 billion → 28 billion USD · Noul 0.73 · https://finance.yahoo.com/news/openai-just-raised-a-historic-amount-of-money-here-are-2-stunning-numbers-you-shouldnt-forget-133202041.html
  From OpenAI&#x27;s $28 billion valuation in 2023 to $852 billion in just three years is impressive, Bilello noted: Valuation in April 2023: $28 billio...
- `c3` $852 billion → 852 billion USD · Noul 0.65 · https://finance.yahoo.com/news/openai-just-raised-a-historic-amount-of-money-here-are-2-stunning-numbers-you-shouldnt-forget-133202041.html
  From OpenAI&#x27;s $28 billion valuation in 2023 to $852 billion in just three years is impressive, Bilello noted: Valuation in April 2023: $28 billio...
- `c4` $60 billion → 60 billion USD · Noul 0.04 · https://www.forbes.com/sites/investor-hub/article/openai-ipo-things-to-know/
  OpenAI’s IPO is expected to be the second largest in history, looking at raising · $60 billion or more, according to Reuters.

Choice: c3 (confidence 0.26). Probabilities: c3 0.41, c1 0.40, none 0.16, c2 0.03, c4 0.00.

### xAI

Wrote $230B. Choice selected c8 and the Noul on that snippet was 0.93, above 0.8, so code copied the amount the regex had parsed.

Model jev-1.13.0. 3374 input tokens, 316 output tokens.

Candidates code found:

- `c1` $80 billion → 80 billion USD · Noul 0.36 · https://nextbigfuture.substack.com/p/xai-acquires-x-in-an-all-stock-transactionhtml
  The combination values xAI at $80 billion and X at $33 billion ($45B less $12B debt).
- `c2` $33 billion → 33 billion USD · Noul 0.12 · https://nextbigfuture.substack.com/p/xai-acquires-x-in-an-all-stock-transactionhtml
  The combination values xAI at $80 billion and X at $33 billion ($45B less $12B debt).
- `c3` $45B → 45 billion USD · Noul 0.13 · https://nextbigfuture.substack.com/p/xai-acquires-x-in-an-all-stock-transactionhtml
  The combination values xAI at $80 billion and X at $33 billion ($45B less $12B debt).
- `c4` $12B → 12 billion USD · Noul 0.05 · https://nextbigfuture.substack.com/p/xai-acquires-x-in-an-all-stock-transactionhtml
  The combination values xAI at $80 billion and X at $33 billion ($45B less $12B debt).
- `c5` $200 billion → 200 billion USD · Noul 0.83 · https://sacra.com/c/xai/
  xAI was previously valued at $200 billion in September 2025 during a $10 billion equity raise led by institutional investors.
- `c6` $10 billion → 10 billion USD · Noul 0.15 · https://sacra.com/c/xai/
  xAI was previously valued at $200 billion in September 2025 during a $10 billion equity raise led by institutional investors.
- `c7` $20 billion → 20 billion USD · Noul 0.14 · https://sacra.com/c/xai/
  xAI last closed a $20 billion Series E in January 2026 at a $230 billion valuation, upsized from an initial $15 billion target.
- `c8` $230 billion → 230 billion USD · Noul 0.93 · https://sacra.com/c/xai/
  xAI last closed a $20 billion Series E in January 2026 at a $230 billion valuation, upsized from an initial $15 billion target.
- `c9` $15 billion → 15 billion USD · Noul 0.08 · https://sacra.com/c/xai/
  xAI last closed a $20 billion Series E in January 2026 at a $230 billion valuation, upsized from an initial $15 billion target.
- `c10` $250 billion → 250 billion USD · Noul 0.54 · https://sacra.com/c/xai/
  On February 2, 2026, SpaceX acquired xAI in an all-stock deal. Reuters reported the transaction valued xAI at $250 billion and SpaceX at $1 trillion, ...
- `c11` $1 trillion → 1000 billion USD · Noul 0.08 · https://sacra.com/c/xai/
  On February 2, 2026, SpaceX acquired xAI in an all-stock deal. Reuters reported the transaction valued xAI at $250 billion and SpaceX at $1 trillion, ...

Choice: c8 (confidence 0.66). Probabilities: c8 0.69, c10 0.29, none 0.02, c5 0.00, c3 0.00, c11 0.00, c1 0.00, c9 0.00, c6 0.00, c4 0.00, c2 0.00, c7 0.00.

### Databricks

Wrote $134B. Choice selected c5 and the Noul on that snippet was 0.86, above 0.8, so code copied the amount the regex had parsed.

Model jev-1.13.0. 1879 input tokens, 156 output tokens.

Candidates code found:

- `c1` $1 billion → 1 billion USD · Noul 0.40 · https://www.bloomberg.com/news/articles/2025-09-08/databricks-raises-1-billion-at-a-valuation-of-over-100-billion
  Databricks Inc., one of the world’s most valuable startups, said it closed a $1 billion funding round, valuing the software provider at more than $100...
- `c2` $4 billion → 4 billion USD · Noul 0.05 · https://www.databricks.com/company/newsroom/press-releases/databricks-surpasses-4-8b-revenue-run-rate-growing-55-year-over-year
  SAN FRANCISCO, CA — December 16, 2025 — Databricks, the Data and AI company, today announced it is raising a &gt;$4 billion Series L investment, valui...
- `c3` $5 billion → 5 billion USD · Noul 0.66 · https://www.cnbc.com/2026/02/09/databricks-completes-5-billion-funding-round-with-2-billion-in-debt.html
  Databricks said it raised $5 billion in funding and $2 billion in new debt capacity at a $134 billion valuation. The company also said its annualized ...
- `c4` $2 billion → 2 billion USD · Noul 0.13 · https://www.cnbc.com/2026/02/09/databricks-completes-5-billion-funding-round-with-2-billion-in-debt.html
  Databricks said it raised $5 billion in funding and $2 billion in new debt capacity at a $134 billion valuation. The company also said its annualized ...
- `c5` $134 billion → 134 billion USD · Noul 0.86 · https://www.cnbc.com/2026/02/09/databricks-completes-5-billion-funding-round-with-2-billion-in-debt.html
  Databricks said it raised $5 billion in funding and $2 billion in new debt capacity at a $134 billion valuation. The company also said its annualized ...

Choice: c5 (confidence 0.95). Probabilities: c5 0.96, none 0.03, c3 0.01, c4 0.00, c2 0.00, c1 0.00.

### DeepSeek

Kept $74B. No cited amount named this company, so Jev was not asked.

### Anduril

Wrote $61B. Choice selected c4 and the Noul on that snippet was 0.91, above 0.8, so code copied the amount the regex had parsed.

Model jev-1.13.0. 1890 input tokens, 156 output tokens.

Candidates code found:

- `c1` $2.5bn → 2.5 billion USD · Noul 0.08 · https://finance.yahoo.com/news/anduril-industries-raises-2-5bn-084718100.html
  Anduril Industries raises $2.5bn funding, valuation hits $30.5bn Anduril offers a range of products · Verdict Anduril Industries has closed a $2.5bn...
- `c2` $30.5bn → 30.5 billion USD · Noul 0.91 · https://finance.yahoo.com/news/anduril-industries-raises-2-5bn-084718100.html
  Anduril Industries raises $2.5bn funding, valuation hits $30.5bn Anduril offers a range of products · Verdict Anduril Industries has closed a $2.5bn...
- `c3` $5 billion → 5 billion USD · Noul 0.31 · https://techcrunch.com/2026/05/13/anduril-raises-5b-doubles-valuation-to-61b/
  Anduril has raised a $5 billion Series H round at a $61 billion valuation, led by returning investors Thrive Capital and Andreessen Horowitz, the comp...
- `c4` $61 billion → 61 billion USD · Noul 0.91 · https://techcrunch.com/2026/05/13/anduril-raises-5b-doubles-valuation-to-61b/
  Anduril has raised a $5 billion Series H round at a $61 billion valuation, led by returning investors Thrive Capital and Andreessen Horowitz, the comp...
- `c5` $40 billion → 40 billion USD · Noul 0.07 · https://techcrunch.com/2026/07/24/anduril-reportedly-in-talks-to-raise-funding-at-100b-valuation-more-than-3x-last-years-mark/
  Tyler Williams ... Defense tech company Anduril is said to be raising a new round of capital that may push its valuation up by a whopping $40 billion ...

Choice: c4 (confidence 0.98). Probabilities: c4 0.98, c2 0.01, none 0.01, c5 0.00, c3 0.00, c1 0.00.

### Z.ai (Zhipu)

Wrote $40.4B. Choice selected c2 and the Noul on that snippet was 0.89, above 0.8, so code copied the amount the regex had parsed.

Model jev-1.13.0. 1270 input tokens, 104 output tokens.

Candidates code found:

- `c1` $62 billion → 62 billion USD · Noul 0.84 · https://en.wikipedia.org/wiki/Z.ai
  [[7]](./Z.ai#cite_note-:14-8) With a [market capitalization](https://en.wikipedia.org/wiki/Market_capitalization) of US$62 billion as of August 2026, ...
- `c2` $40.4B → 40.4 billion USD · Noul 0.89 · https://pitchbook.com/profiles/company/481268-17
  ... As of 15-Sep-2026, Zhipu’s stock price is $86.71. Its current market cap is $40.4B with 466M shares.
- `c3` $4 billion → 4 billion USD · Noul 0.06 · https://www.siliconreport.com/zhipu-ai-seeks-4b-placement-after-stock-surge-creates-100b-valuation-172cdec6
  Chinese AI model developer Zhipu AI is seeking to raise approximately $4 billion through a private placement, capitalizing on a stock rally that has p...

Choice: c2 (confidence 0.93). Probabilities: c2 0.95, c1 0.04, none 0.01, c3 0.00.

### Moonshot AI

Wrote $35B. Choice selected c3 and the Noul on that snippet was 0.92, above 0.8, so code copied the amount the regex had parsed.

Model jev-1.13.0. 1653 input tokens, 130 output tokens.

Candidates code found:

- `c1` $4.3 billion → 4.3 billion USD · Noul 0.61 · https://techcrunch.com/2026/05/07/chinas-moonshot-ai-raises-2b-at-20b-valuation-as-demand-for-open-source-ai-skyrockets/
  Moonshot was valued at $4.3 billion at the end of 2025, per reports, and by early 2026, that figure had more than doubled to $10 billion following a $...
- `c2` $10 billion → 10 billion USD · Noul 0.70 · https://techcrunch.com/2026/05/07/chinas-moonshot-ai-raises-2b-at-20b-valuation-as-demand-for-open-source-ai-skyrockets/
  Moonshot was valued at $4.3 billion at the end of 2025, per reports, and by early 2026, that figure had more than doubled to $10 billion following a $...
- `c3` $35 billion → 35 billion USD · Noul 0.92 · https://www.bloomberg.com/news/articles/2026-07-29/china-s-moonshot-ai-passes-funding-goal-to-hit-35-billion-value
  Moonshot AI secured a $35 billion valuation after raising a larger-than-anticipated $3.5 billion in a just-closed round of financing, riding the momen...
- `c4` $3.5 billion → 3.5 billion USD · Noul 0.06 · https://www.bloomberg.com/news/articles/2026-07-29/china-s-moonshot-ai-passes-funding-goal-to-hit-35-billion-value
  Moonshot AI secured a $35 billion valuation after raising a larger-than-anticipated $3.5 billion in a just-closed round of financing, riding the momen...

Choice: c3 (confidence 0.97). Probabilities: c3 0.98, c2 0.02, c1 0.00, none 0.00, c4 0.00.

### MiniMax

Kept $4B. Choice selected c2, and the Noul on that snippet was 0.59, which is not above 0.8.

Model jev-1.13.0. 914 input tokens, 78 output tokens.

Candidates code found:

- `c1` $4 billion → 4 billion USD · Noul 0.89 · https://sacra.com/c/minimax/
  MiniMax closed a $300 million Series B extension in July 2025 at a $4 billion valuation, led by Shanghai state-owned capital through Shanghai STVC Gro...
- `c2` 101.98 billion → 102 billion USD · Noul 0.59 · https://stockanalysis.com/quote/hkg/0100/market-cap/
  MiniMax Group has a market cap or net worth of 101.98 billion as of September 10, 2026.

Choice: c2 (confidence 0.70). Probabilities: c2 0.80, c1 0.16, none 0.04.

