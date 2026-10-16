# Public wording gate

`ADVICE_OUTPUT` defaults to `off`. Turning it on requires the lawyer's review of action labels, position tiers, plans and the sizing guide. Rule states remain visible while it is off. They describe published screening rules and do not name a trade.

## Action wording held by `ADVICE_OUTPUT`

| Surface | English strings | Slovak strings | When off |
| --- | --- | --- | --- |
| Company and idea cards, `ideas.actions` | “Start position”, “Add”, “High-conviction add”, “Reduce” | “Otvoriť pozíciu”, “Prikúpiť”, “Výrazne prikúpiť”, “Znížiť” | The card shows the ticker, rule state on the company page, and evidence sources. |
| Card size tiers, `ideas.tiers` and `ideas.tiersShort` | “Add about 1/3 of a full position”, “Add about 1/2 of a full position”, “Add 1/3”, “Add 1/2” | “Prikúpiť asi 1/3 plnej pozície”, “Prikúpiť asi 1/2 plnej pozície”, “Prikúpiť 1/3”, “Prikúpiť 1/2” | All tiers are absent. |
| Card plan, `ideas.trigger` and stored plan text | “Add or upgrade trigger”, plus stored trigger, invalidation and opportunity cost | Translated plan text, with English fallback | The plan, verdict, ratings and model text are absent. |
| Ideas list | The same card strings | The same card strings | `/ideas` returns 404, including when `IDEAS_PAGE` is on or fixture data is selected. |
| Sizing metadata and page, `meta.sizingDescription` and `sizing.*` | “add rules”, “Add rows”, “Add one third of full”, “Add one half of full”, “Before an add”, “At most one add per month”, “ADD signal”, “Never add past the cap”, “REDUCE signal” | “Riadky prikúpenia”, “Prikúpenie tretiny plnej”, “Prikúpenie polovice plnej”, “Pred prikúpením”, “Najviac jedno prikúpenie za mesiac”, “Prikúpiť”, “Nikdy neprikupujte nad limit”, “Signál na zníženie pozície”, “Prikúpenie tretiny plnej pozície” | `/sizing` returns 404. Navigation and sitemap omit it. |
| Track record tiers, `trackRecord.signalTiers` | “Add 1/3”, “Add 1/2” | “Prikúpiť 1/3”, “Prikúpiť 1/2” | Score rows show the rule state. Judge rows say “Recorded rule event” or “Zaznamenaná udalosť pravidiel”. |

Public cards never show the stored EUR amount, even when `ADVICE_OUTPUT` is on. The amount belongs to the owner's private workflow under ADR-001.

## Wording that stays visible with the flag off

- Home: “Nine core rules make the public percentage” describes the method. “no position sizes, price targets or personal trade instructions” and “ani cieľové ceny ani osobné pokyny k obchodom” state the product limit.
- Disclaimer: `common.disclaimer` reads “Informational screening only. Same rules for every visitor. No personal investment advice.” and in Slovak “Iba informačný prehľad podľa pravidiel. Rovnaké pravidlá pre každého návštevníka. Nejde o osobné investičné poradenstvo.” Share images use the shorter `common.ogDisclaimer`: “Informational screening only. No personal investment advice.” The pricing page repeats the same ADR-001 line and says that both tiers show the same rules and scores.
- Track record window: forward returns and the beat rate use 20 trading days (`trackRecord.hitRate`, `trackRecord.periodNote`).
- Track record: “measured buy signals”, “buy signals, too few to conclude”, “Podiel nákupných signálov” and “Počet nákupných signálov” describe historical counts, not an action for the reader. “Start at zero”, “since start” and “SPY since start” refer to chart time.
- Company and dashboard: “Nákupy insiderov alebo inštitúcií” describes source data. “Bez signálu na ďalší nákup” states that no purchase signal exists. “Znížený výhľad” and related rejection text describe guidance changes.
- Owner allocation: `ownerAllocation.*` contains add, buy and reduce terms in both locales. It remains behind `OWNER_VIEW`; it is not a public route while that flag is off.
- The daily digest and Telegram post use localized rule states only. Future email templates must follow the same rule while `ADVICE_OUTPUT` is off.

