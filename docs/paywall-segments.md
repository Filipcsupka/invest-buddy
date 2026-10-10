# Possible paywall segments

Decision on 2026-10-08: the markers identify sections that could become subscriber content when marketing starts. They do not check a subscription or change page copy. The separate `ADVICE_OUTPUT` legal gate hides the sizing page and action wording while it is off.

| Segment id | Page | What it shows | Status | Legal gate | Why |
| --- | --- | --- | --- | --- | --- |
| None | Landing `/` | Product introduction, sample company sheet, method and record links | Free | None | Shows what the screen does before signup. |
| None | Methodology, legal pages | Published rules, limitations, privacy and terms | Free | None | Readers need the rules and legal text to interpret any score. |
| None | Dashboard `/dashboard` and scanner redirect | Ticker list, score, state, search and filters | Free | None | The basic screen is the entry point. `/scanner` redirects here. |
| None | Company `/company/[ticker]` | Name, sector, current score and state | Free | None | A reader can inspect the basic screening result. |
| `idea-card` | Company | Action, size tier, rationale, setup, plan and evidence | Candidate | `ADVICE_OUTPUT` | The full card appears only when legal review permits advice-like wording. With the flag off, it shows the rule state and evidence. The ideas page also requires `IDEAS_PAGE`. |
| `portfolio-performance` | Portfolio | Indexed return, benchmark chart and performance figures | Candidate | None | Detailed portfolio performance has value beyond the basic screen. |
| `portfolio-weights` | Portfolio | Position weights | Candidate | None | Shows portfolio composition. |
| `track-record-signals` | Track record | Dated signals and 30, 90 and 180 day returns | Candidate | None | Detailed outcome history supports deeper evaluation. |
| `track-record-history` | Track record | Historical score snapshots and ticker details | Candidate | None | Gives access to prior screens. |
| `track-record-benchmark` | Track record, fixture mode | Sample benchmark chart | Candidate | None | Keeps the fixture example with the detailed record section. |
| `sizing-matrix` | Sizing | Tier percentages by account size | Candidate | `ADVICE_OUTPUT` | Detailed application of the published method. |
| `sizing-cash` | Sizing | Cash band rules | Candidate | `ADVICE_OUTPUT` | Part of the detailed sizing guide. |
| `sizing-add` | Sizing | Add and reduce rules | Candidate | `ADVICE_OUTPUT` | Part of the detailed sizing guide. |
| `sizing-example` | Sizing | Worked example | Candidate | `ADVICE_OUTPUT` | Part of the detailed sizing guide. |
| `owner-cash` | Owner allocation | Private cash, reserve and carry amounts | Candidate | None | Owner only data, already protected by the owner view flag. |
| `owner-suggestions` | Owner allocation | Private allocation suggestions and amounts | Candidate | None | Owner only decisions and amounts, protected by the owner view flag. |
| None | Discovery candidates | No dedicated results page exists yet | Future candidate | None | Mark candidate details when that page is built; keep the basic dashboard state free. |
| None | History export | No export control exists yet | Future candidate | None | Mark the export control when it is built. |

The company page writer owns the company markers. The `idea` section uses `idea-card`. Recommended further sections are `chart` (price and moving average history), `rules` (rule hits, points and evidence), and `inputs` (full input breakdown and sources). The `rejection` section can stay free with the current state; it explains a basic screening result. Register further IDs and add their markers together.

ADR-001 limits public output to informational screening. A later paywall must not turn the wording into personal investment advice or expose owner EUR amounts. The current `IDEAS_PAGE` and owner view flags retain their existing access rules.

Later implementation: make `PaywallSegment` the single place that checks subscription access when `PAYWALL=on`. With that flag absent, it must keep rendering its children as it does now. Keep a free explanation and route to subscription outside hidden sections, and test both flag states before launch. No subscription check is active now.
