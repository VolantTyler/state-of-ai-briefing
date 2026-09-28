---
name: paid-call-cost
description: >
  Use when adding or changing a paid model call, web search, or other
  metered API in this project.
---

# Paid call cost

- Count calls per run, including retries, and whether a failed call is still billed. Markets on 2026-09-21 retried a full search after `no JSON in reply`; both attempts were billed.
- Keep the provider usage fields (tokens, search counts). Do not drop them. The refresh handler kept `content` and dropped Anthropic's `usage` object.
- Cap tool loops. Prefer the tool version that filters pages before they reach the model. `web_search_20250305` had no `max_uses`, and result pages were billed again on every later search in the same call.
- Skip the model when a direct HTTP source can return the same fact. Stock closes did not need a model.
- Do not rerun a paid fetch on a series that is not moving. Web-share was re-run nightly after it stopped changing (`changedAt` 2026-09-10).
- Estimate dollars before merge, and say what was not measured. The ~$1.85 night was a reconciliation: no stored run had `input_tokens` or `web_search_requests`.
