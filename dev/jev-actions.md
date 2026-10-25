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

Ran 2026-10-25T08:30:17.791Z.

Cited passages: 10.

### Anthropic

Wrote $965B. Choice selected c2, so code copied the amount the regex had parsed.

Model jev-1.14.0. 1919 input tokens, 156 output tokens.

Candidates code found:

- `c1` $65 billion → 65 billion USD · Noul 0.06 · https://pinggy.io/blog/openai_anthropic_funding_history/
  On May 28, 2026, Anthropic closed a $65 billion Series H at a $965 billion post-money valuation - briefly making it the most valuable private company ...
- `c2` $965 billion → 965 billion USD · Noul 0.96 · https://pinggy.io/blog/openai_anthropic_funding_history/
  On May 28, 2026, Anthropic closed a $65 billion Series H at a $965 billion post-money valuation - briefly making it the most valuable private company ...
- `c3` $965 billion → 965 billion USD · Noul 0.93 · https://valueaddvc.com/blog/anthropic-valuation-2026-965b-series-h-and-the-ipo-filing-explained
  Anthropic's $965 billion valuation edged past OpenAI's $852 billion — set in OpenAI's late-March 2026 round that raised $122 billion — making this the...
- `c4` $852 billion → 852 billion USD · Noul 0.06 · https://valueaddvc.com/blog/anthropic-valuation-2026-965b-series-h-and-the-ipo-filing-explained
  Anthropic's $965 billion valuation edged past OpenAI's $852 billion — set in OpenAI's late-March 2026 round that raised $122 billion — making this the...
- `c5` $122 billion → 122 billion USD · Noul 0.05 · https://valueaddvc.com/blog/anthropic-valuation-2026-965b-series-h-and-the-ipo-filing-explained
  Anthropic's $965 billion valuation edged past OpenAI's $852 billion — set in OpenAI's late-March 2026 round that raised $122 billion — making this the...

Choice: c2 (confidence 0.89). Probabilities: c2 0.91, c3 0.08, none 0.01, c1 0.00, c4 0.00, c5 0.00.

### OpenAI

Wrote $852B. Choice selected c2, so code copied the amount the regex had parsed.

Model jev-1.14.0. 1334 input tokens, 104 output tokens.

Candidates code found:

- `c1` $965 billion → 965 billion USD · Noul 0.05 · https://valueaddvc.com/blog/anthropic-valuation-2026-965b-series-h-and-the-ipo-filing-explained
  Anthropic's $965 billion valuation edged past OpenAI's $852 billion — set in OpenAI's late-March 2026 round that raised $122 billion — making this the...
- `c2` $852 billion → 852 billion USD · Noul 0.93 · https://valueaddvc.com/blog/anthropic-valuation-2026-965b-series-h-and-the-ipo-filing-explained
  Anthropic's $965 billion valuation edged past OpenAI's $852 billion — set in OpenAI's late-March 2026 round that raised $122 billion — making this the...
- `c3` $122 billion → 122 billion USD · Noul 0.04 · https://valueaddvc.com/blog/anthropic-valuation-2026-965b-series-h-and-the-ipo-filing-explained
  Anthropic's $965 billion valuation edged past OpenAI's $852 billion — set in OpenAI's late-March 2026 round that raised $122 billion — making this the...

Choice: c2 (confidence 0.95). Probabilities: c2 0.96, none 0.03, c3 0.01, c1 0.00.

### xAI

Kept $230B. No cited amount named this company, so Jev was not asked.

### Databricks

Flagged $190B. Choice selected c2. The figure moved. A second source checks it before it is published.

Model jev-1.14.0. 959 input tokens, 78 output tokens.

Candidates code found:

- `c1` $5 billion → 5 billion USD · Noul 0.10 · https://finance.yahoo.com/technology/ai/articles/databricks-valued-190-billion-latest-142120377.html
  Aug 13 (Reuters) - Databricks said on Thursday it had raised $5 billion at a $190 billion valuation, as the data and artificial intelligence software ...
- `c2` $190 billion → 190 billion USD · Noul 0.87 · https://finance.yahoo.com/technology/ai/articles/databricks-valued-190-billion-latest-142120377.html
  Aug 13 (Reuters) - Databricks said on Thursday it had raised $5 billion at a $190 billion valuation, as the data and artificial intelligence software ...

Choice: c2 (confidence 0.95). Probabilities: c2 0.97, none 0.02, c1 0.01.

### DeepSeek

Kept $74B. No cited amount named this company, so Jev was not asked.

### Anduril

Kept $61B. No cited amount named this company, so Jev was not asked.

### Z.ai (Zhipu)

Wrote $55.9B. Choice selected c5, so code copied the amount the regex had parsed.

Model jev-1.14.0. 1855 input tokens, 156 output tokens.

Candidates code found:

- `c1` 700 billion → 700 billion USD · Noul 0.34 · https://finance.biggo.com/news/CvcIfZ4BmHHDnbgyNdIl
  Zhipu commands the highest valuation exceeding CNY 700 billion (approximately $103.5 billion) but faces widening losses.
- `c2` $103.5 billion → 103.5 billion USD · Noul 0.45 · https://finance.biggo.com/news/CvcIfZ4BmHHDnbgyNdIl
  Zhipu commands the highest valuation exceeding CNY 700 billion (approximately $103.5 billion) but faces widening losses.
- `c3` 700 billion → 700 billion USD · Noul 0.45 · https://finance.biggo.com/news/CvcIfZ4BmHHDnbgyNdIl
  ##### Key Elements According to financial data compiled by 36Kr, Zhipu holds the highest valuation, exceeding CNY 700 billion (approximately $103.5 bi...
- `c4` $434.7 billion → 434.7 billion USD · Noul 0.72 · https://techcrunch.com/2026/05/07/chinas-moonshot-ai-raises-2b-at-20b-valuation-as-demand-for-open-source-ai-skyrockets/
  Zhipu AI, which trades in Hong Kong as Knowledge Atlas Technology, ended Thursday with a market cap of HK$434.7 billion (roughly $55.9 billion), while...
- `c5` $55.9 billion → 55.9 billion USD · Noul 0.70 · https://techcrunch.com/2026/05/07/chinas-moonshot-ai-raises-2b-at-20b-valuation-as-demand-for-open-source-ai-skyrockets/
  Zhipu AI, which trades in Hong Kong as Knowledge Atlas Technology, ended Thursday with a market cap of HK$434.7 billion (roughly $55.9 billion), while...

Choice: c5 (confidence 0.64). Probabilities: c5 0.70, none 0.18, c2 0.04, c1 0.03, c4 0.03, c3 0.02.

### Moonshot AI

Wrote $50B. Choice selected c1, so code copied the amount the regex had parsed.

Model jev-1.14.0. 977 input tokens, 78 output tokens.

Candidates code found:

- `c1` $50 billion → 50 billion USD · Noul 0.62 · https://www.trendingtopics.eu/deepseek-moonshot-ai-ipo/
  ## Moonshot AI: Hong Kong in the First Quarter of 2027 Moonshot AI was valued at nearly $50 billion (about 42.7 billion euros) in its latest funding r...
- `c2` 42.7 billion → 42.7 billion USD · Noul 0.46 · https://www.trendingtopics.eu/deepseek-moonshot-ai-ipo/
  ## Moonshot AI: Hong Kong in the First Quarter of 2027 Moonshot AI was valued at nearly $50 billion (about 42.7 billion euros) in its latest funding r...

Choice: c1 (confidence 0.72). Probabilities: c1 0.81, none 0.15, c2 0.04.

### MiniMax

Kept $4B. No cited amount named this company, so Jev was not asked.

