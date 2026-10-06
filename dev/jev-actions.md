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

## What code does after Jev

Code still refuses the chosen amount when its snippet shows a round size beside a higher valuation, or when the amount is revenue or a run rate. Code also refuses a drop to less than one third of the prior mark. The panel keeps its previous number. A bare dollar figure with the unit cut off is used only to notice the higher valuation, and is never written.

## Latest run

Ran 2026-10-06T15:26:36.730Z.

Cited passages: 9.

### Anthropic

Kept $965B. Choice selected c3, and the Noul on that snippet was 0.46, which is not above 0.8.

Model jev-1.13.0. 1640 input tokens, 130 output tokens.

Candidates code found:

- `c1` $65 billion → 65 billion USD · Noul 0.18 · https://www.morningstar.com/stocks/anthropic-bests-openai-valuation-race-hitting-965b
  Anthropic, maker of Claude AI, has officially become the world’s most valuable startup after announcing it raised $65 billion in Series H funding at a...
- `c2` $852B → 852 billion USD · Noul 0.13 · https://valueaddvc.com/blog/ai-company-valuations-in-2025-how-the-top-ai-startups-are-being-priced
  As of mid-2026 OpenAI is valued at roughly $852B and Anthropic at ~$965B (both have now filed S-1s), while xAI was last marked near $230B before Space...
- `c3` $965B → 965 billion USD · Noul 0.46 · https://valueaddvc.com/blog/ai-company-valuations-in-2025-how-the-top-ai-startups-are-being-priced
  As of mid-2026 OpenAI is valued at roughly $852B and Anthropic at ~$965B (both have now filed S-1s), while xAI was last marked near $230B before Space...
- `c4` $230B → 230 billion USD · Noul 0.04 · https://valueaddvc.com/blog/ai-company-valuations-in-2025-how-the-top-ai-startups-are-being-priced
  As of mid-2026 OpenAI is valued at roughly $852B and Anthropic at ~$965B (both have now filed S-1s), while xAI was last marked near $230B before Space...

Choice: c3 (confidence 0.28). Probabilities: c3 0.43, c1 0.34, none 0.23, c2 0.00, c4 0.00.

### OpenAI

Kept $852B. Choice selected c2, and the Noul on that snippet was 0.47, which is not above 0.8.

Model jev-1.13.0. 1639 input tokens, 130 output tokens.

Candidates code found:

- `c1` $122 billion → 122 billion USD · Noul 0.13 · https://ibinterviewquestions.com/blog/how-to-value-ai-companies-openai-anthropic
  ### What a funding round actually tells you It is tempting to treat the latest round as the answer: OpenAI raised about **$122 billion** at a roughly ...
- `c2` $852B → 852 billion USD · Noul 0.47 · https://valueaddvc.com/blog/ai-company-valuations-in-2025-how-the-top-ai-startups-are-being-priced
  As of mid-2026 OpenAI is valued at roughly $852B and Anthropic at ~$965B (both have now filed S-1s), while xAI was last marked near $230B before Space...
- `c3` $965B → 965 billion USD · Noul 0.06 · https://valueaddvc.com/blog/ai-company-valuations-in-2025-how-the-top-ai-startups-are-being-priced
  As of mid-2026 OpenAI is valued at roughly $852B and Anthropic at ~$965B (both have now filed S-1s), while xAI was last marked near $230B before Space...
- `c4` $230B → 230 billion USD · Noul 0.04 · https://valueaddvc.com/blog/ai-company-valuations-in-2025-how-the-top-ai-startups-are-being-priced
  As of mid-2026 OpenAI is valued at roughly $852B and Anthropic at ~$965B (both have now filed S-1s), while xAI was last marked near $230B before Space...

Choice: c2 (confidence 0.27). Probabilities: c2 0.42, none 0.31, c1 0.27, c4 0.00, c3 0.00.

### xAI

Kept $230B. Choice selected c3, and the Noul on that snippet was 0.41, which is not above 0.8.

Model jev-1.13.0. 1354 input tokens, 104 output tokens.

Candidates code found:

- `c1` $852B → 852 billion USD · Noul 0.05 · https://valueaddvc.com/blog/ai-company-valuations-in-2025-how-the-top-ai-startups-are-being-priced
  As of mid-2026 OpenAI is valued at roughly $852B and Anthropic at ~$965B (both have now filed S-1s), while xAI was last marked near $230B before Space...
- `c2` $965B → 965 billion USD · Noul 0.05 · https://valueaddvc.com/blog/ai-company-valuations-in-2025-how-the-top-ai-startups-are-being-priced
  As of mid-2026 OpenAI is valued at roughly $852B and Anthropic at ~$965B (both have now filed S-1s), while xAI was last marked near $230B before Space...
- `c3` $230B → 230 billion USD · Noul 0.41 · https://valueaddvc.com/blog/ai-company-valuations-in-2025-how-the-top-ai-startups-are-being-priced
  As of mid-2026 OpenAI is valued at roughly $852B and Anthropic at ~$965B (both have now filed S-1s), while xAI was last marked near $230B before Space...

Choice: c3 (confidence 0.84). Probabilities: c3 0.88, none 0.12, c1 0.00, c2 0.00.

### Databricks

Kept $134B. Choice selected c2, and the Noul on that snippet was 0.25, which is not above 0.8.

Model jev-1.13.0. 955 input tokens, 78 output tokens.

Candidates code found:

