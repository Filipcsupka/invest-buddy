# ADR-006: signal alignment (C5 decisions)

Date: 2026-10-14. Status: partly decided. Public output stays informational screening under ADR-001.

The C5 review compared `src/engine/signals.ts` with `InvestingGuide.md` and listed six decisions, called D1 to D6 here. They are not the lane DATA tasks of the same name. This record lists each one with what the docs and the vault already say. A decision with no owner answer on file is open. Nothing below is a new decision.

## Decisions

| # | Question | Options | State | Source |
| --- | --- | --- | --- | --- |
| D1 | Score needed for START | 18 (Guide section 6) or lower | In code at 18 since PR #80; owner sign-off not on file | `docs/tasks-open.md` section J (#80); `docs/roadmap/lane-engine.md` EN3 |
| D2 | Score needed for ADD | 15 (Guide section 8) or 18 (PR #80 first applied 18) | In code at 15; owner sign-off not on file | `docs/roadmap/README.md` owner decision 5 default; `docs/tasks-open.md` section J |
| D3 | Count `data_rule` and `verified_single` in signals | count both, or drop both from the score | Done in code (EN4, #177); owner sign-off not on file | `docs/roadmap/board.md`; `docs/data.md` single-extractor rule |
| D4 | Retire the private point tables | derive ratings from the Guide score, or keep both | Done in code (EN5, #177); owner sign-off not on file | `docs/roadmap/board.md` |
| D5 | Sizing: Guide EUR bands or the draft `allocation-config.ts`, and EUR bands against percent of cash | Guide bands (initial 20 to 40, add 20 to 50, from EUR 200 a month) or draft values | Open | `docs/roadmap/lane-engine.md` EN10 |
| D6 | Deep add and breakout retest as ADD triggers | build both, one, or none | Deep add: removed, owner decision 2026-10-14 (PM3), no source supports averaging down. Retest: open | `docs/roadmap/lane-engine.md` EN7, EN8 |

## Decided by the owner

- 2026-10-14, EN47: the Setup threshold stays at 72% of the 23 core points. The 78.3% proposal is not adopted.
- 2026-10-14, PM3: no DEEP_ADD action and no take-profit rule. Guide rule 3 stays unimplemented on purpose.

## Still open

- Public output never shows START or ADD wording or amounts; owner mode only (EN48 design). No recorded owner decision found, so it stays open.
- Owner sign-off on D1 to D4. The code already follows the defaults above, so a "no" means a rule change and a golden refresh.
- D5, the sizing values, plus the IBKR fee and minimum order (draft EUR 0.35, unverified).
- D6 retest: whether it triggers an owner-mode ADD, and the lookback and tolerance values.
- `EPS_BEAT_MIN_SURPRISE_PCT`: keep 0 or use 2 (C5c).
- Pre-revenue profile (EN43): not decided.
- Wording of the 7 October START for AMD in the track record, from the 18-point rule: not decided.

## Effect on code

Any change to D1 to D4 bumps `SIGNAL_RULES.version` or `SCORE_RULES_VERSION` and refreshes the golden fixtures in `src/engine/fixtures` in the same PR.
