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

The answer is the probability of yes. Code records it and does not use it as a write gate. Choice's pick is the candidate. A pick that matches the stored mark is published. A pick that moves, or that the snippet marks as a round size or a run rate, is flagged for a second source.

A yes covers a private last-round mark and the market cap of a company that itself trades. Whether a source is trustworthy is a different question.

## What code does before Jev

A regex pulls dollar amounts out of cited passages that name the company. Amounts under $1 billion are dropped. At most 12 candidates are sent. The number later written on the panel is one of those regex matches, normalized to billions of USD.

## What code does after Jev

Code flags the chosen amount when its snippet shows a round size beside a higher valuation, when the amount is revenue or a run rate, or when it falls to less than one third of the prior mark. A second source and a later Choice then decide whether to publish it. A bare dollar figure with the unit cut off is used only to notice the higher valuation, and is never written.

## Latest run

Ran 2026-10-11T16:21:31.145Z.

Cited passages: 11.

### Anthropic

Wrote $965B. Choice selected c2, so code copied the amount the regex had parsed.

Model jev-1.13.0. 1600 input tokens, 130 output tokens.

Candidates code found:

- `c1` $65 billion → 65 billion USD · Noul 0.07 · https://pinggy.io/blog/openai_anthropic_funding_history/
  On May 28, 2026, Anthropic closed a $65 billion Series H at a $965 billion post-money valuation - briefly making it the most valuable private company ...
- `c2` $965 billion → 965 billion USD · Noul 0.94 · https://pinggy.io/blog/openai_anthropic_funding_history/
  On May 28, 2026, Anthropic closed a $65 billion Series H at a $965 billion post-money valuation - briefly making it the most valuable private company ...
- `c3` $965 billion → 965 billion USD · Noul 0.88 · https://valueaddvc.com/blog/anthropic-valuation-2026-965b-series-h-and-the-ipo-filing-explained
  ## Anthropic vs OpenAI: Comparing the Two Highest-Valued AI Companies in 2026 Anthropic's $965 billion valuation edged past OpenAI's $852 billion — se...
- `c4` $852 billion → 852 billion USD · Noul 0.05 · https://valueaddvc.com/blog/anthropic-valuation-2026-965b-series-h-and-the-ipo-filing-explained
  ## Anthropic vs OpenAI: Comparing the Two Highest-Valued AI Companies in 2026 Anthropic's $965 billion valuation edged past OpenAI's $852 billion — se...

Choice: c2 (confidence 0.94). Probabilities: c2 0.95, c3 0.04, none 0.01, c1 0.00, c4 0.00.

### OpenAI

Wrote $852B. Choice selected c2, so code copied the amount the regex had parsed.

Model jev-1.13.0. 1015 input tokens, 78 output tokens.

Candidates code found:

- `c1` $965 billion → 965 billion USD · Noul 0.07 · https://valueaddvc.com/blog/anthropic-valuation-2026-965b-series-h-and-the-ipo-filing-explained
  ## Anthropic vs OpenAI: Comparing the Two Highest-Valued AI Companies in 2026 Anthropic's $965 billion valuation edged past OpenAI's $852 billion — se...
- `c2` $852 billion → 852 billion USD · Noul 0.58 · https://valueaddvc.com/blog/anthropic-valuation-2026-965b-series-h-and-the-ipo-filing-explained
  ## Anthropic vs OpenAI: Comparing the Two Highest-Valued AI Companies in 2026 Anthropic's $965 billion valuation edged past OpenAI's $852 billion — se...

Choice: c2 (confidence 0.67). Probabilities: c2 0.78, none 0.22, c1 0.00.

### xAI

Kept $230B. Choice selected none, so code did not copy an amount.

Model jev-1.13.0. 964 input tokens, 77 output tokens.

Candidates code found:

- `c1` $20 billion → 20 billion USD · Noul 0.05 · https://www.cnbc.com/2026/01/06/elon-musk-xai-raises-20-billion-from-nvidia-cisco-investors.html
  Elon Musk's xAI said it raised $20 billion in a funding round, exceeding its prior target of $15 billion. CNBC reported in November that a financing w...
- `c2` $15 billion → 15 billion USD · Noul 0.06 · https://www.cnbc.com/2026/01/06/elon-musk-xai-raises-20-billion-from-nvidia-cisco-investors.html
  Elon Musk's xAI said it raised $20 billion in a funding round, exceeding its prior target of $15 billion. CNBC reported in November that a financing w...

Choice: none (confidence 0.52). Probabilities: none 0.68, c1 0.31, c2 0.01.

### Databricks

Wrote $134B. Choice selected c2, so code copied the amount the regex had parsed.

Model jev-1.13.0. 921 input tokens, 78 output tokens.

Candidates code found:

- `c1` $4 billion → 4 billion USD · Noul 0.04 · https://www.cnbc.com/2025/12/16/databricks-funding-valuation.html
  Databricks said Tuesday that it’s raising $4 billion in a funding round that would value the data analytics software company at $134 billion.
- `c2` $134 billion → 134 billion USD · Noul 0.30 · https://www.cnbc.com/2025/12/16/databricks-funding-valuation.html
  Databricks said Tuesday that it’s raising $4 billion in a funding round that would value the data analytics software company at $134 billion.

Choice: c2 (confidence 0.51). Probabilities: c2 0.67, none 0.32, c1 0.01.

### DeepSeek

Kept $74B. No cited amount named this company, so Jev was not asked.

### Anduril

Kept $61B. Choice selected none, so code did not copy an amount.

Model jev-1.13.0. 679 input tokens, 51 output tokens.

Candidates code found:

- `c1` $40 billion → 40 billion USD · Noul 0.09 · https://techcrunch.com/2026/07/24/anduril-reportedly-in-talks-to-raise-funding-at-100b-valuation-more-than-3x-last-years-mark/
  Defense tech company Anduril is said to be raising a new round of capital that may push its valuation up by a whopping $40 billion to about $100 billi...

Choice: none (confidence 0.90). Probabilities: none 0.95, c1 0.05.

### Z.ai (Zhipu)

Kept $55.9B. Choice selected none, so code did not copy an amount.

Model jev-1.13.0. 1198 input tokens, 103 output tokens.

Candidates code found:

- `c1` 700 billion → 700 billion USD · Noul 0.57 · https://finance.biggo.com/news/CvcIfZ4BmHHDnbgyNdIl
  Zhipu commands the highest valuation exceeding CNY 700 billion (approximately $103.5 billion) but faces widening losses.
- `c2` $103.5 billion → 103.5 billion USD · Noul 0.58 · https://finance.biggo.com/news/CvcIfZ4BmHHDnbgyNdIl
  Zhipu commands the highest valuation exceeding CNY 700 billion (approximately $103.5 billion) but faces widening losses.
- `c3` 700 billion → 700 billion USD · Noul 0.56 · https://finance.biggo.com/news/CvcIfZ4BmHHDnbgyNdIl
  ##### Key Elements According to financial data compiled by 36Kr, Zhipu holds the highest valuation, exceeding CNY 700 billion (approximately $103.5 bi...

Choice: none (confidence 0.32). Probabilities: none 0.49, c2 0.25, c1 0.23, c3 0.03.

### Moonshot AI

Kept $50B. No cited amount named this company, so Jev was not asked.

### MiniMax

Kept $4B. No cited amount named this company, so Jev was not asked.