- `c1` $4 billion → 4 billion USD · Noul 0.05 · https://www.bloomberg.com/news/articles/2025-12-16/databricks-raising-funds-at-134-billion-valuation-wsj-reports
  Databricks is raising over $4 billion in a new funding round that values the software firm at $134 billion, another example of how some tech companies...
- `c2` $134 billion → 134 billion USD · Noul 0.25 · https://www.bloomberg.com/news/articles/2025-12-16/databricks-raising-funds-at-134-billion-valuation-wsj-reports
  Databricks is raising over $4 billion in a new funding round that values the software firm at $134 billion, another example of how some tech companies...

Choice: c2 (confidence 0.31). Probabilities: c2 0.54, none 0.45, c1 0.01.

### DeepSeek

Kept $74B. Choice selected none, so code did not copy an amount.

Model jev-1.13.0. 652 input tokens, 51 output tokens.

Candidates code found:

- `c1` $74 billion → 74 billion USD · Noul 0.12 · https://www.kucoin.com/news/flash/moonshot-ai-and-deepseek-lead-china-s-ai-valuation-surge-with-high-p-arr-multiples
  According to The Information and Bloomberg, citing sources familiar with the matter, DeepSeek is advancing its second funding round at a $74 billion v...

Choice: none (confidence 0.79). Probabilities: none 0.90, c1 0.10.

### Anduril

Kept $61B. Choice selected none, so code did not copy an amount.

Model jev-1.13.0. 710 input tokens, 51 output tokens.

Candidates code found:

- `c1` $100B → 100 billion USD · Noul 0.07 · https://techcrunch.com/2026/07/24/anduril-reportedly-in-talks-to-raise-funding-at-100b-valuation-more-than-3x-last-years-mark/
  # Anduril reportedly in talks to raise funding at $100B valuation, more than 3x last year’s mark 10:33 AM PDT · July 24, 2026 Defense tech company An...

Choice: none (confidence 0.93). Probabilities: none 0.97, c1 0.03.

### Z.ai (Zhipu)

Wrote $55.9B. Choice selected c2 and the Noul on that snippet was 0.89, above 0.8, so code copied the amount the regex had parsed.

Model jev-1.13.0. 1026 input tokens, 78 output tokens.

Candidates code found:

- `c1` $434.7 billion → 434.7 billion USD · Noul 0.50 · https://techcrunch.com/2026/05/07/chinas-moonshot-ai-raises-2b-at-20b-valuation-as-demand-for-open-source-ai-skyrockets/
  Zhipu AI, which trades in Hong Kong as Knowledge Atlas Technology, ended Thursday with a market cap of HK$434.7 billion (roughly $55.9 billion), while...
- `c2` $55.9 billion → 55.9 billion USD · Noul 0.89 · https://techcrunch.com/2026/05/07/chinas-moonshot-ai-raises-2b-at-20b-valuation-as-demand-for-open-source-ai-skyrockets/
  Zhipu AI, which trades in Hong Kong as Knowledge Atlas Technology, ended Thursday with a market cap of HK$434.7 billion (roughly $55.9 billion), while...

Choice: c2 (confidence 0.93). Probabilities: c2 0.95, c1 0.03, none 0.02.

### Moonshot AI

Wrote $35B. Choice selected c2 and the Noul on that snippet was 0.87, above 0.8, so code copied the amount the regex had parsed.

Model jev-1.13.0. 2058 input tokens, 156 output tokens.

Candidates code found:

- `c1` $3.5 billion → 3.5 billion USD · Noul 0.13 · https://dealroom.co/news/141770-moonshot-ai-hits-35b-valuation-on-3-5b-raise-eyes-50b-ahead-of-ipo/
  … China's Moonshot AI has raised $3.5 billion, securing a $35 billion valuation ... # Moonshot AI hits $35B valuation on $3.5B raise, eyes $50B ahead...
- `c2` $35 billion → 35 billion USD · Noul 0.87 · https://dealroom.co/news/141770-moonshot-ai-hits-35b-valuation-on-3-5b-raise-eyes-50b-ahead-of-ipo/
  … China's Moonshot AI has raised $3.5 billion, securing a $35 billion valuation ... # Moonshot AI hits $35B valuation on $3.5B raise, eyes $50B ahead...
- `c3` $35B → 35 billion USD · Noul 0.87 · https://dealroom.co/news/141770-moonshot-ai-hits-35b-valuation-on-3-5b-raise-eyes-50b-ahead-of-ipo/
  … China's Moonshot AI has raised $3.5 billion, securing a $35 billion valuation ... # Moonshot AI hits $35B valuation on $3.5B raise, eyes $50B ahead...
- `c4` $3.5B → 3.5 billion USD · Noul 0.09 · https://dealroom.co/news/141770-moonshot-ai-hits-35b-valuation-on-3-5b-raise-eyes-50b-ahead-of-ipo/
  … China's Moonshot AI has raised $3.5 billion, securing a $35 billion valuation ... # Moonshot AI hits $35B valuation on $3.5B raise, eyes $50B ahead...
- `c5` $50B → 50 billion USD · Noul 0.10 · https://dealroom.co/news/141770-moonshot-ai-hits-35b-valuation-on-3-5b-raise-eyes-50b-ahead-of-ipo/
  … China's Moonshot AI has raised $3.5 billion, securing a $35 billion valuation ... # Moonshot AI hits $35B valuation on $3.5B raise, eyes $50B ahead...

Choice: c2 (confidence 0.79). Probabilities: c2 0.83, c3 0.14, none 0.03, c4 0.00, c1 0.00, c5 0.00.

### MiniMax

Kept $4B. No cited amount named this company, so Jev was not asked.

