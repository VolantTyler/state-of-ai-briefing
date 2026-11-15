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

Ran 2026-11-15T17:15:39.956Z.

Cited passages: 9.

### OpenAI

Flagged $852B. Choice selected c1. The figure moved. A second source checks it before it is published.

Model jev-1.14.0. 951 input tokens, 78 output tokens.

Candidates code found:

- `c1` $852 billion → 852 billion USD · Noul 0.91 · https://www.cnbc.com/2026/05/28/anthropic-open-ai-startup-value.html
  Anthropic&#x27;s biggest competitor OpenAI was valued at $852 billion in late March after closing a record-breaking $122 billion funding round.
- `c2` $122 billion → 122 billion USD · Noul 0.04 · https://www.cnbc.com/2026/05/28/anthropic-open-ai-startup-value.html
  Anthropic&#x27;s biggest competitor OpenAI was valued at $852 billion in late March after closing a record-breaking $122 billion funding round.

Choice: c1 (confidence 0.89). Probabilities: c1 0.93, none 0.04, c2 0.03.

### Anthropic

Wrote $965B. Choice selected c2, so code copied the amount the regex had parsed.

Model jev-1.14.0. 1474 input tokens, 130 output tokens.

Candidates code found:

- `c1` $65 billion → 65 billion USD · Noul 0.13 · https://www.axios.com/2026/05/28/anthropic-ai-fundraising-openai
  Anthropic has raised $65 billion, valuing the AI lab at $965 billion.
- `c2` $965 billion → 965 billion USD · Noul 0.82 · https://www.axios.com/2026/05/28/anthropic-ai-fundraising-openai
  Anthropic has raised $65 billion, valuing the AI lab at $965 billion.
- `c3` $852 billion → 852 billion USD · Noul 0.03 · https://www.cnbc.com/2026/05/28/anthropic-open-ai-startup-value.html
  Anthropic&#x27;s biggest competitor OpenAI was valued at $852 billion in late March after closing a record-breaking $122 billion funding round.
- `c4` $122 billion → 122 billion USD · Noul 0.03 · https://www.cnbc.com/2026/05/28/anthropic-open-ai-startup-value.html
  Anthropic&#x27;s biggest competitor OpenAI was valued at $852 billion in late March after closing a record-breaking $122 billion funding round.

Choice: c2 (confidence 0.71). Probabilities: c2 0.77, none 0.21, c1 0.02, c3 0.00, c4 0.00.

### xAI

Wrote $250B. Choice selected c1, so code copied the amount the regex had parsed.

Model jev-1.14.0. 921 input tokens, 78 output tokens.

Candidates code found:

- `c1` $250 billion → 250 billion USD · Noul 0.54 · https://aifundingtracker.com/xai-valuation/
  Each xAI share converted into 0.1433 SpaceX shares, which valued xAI at $250 billion and SpaceX at $1 trillion.
- `c2` $1 trillion → 1000 billion USD · Noul 0.06 · https://aifundingtracker.com/xai-valuation/
  Each xAI share converted into 0.1433 SpaceX shares, which valued xAI at $250 billion and SpaceX at $1 trillion.

Choice: c1 (confidence 0.70). Probabilities: c1 0.80, none 0.19, c2 0.01.

### Databricks

Wrote $190B. Choice selected c2, so code copied the amount the regex had parsed.

Model jev-1.14.0. 893 input tokens, 78 output tokens.

Candidates code found:

- `c1` $5 billion → 5 billion USD · Noul 0.16 · https://www.cnbc.com/2026/08/13/databricks-funding-round-190-billion-valuation.html
  Databricks on Thursday wrapped a $5 billion funding round at a $190 billion valuation.
- `c2` $190 billion → 190 billion USD · Noul 0.93 · https://www.cnbc.com/2026/08/13/databricks-funding-round-190-billion-valuation.html
  Databricks on Thursday wrapped a $5 billion funding round at a $190 billion valuation.

Choice: c2 (confidence 0.98). Probabilities: c2 0.99, none 0.01, c1 0.00.

### DeepSeek

Kept $74B. No cited amount named this company, so Jev was not asked.

