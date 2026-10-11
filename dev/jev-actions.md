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

Ran 2026-10-11T08:25:17.430Z.

Cited passages: 9.

### Anthropic

Wrote $965B. Choice selected c2, so code copied the amount the regex had parsed.

Model jev-1.13.0. 956 input tokens, 78 output tokens.

Candidates code found:

- `c1` $65 billion → 65 billion USD · Noul 0.05 · https://thehill.com/policy/technology/5900111-anthropic-valuation-openai-race/
  Anthropic raked in $65 billion from investors at a $965 billion valuation in its latest funding round, overtaking OpenAI’s most recent valuation as th...
- `c2` $965 billion → 965 billion USD · Noul 0.82 · https://thehill.com/policy/technology/5900111-anthropic-valuation-openai-race/
  Anthropic raked in $65 billion from investors at a $965 billion valuation in its latest funding round, overtaking OpenAI’s most recent valuation as th...

Choice: c2 (confidence 0.83). Probabilities: c2 0.89, none 0.10, c1 0.01.

### OpenAI

Wrote $852B. Choice selected c3, so code copied the amount the regex had parsed.

Model jev-1.13.0. 1233 input tokens, 104 output tokens.

Candidates code found:

- `c1` $65 billion → 65 billion USD · Noul 0.04 · https://thehill.com/policy/technology/5900111-anthropic-valuation-openai-race/
  Anthropic raked in $65 billion from investors at a $965 billion valuation in its latest funding round, overtaking OpenAI’s most recent valuation as th...
- `c2` $965 billion → 965 billion USD · Noul 0.06 · https://thehill.com/policy/technology/5900111-anthropic-valuation-openai-race/
  Anthropic raked in $65 billion from investors at a $965 billion valuation in its latest funding round, overtaking OpenAI’s most recent valuation as th...
- `c3` $852 billion → 852 billion USD · Noul 0.87 · https://thehill.com/policy/technology/5900111-anthropic-valuation-openai-race/
  The company leapfrogs OpenAI, whose latest funding round in February put the ChatGPT maker at $852 billion.

Choice: c3 (confidence 0.97). Probabilities: c3 0.98, none 0.02, c1 0.00, c2 0.00.

### xAI

Kept $230B. No cited amount named this company, so Jev was not asked.

### Databricks

Kept $134B. No cited amount named this company, so Jev was not asked.

### DeepSeek

Kept $74B. Choice selected none, so code did not copy an amount.

Model jev-1.13.0. 989 input tokens, 77 output tokens.

Candidates code found:

- `c1` $50 billion → 50 billion USD · Noul 0.04 · https://finance.yahoo.com/technology/ai/articles/moonshot-ai-eyes-hong-kong-085637302.html
  Chinese AI start-up Moonshot AI is targeting for a Hong Kong listing in early 2027 after its valuation hit $50 billion (€44.6bn), while rival DeepSeek...
- `c2` 44.6bn → 44.6 billion USD · Noul 0.04 · https://finance.yahoo.com/technology/ai/articles/moonshot-ai-eyes-hong-kong-085637302.html
  Chinese AI start-up Moonshot AI is targeting for a Hong Kong listing in early 2027 after its valuation hit $50 billion (€44.6bn), while rival DeepSeek...

Choice: none (confidence 0.98). Probabilities: none 0.99, c1 0.01, c2 0.00.

### Anduril

Kept $61B. Choice selected none, so code did not copy an amount.

Model jev-1.13.0. 710 input tokens, 51 output tokens.

Candidates code found:

- `c1` $100B → 100 billion USD · Noul 0.07 · https://techcrunch.com/2026/07/24/anduril-reportedly-in-talks-to-raise-funding-at-100b-valuation-more-than-3x-last-years-mark/
  # Anduril reportedly in talks to raise funding at $100B valuation, more than 3x last year’s mark 10:33 AM PDT · July 24, 2026 Defense tech company An...

Choice: none (confidence 0.92). Probabilities: none 0.96, c1 0.04.

### Z.ai (Zhipu)

Wrote $55.9B. Choice selected c2, so code copied the amount the regex had parsed.

Model jev-1.13.0. 1026 input tokens, 78 output tokens.

Candidates code found:

- `c1` $434.7 billion → 434.7 billion USD · Noul 0.50 · https://techcrunch.com/2026/05/07/chinas-moonshot-ai-raises-2b-at-20b-valuation-as-demand-for-open-source-ai-skyrockets/
  Zhipu AI, which trades in Hong Kong as Knowledge Atlas Technology, ended Thursday with a market cap of HK$434.7 billion (roughly $55.9 billion), while...
- `c2` $55.9 billion → 55.9 billion USD · Noul 0.89 · https://techcrunch.com/2026/05/07/chinas-moonshot-ai-raises-2b-at-20b-valuation-as-demand-for-open-source-ai-skyrockets/
  Zhipu AI, which trades in Hong Kong as Knowledge Atlas Technology, ended Thursday with a market cap of HK$434.7 billion (roughly $55.9 billion), while...

Choice: c2 (confidence 0.94). Probabilities: c2 0.96, none 0.02, c1 0.02.

### Moonshot AI

Flagged $50B. Choice selected c1. The figure moved. A second source checks it before it is published.

Model jev-1.13.0. 991 input tokens, 78 output tokens.

Candidates code found:

- `c1` $50 billion → 50 billion USD · Noul 0.55 · https://finance.yahoo.com/technology/ai/articles/moonshot-ai-eyes-hong-kong-085637302.html
  Chinese AI start-up Moonshot AI is targeting for a Hong Kong listing in early 2027 after its valuation hit $50 billion (€44.6bn), while rival DeepSeek...
- `c2` 44.6bn → 44.6 billion USD · Noul 0.44 · https://finance.yahoo.com/technology/ai/articles/moonshot-ai-eyes-hong-kong-085637302.html
  Chinese AI start-up Moonshot AI is targeting for a Hong Kong listing in early 2027 after its valuation hit $50 billion (€44.6bn), while rival DeepSeek...

Choice: c1 (confidence 0.33). Probabilities: c1 0.55, none 0.44, c2 0.01.

### MiniMax

Kept $4B. No cited amount named this company, so Jev was not asked.

