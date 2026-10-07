# Comparison with the old automation

Decision on 2026-10-07: keep the rules and prompts as they are for now. For a period the new system runs next to the old automation, and the two are compared. After that the owner decides whether the strategy or the rules change. Nothing here changes scoring.

How to use this file: when the old automation names a ticker as a buy or a watch, add a row with the date, the old call, and what the new system showed on the same day (state, score, idea, and the reason if they differ). Review the table after a few weeks. Count where the old call was right, where the new system was right, and why they differ.

The old automation sizes trades for the owner's own money (EUR 200 a month). Differences in amounts are not compared. Only the ticker, the direction and the reason.

## Entries

| Date | Ticker | Old automation | New system (same day) | Why they differ |
|---|---|---|---|---|
| 2026-10-06 | PCVX | START position, small. Phase 3 success the day before, then a drop on a financing of about 1 billion dollars. Setup rated company very strong, entry good, catalyst very strong. | Not in the original 35, added by hand on 2026-10-07. State Ignore, score 8 (technical 6, fundamentals 0, macro 2). No idea card. | 1) Catalyst rule did not fire: the extractor prompt counts launches, customer wins, partnerships and approvals, not clinical readouts, so `productCatalyst` was null although the 8-K and press release are stored. 2) PCVX has no revenue, so the revenue and EPS rules cannot give points, and the maximum reachable score is about 12, below Setup at 18. 3) The 424B5 prospectus (the financing) is not collected. 4) Entry rule needs a 5 to 10 percent dip in an uptrend; PCVX fell 26.5 percent from its 20-day high. |

## Known structural differences to keep in mind

- The old automation judges by reading news and filings and writing an opinion. The new system scores fixed rules and shows the evidence for each rule.
- The new rules come from `InvestingGuide.md` and suit growth companies with revenue. Pre-revenue biotech has no path to a high score (open question B in the PCVX discussion, not yet a task).
- The new system watches 36 tickers plus what weekly discovery finds. The old one can name any ticker.
- The new system uses data from SEC filings, FRED and prices. News wires are not a source it shows.

## Open for the later decision

- Add a profile for pre-revenue companies (catalyst, cash runway from XBRL, financing events).
- Add clinical and regulatory milestones to the catalyst definition.
- Collect 424B5 prospectuses.
- Whether Setup at 18 points is the right threshold at all (placeholders C5 and F6).