### Anduril

Wrote $61B. Choice selected c1, so code copied the amount the regex had parsed.

Model jev-1.14.0. 970 input tokens, 78 output tokens.

Candidates code found:

- `c1` $61 billion → 61 billion USD · Noul 0.94 · https://www.bloomberg.com/news/articles/2026-05-13/anduril-valued-at-61-billion-in-round-led-by-thrive-andreessen
  Anduril Industries Inc. doubled its valuation to $61 billion in a fresh $5 billion funding round led by Thrive Capital and Andreessen Horowitz, a sign...
- `c2` $5 billion → 5 billion USD · Noul 0.05 · https://www.bloomberg.com/news/articles/2026-05-13/anduril-valued-at-61-billion-in-round-led-by-thrive-andreessen
  Anduril Industries Inc. doubled its valuation to $61 billion in a fresh $5 billion funding round led by Thrive Capital and Andreessen Horowitz, a sign...

Choice: c1 (confidence 0.97). Probabilities: c1 0.98, none 0.01, c2 0.01.

### Moonshot AI

Wrote $50B. Choice selected c1, so code copied the amount the regex had parsed.

Model jev-1.14.0. 913 input tokens, 78 output tokens.

Candidates code found:

- `c1` $50 billion → 50 billion USD · Noul 0.77 · https://www.trendingtopics.eu/deepseek-moonshot-ai-ipo/
  Moonshot AI was valued at nearly $50 billion (about 42.7 billion euros) in its latest funding round, Bloomberg reported.
- `c2` 42.7 billion → 42.7 billion USD · Noul 0.71 · https://www.trendingtopics.eu/deepseek-moonshot-ai-ipo/
  Moonshot AI was valued at nearly $50 billion (about 42.7 billion euros) in its latest funding round, Bloomberg reported.

Choice: c1 (confidence 0.82). Probabilities: c1 0.88, none 0.07, c2 0.05.

### Z.ai (Zhipu)

Flagged $63B. Choice selected c1. The figure moved. A second source checks it before it is published.

Model jev-1.14.0. 1252 input tokens, 104 output tokens.

Candidates code found:

- `c1` $63 billion → 63 billion USD · Noul 0.92 · https://andrew.ooo/answers/deepseek-vs-moonshot-vs-z-ai-vs-minimax-chinese-ai-ipo-race-september-2026/
  Their first earnings reports set the reference points: Z.ai: ~$136 million H1 2026 revenue; market cap just over $63 billion; shares up more than 7x y...
- `c2` $46.6 billion → 46.6 billion USD · Noul 0.88 · https://www.trendingtopics.eu/deepseek-moonshot-ai-ipo/
  Zhipu, which operates under the name Z.ai, and MiniMax have gone public and were most recently valued at $46.6 billion and $13 billion.
- `c3` $13 billion → 13 billion USD · Noul 0.14 · https://www.trendingtopics.eu/deepseek-moonshot-ai-ipo/
  Zhipu, which operates under the name Z.ai, and MiniMax have gone public and were most recently valued at $46.6 billion and $13 billion.

Choice: c1 (confidence 0.67). Probabilities: c1 0.75, c2 0.22, none 0.02, c3 0.01.

### MiniMax

Flagged $13B. Choice selected c2. The figure fell to half or less of the stored mark. The previous mark stays; a second source does not publish this drop.

Model jev-1.14.0. 928 input tokens, 78 output tokens.

Candidates code found:

- `c1` $46.6 billion → 46.6 billion USD · Noul 0.08 · https://www.trendingtopics.eu/deepseek-moonshot-ai-ipo/
  Zhipu, which operates under the name Z.ai, and MiniMax have gone public and were most recently valued at $46.6 billion and $13 billion.
- `c2` $13 billion → 13 billion USD · Noul 0.75 · https://www.trendingtopics.eu/deepseek-moonshot-ai-ipo/
  Zhipu, which operates under the name Z.ai, and MiniMax have gone public and were most recently valued at $46.6 billion and $13 billion.

Choice: c2 (confidence 0.76). Probabilities: c2 0.84, none 0.15, c1 0.01.

