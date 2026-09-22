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

No refresh has written this file yet.

