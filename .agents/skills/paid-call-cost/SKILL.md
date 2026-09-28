---
name: paid-call-cost
description: >
  Use when adding or changing a paid model call, web search, or other
  metered API.
---

# Paid call cost

Tool results are counted again on the next step of the same call.

- Count calls per run, including retries, and whether a failed call is still billed.
- Keep the provider usage fields (tokens, search counts). Do not drop them.
- Cap tool loops. Prefer a tool mode that trims fetched pages before they are billed again as input.
- Skip the model when a direct HTTP source can return the same fact.
- Do not rerun a paid fetch on a series that is not moving.
- Estimate dollars before merge, and say what was not measured.
