This file stays in this repo. It is not part of the shared skill.

In September 2026 a nightly refresh cost about $1.85. The prompts were a few tenths of a cent. Almost all of the rest was web search: result pages were loaded into the call and counted again on each later search. The handler kept the reply text and dropped the provider usage object, so that split is a reconciliation, not a meter reading. The $1.85 figure is the owner's report. It is not stored in the repo.

Each check exists because of that run:

- Count calls, including retries, and whether a failure is still billed. On 2026-09-21 the markets reply had no JSON, and the retry ran a second full search. Both attempts were billed. An empty-credit rejection is not a completed generation. A reply that already spent the search is.
- Keep provider usage fields. No stored run has input tokens, output tokens, or search counts, because the usage object was dropped.
- Cap tool loops, and trim pages before they are billed again. The old tool was `web_search_20250305` with no `max_uses`, so result pages were rebilled on every later search in the same call. The current tool is `web_search_20260318`, which filters pages before they reach the model. Caps are 12 on valuations and 5 on models, users, share, capital, and energy.
- Skip the model when direct HTTP can return the same fact. Markets closes come from Yahoo, not a model.
- Do not rerun a paid fetch on a series that is not moving. Web-share last changed on 2026-09-10 and was still searched every night after the percentages stopped moving. It is skipped unless the last successful check is at least 7 UTC days old.
- Estimate dollars before merge, and say what was not measured. Search counts, result-page tokens, and the console line behind the $1.85 were not measured.

Identifiers to keep: `web_search_20250305` with no `max_uses`; `web_search_20260318`; caps 12 on valuations and 5 on models, users, share, capital, and energy; markets closes from Yahoo, not a model; web-share skipped unless the last successful check is at least 7 UTC days old.
