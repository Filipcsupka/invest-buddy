# Lane STATUS: one clear status per ticker, on the web and in Telegram

Added 2026-10-11 from the owner's request. Goal: a reader sees a ticker's status in two seconds, without reading the sources, and trusts it. The same status appears on the company page, the dashboard and in Telegram.

## Decisions (owner, 2026-10-11)

1. The engine and the 25-point rules stay as published (Guide s6 and s8). This lane changes how the result is shown, and how missing data is shown. It does not change thresholds.
2. A rule with no data is "no data", never "0 points". The page and Telegram show how much of the 25 points had data.
3. Status is a five-step slider. The six existing states map to it:

| State key | Points | Band and color | EN label (flag off) | SK label (flag off) |
| --- | --- | --- | --- | --- |
| broken | any, criteria failed | red | Criteria broken | Kritériá porušené |
| ignore | 0 to 11 | orange | Not now | Mimo výberu |
| wait | 12 to 14 | yellow | Waiting | Čakanie |
| watch | 15 to 17 | blue | Watching | Sledovanie |
| setup | 18 to 25 | green | Conditions met | Podmienky splnené |
| insufficient | not enough data | gray | Not enough data | Nedostatok údajov |

4. Extra confirmations are chips next to the slider: insider net buying (Form 4), EPS beat, guidance raised, product catalyst, volume confirmation. They explain the score. They do not change the band.
5. Wording gate: with `ADVICE_OUTPUT` off the green label is "Conditions met". Only with the flag on may it say "Buy zone" or "Zóna nákupu". Telegram follows the same flag. ADR-001 and the lawyer question (tasks-open G5) still apply.
6. Telegram has two alert types: an event alert when a ticker enters or leaves a band, and a weekly summary of what is watched. Both link to the web.

## Message format (Telegram, HTML parse mode)

Event alert, one message per ticker:

```
🟢 <b>NVDA</b> · Podmienky splnené
🔴🟠🟡🔵🟢  position marker under the active step
Bolo: 🔵 Sledovanie (16) → Teraz: 🟢 (18 / 25)
Potvrdenia: ✓ Rast tržieb ✓ EPS ✓ Insideri (Form 4)
Údaje: 23 z 25 bodov má overené zdroje
<a href="…/sk/company/NVDA">Otvoriť NVDA</a> · <a href="…/sk/methodology">Metodika</a>
Informačný skríning podľa zverejnenej metodiky, nie osobné odporúčanie.
```

Weekly summary: counts per band, tickers in green and blue as links, who moved up or down since last week, link to the dashboard. English and Slovak, same locale rule as the digest (`DIGEST_LOCALE`).

## Tasks

| ID | Task | Owner files | Depends on |
| --- | --- | --- | --- |
| ST0 | Design spec: slider, chips, coverage line, dashboard rows, methodology legend, accessibility (not color only), Telegram mockups. Reads the competitor notes in the vault (Danelfin, Stockopedia, Seeking Alpha, TipRanks, Simply Wall St) and says what is borrowed. Output `docs/design/status-slider.md`. | docs only | none |
| ST1 | `src/engine/status.ts`: pure function from state, points and rule hits to `StatusView` (band, position 0 to 4, color token, label keys, confirmations, coverage with known and unknown rules). Tests for every state and for missing data. | `src/engine/status.ts`, test | none |
| AL1 | Telegram formatter `src/notify/format.ts` (HTML, links, band emoji, escaping) and the event alert in `src/jobs/digest.ts`, one message per ticker that changed band, SK and EN, flag-aware wording. Keeps the delivery log so a rerun never double-posts. | `src/notify/*`, `src/jobs/digest.ts` | none (uses the table above) |
| ST2 | Slider component and the company page header: marker, chips, coverage line, "no data" rows, EN and SK. | new component, company page | ST0, ST1 |
| ST3 | Dashboard and scanner rows use the band; methodology legend; home text. | scanner table, method page | ST1, ST2 |
| AL2 | Weekly summary job and a suspended CronJob in the GitOps mirror. | new job, cronjob manifest | AL1 |
| ST5 | Make the catalyst rule fillable without the model where the filing text allows (8-K items 1.01, 2.02, 7.01, 8.01 with product keywords), behind an owner decision. Not started. | engine, bundle | owner |
