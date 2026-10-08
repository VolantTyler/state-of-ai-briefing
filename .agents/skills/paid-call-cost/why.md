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

On 2026-10-02 two overlapping refreshes billed Sonnet again because web-search results are fed back as input and a `pause_turn` continuation re-sends that context. Recorded pieces: run 1 capital $0.60, energy $0.48, users $0.75 (5 searches each); run 2 models $0.43, capital $1.44 and users $1.54 with `pause_turn`. The second run then failed writing `usage.json` with GitHub 422 "sha wasn't supplied". Valuations and models on run 1 were aborted at the 240s budget before their usage was read. Caps are now 8 on valuations, 2 on models, share, and energy, and 3 on users and capital. Simple panels default to `claude-haiku-4-5-20251001`, which can call `web_search_20260318` only with `allowed_callers: ["direct"]` because Haiku 4.5 does not support dynamic filtering. There is no tool parameter that truncates a result page. `response_inclusion: "excluded"` drops completed dynamic-filtering result blocks from the response; it does not shrink what a direct call loads. A refresh refuses to start while `dev/refresh-lock.json` is held, and `REFRESH_MAX_USD` (default 1) stops later Claude calls.

The 2026-10-02 21:00Z run logged $0.233631 on Haiku (123k input, 10 searches) and then aborted valuations unread after 198s, so that Sonnet bill was not in the $0.23. A full run no longer starts valuations. The solo call uses `max_uses` 4 and `max_tokens` 4000. A reply with no JSON gets one extra Haiku call with no web search, logged as continuation `reformat`, instead of another search. An aborted non-streaming call stores duration and `likelyBilled` rather than a measured $0, because the Messages API returns `usage` only on the completed body.

On 2026-10-08 the models panel stopped calling Haiku when the public
Artificial Analysis pages can be read. Those two GETs are not metered.
Haiku search remains the fallback, with the same `max_uses` 2, and was
not repriced. The success path was not measured as a dollar figure
because it makes no Anthropic call.

On 2026-10-06 the valuations job (claude-sonnet-4-6, `web_search_20260318` with the default dynamic-filtering caller) spent about $0.59 (166k input, 3.6k output, 4 searches) and returned text with no citation blocks. Valuations now sets `allowed_callers: ["direct"]` and still leaves `response_inclusion` unset, so result pages are loaded as input. `max_uses` stays 4. The extra input tokens versus dynamic filtering were not measured. A direct `pause_turn` continuation still re-sends those pages; the cap is still one continuation.
