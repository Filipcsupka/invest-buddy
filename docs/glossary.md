# Glossary, English to Slovak

One Slovak term per concept. Public text, alerts and the digest use these terms. `src/i18n/messages.test.ts` checks the state names, the retired terms and that no Slovak string is left in English. Native review is W23.

## Rule states

| English | Slovak | Note |
| --- | --- | --- |
| Conditions met | Podmienky splnené | Green step. "Buy zone" / "Zóna nákupu" only with `ADVICE_OUTPUT` on. |
| Watching | Sledovanie | |
| Waiting | Čakanie | |
| Not now | Mimo výberu | |
| Criteria broken | Kritériá porušené | Never "Porušené kritériá". |
| Not enough data | Nedostatok údajov | Gray, off the scale. |
| Pullback in uptrend | Pokles v rastovom trende | |

## Score and rules

| English | Slovak | Note |
| --- | --- | --- |
| score | skóre | |
| points | body | "z 25" for "of 25". |
| rule, rejection rule | pravidlo, vylučovacie pravidlo | |
| Met / Not met | Splnené / Nesplnené | |
| No data | Bez údajov | A rule without data is left out, never 0. |
| coverage | údaje pre X z 25 bodov | |
| confirmations | potvrdenia | Context only. |
| methodology | metodika | |
| unknown | neznáme | |

## Data and sources

| English | Slovak | Note |
| --- | --- | --- |
| data | údaje | Never "dáta" or "dátový". "dátum" (date) stays. |
| sample data | ukážkové údaje | |
| price data | cenové údaje | |
| macro data | makro údaje | |
| data source | zdroj údajov | |
| benchmark | porovnávací index | SPY is the "porovnávací index SPY". |
| screening universe | zoznam sledovaných akcií | |
| earnings release | výsledková správa | Same in judge evidence labels. |
| SEC filing | podanie SEC | |
| one reading (model) | jedno čítanie (model) | |
| two independent sources agree | dva nezávislé zdroje sa zhodujú | |
| discovered stock | objavená akcia | |
| ticker | ticker | Kept as a loanword. |

## Track record and portfolio

| English | Slovak | Note |
| --- | --- | --- |
| track record | história záznamov | |
| snapshot | snímka | |
| time-weighted return | časovo vážený výnos | |
| since start | od začiatku | |
| owner's portfolio | portfólio prevádzkovateľa | |

## Words that stay English

InvestBuddy, SPY, SEC, Form 4, FRED, VIX, MA50, MA200, EPS, TWR, XBRL, SaaS, Fintech, ticker, insider.

## Wording gate

Action wording (Prikúpiť, Znížiť, Otvoriť pozíciu and the size tiers) shows only with `ADVICE_OUTPUT` on. See `docs/wording-gate.md`.
