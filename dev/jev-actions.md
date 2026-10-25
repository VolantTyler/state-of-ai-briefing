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

Ran 2026-10-25T14:26:51.973Z.

Cited passages: 9.

### Anthropic

Wrote $965B. Choice selected c1, so code copied the amount the regex had parsed.

Model jev-1.14.0. 979 input tokens, 78 output tokens.

Candidates code found:

- `c1` $965 billion → 965 billion USD · Noul 0.94 · https://valueaddvc.com/blog/anthropic-valuation-2026-965b-series-h-and-the-ipo-filing-explained
  Anthropic is valued at $965 billion after its Series H round in spring 2026, more than double the $380 billion it was worth just three months earlier ...
- `c2` $380 billion → 380 billion USD · Noul 0.42 · https://valueaddvc.com/blog/anthropic-valuation-2026-965b-series-h-and-the-ipo-filing-explained
  Anthropic is valued at $965 billion after its Series H round in spring 2026, more than double the $380 billion it was worth just three months earlier ...

Choice: c1 (confidence 0.82). Probabilities: c1 0.88, none 0.10, c2 0.02.

### OpenAI

Flagged $300B. Choice selected c2. The figure moved. A second source checks it before it is published.

Model jev-1.14.0. 974 input tokens, 78 output tokens.

Candidates code found:

- `c1` $40 billion → 40 billion USD · Noul 0.21 · https://techfundingnews.com/can-openai-hold-its-300b-lead-as-xai-and-anthropic-close-in/
  On March 31, 2025, OpenAI officially declared the completion of its $40 billion funding round, resulting in a post-money valuation of $300 billion.
- `c2` $300 billion → 300 billion USD · Noul 0.94 · https://techfundingnews.com/can-openai-hold-its-300b-lead-as-xai-and-anthropic-close-in/
  On March 31, 2025, OpenAI officially declared the completion of its $40 billion funding round, resulting in a post-money valuation of $300 billion.

Choice: c2 (confidence 1.00). Probabilities: c2 1.00, none 0.00, c1 0.00.

### xAI

Kept $230B. No cited amount named this company, so Jev was not asked.

### Databricks

Kept $190B. No cited amount named this company, so Jev was not asked.

### DeepSeek

Kept $74B. No cited amount named this company, so Jev was not asked.

### Anduril

Kept $61B. No cited amount named this company, so Jev was not asked.

### Z.ai (Zhipu)

Wrote $55.9B. Choice selected c2, so code copied the amount the regex had parsed.

Model jev-1.14.0. 1026 input tokens, 78 output tokens.

Candidates code found:

- `c1` $434.7 billion → 434.7 billion USD · Noul 0.65 · https://techcrunch.com/2026/05/07/chinas-moonshot-ai-raises-2b-at-20b-valuation-as-demand-for-open-source-ai-skyrockets/
  Zhipu AI, which trades in Hong Kong as Knowledge Atlas Technology, ended Thursday with a market cap of HK$434.7 billion (roughly $55.9 billion), while...
- `c2` $55.9 billion → 55.9 billion USD · Noul 0.94 · https://techcrunch.com/2026/05/07/chinas-moonshot-ai-raises-2b-at-20b-valuation-as-demand-for-open-source-ai-skyrockets/
  Zhipu AI, which trades in Hong Kong as Knowledge Atlas Technology, ended Thursday with a market cap of HK$434.7 billion (roughly $55.9 billion), while...

Choice: c2 (confidence 0.91). Probabilities: c2 0.94, c1 0.05, none 0.01.

### Moonshot AI

Kept $50B. No cited amount named this company, so Jev was not asked.

### MiniMax

Kept $4B. No cited amount named this company, so Jev was not asked.

