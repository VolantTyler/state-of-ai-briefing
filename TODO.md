# TODO

Open questions and deferred work for the briefing. One heading per item, with
enough context to pick it up cold.

---

## Commentary prose is never refreshed, and drifts silently

**Status:** open · raised 2026-09-10

§02 carried "Nvidia reports Q2 FY27 after the close today" in both the ticker
note (`BASELINE.stocks`) and the §02 commentary. It was written on 2026-09-07
and was still on the live site on 2026-09-10, three days after the "today" it
referred to.

Both strings are now pinned to `2026-09-07`, which ages visibly instead of
lying. Two things remain.

**1 — Fill in the actual print.** The commentary states consensus (~$92B) and
the expected 8–12% swing, and now says outright that the result is not
reflected. Someone has to look up what Nvidia actually reported and rewrite
that sentence, along with the ticker note.

**2 — The structural problem, which is the real item.** `JOBS.markets.apply`
writes `s.price` and nothing else. No refresh job touches any `note` or any
`<Commentary>` block, so every panel can honestly report `Refreshed 2 hours
ago` beside prose frozen at whenever a human last edited it. The freshness
stamps vouch for the numbers only, and nothing says so.

Three ways out, roughly in increasing order of ambition:

- *Convention.* Never put relative time in static prose — no "today",
  "yesterday", "this week". Absolute dates age visibly. Cheapest, and worth
  adopting regardless of what else happens.
- *Make staleness visible.* Give commentary its own `writtenAt` date, rendered
  in the panel, so a reader can see that the prose and the numbers have
  different ages. Honest, and small.
- *Make it refreshable.* Extend the jobs to rewrite one-line notes, which
  means the model is generating prose that ships unreviewed. Powerful and
  considerably riskier; probably wants the `writtenAt` step first.

**Related, lower severity.** These drift gradually rather than going false
overnight, but they are all frozen prose that reads as current:

| Where | Text |
|---|---|
| `App.jsx:723` | "went public in June and now trades around a $1.87T market cap" — also covered by the SpaceX/xAI item below |
| `App.jsx:866` | "A year ago this was one big circle: ChatGPT held ~79%" |
| `App.jsx:962` | "up from under 2% a year ago, and now above 45% within a few months" |
| `App.jsx:981` | "up from 45% just weeks ago" — also covered by the §07 token-share item below |

`briefing-data.js:200` also says "currently shut", but that string is inside a
refresh *prompt* and is evaluated fresh on every run. Correct as written.

---

## Reconcile §07's China token share (60%) against current reporting (~45%)

**Status:** open · raised 2026-09-07

`BASELINE.china.tokenShare` is `60`, carried since the v2.1 refresh on
2026-08-26 and sourced from the OpenRouter coverage linked in `SRC.china`.
Current reporting puts Chinese-origin models at **~45–46%** of OpenRouter
token volume, not 60%.

**Why this wasn't just overwritten.** The two figures may not be measuring the
same thing, and the difference is large enough that guessing would be worse
than leaving it flagged:

- *Population* — all OpenRouter traffic vs. US-enterprise traffic only. The
  46% figure is quoted in at least one source as a weekly peak for **US
  enterprise** token volume specifically.
- *Denominator* — share of Chinese-origin models vs. the inverse framing of
  "US models fell from 70% to 30%", which implies a ~70% non-US remainder that
  includes non-Chinese open-weight models.
- *Window* — weekly peak vs. trailing average vs. spot reading.

The §07 commentary also leans on the 60% number in prose, so whichever figure
wins, the surrounding sentence needs editing too — not just the constant.

**To resolve:**

1. Pull the primary series from OpenRouter's own rankings/state-of-AI page
   rather than secondary coverage, and write down the exact population and
   window it measures.
2. Decide which framing the briefing wants — global all-traffic share is the
   most defensible for a general-audience panel — and state it in the panel
   label so the number is self-describing.
3. Update `BASELINE.china.tokenShare`, the §07 commentary, and `SRC.china`
   together.
4. Consider making `china` a refresh job in `JOBS`. It is currently the only
   panel with no nightly job, which is exactly why it drifted this far without
   anyone noticing.

---

## Candidate panels not yet built

**Status:** open · raised 2026-09-07

Researched during the v2.4 model-capability update and deliberately left out
of that change. Each would be a new section, not an edit to an existing one.

- **IPO watch.** Anthropic filed confidentially on 2026-06-01, prospectus
  expected late September, October listing at a reported $2T target — which
  would be the largest IPO ever. OpenAI has also filed confidentially. §01
  charts *private* marks, so a public listing partly invalidates that framing
  and probably deserves its own panel rather than a footnote.
- **Consolidation / M&A.** Nvidia is acquiring Hugging Face for ~$13B
  (announced 2026-09-03, expected to close H1 2027), its second-largest
  purchase after $20B for Groq assets.
- **Custom silicon.** OpenAI's Jalapeño inference chip with Broadcom, with
  SemiAnalysis-validated 1.5–1.9× throughput-per-watt gains over GB200/GB300.
  Relevant to §02 and §06, which currently treat Nvidia as the sole axis.
- **Regulation.** There is no regulatory section at all. California SB 1047
  cleared both chambers in late August with a 2026-09-30 signature deadline.

---

## Verify the SpaceX/xAI market cap in §01 commentary

**Status:** open · raised 2026-09-07

The §01 analyst note says SpaceX "now trades around a $1.87T market cap" after
the June IPO. A source encountered during the v2.4 research put the SpaceX IPO
at $1.77T, and another put the post-merger combined entity at $1.25T. Three
numbers, no clear primary source among them. The prose is load-bearing — it is
the justification for why xAI's $250B standalone mark is stale — so it should
be pinned to a real quote before the next edition.