Before enabling the flag, check the English and Slovak company card, ideas list, sizing page, track record and alert templates with the lawyer. Rule state labels are still visible with the flag off; a legal objection to those labels requires a separate product decision.

## Exact EN/SK string inventory

Each row quotes one current dictionary string containing buy, add, start, reduce or a Slovak equivalent. “Hidden” means `ADVICE_OUTPUT` must be on. “Owner” means the private `OWNER_VIEW` route holds the text. “Visible” describes facts, history, a disclaimer or time. Stored judge text is not a fixed dictionary string; the card hides it when the flag is off.

| Key | Off state | Exact string |
| --- | --- | --- |
| `en.meta.sizingDescription` | Hidden | Illustrative position percentages by account and cash range, with per-name limits and add rules. |
| `en.home.buildBody` | Visible | Nine core rules make the public percentage. Each checks collected data you can inspect on the company page. Ad hoc catalyst evidence is shown separately. A rejection rule overrides the percentage. |
| `en.home.leavesOutBody` | Visible | Every visitor sees the same result. There are no position sizes, price targets or personal trade instructions. A score says which published conditions a stock meets today, and it knows nothing about your money or your goals. |
| `en.trackRecord.hitRate` | Visible | 20-trading-day SPY beat rate: {rate} across {n} measured buy signals. |
| `en.trackRecord.smallSample` | Visible | {n} buy signals, too few to conclude. |
| `en.trackRecord.signalTiers.STARTER` | Hidden | Starter |
| `en.trackRecord.signalTiers.ADD_THIRD` | Hidden | Add 1/3 |
| `en.trackRecord.signalTiers.ADD_HALF` | Hidden | Add 1/2 |
| `en.portfolio.liveChartNote` | Visible | Both lines start at zero on the first date. The portfolio line chains daily returns net of deposits (time-weighted return). SPY uses the last close on or before each date. |
| `en.portfolio.twrSince` | Visible | Time-weighted return since start |
| `en.portfolio.kpiCurrent` | Visible | Return since start |
| `en.portfolio.chartAria` | Visible | Portfolio and SPY, change in percent since the first date, zero is the starting value |
| `en.portfolio.benchmarkSince` | Visible | SPY since start |
| `en.methodology.scoreBody` | Visible | Nine core rules use data collected at least quarterly. The percentage divides points met by points with data among those rules. A core rule without data is omitted and the page shows how many core rules have data. Ad hoc catalyst findings appear separately as a bonus and never change the percentage or displayed band. |
| `en.errors.notFoundBody` | Visible | The address may be mistyped, or the ticker is not in the sample universe. |
| `en.errors.notFoundBodyLive` | Visible | The address may be mistyped, or the ticker is not in the screening universe. |
| `en.ideas.tiers.STARTER` | Hidden | Starter, about 1/3 of a full position |
| `en.ideas.tiers.ADD_THIRD` | Hidden | Add about 1/3 of a full position |
| `en.ideas.tiers.ADD_HALF` | Hidden | Add about 1/2 of a full position |
| `en.ideas.tiersShort.STARTER` | Hidden | Starter |
| `en.ideas.tiersShort.ADD_THIRD` | Hidden | Add 1/3 |
| `en.ideas.tiersShort.ADD_HALF` | Hidden | Add 1/2 |
| `en.ideas.actions.START_POSITION` | Hidden | Start position |
| `en.ideas.actions.ADD` | Hidden | Add |
| `en.ideas.actions.HIGH_CONVICTION_ADD` | Hidden | High-conviction add |
| `en.ideas.actions.REDUCE` | Hidden | Reduce |
| `en.ideas.trigger` | Hidden | Add or upgrade trigger |
| `en.sizing.matrixNote` | Hidden | The table uses 10% to 30% cash. Percentages refer to the total portfolio, not the cash balance. Add rows show an increase to an existing position. |
| `en.sizing.starter` | Hidden | Starter |
| `en.sizing.addThird` | Hidden | Add one third of full |
| `en.sizing.addHalf` | Hidden | Add one half of full |
| `en.sizing.addTitle` | Hidden | Before an add |
| `en.sizing.addRule` | Hidden | At most one add per month, and only on an ADD signal. Leave room below the cap; if price drift has already put the name at or above it, wait. Never add past the cap. |
| `en.sizing.reduceRule` | Hidden | A REDUCE signal points back toward the standard size or the cap. It does not set a transaction amount. |
| `en.sizing.example` | Hidden | For an illustrative EUR 20,000 portfolio with 20% cash, a STARTER tier is 2% of the total portfolio, or EUR 400. The per-name cap is 8%, or EUR 1,600. An ADD_THIRD tier is another 2 percentage points before checking the current holding against that cap. |
| `en.ownerAllocation.reserve` | Owner | Held for adds |
| `en.ownerAllocation.monthlyMissing` | Owner | The monthly contribution is missing, so the add reserve and cash-drag note cannot be calculated. |
| `en.ownerAllocation.historyNote` | Owner | The Flex baseline does not record executed add dates. Adds wait until this month's trade history is confirmed. |
| `en.ownerAllocation.tiers.STARTER` | Owner | Starter |
| `en.ownerAllocation.tiers.ADD_THIRD` | Owner | Add |
| `en.ownerAllocation.tiers.ADD_HALF` | Owner | High-conviction add |
| `en.ownerAllocation.reasons.TIER_AMOUNT` | Owner | Tier share of starting free cash. |
| `en.ownerAllocation.reasons.ORDER_CEILING` | Owner | The order ceiling reduced the tier amount. |
| `en.ownerAllocation.reasons.CASH_LIMIT` | Owner | Remaining cash limited this add. |
| `en.ownerAllocation.reasons.ADD_ALREADY_THIS_MONTH` | Owner | An add is already recorded for this ticker this month. |
| `en.ownerAllocation.reasons.ADD_HISTORY_UNKNOWN` | Owner | Executed add history is unavailable; confirm it before assigning money. |
| `sk.meta.sizingDescription` | Hidden | Ilustračné percentá pozície podľa veľkosti účtu a hotovosti, s limitom na jednu firmu a pravidlami prikupovania. |
| `sk.rules.accumulation` | Visible | Nákupy insiderov alebo inštitúcií |
| `sk.ruleDefinitions.accumulation` | Visible | Je nastavený príznak nákupov insiderov alebo inštitúcií. |
| `sk.reasons.earningsMiss` | Visible | Zisk pod odhadom a znížený výhľad |
| `sk.home.leavesOutBody` | Visible | Každý návštevník vidí rovnaký výsledok. Nenájdete tu veľkosť pozícií, cieľové ceny ani osobné pokyny k obchodom. Skóre hovorí, ktoré zverejnené podmienky akcia dnes spĺňa, a o vašich peniazoch ani cieľoch nevie nič. |
| `sk.company.inputs.guidanceCut` | Visible | Znížený výhľad |
| `sk.company.inputs.earningsMissAndGuidanceCut` | Visible | Zisk pod odhadom so zníženým výhľadom |
| `sk.company.inputs.insiderOrInstitutionalAccumulation` | Visible | Nákupy insiderov alebo inštitúcií |
| `sk.trackRecord.hitRate` | Visible | Podiel nákupných signálov, ktoré za 20 obchodných dní prekonali SPY: {rate} z {n} vyhodnotených. |
| `sk.trackRecord.smallSample` | Visible | Počet nákupných signálov: {n}. Vzorka je príliš malá na záver. |
| `sk.trackRecord.signalTiers.ADD_THIRD` | Hidden | Prikúpiť 1/3 |
| `sk.trackRecord.signalTiers.ADD_HALF` | Hidden | Prikúpiť 1/2 |
| `sk.portfolio.heldNoSignal` | Visible | V portfóliu, bez signálu na ďalší nákup |
| `sk.methodology.scoreBody` | Visible | Deväť hlavných pravidiel používa údaje zbierané aspoň štvrťročne. Percento je podiel splnených bodov z bodov hlavných pravidiel s údajmi. Hlavné pravidlo bez údajov sa vynechá a stránka uvádza, koľko hlavných pravidiel má údaje. Príležitostné zistenia o katalyzátoroch sa zobrazujú osobitne ako bonus a nemenia percento ani zobrazený stupeň. |
| `sk.methodology.rejectionBody` | Visible | Tieto pravidlá majú prednosť pred súčtom a presunú ticker do stavu Kritériá porušené: klesajúce tržby, zisk pod odhadom spolu so zníženým výhľadom, cena pod MA200, MA50 pod MA200 a príznak firmy bez tržieb alebo meme pumpy. |
| `sk.ideas.tiers.ADD_THIRD` | Hidden | Prikúpiť asi 1/3 plnej pozície |
| `sk.ideas.tiers.ADD_HALF` | Hidden | Prikúpiť asi 1/2 plnej pozície |
| `sk.ideas.tiersShort.ADD_THIRD` | Hidden | Prikúpiť 1/3 |
| `sk.ideas.tiersShort.ADD_HALF` | Hidden | Prikúpiť 1/2 |
| `sk.ideas.actions.ADD` | Hidden | Prikúpiť |
| `sk.ideas.actions.HIGH_CONVICTION_ADD` | Hidden | Výrazne prikúpiť |
| `sk.ideas.actions.REDUCE` | Hidden | Znížiť |
| `sk.ideas.downgraded` | Hidden | Znížené z {action} |
| `sk.sizing.matrixNote` | Hidden | Tabuľka počíta s 10 až 30 % hotovosti. Percentá sa vzťahujú na celé portfólio, nie na hotovosť. Riadky prikúpenia znamenajú zvýšenie existujúcej pozície. |
| `sk.sizing.addThird` | Hidden | Prikúpenie tretiny plnej |
| `sk.sizing.addHalf` | Hidden | Prikúpenie polovice plnej |
| `sk.sizing.addTitle` | Hidden | Pred prikúpením |
| `sk.sizing.addRule` | Hidden | Najviac jedno prikúpenie za mesiac a len pri signáli Prikúpiť. Nechajte rezervu pod limitom. Ak rast ceny už dostal pozíciu na limit alebo nad neho, počkajte. Nikdy neprikupujte nad limit. |
| `sk.sizing.reduceRule` | Hidden | Signál na zníženie pozície ukazuje späť k štandardnej veľkosti alebo k limitu. Neurčuje sumu transakcie. |
| `sk.sizing.example` | Hidden | Pri ilustračnom portfóliu 20 000 EUR s 20 % hotovosti tvorí úvodná pozícia 2 % celého portfólia, teda 400 EUR. Limit na jednu firmu je 8 %, teda 1 600 EUR. Prikúpenie tretiny plnej pozície pridáva ďalšie 2 percentuálne body, až po kontrole existujúcej pozície voči limitu. |
| `sk.ownerAllocation.reserve` | Owner | Rezerva na prikúpenie |
| `sk.ownerAllocation.monthlyMissing` | Owner | Mesačný vklad chýba, preto nie je možné určiť rezervu na prikúpenie ani upozornenie na nevyužitú hotovosť. |
| `sk.ownerAllocation.cashDrag` | Owner | Voľná hotovosť presahuje tri mesačné vklady. Skontrolujte ju, nákup sa však nevynucuje. |
| `sk.ownerAllocation.historyNote` | Owner | Podklad Flex neobsahuje dátumy vykonaných prikúpení. Prikúpenia čakajú na potvrdenie obchodov v tomto mesiaci. |
| `sk.ownerAllocation.tiers.ADD_THIRD` | Owner | Prikúpenie |
| `sk.ownerAllocation.tiers.ADD_HALF` | Owner | Silné prikúpenie |
| `sk.ownerAllocation.reasons.ORDER_CEILING` | Owner | Horná hranica objednávky znížila sumu. |
| `sk.ownerAllocation.reasons.CASH_LIMIT` | Owner | Prikúpenie obmedzila zostávajúca hotovosť. |
| `sk.ownerAllocation.reasons.RESERVE_LIMIT` | Owner | Novú pozíciu obmedzila rezerva na prikúpenie. |
| `sk.ownerAllocation.reasons.ADD_ALREADY_THIS_MONTH` | Owner | Pri tomto tickeri už bolo v mesiaci zaznamenané prikúpenie. |
| `sk.ownerAllocation.reasons.ADD_HISTORY_UNKNOWN` | Owner | Chýba história vykonaných prikúpení; pred pridelením sumy ju treba potvrdiť. |

## Status label (ST1)

`status.advice.setup` ("Buy zone", "Zóna nákupu") and `status.headlineAdvice.setup` are used only when `ADVICE_OUTPUT` is on. With the flag off the green state reads "Conditions met" / "Podmienky splnené".
