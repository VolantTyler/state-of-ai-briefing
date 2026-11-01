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

Code flags the chosen amount when its snippet shows a round size beside a higher valuation, when the amount is revenue or a run rate, or when it falls to half or less of the prior mark. A second source and a later Choice decide whether to publish a move, a round size, or a run rate. A drop to half or less of the prior mark is not published from that check, and the previous mark stays. A bare dollar figure with the unit cut off is used only to notice the higher valuation, and is never written.

## Latest run

Ran 2026-11-01T09:29:54.222Z.

Cited passages: 9.

### Anthropic

Flagged $13B. Choice selected c1. The figure fell to half or less of the stored mark. The previous mark stays; a second source does not publish this drop.

Model jev-1.14.0. 674 input tokens, 52 output tokens.

Candidates code found:

- `c1` $13B → 13 billion USD · Noul 0.05 · https://techfundingnews.com/openai-anthropic-xai-ai-funding-trends-2025/
  ### Anthropic Anthropic Founder/s: Daniela Amodei, Dario Amodei Founded year: 2021 Recent funding: $13B San Francisco-based OpenAI rival Anthropic h...

Choice: c1 (confidence 0.10). Probabilities: c1 0.55, none 0.45.

### OpenAI

Flagged $300B. Choice selected c3. The figure fell to half or less of the stored mark. The previous mark stays; a second source does not publish this drop.

Model jev-1.14.0. 1231 input tokens, 104 output tokens.

Candidates code found:

- `c1` $13B → 13 billion USD · Noul 0.02 · https://techfundingnews.com/openai-anthropic-xai-ai-funding-trends-2025/
  ### Anthropic Anthropic Founder/s: Daniela Amodei, Dario Amodei Founded year: 2021 Recent funding: $13B San Francisco-based OpenAI rival Anthropic h...
- `c2` $40 billion → 40 billion USD · Noul 0.09 · https://techfundingnews.com/openai-anthropic-xai-ai-funding-trends-2025/
  ### OpenAI OpenAI has raised $40 billion in a new funding round that values the company at $300 billion post-money.
- `c3` $300 billion → 300 billion USD · Noul 0.94 · https://techfundingnews.com/openai-anthropic-xai-ai-funding-trends-2025/
  ### OpenAI OpenAI has raised $40 billion in a new funding round that values the company at $300 billion post-money.

Choice: c3 (confidence 0.96). Probabilities: c3 0.97, c2 0.02, none 0.01, c1 0.00.

### xAI

Kept $230B. No cited amount named this company, so Jev was not asked.

### Databricks

Kept $190B. No cited amount named this company, so Jev was not asked.

### DeepSeek

Kept $74B. No cited amount named this company, so Jev was not asked.

### Anduril

Flagged $30.5B. Choice selected c2. The figure fell to half or less of the stored mark. The previous mark stays; a second source does not publish this drop.

Model jev-1.14.0. 946 input tokens, 78 output tokens.

Candidates code found:

- `c1` $2.5 billion → 2.5 billion USD · Noul 0.05 · https://www.cnbc.com/2025/06/05/anduril-valuation-founders-fund.html
  Anduril Chairman Trae Stephens told Bloomberg on Thursday that the defense tech company has just raised $2.5 billion at a $30.5 billion valuation.
- `c2` $30.5 billion → 30.5 billion USD · Noul 0.91 · https://www.cnbc.com/2025/06/05/anduril-valuation-founders-fund.html
  Anduril Chairman Trae Stephens told Bloomberg on Thursday that the defense tech company has just raised $2.5 billion at a $30.5 billion valuation.

Choice: c2 (confidence 0.97). Probabilities: c2 0.98, none 0.02, c1 0.00.

### Z.ai (Zhipu)

Wrote $55.9B. Choice selected c2, so code copied the amount the regex had parsed.

Model jev-1.14.0. 1026 input tokens, 78 output tokens.

Candidates code found:

- `c1` $434.7 billion → 434.7 billion USD · Noul 0.63 · https://techcrunch.com/2026/05/07/chinas-moonshot-ai-raises-2b-at-20b-valuation-as-demand-for-open-source-ai-skyrockets/
  Zhipu AI, which trades in Hong Kong as Knowledge Atlas Technology, ended Thursday with a market cap of HK$434.7 billion (roughly $55.9 billion), while...
- `c2` $55.9 billion → 55.9 billion USD · Noul 0.94 · https://techcrunch.com/2026/05/07/chinas-moonshot-ai-raises-2b-at-20b-valuation-as-demand-for-open-source-ai-skyrockets/
  Zhipu AI, which trades in Hong Kong as Knowledge Atlas Technology, ended Thursday with a market cap of HK$434.7 billion (roughly $55.9 billion), while...

Choice: c2 (confidence 0.92). Probabilities: c2 0.95, c1 0.04, none 0.01.

### Moonshot AI

Wrote $50B. Choice selected c1, so code copied the amount the regex had parsed.

Model jev-1.14.0. 977 input tokens, 78 output tokens.

Candidates code found:

- `c1` $50 billion → 50 billion USD · Noul 0.59 · https://www.trendingtopics.eu/deepseek-moonshot-ai-ipo/
  ## Moonshot AI: Hong Kong in the First Quarter of 2027 Moonshot AI was valued at nearly $50 billion (about 42.7 billion euros) in its latest funding r...
- `c2` 42.7 billion → 42.7 billion USD · Noul 0.49 · https://www.trendingtopics.eu/deepseek-moonshot-ai-ipo/
  ## Moonshot AI: Hong Kong in the First Quarter of 2027 Moonshot AI was valued at nearly $50 billion (about 42.7 billion euros) in its latest funding r...

Choice: c1 (confidence 0.68). Probabilities: c1 0.79, none 0.17, c2 0.04.

### MiniMax

Flagged $33B. Choice selected c1. The figure moved. A second source checks it before it is published.

Model jev-1.14.0. 607 input tokens, 52 output tokens.

Candidates code found:

- `c1` $33 billion → 33 billion USD · Noul 0.51 · https://www.recodechinaai.com/p/chinese-ai-companies-just-had-their
  MiniMax doubled on its debut day and has since climbed to over $33 billion.

Choice: c1 (confidence 0.22). Probabilities: c1 0.61, none 0.39.

