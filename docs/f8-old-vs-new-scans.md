# F8: old scan cards against the script pipeline (offline part)

Checked 2026-10-09. Read-only SELECTs on the khtz Postgres. No model calls, no cluster writes. The re-run of extract and judge is not done here.

## What is known about the old cards

Only PCVX has a record: `docs/comparison-log.md` has the old call (START position, small; company very strong, entry good, catalyst very strong). The F8 brief calls it WATCH, the log says START. I could not tell which is right.

No card text for EFXT or WULF exists in this repo, its history, or `~/Documents/ops-brain/moje/invest` and `projects/investing-platform`. The only mentions are in F7: EFXT after a 450 MW data-center contract, WULF after a power-capacity amendment. Action, band, ratings, triggers and filings cited by those two cards are unknown. I did not reconstruct them.

## What the pipeline holds

| | EFXT | PCVX | WULF |
|---|---|---|---|
| Old card | START, details not found | START (log) or WATCH (brief), 2026-10-06 | START, details not found |
| In `instruments` | no | yes (source discovery, added 2026-10-07) | no |
| `source_documents` | none | 28: 10-Q 1, Form 4 21, 8-K 4, 8-K EX-99.1 1 (2026-10-05), EX-99.2 1 | none |
| `collected_facts` | none | 4 keys: insider_net_buy_90d, latest_earnings_8k, price_move_5d, volume_ratio_20d | none |
| `scheduled_gates` | none | 2026-10-08 (extracted and judged) | none |
| `extraction_runs` | none | 2: 2026-10-06 and 2026-10-07, both ok | none |
| `trade_ideas` | none | none | none |
| `discovery_candidates` | none | none | none |
| `discovery_price_bars` | none | none | none |
| Daily score | none | Ignore, 8 (technical 6, fundamentals 0, macro 2) | none |

## Old against new

| | EFXT | PCVX | WULF |
|---|---|---|---|
| Same action | cannot compare, no new output | no: old START (or WATCH), new Ignore score 8, no idea card | cannot compare, no new output |
| Facts the scripts could not supply | unknown, the ticker is not collected at all | `productCatalyst` null in both extractions (the Phase 3 readout does not count in the prompt); revenue and EPS fields null (no revenue); the 424B5 financing filings are listed in `filing_watch` (2026-10-06 twice, 2026-10-08 twice) but stored as no document | unknown, same as EFXT |
| Tokens and cost | none recorded | extraction 2026-10-06: 9 in, 11,744 out, 19,780 cache creation, USD 0.0983 (claude-haiku-4-5). Extraction 2026-10-07: 2 in, 3,595 out, 2,844 cache read, 20,095 cache creation, USD 0.0058 (claude-haiku-5-5). No judge input for PCVX | none recorded |

The old card's tokens and cost are not recorded anywhere I could find, so there is no ratio to report. The judge runs are per day for all tickers, not per ticker, so a per-card judge cost does not exist.

## Why the pipeline cannot answer for EFXT and WULF today

Neither ticker is in `instruments`, so the collector, watch, gate, extract and judge steps never touch them. Discovery (F7) has produced no candidates yet; the first scheduled run is Saturday 2026-10-10, and the 2026-10-09 one-off returned none. Whether the weekly run would surface EFXT or WULF is unknown, and neither is in the discovery theme file as a rule-based hit I could verify.

## Unknown

- Old action, band, ratings, triggers and cited filings for EFXT and WULF.
- Whether the PCVX old action was START or WATCH.
- Old token and dollar cost for all three.
- What the extractor and judge would return for EFXT and WULF with full inputs.
- Whether the judge would change the PCVX picture; PCVX never reached a judge idea.
