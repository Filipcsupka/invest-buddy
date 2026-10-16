# Slovak native review packet

Prepared 2026-10-16 from `origin/main` at 585ad3d. For a native Slovak reader. Nothing here is rewritten: the table shows the current text as it ships. Write the fix in the last column, or write OK.

## Scope

The task was every Slovak string added or changed since 2026-10-01. The repository's first commit is 12c8340 (2026-10-04) and 269 commits have landed since 2026-10-01, so the whole Slovak catalog falls inside that window. `git log --since=2026-10-01` shows 67 commits touching `src/i18n/*.ts` (not counting tests), `src/notify` and `src/jobs/digest.ts`. The table therefore lists the whole catalog, not a diff.

Source files read: `src/i18n/messages.ts`, `heatmap-messages.ts`, `seo-messages.ts` (this feeds `src/seo/ticker-text.ts`), `data-status-messages.ts`, `scanner-floor-messages.ts`, `launch-messages.ts`, `legal-messages.ts`, `src/notify/format.ts`, `weekly.ts`, `discovery.ts`, `research-card.ts` and the inline scanner texts in `src/app/[locale]/scanner/page.tsx`. `src/i18n/metadata.ts`, `score-text.ts`, `record-signal.ts` and `rules.ts` hold no Slovak text of their own.

Left out of the table: 1 string with no text (`common.operatorDisclosure`, filled from an environment variable) and 35 strings whose Slovak is identical to the English (names such as SEC EDGAR, FRED, 10-Q, `F`, `T`, `M`). Both were counted in the 1041 Slovak strings found. The table lists 1005.

Row format: `file:line` is the line of the Slovak text. `{name}` marks a placeholder that the site fills in. Do not change it. Plural entries (`one`, `few`, `many`, `other`) are listed as written.

How the Slovak strings were checked: key sets of English and Slovak match for every file (same keys, none missing). A Slovak string was not compared for meaning with the English.

Pages that are hidden today (404 or private) are marked in their heading. Their text is still listed because it ships in the code.

## Glossary of terms used

These are the terms the site uses for states and rules. `docs/glossary.md` is the project's own list, one Slovak term per concept.

### States (the six steps and the pullback label)

| English | Slovak | Note |
| --- | --- | --- |
| Conditions met | Podmienky splnené | Top step. "Buy zone" / "Zóna nákupu" appears only when `ADVICE_OUTPUT` is on. |
| Watching | Sledovanie | |
| Pullback in uptrend | Pokles v rastovom trende | Label on a Watching ticker. |
| Waiting | Čakanie | |
| Not now | Mimo výberu | |
| Criteria broken | Kritériá porušené | Glossary says never "Porušené kritériá". |
| Not enough data | Nedostatok údajov | Gray, no score. |

### Score and data terms (from `docs/glossary.md`)

| English | Slovak | Note |
| --- | --- | --- |
| score | skóre | |
| points | body | "z 25" means "of 25". |
| rule, rejection rule | pravidlo, vylučovacie pravidlo | |
| Met / Not met | Splnené / Nesplnené | |
| No data | Bez údajov | A rule without data is left out, never counted as 0. |
| coverage | pokrytie | In text: "údaje pre X z 25 bodov". |
| confirmations | potvrdenia | Context only, no effect on the state. |
| methodology | metodika | |
| data | údaje | Never "dáta". "dátum" (date) stays. |
| benchmark | porovnávací index | SPY is "porovnávací index SPY". |
| screening universe | zoznam sledovaných akcií | |
| track record | história záznamov | |
| time-weighted return | časovo vážený výnos | |
| owner's portfolio | portfólio prevádzkovateľa | |

Words that stay English by the glossary: InvestBuddy, SPY, SEC, Form 4, FRED, VIX, MA50, MA200, EPS, TWR, XBRL, SaaS, Fintech, ticker, insider.

### The ten rules


| Rule id | English | Slovak | Short label (EN / SK) |
| --- | --- | --- | --- |
| `revenue-acceleration` | Revenue growth accelerated from the prior quarter | Rast tržieb sa oproti minulému štvrťroku zrýchlil | Revenue / Tržby |
| `earnings` | EPS beat or guidance raised | Zisk na akciu nad odhadom alebo zvýšený výhľad | Earnings / Zisk |
| `catalyst` | Curated product catalyst | Produktový katalyzátor z vybraného zoznamu | Catalyst / Katalyzátor |
| `accumulation` | Insider or institutional accumulation | Nákupy insiderov alebo inštitúcií | Accumulation / Akumulácia |
| `above-ma` | Close above MA50 and MA200 | Záverečná cena nad MA50 aj MA200 | Above MAs / Nad priemermi |
| `uptrend` | Uptrend intact | Rastový trend trvá | Uptrend / Trend |
| `green-volume` | Higher volume on green days | Vyšší objem v rastových dňoch | Volume / Objem |
| `dip` | Close 5 to 10% below the 20-day high, in an uptrend | Cena 5 až 10 % pod 20-dňovým maximom v rastovom trende | Dip / Pokles |
| `rotation` | Growth-sector rotation flag | Príznak rotácie do rastových sektorov | Rotation / Rotácia |
| `macro-data` | Macro data tailwind flag | Príznak priaznivých makro údajov | Macro data / Makro údaje |

Rule groups: Fundamentals / Fundamenty (F), Technical / Technika (T), Macro / Makro (M).

### Flags (company page)

| Flag | English | Slovak |
| --- | --- | --- |
| `dilution` | Share count growth | Rast počtu akcií |
| `illiquid` | Low trading volume | Nízky objem obchodovania |
| `interestCover` | Interest cover | Krytie úrokov |
| `shortInterest` | Short interest | Krátke pozície |
| `drawdown` | Drop from the 20-day high | Pokles od 20-dňového maxima |

## Strings by page

### Home

| # | Key (SK line) | English | Slovak | OK / suggested fix |
| --- | --- | --- | --- | --- |
| 1 | `messages.ts:1126` `home.title` | Every score shows its working | Pri každom skóre vidíte celý výpočet | |
| 2 | `messages.ts:1127` `home.lede` | InvestBuddy scores a fixed list of growth stocks each trading day with one published set of rules. Open any ticker to see which rules it met, which it missed and the data each rule read. | InvestBuddy každý obchodný deň hodnotí pevný zoznam rastových akcií podľa jednej zverejnenej sady pravidiel. Pri každom tickeri uvidíte, ktoré pravidlá splnil, ktoré nie a z akých údajov pravidlo vychádzalo. | |
| 3 | `messages.ts:1128` `home.primary` | Open today's stock screen | Otvoriť dnešný prehľad akcií | |
| 4 | `messages.ts:1129` `home.secondary` | Read the rules | Prečítať pravidlá | |
| 5 | `messages.ts:1130` `home.specimenCaption` | Sample datasheet for {ticker}, session of {date} | Ukážkový list pre {ticker}, obchodný deň {date} | |
| 6 | `messages.ts:1131` `home.datasheetCaption` | Datasheet for {ticker}, session of {date} | Prehľad pre {ticker}, obchodný deň {date} | |
| 7 | `messages.ts:1132` `home.specimenLink` | Open the full {ticker} screen | Otvoriť celý rozbor {ticker} | |
| 8 | `messages.ts:1133` `home.buildTitle` | How a score is built | Ako vzniká skóre | |
| 9 | `messages.ts:1134` `home.buildBody` | Nine core rules make the public percentage. Each checks collected data you can inspect on the company page. Ad hoc catalyst evidence is shown separately. A rejection rule overrides the percentage. | Deväť hlavných pravidiel tvorí verejné percento. Každé kontroluje zbierané údaje, ktoré nájdete na stránke spoločnosti. Príležitostné zistenia o katalyzátoroch sa zobrazujú osobitne. Vylučovacie pravidlo má prednosť pred percentom. | |
| 10 | `messages.ts:1135` `home.statusTitle` | One status per ticker | Jeden stav pre každý ticker | |
| 11 | `messages.ts:1136` `home.statusBody` | Five steps from Criteria broken to {setup}, set by the published rules. Gray means not enough data to score. | Päť stupňov od Kritériá porušené po {setup} podľa zverejnených pravidiel. Sivá znamená, že na skóre nie je dosť údajov. | |
| 12 | `messages.ts:1137` `home.leavesOutTitle` | What the screen leaves out | Čo v prehľade nenájdete | |
| 13 | `messages.ts:1138` `home.leavesOutBody` | Every visitor sees the same result. There are no position sizes, price targets or personal trade instructions. A score says which published conditions a stock meets today, and it knows nothing about your money or your goals. | Každý návštevník vidí rovnaký výsledok. Nenájdete tu veľkosť pozícií, cieľové ceny ani osobné pokyny k obchodom. Skóre hovorí, ktoré zverejnené podmienky akcia dnes spĺňa, a o vašich peniazoch ani cieľoch nevie nič. | |
| 14 | `messages.ts:1139` `home.recordTitle` | The record keeps the misses | Záznam necháva aj neúspechy | |
| 15 | `messages.ts:1140` `home.recordBody` | The track record keeps dated screening snapshots and later signal outcomes, including criteria that broke. | História uchováva datované hodnotenia a neskoršie výsledky signálov vrátane porušených kritérií. | |
| 16 | `messages.ts:1141` `home.recordSampleBody` | The sample track record uses synthetic sessions. It does not show past returns. | Ukážková história používa syntetické obchodné dni. Nezobrazuje minulé výnosy. | |
| 17 | `messages.ts:1142` `home.recordLink` | View the track record | Pozrieť históriu záznamov | |

### Waitlist block on the home page (only when WAITLIST is on)

| # | Key (SK line) | English | Slovak | OK / suggested fix |
| --- | --- | --- | --- | --- |
| 18 | `launch-messages.ts:43` `landing.ctaWaitlist` | Join the waitlist | Pridať sa do poradovníka | |
| 19 | `launch-messages.ts:44` `landing.waitlistTitle` | Get one email when it opens | Jeden e-mail, keď sa otvorí | |
| 20 | `launch-messages.ts:45` `landing.waitlistBody` | The screen is free to read today. Join the list and we tell you when it opens, with no other mail. | Prehľad je dnes zadarmo na čítanie. Pridajte sa do zoznamu a dáme vám vedieť, keď sa otvorí, bez inej pošty. | |
| 21 | `launch-messages.ts:46` `landing.proofTitle` | What you can check today | Čo si môžete overiť už dnes | |
| 22 | `launch-messages.ts:47` `landing.proofMethodTitle` | The method is published | Metodika je zverejnená | |
| 23 | `launch-messages.ts:48` `landing.proofMethodBody` | Nine core rules, written out, with the data each one reads. | Deväť hlavných pravidiel, každé s údajmi, z ktorých vychádza. | |
| 24 | `launch-messages.ts:49` `landing.proofMethodLink` | Read the methodology | Prečítať metodiku | |
| 25 | `launch-messages.ts:50` `landing.proofRecordTitle` | The record is dated and keeps the misses | Záznam je datovaný a zachováva aj chyby | |
| 26 | `launch-messages.ts:51` `landing.proofRecordBody` | Each signal is stored with its date. Measured outcomes appear once a signal window has closed, losers included. | Každý signál sa ukladá s dátumom. Namerané výsledky pribudnú po uzavretí okna signálu, aj tie zlé. | |
| 27 | `launch-messages.ts:52` `landing.proofRecordLink` | View the track record | Pozrieť záznam | |
| 28 | `launch-messages.ts:53` `landing.proofSlovakTitle` | Slovak pages | Slovenské stránky | |
| 29 | `launch-messages.ts:54` `landing.proofSlovakBody` | The whole site reads in Slovak and English, with the same rules and numbers. | Celý web je po slovensky aj po anglicky, s rovnakými pravidlami a číslami. | |
| 30 | `launch-messages.ts:55` `landing.factTickers` | {n} tickers scored | Ohodnotených tikerov: {n} | |
| 31 | `launch-messages.ts:56` `landing.factLastScore` | Last score {date} | Posledné skóre {date} | |
| 32 | `launch-messages.ts:57` `landing.factRecordStart` | Record starts {date} | Záznam začína {date} | |
| 33 | `launch-messages.ts:58` `landing.tiersTitle` | Free in beta | Zadarmo v bete | |
| 34 | `launch-messages.ts:59` `landing.tiersBody` | The site is in beta and free to use while we test. Paid plans may come later. There are no prices yet. | Web je v beta prevádzke a počas testovania je zadarmo. Platené plány môžu prísť neskôr. Zatiaľ nie sú žiadne ceny. | |
| 35 | `launch-messages.ts:60` `landing.tiersLink` | How the beta works | Ako funguje beta | |

### Pricing (only when WAITLIST is on)

| # | Key (SK line) | English | Slovak | OK / suggested fix |
| --- | --- | --- | --- | --- |
| 36 | `launch-messages.ts:63` `pricing.title` | Pricing | Cenník | |
| 37 | `launch-messages.ts:64` `pricing.lede` | Beta: free while we test. Paid plans later. No prices yet. | Beta: zadarmo, kým testujeme. Platené plány neskôr. Zatiaľ bez cien. | |
| 38 | `launch-messages.ts:65` `pricing.freeTitle` | Free while we test | Zadarmo počas testovania | |
| 39 | `launch-messages.ts:66` `pricing.freeBody` | The site is in beta. Reading the scores, the rules and the public record costs nothing. | Web je v beta prevádzke. Čítanie skóre, pravidiel a verejného záznamu nestojí nič. | |
| 40 | `launch-messages.ts:67` `pricing.laterTitle` | Paid plans later | Platené plány neskôr | |
| 41 | `launch-messages.ts:68` `pricing.laterBody` | We may add paid plans after the beta. No plan, price or date is set, and nothing is for sale now. If a plan is added, its price will be shown before you pay. | Po bete môžeme pridať platené plány. Žiadny plán, cena ani termín nie je určený a teraz nie je nič v predaji. Ak plán pribudne, cenu uvidíte skôr, než zaplatíte. | |
| 42 | `launch-messages.ts:69` `pricing.waitlistTitle` | Get one email when things change | Jeden e-mail, keď sa niečo zmení | |

### Navigation, footer, theme, language

| # | Key (SK line) | English | Slovak | OK / suggested fix |
| --- | --- | --- | --- | --- |
| 43 | `messages.ts:915` `nav.label` | Main | Hlavná navigácia | |
| 44 | `messages.ts:916` `nav.home` | InvestBuddy home | InvestBuddy, úvod | |
| 45 | `messages.ts:917` `nav.dashboard` | Stock screen | Prehľad akcií | |
| 46 | `messages.ts:918` `nav.scanner` | Scanner | Skener | |
| 47 | `messages.ts:919` `nav.trackRecord` | Track record | História záznamov | |
| 48 | `messages.ts:920` `nav.insiders` | Insider filings | Obchody insiderov | |
| 49 | `messages.ts:921` `nav.portfolio` | Portfolio | Portfólio | |
| 50 | `messages.ts:922` `nav.methodology` | Methodology | Metodika | |
| 51 | `messages.ts:923` `nav.ideas` | Ideas | Nápady | |
| 52 | `messages.ts:924` `nav.sizing` | Sizing guide | Veľkosť pozície | |
| 53 | `messages.ts:927` `theme.toDark` | Switch to dark theme | Prepnúť na tmavý motív | |
| 54 | `messages.ts:928` `theme.toLight` | Switch to light theme | Prepnúť na svetlý motív | |
| 55 | `messages.ts:929` `theme.generic` | Switch colour theme | Prepnúť farebný motív | |
| 56 | `messages.ts:932` `language.label` | Language | Jazyk | |
| 57 | `messages.ts:933` `language.otherName` | Slovensky | English | |
| 58 | `messages.ts:934` `language.otherAction` | Read this page in Slovak | Čítať túto stránku po anglicky | |
| 59 | `messages.ts:937` `footer.note` | InvestBuddy runs informational screening on sample data. | InvestBuddy zobrazuje informačný prehľad akcií na ukážkových údajoch. | |
| 60 | `messages.ts:938` `footer.liveNote` | InvestBuddy publishes informational screening from recorded scans. | InvestBuddy zobrazuje informačný prehľad akcií zo zaznamenaných skenov. | |
| 61 | `messages.ts:939` `footer.legal` | Legal and method | Právne informácie a metodika | |
| 62 | `messages.ts:940` `footer.privacy` | Privacy | Ochrana súkromia | |
| 63 | `messages.ts:941` `footer.terms` | Terms | Podmienky používania | |
| 64 | `messages.ts:942` `footer.disclaimer` | Disclaimer | Upozornenie | |
| 65 | `messages.ts:943` `footer.methodology` | Methodology | Metodika | |

### Shared text (all pages)

| # | Key (SK line) | English | Slovak | OK / suggested fix |
| --- | --- | --- | --- | --- |
| 66 | `messages.ts:884` `common.sample` | SAMPLE DATA | UKÁŽKOVÉ ÚDAJE | |
| 67 | `messages.ts:885` `common.noDataYet` | No data yet. The next completed scan will appear here. | Zatiaľ tu nie sú údaje. Zobrazí sa tu ďalší dokončený sken. | |
| 68 | `messages.ts:886` `common.lastUpdated` | Last updated {date} | Posledná aktualizácia {date} | |
| 69 | `messages.ts:887` `common.staleData` | Stale since {date}. | Zastarané od {date}. | |
| 70 | `messages.ts:889` `common.macroEvents.title` | Upcoming market events | Blížiace sa udalosti na trhu | |
| 71 | `messages.ts:890` `common.macroEvents.note` | Dates of US data releases and Fed decisions that often move growth stocks. Informational: scores and signals do not change because of them. | Termíny amerických makroekonomických správ a rozhodnutí Fedu, ktoré často hýbu rastovými akciami. Len informatívne: skóre a signály sa nimi nemenia. | |
| 72 | `messages.ts:891` `common.macroEvents.today` | today | dnes | |
| 73 | `messages.ts:892` `common.macroEvents.inSessions` | in {n} trading days | o {n} obchodných dní | |
| 74 | `messages.ts:893` `common.macroEvents.kinds.CPI` | CPI inflation | CPI inflácia | |
| 75 | `messages.ts:893` `common.macroEvents.kinds.PPI` | PPI producer prices | PPI ceny výrobcov | |
| 76 | `messages.ts:893` `common.macroEvents.kinds.NFP` | US jobs report | Americká správa o trhu práce | |
| 77 | `messages.ts:893` `common.macroEvents.kinds.FOMC` | Fed rate decision | Rozhodnutie Fedu o sadzbách | |
| 78 | `messages.ts:893` `common.macroEvents.kinds.EARNINGS` | Earnings | Výsledky firiem | |
| 79 | `messages.ts:895` `common.unknown` | unknown | neznáme | |
| 80 | `messages.ts:896` `common.disclaimer` | Informational screening only. Same rules for every visitor. No personal investment advice. | Iba informačný prehľad podľa pravidiel. Rovnaké pravidlá pre každého návštevníka. Nejde o osobné investičné poradenstvo. | |
| 81 | `messages.ts:897` `common.ogDisclaimer` | Informational screening only. No personal investment advice. | Iba informačný prehľad. Nejde o osobné investičné poradenstvo. | |
| 82 | `messages.ts:898` `common.ogStale` | STALE DATA | ZASTARANÉ ÚDAJE | |
| 83 | `messages.ts:900` `common.skipToContent` | Skip to content | Preskočiť na obsah | |
| 84 | `messages.ts:901` `common.outOf25` | of 25 | z 25 | |
| 85 | `messages.ts:902` `common.points` | points | bodov | |
| 86 | `messages.ts:903` `common.yes` | yes | áno | |
| 87 | `messages.ts:904` `common.no` | no | nie | |
| 88 | `messages.ts:905` `common.met` | Met | Splnené | |
| 89 | `messages.ts:906` `common.notMet` | Not met | Nesplnené | |
| 90 | `messages.ts:907` `common.noScore` | No score | Bez skóre | |
| 91 | `messages.ts:908` `common.extension` | Sample extension | Ukážkové rozšírenie | |
| 92 | `messages.ts:909` `common.universe` | Screening universe | Zoznam sledovaných akcií | |
| 93 | `messages.ts:910` `common.guide` | Investing guide | Investičná príručka | |
| 94 | `messages.ts:911` `common.discovery` | Discovery | Objavená akcia | |
| 95 | `messages.ts:912` `common.loading` | Loading the screen… | Načítava sa prehľad… | |

### Status scale and legend

| # | Key (SK line) | English | Slovak | OK / suggested fix |
| --- | --- | --- | --- | --- |
| 96 | `messages.ts:946` `states.setup` | Conditions met | Podmienky splnené | |
| 97 | `messages.ts:947` `states.watch` | Watching | Sledovanie | |
| 98 | `messages.ts:948` `states.pullback` | Pullback in uptrend | Pokles v rastovom trende | |
| 99 | `messages.ts:949` `states.wait` | Waiting | Čakanie | |
| 100 | `messages.ts:950` `states.ignore` | Not now | Mimo výberu | |
| 101 | `messages.ts:951` `states.broken` | Criteria broken | Kritériá porušené | |
| 102 | `messages.ts:952` `states.insufficient` | Not enough data | Nedostatok údajov | |
| 103 | `messages.ts:955` `stateRanges.setup` | 72% or more of the points with data | 72 % a viac z bodov s údajmi | |
| 104 | `messages.ts:956` `stateRanges.watch` | 60% to 71.9% of the points with data | 60 % až 71,9 % z bodov s údajmi | |
| 105 | `messages.ts:957` `stateRanges.pullback` | Watch, plus a 5 to 10% dip in an uptrend | Sledovanie a k tomu pokles o 5 až 10 % v rastovom trende | |
| 106 | `messages.ts:958` `stateRanges.wait` | 48% to 59.9% of the points with data | 48 % až 59,9 % z bodov s údajmi | |
| 107 | `messages.ts:959` `stateRanges.ignore` | Under 48% of the points with data | Menej ako 48 % z bodov s údajmi | |
| 108 | `messages.ts:960` `stateRanges.broken` | Any rejection rule, whatever the total | Akékoľvek vylučovacie pravidlo bez ohľadu na súčet | |
| 109 | `messages.ts:961` `stateRanges.insufficient` | Invalid inputs or fewer than 200 price bars | Neplatné vstupy alebo menej ako 200 cenových záznamov | |
| 110 | `messages.ts:964` `status.labels.broken` | Criteria broken | Kritériá porušené | |
| 111 | `messages.ts:964` `status.labels.ignore` | Not now | Mimo výberu | |
| 112 | `messages.ts:964` `status.labels.wait` | Waiting | Čakanie | |
| 113 | `messages.ts:964` `status.labels.watch` | Watching | Sledovanie | |
| 114 | `messages.ts:964` `status.labels.setup` | Conditions met | Podmienky splnené | |
| 115 | `messages.ts:964` `status.labels.insufficient` | Not enough data | Nedostatok údajov | |
| 116 | `messages.ts:965` `status.advice.setup` | Buy zone | Zóna nákupu | |
| 117 | `messages.ts:967` `status.headline.broken` | Criteria broken: a rejection rule applies, whatever the total. | Kritériá porušené: platí vylučovacie pravidlo bez ohľadu na súčet. | |
| 118 | `messages.ts:968` `status.headline.ignore` | Not now: {points} of {max} points. | Mimo výberu: {points} z {max} bodov. | |
| 119 | `messages.ts:969` `status.headline.wait` | Waiting: {points} of {max} points. | Čakanie: {points} z {max} bodov. | |
| 120 | `messages.ts:970` `status.headline.watch` | Watching: {points} of {max} points. | Sledovanie: {points} z {max} bodov. | |
| 121 | `messages.ts:971` `status.headline.setup` | Conditions met: {points} of {max} points. | Podmienky splnené: {points} z {max} bodov. | |
| 122 | `messages.ts:972` `status.headline.insufficient` | Not enough data to score this ticker. | Na ohodnotenie tohto tickera chýbajú údaje. | |
| 123 | `messages.ts:974` `status.headlineAdvice.setup` | Buy zone: {points} of {max} points. | Zóna nákupu: {points} z {max} bodov. | |
| 124 | `messages.ts:975` `status.coverage` | {known} of {max} points have data | {known} z {max} bodov má údaje | |
| 125 | `messages.ts:976` `status.noData` | no data | bez údajov | |
| 126 | `messages.ts:977` `status.unknownRules` | Rules with no data | Pravidlá bez údajov | |
| 127 | `messages.ts:978` `status.confirmations.insider` | Insider net buying (Form 4) | Insideri kupujú (Form 4) | |
| 128 | `messages.ts:978` `status.confirmations.epsBeat` | EPS beat | Zisk nad odhadom | |
| 129 | `messages.ts:978` `status.confirmations.guidanceRaised` | Guidance raised | Zvýšený výhľad | |
| 130 | `messages.ts:978` `status.confirmations.catalyst` | Product catalyst | Produktový katalyzátor | |
| 131 | `messages.ts:978` `status.confirmations.volume` | Volume confirmation | Potvrdenie objemom | |
| 132 | `messages.ts:979` `status.confirmationState.met` | confirmed | potvrdené | |
| 133 | `messages.ts:979` `status.confirmationState.notMet` | not confirmed | nepotvrdené | |
| 134 | `messages.ts:979` `status.confirmationState.noData` | no data | bez údajov | |
| 135 | `messages.ts:980` `status.ranges.broken` | any | ľubovoľný počet | |
| 136 | `messages.ts:980` `status.ranges.ignore` | under 48% | menej ako 48 % | |
| 137 | `messages.ts:980` `status.ranges.wait` | 48% to 59.9% | 48 % až 59,9 % | |
| 138 | `messages.ts:980` `status.ranges.watch` | 60% to 71.9% | 60 % až 71,9 % | |
| 139 | `messages.ts:980` `status.ranges.setup` | 72% or more | 72 % a viac | |
| 140 | `messages.ts:980` `status.ranges.insufficient` | none | žiadne | |
| 141 | `messages.ts:981` `status.scaleAria` | Status scale from Criteria broken to {setup} | Stupnica stavu od Kritériá porušené po {setup} | |
| 142 | `messages.ts:982` `status.summaryAria` | Status {label}, step {step} of 5, {percent}, data from {known} of {total} core rules | Stav {label}, stupeň {step} z 5, {percent}, údaje pre {known} z {total} hlavných pravidiel | |
| 143 | `messages.ts:983` `status.summaryAriaBroken` | Status {label}, step 1 of 5, points not counted | Stav {label}, stupeň 1 z 5, body sa nepočítajú | |
| 144 | `messages.ts:984` `status.summaryAriaNone` | Status {label}, no score | Stav {label}, bez skóre | |
| 145 | `messages.ts:985` `status.asOf` | Status as of {date} | Stav k {date} | |
| 146 | `messages.ts:986` `status.methodLink` | How the status works | Ako funguje stav | |
| 147 | `messages.ts:987` `status.points` | {points} of 25 points | {points} z 25 bodov | |
| 148 | `messages.ts:988` `status.pointsNotCounted` | Points not counted: {points} | Nezapočítané body: {points} | |
| 149 | `messages.ts:989` `status.brokenBecause` | Rejected by: {reasons} | Vylúčené pre: {reasons} | |
| 150 | `messages.ts:990` `status.insufficientBecause` | Why: {reasons} | Dôvod: {reasons} | |
| 151 | `messages.ts:991` `status.coreData` | Data from {known} of {total} core rules | Údaje pre {known} z {total} hlavných pravidiel | |
| 152 | `messages.ts:992` `status.rulesMet` | Meets {met} of {total} rules | Spĺňa {met} z {total} pravidiel | |
| 153 | `messages.ts:993` `status.cutoffs` | Conditions met 72%+, Watching 60%+, Waiting 48%+; the guide's 18/15/12 of 25 | Podmienky splnené od 72 %, Sledovanie od 60 %, Čakanie od 48 %; v príručke 18/15/12 z 25 | |
| 154 | `messages.ts:994` `status.coreLabel` | Core | Hlavné | |
| 155 | `messages.ts:995` `status.bonusLabel` | Bonus | Doplnkové | |
| 156 | `messages.ts:996` `status.bonusTitle` | Bonus findings | Bonusové zistenia | |
| 157 | `messages.ts:997` `status.bonusNote` | Shown separately; they do not change the percentage. | Zobrazujú sa osobitne a nemenia percento. | |
| 158 | `messages.ts:998` `status.pointsNotCountedPlain` | No percentage: criteria broken | Bez percenta: kritériá porušené | |
| 159 | `messages.ts:999` `status.coverageCapPlain` | With this data the highest band is Watching. | S týmito údajmi je najvyšším stupňom Sledovanie. | |
| 160 | `messages.ts:1000` `status.dataFull` | Data: all 25 points | Údaje: všetkých 25 bodov | |
| 161 | `messages.ts:1001` `status.dataSome` | Data: {known} of 25 points, the rest not counted | Údaje: {known} z 25 bodov, zvyšok sa nepočíta | |
| 162 | `messages.ts:1002` `status.dataMissing` | No data: {rules} | Bez údajov: {rules} | |
| 163 | `messages.ts:1003` `status.coverageCap` | With this data the ticker cannot reach {setup}. | S týmito údajmi ticker nemôže dosiahnuť stav {setup}. | |
| 164 | `messages.ts:1004` `status.groupNoData` | {n} no data | {n} bez údajov | |
| 165 | `messages.ts:1005` `status.markNoData` | {n} points without data | Body bez údajov: {n} | |
| 166 | `messages.ts:1006` `status.confirmTitle` | Confirmations | Potvrdenia | |
| 167 | `messages.ts:1007` `status.confirmNote` | Context only. They do not change the status. | Len pre kontext. Stav nemenia. | |
| 168 | `messages.ts:1008` `status.ruleShort.revenue-acceleration` | Revenue | Tržby | |
| 169 | `messages.ts:1008` `status.ruleShort.earnings` | Earnings | Zisk | |
| 170 | `messages.ts:1008` `status.ruleShort.catalyst` | Catalyst | Katalyzátor | |
| 171 | `messages.ts:1008` `status.ruleShort.accumulation` | Accumulation | Akumulácia | |
| 172 | `messages.ts:1008` `status.ruleShort.above-ma` | Above MAs | Nad priemermi | |
| 173 | `messages.ts:1008` `status.ruleShort.uptrend` | Uptrend | Trend | |
| 174 | `messages.ts:1008` `status.ruleShort.green-volume` | Volume | Objem | |
| 175 | `messages.ts:1008` `status.ruleShort.dip` | Dip | Pokles | |
| 176 | `messages.ts:1008` `status.ruleShort.rotation` | Rotation | Rotácia | |
| 177 | `messages.ts:1008` `status.ruleShort.macro-data` | Macro data | Makro údaje | |
| 178 | `messages.ts:1009` `status.columns.status` | Status | Stav | |
| 179 | `messages.ts:1009` `status.columns.data` | Data | Údaje | |
| 180 | `messages.ts:1009` `status.columns.points` | Percent | Percento | |
| 181 | `messages.ts:1011` `status.meaning.broken` | A rejection rule applies, so the points do not count. | Platí vylučovacie pravidlo, takže body sa nepočítajú. | |
| 182 | `messages.ts:1012` `status.meaning.ignore` | Too few published conditions are met. | Splnených je príliš málo zverejnených podmienok. | |
| 183 | `messages.ts:1013` `status.meaning.wait` | Some conditions are met, not enough to watch. | Časť podmienok je splnená, na sledovanie to nestačí. | |
| 184 | `messages.ts:1014` `status.meaning.watch` | At least 60% of core rule points with data, or a higher percentage with less than 80% core weight covered. | Aspoň 60 % bodov hlavných pravidiel s údajmi alebo vyššie percento pri pokrytí menej ako 80 % ich váhy. | |
| 185 | `messages.ts:1015` `status.meaning.setup` | At least 72% of core rule points with data, at least 80% core weight covered, and no rejection rule. | Aspoň 72 % bodov hlavných pravidiel s údajmi, pokrytie aspoň 80 % ich váhy a žiadne vylučovacie pravidlo. | |
| 186 | `messages.ts:1016` `status.meaning.insufficient` | The score cannot be computed, for example fewer than 200 daily prices. | Skóre sa nedá vypočítať, napríklad pre menej ako 200 denných cien. | |
| 187 | `messages.ts:1018` `status.legendTitle` | How to read the status | Ako čítať stav | |
| 188 | `messages.ts:1019` `status.legendLede` | Every ticker sits on one of five steps. The step comes only from the published rules. | Každý ticker je na jednom z piatich stupňov. Stupeň určujú len zverejnené pravidlá. | |
| 189 | `messages.ts:1020` `status.legendMissingTitle` | Missing data | Chýbajúce údaje | |
| 190 | `messages.ts:1021` `status.legendMissing` | A core rule without data shows No data and is left out of the percentage. A rule with two inputs has no data when neither input is met and one is unknown. The same applies when its source is planned but unavailable. The band follows the percentage: Setup from 72%, Watch from 60%, Wait from 48%, and Ignore below 48%. When fewer than 19 of the 23 core points have data (80%), the highest band is Watch. | Hlavné pravidlo bez údajov má označenie Bez údajov a do percenta nevstupuje. Pravidlo s dvoma vstupmi nemá údaje, keď nie je splnený ani jeden vstup a jeden je neznámy. To isté platí pre plánovaný, zatiaľ nedostupný zdroj. Stupeň vychádza z percenta: Podmienky splnené od 72 %, Sledovanie od 60 %, Čakanie od 48 % a Mimo výberu pod 48 %. Ak má údaje menej ako 19 z 23 bodov hlavných pravidiel (80 %), najvyšší stupeň je Sledovanie. | |
| 191 | `messages.ts:1022` `status.legendConfirmTitle` | Confirmations | Potvrdenia | |
| 192 | `messages.ts:1023` `status.legendConfirm` | Insider buying, EPS beat, guidance raised, product catalyst and volume are shown next to the status for context. They do not change the step. | Nákupy insiderov, EPS nad odhadom, zvýšený výhľad, produktový katalyzátor a objem sú pri stave len pre kontext. Stupeň nemenia. | |
| 193 | `messages.ts:1024` `status.legendStep` | Step | Stupeň | |
| 194 | `messages.ts:1025` `status.legendMeaning` | Meaning | Význam | |

### Rules, rule reasons, groups, sectors, tables

| # | Key (SK line) | English | Slovak | OK / suggested fix |
| --- | --- | --- | --- | --- |
| 195 | `messages.ts:1028` `groups.fundamentals` | Fundamentals | Fundamenty | |
| 196 | `messages.ts:1029` `groups.technical` | Technical | Technika | |
| 197 | `messages.ts:1030` `groups.macro` | Macro | Makro | |
| 198 | `messages.ts:1034` `groups.groupScore` | {group} {score} of {max} | {group} {score} z {max} | |
| 199 | `messages.ts:1037` `rules.revenue-acceleration` | Revenue growth accelerated from the prior quarter | Rast tržieb sa oproti minulému štvrťroku zrýchlil | |
| 200 | `messages.ts:1038` `rules.earnings` | EPS beat or guidance raised | Zisk na akciu nad odhadom alebo zvýšený výhľad | |
| 201 | `messages.ts:1039` `rules.catalyst` | Curated product catalyst | Produktový katalyzátor z vybraného zoznamu | |
| 202 | `messages.ts:1040` `rules.accumulation` | Insider or institutional accumulation | Nákupy insiderov alebo inštitúcií | |
| 203 | `messages.ts:1041` `rules.above-ma` | Close above MA50 and MA200 | Záverečná cena nad MA50 aj MA200 | |
| 204 | `messages.ts:1042` `rules.uptrend` | Uptrend intact | Rastový trend trvá | |
| 205 | `messages.ts:1043` `rules.green-volume` | Higher volume on green days | Vyšší objem v rastových dňoch | |
| 206 | `messages.ts:1044` `rules.dip` | Close 5 to 10% below the 20-day high, in an uptrend | Cena 5 až 10 % pod 20-dňovým maximom v rastovom trende | |
| 207 | `messages.ts:1045` `rules.rotation` | Growth-sector rotation flag | Príznak rotácie do rastových sektorov | |
| 208 | `messages.ts:1046` `rules.macro-data` | Macro data tailwind flag | Príznak priaznivých makro údajov | |
| 209 | `messages.ts:1049` `ruleDefinitions.revenue-acceleration` | Revenue growth this quarter is higher than last quarter, and revenue is not declining. | Medziročný rast tržieb je v tomto štvrťroku vyšší ako v minulom a tržby neklesajú. | |
| 210 | `messages.ts:1050` `ruleDefinitions.earnings` | The company beat the EPS estimate, raised guidance, or both. | Firma prekonala odhad zisku na akciu, zvýšila výhľad, alebo oboje. | |
| 211 | `messages.ts:1051` `ruleDefinitions.catalyst` | A product catalyst from the curated list is flagged for the company. | Pri firme je označený produktový katalyzátor z vybraného zoznamu. | |
| 212 | `messages.ts:1052` `ruleDefinitions.accumulation` | An insider or institutional accumulation flag is set. | Je nastavený príznak nákupov insiderov alebo inštitúcií. | |
| 213 | `messages.ts:1053` `ruleDefinitions.above-ma` | The last close is above both the 50-day and the 200-day moving average. | Posledná záverečná cena je nad 50-dňovým aj 200-dňovým kĺzavým priemerom. | |
| 214 | `messages.ts:1054` `ruleDefinitions.uptrend` | MA50 is above MA200, the close is above MA50, and MA50 is higher than ten sessions ago. | MA50 je nad MA200, cena je nad MA50 a MA50 je vyššie ako pred desiatimi obchodnými dňami. | |
| 215 | `messages.ts:1055` `ruleDefinitions.green-volume` | Over the last 10 sessions, mean volume on up days is at least 1.2 times mean volume on down days, with at least two of each. | Za posledných 10 obchodných dní je priemerný objem v rastových dňoch aspoň 1,2-násobkom objemu v klesajúcich dňoch a každých je aspoň dva. | |
| 216 | `messages.ts:1056` `ruleDefinitions.dip` | The close sits 5 to 10% below the highest high of the last 20 sessions while the uptrend rule holds. | Cena je 5 až 10 % pod najvyšším maximom za posledných 20 obchodných dní a pravidlo rastového trendu platí. | |
| 217 | `messages.ts:1057` `ruleDefinitions.rotation` | A structured flag for money rotating into growth sectors is set. | Je nastavený štruktúrovaný príznak presunu peňazí do rastových sektorov. | |
| 218 | `messages.ts:1058` `ruleDefinitions.macro-data` | A structured flag for supportive macro data is set. | Je nastavený štruktúrovaný príznak priaznivých makroekonomických údajov. | |
| 219 | `messages.ts:1061` `ruleThresholds.revenue-acceleration` | revenue growth this quarter above last quarter, and revenue not declining | rast tržieb v tomto štvrťroku vyšší ako v minulom a tržby neklesajú | |
| 220 | `messages.ts:1062` `ruleThresholds.earnings` | an EPS beat or raised guidance | zisk nad odhadom alebo zvýšený výhľad | |
| 221 | `messages.ts:1063` `ruleThresholds.catalyst` | a product catalyst flagged from the curated list | označený produktový katalyzátor z vybraného zoznamu | |
| 222 | `messages.ts:1064` `ruleThresholds.accumulation` | up-day volume at least {ratio} times down-day volume over 50 sessions, or an insider or institutional buying flag | objem v rastových dňoch aspoň {ratio}-násobok objemu v klesajúcich dňoch za 50 obchodných dní, alebo príznak nákupov insiderov či inštitúcií | |
| 223 | `messages.ts:1065` `ruleThresholds.above-ma` | close above both MA50 and MA200 | cena nad MA50 aj MA200 | |
| 224 | `messages.ts:1066` `ruleThresholds.uptrend` | MA50 above MA200, close above MA50, and MA50 higher than 10 sessions ago | MA50 nad MA200, cena nad MA50 a MA50 vyššie ako pred 10 obchodnými dňami | |
| 225 | `messages.ts:1067` `ruleThresholds.green-volume` | mean volume on green days at least {ratio} times red days over 10 sessions, with at least 2 of each | priemerný objem v rastových dňoch aspoň {ratio}-násobok klesajúcich dní za 10 obchodných dní, každých aspoň 2 | |
| 226 | `messages.ts:1068` `ruleThresholds.dip` | close {min} to {max} below the 20-day high while the uptrend rule holds | cena {min} až {max} pod 20-dňovým maximom, kým platí pravidlo rastového trendu | |
| 227 | `messages.ts:1069` `ruleThresholds.rotation` | growth sector rotation flag set | príznak presunu do rastových sektorov je nastavený | |
| 228 | `messages.ts:1070` `ruleThresholds.macro-data` | supportive macro data flag set | príznak priaznivých makroekonomických údajov je nastavený | |
| 229 | `messages.ts:1073` `ruleDetails.revenue` | Revenue growth from {prior} to {current} | Rast tržieb z {prior} na {current} | |
| 230 | `messages.ts:1074` `ruleDetails.earnings` | EPS beat: {beat}. Guidance raised: {raised}. | Zisk nad odhadom: {beat}. Zvýšený výhľad: {raised}. | |
| 231 | `messages.ts:1075` `ruleDetails.flag` | Flag set: {value} | Príznak nastavený: {value} | |
| 232 | `messages.ts:1076` `ruleDetails.aboveMa` | Close {close}, MA50 {ma50}, MA200 {ma200} | Cena {close}, MA50 {ma50}, MA200 {ma200} | |
| 233 | `messages.ts:1077` `ruleDetails.uptrend` | MA50 {ma50}, ten sessions earlier {ma50Prior} | MA50 {ma50}, pred desiatimi dňami {ma50Prior} | |
| 234 | `messages.ts:1078` `ruleDetails.volume` | Mean volume, green days {green}, red days {red} | Priemerný objem, rastové dni {green}, klesajúce dni {red} | |
| 235 | `messages.ts:1079` `ruleDetails.dip` | {drawdown} below the 20-day high of {high} | {drawdown} pod 20-dňovým maximom {high} | |
| 236 | `messages.ts:1080` `ruleDetails.unknown` | Not enough data | Nedostatok údajov | |
| 237 | `messages.ts:1083` `reasons.decliningRevenue` | Declining revenue | Klesajúce tržby | |
| 238 | `messages.ts:1084` `reasons.earningsMiss` | Earnings miss and guidance cut | Zisk pod odhadom a znížený výhľad | |
| 239 | `messages.ts:1085` `reasons.belowMa200` | Long-term downtrend: close below MA200 | Dlhodobý pokles: cena pod MA200 | |
| 240 | `messages.ts:1086` `reasons.ma50BelowMa200` | Long-term downtrend: MA50 below MA200 | Dlhodobý pokles: MA50 pod MA200 | |
| 241 | `messages.ts:1087` `reasons.noRevenue` | No revenue or meme-pump flag | Bez tržieb alebo príznak meme pumpy | |
| 242 | `messages.ts:1088` `reasons.shortHistory` | Fewer than 200 price bars, so MA200 cannot be calculated | Menej ako 200 cenových záznamov, MA200 sa nedá vypočítať | |
| 243 | `messages.ts:1089` `reasons.invalidSeries` | Invalid price series | Neplatný cenový rad | |
| 244 | `messages.ts:1090` `reasons.invalidDate` | Invalid, duplicate or unsorted date at bar {n} | Neplatný, duplicitný alebo nezoradený dátum v zázname {n} | |
| 245 | `messages.ts:1091` `reasons.invalidBar` | Invalid price or volume at bar {n} | Neplatná cena alebo objem v zázname {n} | |
| 246 | `messages.ts:1092` `reasons.invalidFundamentals` | Invalid fundamentals | Neplatné fundamentálne údaje | |
| 247 | `messages.ts:1093` `reasons.invalidMacro` | Invalid macro inputs | Neplatné makro vstupy | |
| 248 | `messages.ts:1094` `reasons.stalePrices` | Prices are out of date | Ceny sú zastarané | |
| 249 | `messages.ts:1097` `sectors.AI & semiconductors` | AI and semiconductors | AI a polovodiče | |
| 250 | `messages.ts:1098` `sectors.Cloud & SaaS` | Cloud and SaaS | Cloud a SaaS | |
| 251 | `messages.ts:1099` `sectors.Cybersecurity` | Cybersecurity | Kybernetická bezpečnosť | |
| 252 | `messages.ts:1101` `sectors.Biotech` | Biotech | Biotechnológie | |
| 253 | `messages.ts:1102` `sectors.Energy & EV` | Energy and EV | Energetika a elektromobily | |
| 254 | `messages.ts:1103` `sectors.Additional growth` | Other growth | Ďalšie rastové firmy | |
| 255 | `messages.ts:1104` `sectors.Sample extension` | Sample extension | Ukážkové rozšírenie | |
| 256 | `messages.ts:1105` `sectors.Discovery` | Discovery | Objavené firmy | |
| 257 | `messages.ts:1106` `sectors.Growth` | Growth | Rastové firmy | |
| 258 | `messages.ts:1110` `table.company` | Company | Spoločnosť | |
| 259 | `messages.ts:1111` `table.sector` | Sector | Sektor | |
| 260 | `messages.ts:1112` `table.score` | Score | Skóre | |
| 261 | `messages.ts:1113` `table.rules` | Rules met | Splnené pravidlá | |
| 262 | `messages.ts:1114` `table.state` | Rule state | Stav pravidiel | |
| 263 | `messages.ts:1115` `table.reason` | Rejection rule | Vylučovacie pravidlo | |
| 264 | `messages.ts:1116` `table.date` | Date | Dátum | |
| 265 | `messages.ts:1117` `table.criteria` | Criteria | Kritériá | |
| 266 | `messages.ts:1118` `table.noRejection` | No rejection | Bez vylúčenia | |
| 267 | `messages.ts:1119` `table.sortBy` | Sort by {column} | Zoradiť podľa: {column} | |
| 268 | `messages.ts:1122` `mark.label` | {total} of 25 points. {fundamentals} of 10 fundamentals, {technical} of 10 technical, {macro} of 5 macro. | {total} z 25 bodov. Fundamenty {fundamentals} z 10, technika {technical} z 10, makro {macro} z 5. | |
| 269 | `messages.ts:1123` `mark.none` | No score calculated | Skóre sa nevypočítalo | |
| 270 | `messages.ts:1295` `chart.label` | {name}: closing price over the last {count} sessions, from {first} to {last}, with moving averages and the dip zone. | {name}: záverečná cena za posledných {count} obchodných dní, od {first} do {last}, s kĺzavými priemermi a pásmom poklesu. | |
| 271 | `messages.ts:1296` `chart.close` | Close | Záverečná cena | |
| 272 | `messages.ts:1299` `chart.dip` | Dip zone, 5 to 10% under the 20-day high | Pásmo poklesu, 5 až 10 % pod 20-dňovým maximom | |
| 273 | `messages.ts:1300` `chart.last` | Last close {value} | Posledná cena {value} | |

### Dashboard

| # | Key (SK line) | English | Slovak | OK / suggested fix |
| --- | --- | --- | --- | --- |
| 274 | `messages.ts:1145` `dashboard.title` | Stock screen | Prehľad akcií | |
| 275 | `messages.ts:1146` `dashboard.lede` | Session of {date}. {count} scored with the same rules for every visitor. | Obchodný deň {date}. Hodnotíme {count} rovnakými pravidlami pre každého návštevníka. | |
| 276 | `messages.ts:1147` `dashboard.summaryLabel` | Tickers per rule state | Počet tickerov podľa stavu pravidiel | |
| 277 | `messages.ts:1148` `dashboard.empty` | No ticker is in this state today. | Dnes v tomto stave nie je žiadny ticker. | |
| 278 | `messages.ts:1149` `dashboard.scannerLink` | Open the scanner | Otvoriť skener | |
| 279 | `messages.ts:1150` `dashboard.lowerTitle` | Other states | Ostatné stavy | |
| 280 | `messages.ts:1151` `dashboard.lowerBody` | Waiting, Not now and Not enough data. | Čakanie, Mimo výberu a Nedostatok údajov. | |
| 281 | `messages.ts:1152` `dashboard.showLower` | Show {count} | Zobraziť {count} | |
| 282 | `messages.ts:1154` `dashboard.stateNotes.setup` | At least 72% of core points with data, at least 80% of core weight covered, and no rejection rule. | Aspoň 72 % hlavných bodov s údajmi, pokrytie aspoň 80 % ich váhy a žiadne vylučovacie pravidlo. | |
| 283 | `messages.ts:1155` `dashboard.stateNotes.watch` | 60% to 71.9% of core points with data, or a higher share when less than 80% of core weight is covered. A dip qualifier marks a price 5 to 10% below its 20-day high in an uptrend. | 60 % až 71,9 % hlavných bodov s údajmi alebo vyšší podiel pri pokrytí menej ako 80 % ich váhy. Pokles o 5 až 10 % pod 20-dňové maximum v rastovom trende je pri tickeri vyznačený. | |
| 284 | `messages.ts:1156` `dashboard.stateNotes.broken` | At least one rejection rule applies, so the total does not count. | Platí aspoň jedno vylučovacie pravidlo, takže súčet sa nepočíta. | |

### Scanner (404 unless PAYWALL is on)

| # | Key (SK line) | English | Slovak | OK / suggested fix |
| --- | --- | --- | --- | --- |
| 285 | `messages.ts:1160` `scanner.title` | Scanner | Skener | |
| 286 | `messages.ts:1161` `scanner.lede` | All {count}: the 28 named in the investing guide plus seven labelled extensions. Search, filter by rule state, and sort by any column. | Všetkých {count}: 28 z investičnej príručky a sedem označených rozšírení. Hľadajte, filtrujte podľa stavu a zoraďte podľa ktoréhokoľvek stĺpca. | |
| 287 | `messages.ts:1162` `scanner.searchLabel` | Search the universe | Hľadať v zozname | |
| 288 | `messages.ts:1163` `scanner.searchPlaceholder` | Ticker, company or sector | Ticker, spoločnosť alebo sektor | |
| 289 | `messages.ts:1164` `scanner.filterLabel` | Rule state | Stav pravidiel | |
| 290 | `messages.ts:1165` `scanner.allStates` | All states | Všetky stavy | |
| 291 | `messages.ts:1166` `scanner.clear` | Clear search and filters | Zrušiť hľadanie a filtre | |
| 292 | `messages.ts:1167` `scanner.empty` | No ticker matches this search and filter. | Tomuto hľadaniu a filtru nezodpovedá žiadny ticker. | |
| 293 | `messages.ts:1168` `scanner.showing` | Showing {shown} of {total} | Zobrazené: {shown} z {total} | |
| 294 | `messages.ts:1169` `scanner.rulesMet` | Rules met | Splnené pravidlá | |
| 295 | `messages.ts:1170` `scanner.rulesMetOf` | {met} of {total} | {met} z {total} | |
| 296 | `messages.ts:1171` `scanner.streakToday` | changed today | zmena dnes | |
| 297 | `messages.ts:1172` `scanner.streakSince` | unchanged for {days} | bez zmeny {days} | |
| 298 | `messages.ts:1173` `scanner.streakSinceAtLeast` | unchanged for at least {days} | bez zmeny aspoň {days} | |
| 299 | `messages.ts:1174` `scanner.streakGained` | {count} gained this week | získané tento týždeň: {count} | |
| 300 | `messages.ts:1175` `scanner.streakLost` | {count} lost this week | stratené tento týždeň: {count} | |
| 301 | `messages.ts:1176` `scanner.dayOne` | {n} day | {n} deň | |
| 302 | `messages.ts:1177` `scanner.dayFew` | {n} days | {n} dni | |
| 303 | `messages.ts:1178` `scanner.dayMany` | {n} days | {n} dní | |
| 304 | `messages.ts:1179` `scanner.ruleCountOne` | {count} rule | {count} pravidlo | |
| 305 | `messages.ts:1180` `scanner.ruleCountFew` | {count} rules | {count} pravidlá | |
| 306 | `messages.ts:1181` `scanner.ruleCountMany` | {count} rules | {count} pravidiel | |
| 307 | `messages.ts:1182` `scanner.presetsLabel` | Preset screens | Pripravené filtre | |
| 308 | `messages.ts:1183` `scanner.presetsNote` | A preset is a filter on published rules. It changes which rows show, not what a status means. Every row keeps its status. | Pripravený filter pracuje s uverejnenými pravidlami. Mení, ktoré riadky vidíte, nie význam stavu. Každý riadok si ponechá svoj stav. | |
| 309 | `messages.ts:1184` `scanner.presetAny` | any of {count} rules, last 7 days | ktorékoľvek z {count} pravidiel, posledných 7 dní | |
| 310 | `messages.ts:1185` `scanner.presetMeta` | {rules}, {count} of {total} tickers | {rules}, {count} z {total} tickerov | |
| 311 | `messages.ts:1186` `scanner.presetActive` | Preset: {name} | Filter: {name} | |
| 312 | `messages.ts:1187` `scanner.presetClear` | Clear preset | Zrušiť filter | |
| 313 | `messages.ts:1189` `scanner.presets.growth-earnings.name` | Revenue accelerating, earnings beat | Zrýchlené tržby, zisk nad odhadom | |
| 314 | `messages.ts:1189` `scanner.presets.growth-earnings.note` | Revenue growth sped up and EPS beat the estimate or guidance was raised. | Rast tržieb sa zrýchlil a zisk na akciu bol nad odhadom alebo sa zvýšil výhľad. | |
| 315 | `messages.ts:1190` `scanner.presets.trend-volume.name` | Trend and volume | Trend a objem | |
| 316 | `messages.ts:1190` `scanner.presets.trend-volume.note` | Close above MA50 and MA200, uptrend intact, higher volume on green days. | Zatvorenie nad MA50 a MA200, rastúci trend, vyšší objem v zelených dňoch. | |
| 317 | `messages.ts:1191` `scanner.presets.pullback-uptrend.name` | Pullback in an uptrend | Pokles v rastúcom trende | |
| 318 | `messages.ts:1191` `scanner.presets.pullback-uptrend.note` | Uptrend intact and the close is 5 to 10% below the 20-day high. | Rastúci trend a zatvorenie o 5 až 10 % pod 20-dňovým maximom. | |
| 319 | `messages.ts:1192` `scanner.presets.holders-catalyst.name` | Accumulation and catalyst | Akumulácia a katalyzátor | |
| 320 | `messages.ts:1192` `scanner.presets.holders-catalyst.note` | Insider or institutional accumulation and a curated product catalyst. | Akumulácia insiderov alebo inštitúcií a produktový katalyzátor z vybraného zoznamu. | |
| 321 | `messages.ts:1193` `scanner.presets.macro-tailwind.name` | Macro tailwind | Priaznivé makro | |
| 322 | `messages.ts:1193` `scanner.presets.macro-tailwind.note` | Both the growth-sector rotation flag and the macro data flag are on. | Platí príznak rotácie do rastových sektorov aj príznak makro údajov. | |
| 323 | `messages.ts:1194` `scanner.presets.newly-meeting.name` | Newly meeting rules | Novo splnené pravidlá | |
| 324 | `messages.ts:1194` `scanner.presets.newly-meeting.note` | At least one rule is met now that was not met a week ago. | Aspoň jedno pravidlo je splnené teraz a pred týždňom splnené nebolo. | |
| 325 | `messages.ts:1195` `scanner.presets.rules-lost.name` | Rules lost this week | Pravidlá stratené za týždeň | |
| 326 | `messages.ts:1195` `scanner.presets.rules-lost.note` | At least one rule that was met a week ago now fails. | Aspoň jedno pravidlo splnené pred týždňom teraz neplatí. | |
| 327 | `scanner-floor-messages.ts:21` `result` | {count} of {total} tickers, floor applied | {count} z {total} tickerov, filter likvidity použitý | |
| 328 | `scanner-floor-messages.ts:22` `resultOff` | {count} of {total} tickers, floor off | {count} z {total} tickerov, filter likvidity vypnutý | |
| 329 | `scanner-floor-messages.ts:23` `remove` | Remove the floor | Zrušiť filter likvidity | |
| 330 | `scanner-floor-messages.ts:24` `apply` | Apply the floor | Použiť filter likvidity | |
| 331 | `scanner-floor-messages.ts:25` `rule` | Floor: average daily trading value of at least {volume} over {days} sessions, and market cap of at least {cap}. Tickers without these figures stay in the list. | Filter: priemerná denná obchodovaná hodnota aspoň {volume} za {days} dní a trhová kapitalizácia aspoň {cap}. Tickery bez týchto údajov zostávajú v zozname. | |
| 332 | `scanner-floor-messages.ts:26` `hiddenOne` | {n} ticker is below the floor and hidden. Held tickers always show. | {n} ticker je pod filtrom a je skrytý. Držané tickery sa zobrazia vždy. | |
| 333 | `scanner-floor-messages.ts:27` `hiddenFew` | {n} tickers are below the floor and hidden. Held tickers always show. | {n} tickery sú pod filtrom a sú skryté. Držané tickery sa zobrazia vždy. | |
| 334 | `scanner-floor-messages.ts:28` `hiddenMany` | {n} tickers are below the floor and hidden. Held tickers always show. | {n} tickerov je pod filtrom a je skrytých. Držané tickery sa zobrazia vždy. | |
| 335 | `scanner-floor-messages.ts:29` `hiddenNone` | No ticker is below the floor. | Žiadny ticker nie je pod filtrom. | |
| 336 | `scanner-floor-messages.ts:30` `ruleOff` | The floor is off, so thinly traded and small names show too. The floor is average daily trading value of at least {volume} and market cap of at least {cap}. | Filter je vypnutý, preto sa zobrazia aj málo obchodované a malé spoločnosti. Filter je priemerná denná obchodovaná hodnota aspoň {volume} a trhová kapitalizácia aspoň {cap}. | |
| 337 | `scanner-floor-messages.ts:31` `noData` | no data | bez údajov | |
| 338 | `scanner-floor-messages.ts:32` `noDataNote` | Floor figure missing: not enough price bars or no stored share count. | Chýba údaj pre filter: málo cenových dní alebo žiadny uložený počet akcií. | |
| 339 | `scanner-floor-messages.ts:33` `millions` | {n}M USD | {n} mil. USD | |
| 340 | `scanner/page.tsx:40` `sector` | Sector | Sektor | |
| 341 | `scanner/page.tsx:40` `score` | Total score | Celkové skóre | |
| 342 | `scanner/page.tsx:40` `sort` | Sort by | Zoradiť podľa | |
| 343 | `scanner/page.tsx:40` `minimum` | From | Od | |
| 344 | `scanner/page.tsx:40` `maximum` | To | Do | |
| 345 | `scanner/page.tsx:40` `all` | Any | Všetky | |
| 346 | `scanner/page.tsx:40` `held` | Held only | Len držané | |
| 347 | `scanner/page.tsx:40` `source` | Source | Zdroj | |
| 348 | `scanner/page.tsx:40` `guide` | Guide | Príručka | |
| 349 | `scanner/page.tsx:40` `discovery` | Discovery | Objavené | |
| 350 | `scanner/page.tsx:40` `extension` | Extension | Rozšírenie | |
| 351 | `scanner/page.tsx:40` `apply` | Apply filters | Použiť filtre | |
| 352 | `scanner/page.tsx:40` `clear` | Clear filters | Zrušiť filtre | |
| 353 | `scanner/page.tsx:40` `result` | {count} of {total} tickers | {count} z {total} tickerov | |
| 354 | `scanner/page.tsx:40` `empty` | No tickers match these filters. | Žiadny ticker nezodpovedá filtrom. | |
| 355 | `scanner/page.tsx:40` `sourceNote` | Discovery candidates appear after they have a stored score. | Objavené spoločnosti sa zobrazia po uložení skóre. | |

### Company page

| # | Key (SK line) | English | Slovak | OK / suggested fix |
| --- | --- | --- | --- | --- |
| 356 | `messages.ts:1199` `company.blockLabel` | Datasheet | Technický list | |
| 357 | `messages.ts:1200` `company.sector` | Sector | Sektor | |
| 358 | `messages.ts:1201` `company.source` | Source | Zdroj | |
| 359 | `messages.ts:1202` `company.session` | Session | Obchodný deň | |
| 360 | `messages.ts:1203` `company.lastReviewed` | Last reviewed | Naposledy preskúmané | |
| 361 | `messages.ts:1204` `company.nextReview` | Next scheduled review | Ďalšia plánovaná kontrola | |
| 362 | `messages.ts:1205` `company.data` | Data | Údaje | |
| 363 | `messages.ts:1206` `company.scoreTitle` | Score | Skóre | |
| 364 | `messages.ts:1207` `company.scoreTotal` | {total} of 25 | {total} z 25 | |
| 365 | `messages.ts:1208` `company.chartTitle` | Price, last 100 sessions | Cena za posledných 100 obchodných dní | |
| 366 | `messages.ts:1209` `company.chartNote` | Synthetic series, for illustration only. | Syntetický rad, len na ilustráciu. | |
| 367 | `messages.ts:1210` `company.chartTitleLive` | Daily closes, last 100 sessions | Denné zatváracie ceny za posledných 100 obchodných dní | |
| 368 | `messages.ts:1212` `company.history.title` | Score history | História skóre | |
| 369 | `messages.ts:1213` `company.history.note` | Total score per scan day, out of 25. History starts on 2026-10-02, so early charts are short. The rules version can differ between days. | Celkové skóre za každý deň skenu, z 25. História začína 2026-10-02, preto sú prvé grafy krátke. Verzia pravidiel sa medzi dňami môže líšiť. | |
| 370 | `messages.ts:1214` `company.history.empty` | Not enough history yet. A chart needs at least two scan days. | Zatiaľ je málo histórie. Graf potrebuje aspoň dva dni skenu. | |
| 371 | `messages.ts:1215` `company.history.chartLabel` | Total score of {ticker} over {count} scan days, from {first} to {last} | Celkové skóre {ticker} za {count} dní skenu, od {first} do {last} | |
| 372 | `messages.ts:1216` `company.history.tableLabel` | Show as a table | Zobraziť ako tabuľku | |
| 373 | `messages.ts:1217` `company.history.date` | Date | Dátum | |
| 374 | `messages.ts:1218` `company.history.total` | Total | Spolu | |
| 375 | `messages.ts:1219` `company.history.fundamentals` | Fundamentals | Fundamenty | |
| 376 | `messages.ts:1220` `company.history.technical` | Technical | Technika | |
| 377 | `messages.ts:1221` `company.history.macro` | Macro | Makro | |
| 378 | `messages.ts:1222` `company.history.state` | State | Stav | |
| 379 | `messages.ts:1224` `company.ideaTitle` | Latest trade idea | Posledný investičný nápad | |
| 380 | `messages.ts:1225` `company.ideaNote` | Informational screening output from the same rules. Not personal advice. | Informačný výstup z rovnakých pravidiel. Nie je to osobné odporúčanie. | |
| 381 | `messages.ts:1226` `company.noIdea` | No trade idea for this stock yet. A card appears only when the action or the setup rating changes. | Pre túto akciu zatiaľ nie je investičný nápad. Karta sa objaví, len keď sa zmení akcia alebo hodnotenie nastavenia. | |
| 382 | `messages.ts:1227` `company.rulesTitle` | Rule by rule | Pravidlo po pravidle | |
| 383 | `messages.ts:1228` `company.rulesSummary` | {matched} of {count} scoring rules met. | Splnené bodované pravidlá: {matched} z {count}. | |
| 384 | `messages.ts:1229` `company.rejectionTitle` | Rejection rules | Vylučovacie pravidlá | |
| 385 | `messages.ts:1230` `company.rejectionNone` | None triggered. | Žiadne sa nespustilo. | |
| 386 | `messages.ts:1231` `company.needs` | Needs: {text} | Vyžaduje: {text} | |
| 387 | `messages.ts:1232` `company.pointsOf` | +{points} of {max} | +{points} z {max} | |
| 388 | `messages.ts:1233` `company.pointsNone` | 0 of {max} | 0 z {max} | |
| 389 | `messages.ts:1235` `company.checks.triggersWhen` | Triggers when: {text} | Spustí sa, keď: {text} | |
| 390 | `messages.ts:1236` `company.checks.clear` | Not triggered | Nespustilo sa | |
| 391 | `messages.ts:1237` `company.checks.triggered` | Triggered | Spustilo sa | |
| 392 | `messages.ts:1238` `company.checks.revenue` | revenue is flagged as declining, or growth is below 0% | tržby sú označené ako klesajúce alebo rast je pod 0 % | |
| 393 | `messages.ts:1239` `company.checks.earningsMiss` | an EPS miss and a guidance cut are both flagged | je označený zisk pod odhadom aj znížený výhľad | |
| 394 | `messages.ts:1240` `company.checks.belowMa200` | the close is below MA200 | cena je pod MA200 | |
| 395 | `messages.ts:1241` `company.checks.ma50BelowMa200` | MA50 is below MA200 | MA50 je pod MA200 | |
| 396 | `messages.ts:1242` `company.checks.noRevenue` | a no-revenue or meme-pump flag is set | je nastavený príznak firmy bez tržieb alebo meme pumpy | |
| 397 | `messages.ts:1244` `company.insufficientNote` | No score was calculated for this ticker. | Pre tento ticker sa skóre nevypočítalo. | |
| 398 | `messages.ts:1245` `company.inputsTitle` | Structured inputs | Štruktúrované vstupy | |
| 399 | `messages.ts:1246` `company.back` | Back to the stock screen | Späť na prehľad akcií | |
| 400 | `messages.ts:1247` `company.methodLink` | How each rule is defined | Ako je ktoré pravidlo definované | |
| 401 | `messages.ts:1249` `company.inputs.revenueAccelerating` | Revenue growth accelerating | Rast tržieb sa zrýchľuje | |
| 402 | `messages.ts:1250` `company.inputs.revenueGrowthCurrent` | Revenue growth, this quarter | Rast tržieb, tento štvrťrok | |
| 403 | `messages.ts:1251` `company.inputs.revenueGrowthPrior` | Revenue growth, prior quarter | Rast tržieb, minulý štvrťrok | |
| 404 | `messages.ts:1252` `company.inputs.revenueDeclining` | Revenue declining | Tržby klesajú | |
| 405 | `messages.ts:1253` `company.inputs.epsBeat` | EPS beat | Zisk na akciu nad odhadom | |
| 406 | `messages.ts:1254` `company.inputs.guidanceRaised` | Guidance raised | Zvýšený výhľad | |
| 407 | `messages.ts:1255` `company.inputs.guidanceCut` | Guidance cut | Znížený výhľad | |
| 408 | `messages.ts:1256` `company.inputs.narrativeChanged` | Narrative changed | Zmena investičného príbehu | |
| 409 | `messages.ts:1257` `company.inputs.earningsMissAndGuidanceCut` | Earnings miss with guidance cut | Zisk pod odhadom so zníženým výhľadom | |
| 410 | `messages.ts:1258` `company.inputs.productCatalyst` | Product catalyst | Produktový katalyzátor | |
| 411 | `messages.ts:1259` `company.inputs.insiderOrInstitutionalAccumulation` | Insider or institutional accumulation | Nákupy insiderov alebo inštitúcií | |
| 412 | `messages.ts:1260` `company.inputs.noRevenue` | No revenue | Bez tržieb | |
| 413 | `messages.ts:1261` `company.inputs.memePump` | Meme-pump flag | Príznak meme pumpy | |
| 414 | `messages.ts:1262` `company.inputs.growthSectorRotation` | Growth-sector rotation | Rotácia do rastových sektorov | |
| 415 | `messages.ts:1263` `company.inputs.dataTailwind` | Macro data tailwind | Priaznivé makro údaje | |

### Company page: data sources and agreement

| # | Key (SK line) | English | Slovak | OK / suggested fix |
| --- | --- | --- | --- | --- |
| 416 | `messages.ts:832` `agreement.agree` | two independent sources agree | dva nezávislé zdroje sa zhodujú | |
| 417 | `messages.ts:833` `agreement.disputed` | disputed | sporné | |
| 418 | `messages.ts:834` `agreement.single` | one reading (model) | jedno čítanie (model) | |
| 419 | `messages.ts:835` `agreement.xbrl_override` | computed from SEC data | vypočítané z údajov SEC | |
| 420 | `messages.ts:836` `agreement.verified_single` | one reading (model), checked against the quote | jedno čítanie (model), citát overený | |
| 421 | `messages.ts:837` `agreement.data_rule` | data rule | pravidlo z údajov | |
| 422 | `messages.ts:838` `agreement.carried` | carried from {date} | prevzaté z {date} | |
| 423 | `messages.ts:839` `agreement.expired` | expired, unknown | platnosť vypršala, neznáme | |
| 424 | `messages.ts:840` `agreement.title` | Source agreement | Zhoda zdrojov | |
| 425 | `messages.ts:843` `sources.label` | Source | Zdroj | |
| 426 | `messages.ts:844` `sources.none` | No source yet | Zatiaľ bez zdroja | |
| 427 | `messages.ts:845` `sources.secItem` | SEC 8-K item {item} | SEC 8-K, položka {item} | |
| 428 | `messages.ts:846` `sources.noneCatalyst` | No SEC 8-K from the last 90 days with a launch, new product, partnership, FDA approval or contract award, or no 8-K text stored yet. Checked every night against items 1.01, 2.02, 7.01 and 8.01. | Žiadne podanie SEC 8-K z posledných 90 dní so spustením, novým produktom, partnerstvom, schválením FDA alebo zákazkou, alebo ešte nie je uložený text 8-K. Kontrola beží každú noc podľa položiek 1.01, 2.02, 7.01 a 8.01. | |
| 429 | `messages.ts:847` `sources.computedPrices` | Computed from price data | Vypočítané z cenových údajov | |
| 430 | `messages.ts:848` `sources.computedMacro` | Computed from macro data (FRED) | Vypočítané z makro údajov (FRED) | |
| 431 | `messages.ts:849` `sources.methodology` | How it is computed | Ako sa počíta | |
| 432 | `messages.ts:850` `sources.insiderNone` | SEC Form 4: no open-market purchases in the last 90 days ({from} to {to}) | SEC Form 4: žiadne nákupy na voľnom trhu za posledných 90 dní ({from} až {to}) | |
| 433 | `messages.ts:851` `sources.insiderLink` | Form 4 filings for {ticker} | Podania Form 4 pre {ticker} | |
| 434 | `messages.ts:852` `sources.readingSingle` | One reading (model), not confirmed by a second source | Jedno čítanie (model), bez potvrdenia druhým zdrojom | |
| 435 | `messages.ts:853` `sources.readingChecked` | One reading (model) checked against the quote | Jedno čítanie (model) overené voči citátu | |
| 436 | `messages.ts:854` `sources.readingTwo` | Two independent sources agree | Dva nezávislé zdroje sa zhodujú | |
| 437 | `messages.ts:855` `sources.readingSec` | Computed from SEC data | Vypočítané z údajov SEC | |
| 438 | `messages.ts:856` `sources.unknownReview` | No data yet. The nightly review fills it, only for tickers with new filings, up to 6 per night. Earnings-season filings refresh it. | Zatiaľ bez údajov. Dopĺňa ich nočná kontrola, len pre tickery s novými podaniami, najviac 6 za noc. Podania zo sezóny výsledkov ich obnovia. | |
| 439 | `messages.ts:857` `sources.unknownComputed` | No data yet. Computed after the next nightly price and macro update. | Zatiaľ bez údajov. Vypočítajú sa po najbližšej nočnej aktualizácii cien a makro údajov. | |
| 440 | `messages.ts:858` `sources.legendTitle` | Source labels | Označenia zdrojov | |
| 441 | `messages.ts:859` `sources.legendComputed` | Computed from price data or macro data (FRED): our own calculation, no model reading. | Vypočítané z cenových alebo makro údajov (FRED): vlastný výpočet, bez čítania modelom. | |
| 442 | `messages.ts:860` `sources.legendSec` | Computed from SEC data: read from stored SEC filings and company facts. | Vypočítané z údajov SEC: vyčítané z uložených podaní SEC a faktov spoločnosti. | |
| 443 | `messages.ts:861` `sources.legendTwo` | Two independent sources: two separate readings agree. | Dva nezávislé zdroje: dve samostatné čítania sa zhodujú. | |
| 444 | `messages.ts:862` `sources.legendChecked` | One reading (model) checked against the quote: one model reading, and its quoted text was found in the filing. | Jedno čítanie (model) overené voči citátu: jedno čítanie modelom a jeho citovaný text sa našiel v podaní. | |
| 445 | `messages.ts:863` `sources.legendSingle` | One reading (model): one model reading, not confirmed by a second source. | Jedno čítanie (model): jedno čítanie modelom, bez potvrdenia druhým zdrojom. | |
| 446 | `messages.ts:864` `sources.legendUnknown` | No data yet: the nightly review fills it, only for tickers with new filings, up to 6 per night; earnings-season filings refresh it. | Zatiaľ bez údajov: dopĺňa ich nočná kontrola, len pre tickery s novými podaniami, najviac 6 za noc; podania zo sezóny výsledkov ich obnovia. | |
| 447 | `messages.ts:865` `sources.summary` | Data sources | Zdroje údajov | |
| 448 | `messages.ts:866` `sources.newTab` | opens in a new tab | otvorí sa na novej karte | |
| 449 | `messages.ts:868` `sources.kinds.release` | Earnings release | Výsledková správa | |
| 450 | `messages.ts:873` `sources.kinds.filing` | SEC filing | Podanie SEC | |
| 451 | `messages.ts:874` `sources.kinds.xbrl` | SEC XBRL company facts | SEC XBRL údaje spoločnosti | |
| 452 | `messages.ts:875` `sources.kinds.alphavantage` | Alpha Vantage earnings data | Údaje o zisku od Alpha Vantage | |
| 453 | `messages.ts:876` `sources.kinds.fred` | FRED 10-year yield | 10-ročný výnos FRED | |
| 454 | `messages.ts:878` `sources.kinds.prices` | Own price bars | Vlastné cenové údaje | |
| 455 | `messages.ts:879` `sources.kinds.pricesUniverse` | Own price data (SPY and universe tickers) | Vlastné cenové údaje (SPY a tickery univerza) | |
| 456 | `messages.ts:880` `sources.kinds.unstored` | Cited page, no stored copy | Citovaná stránka, bez uloženej kópie | |

### Company page: flags

| # | Key (SK line) | English | Slovak | OK / suggested fix |
| --- | --- | --- | --- | --- |
| 457 | `messages.ts:1267` `flags.title` | Flags | Príznaky | |
| 458 | `messages.ts:1268` `flags.note` | Flags sit apart from the score and never change it. Each one is a stored fact checked against a fixed line, the same for every visitor. Missing data shows as no data, not as a pass. | Príznaky stoja bokom od skóre a nikdy ho nemenia. Každý je uložený údaj porovnaný s pevnou hranicou, rovnaký pre každého návštevníka. Chýbajúce údaje sa zobrazia ako bez údajov, nie ako splnené. | |
| 459 | `messages.ts:1269` `flags.state.flagged` | Flagged | Označené | |
| 460 | `messages.ts:1269` `flags.state.clear` | Not flagged | Neoznačené | |
| 461 | `messages.ts:1269` `flags.state.noData` | No data | Bez údajov | |
| 462 | `messages.ts:1270` `flags.names.dilution` | Share count growth | Rast počtu akcií | |
| 463 | `messages.ts:1270` `flags.names.illiquid` | Low trading volume | Nízky objem obchodovania | |
| 464 | `messages.ts:1270` `flags.names.interestCover` | Interest cover | Krytie úrokov | |
| 465 | `messages.ts:1270` `flags.names.shortInterest` | Short interest | Krátke pozície | |
| 466 | `messages.ts:1270` `flags.names.drawdown` | Drop from the 20-day high | Pokles od 20-dňového maxima | |
| 467 | `messages.ts:1272` `flags.thresholds.dilution` | Flagged when the reported share count is up {percent} or more over about a year. | Označené, keď je vykázaný počet akcií za približne rok vyšší o {percent} alebo viac. | |
| 468 | `messages.ts:1273` `flags.thresholds.illiquid` | Flagged when average daily trading value over {days} sessions is under {amount}. | Označené, keď je priemerná denná hodnota obchodov za {days} dní nižšia ako {amount}. | |
| 469 | `messages.ts:1274` `flags.thresholds.interestCover` | Flagged when operating income covers interest expense less than {times} times. | Označené, keď prevádzkový zisk pokrýva úrokové náklady menej ako {times}-krát. | |
| 470 | `messages.ts:1275` `flags.thresholds.shortInterest` | Flagged when short interest is {percent} or more of float. | Označené, keď krátke pozície tvoria {percent} alebo viac voľne obchodovateľných akcií. | |
| 471 | `messages.ts:1276` `flags.thresholds.drawdown` | Flagged when the last close is {percent} or more under the 20-day high. | Označené, keď je posledná záverečná cena o {percent} alebo viac pod 20-dňovým maximom. | |
| 472 | `messages.ts:1279` `flags.values.dilution` | Shares {change} between {fromDate} ({from}) and {toDate} ({to}). | Počet akcií {change} medzi {fromDate} ({from}) a {toDate} ({to}). | |
| 473 | `messages.ts:1280` `flags.values.illiquid` | Average daily trading value {amount}. | Priemerná denná hodnota obchodov {amount}. | |
| 474 | `messages.ts:1281` `flags.values.interestCover` | Operating income covers interest expense {times} times. | Prevádzkový zisk pokrýva úrokové náklady {times}-krát. | |
| 475 | `messages.ts:1282` `flags.values.interestCoverNone` | No interest expense reported. | Úrokové náklady nie sú vykázané. | |
| 476 | `messages.ts:1283` `flags.values.shortInterest` | {percent} of float. | {percent} voľne obchodovateľných akcií. | |
| 477 | `messages.ts:1284` `flags.values.drawdown` | The last close is {percent} under the 20-day high. | Posledná záverečná cena je o {percent} pod 20-dňovým maximom. | |
| 478 | `messages.ts:1287` `flags.missing.dilution` | Needs two reported share counts about a year apart. | Potrebné sú dva vykázané počty akcií s odstupom približne roka. | |
| 479 | `messages.ts:1288` `flags.missing.illiquid` | Needs 20 sessions of price and volume. | Potrebných je 20 obchodných dní s cenou a objemom. | |
| 480 | `messages.ts:1289` `flags.missing.interestCover` | Operating income or interest expense is not stored yet. | Prevádzkový zisk alebo úrokové náklady zatiaľ nie sú uložené. | |
| 481 | `messages.ts:1290` `flags.missing.shortInterest` | No short interest source is stored yet. | Zdroj krátkych pozícií zatiaľ nie je uložený. | |
| 482 | `messages.ts:1291` `flags.missing.drawdown` | Needs 20 sessions of prices. | Potrebných je 20 obchodných dní s cenami. | |

### Company page: data status block

| # | Key (SK line) | English | Slovak | OK / suggested fix |
| --- | --- | --- | --- | --- |
| 483 | `data-status-messages.ts:26` `title` | Data status | Stav údajov | |
| 484 | `data-status-messages.ts:27` `note` | Newest stored date for each dataset behind this page. Informational only. | Najnovší uložený dátum pre každú sadu údajov za touto stránkou. Len informačne. | |
| 485 | `data-status-messages.ts:29` `datasets.prices.label` | Prices | Ceny | |
| 486 | `data-status-messages.ts:29` `datasets.prices.source` | End-of-day price feed | Denný zdroj záverečných cien | |
| 487 | `data-status-messages.ts:30` `datasets.fundamentals.label` | Fundamentals | Fundamenty | |
| 488 | `data-status-messages.ts:30` `datasets.fundamentals.source` | SEC EDGAR financial statement data | Finančné výkazy SEC EDGAR | |
| 489 | `data-status-messages.ts:31` `datasets.filings.label` | Filings and 8-K | Podania a 8-K | |
| 490 | `data-status-messages.ts:33` `datasets.macro.label` | Macro series | Makro rady | |
| 491 | `data-status-messages.ts:34` `datasets.news.label` | News | Správy | |
| 492 | `data-status-messages.ts:34` `datasets.news.source` | Press-release feeds | Tlačové správy firiem | |
| 493 | `data-status-messages.ts:36` `state.current` | current | aktuálne | |
| 494 | `data-status-messages.ts:36` `state.stale` | stale | zastarané | |
| 495 | `data-status-messages.ts:36` `state.none` | no data | bez údajov | |
| 496 | `data-status-messages.ts:37` `updated` | Updated {date} | Aktualizované {date} | |
| 497 | `data-status-messages.ts:38` `coverageLabel` | Data coverage | Pokrytie údajmi | |
| 498 | `data-status-messages.ts:39` `coverage` | {known} of {total} core rules have data | {known} z {total} základných pravidiel má údaje | |
| 499 | `data-status-messages.ts:40` `coveragePoints` | {points} of {max} core points have data. Guard: {guard}. | {points} z {max} základných bodov má údaje. Hranica: {guard}. | |
| 500 | `data-status-messages.ts:41` `level.full` | Full | Úplné | |
| 501 | `data-status-messages.ts:41` `level.partial` | Partial | Čiastočné | |
| 502 | `data-status-messages.ts:41` `level.limited` | Limited | Obmedzené | |
| 503 | `data-status-messages.ts:41` `level.none` | None | Žiadne | |
| 504 | `data-status-messages.ts:42` `limitedNote` | Below the {percent}% coverage guard, so the score is flagged as incomplete data. | Pod hranicou pokrytia {percent} %, preto je skóre označené ako neúplné údaje. | |
| 505 | `data-status-messages.ts:43` `noScore` | No score yet, so there is no rule coverage to show. | Zatiaľ bez skóre, preto nie je čo ukázať z pokrytia pravidiel. | |

### Company page: SEO title, description, summary

| # | Key (SK line) | English | Slovak | OK / suggested fix |
| --- | --- | --- | --- | --- |
| 506 | `seo-messages.ts:30` `rulesTotal.one` | {n} rule | {n} pravidla | |
| 507 | `seo-messages.ts:30` `rulesTotal.few` | {n} rules | {n} pravidiel | |
| 508 | `seo-messages.ts:30` `rulesTotal.many` | {n} rules | {n} pravidla | |
| 509 | `seo-messages.ts:30` `rulesTotal.other` | {n} rules | {n} pravidiel | |
| 510 | `seo-messages.ts:31` `title` | {label}: meets {met} of {rules} | {label}: spĺňa {met} z {rules} | |
| 511 | `seo-messages.ts:32` `titleNoScore` | {label}: not enough data to score | {label}: nedostatok údajov na skóre | |
| 512 | `seo-messages.ts:33` `description` | {ticker} meets {met} of {rules} as of {date}. State: {state}. Data for {known} of {rules}. Informational screening, not advice. | {ticker} spĺňa {met} z {rules} k {date}. Stav: {state}. Údaje pre {known} z {rules}. Informatívny prehľad, nie poradenstvo. | |
| 513 | `seo-messages.ts:34` `descriptionNoDate` | {ticker} meets {met} of {rules}. State: {state}. Data for {known} of {rules}. Informational screening, not advice. | {ticker} spĺňa {met} z {rules}. Stav: {state}. Údaje pre {known} z {rules}. Informatívny prehľad, nie poradenstvo. | |
| 514 | `seo-messages.ts:35` `descriptionNoScore` | {ticker} has not enough data to score as of {date}. Informational screening, not advice. | {ticker} nemá k {date} dosť údajov na skóre. Informatívny prehľad, nie poradenstvo. | |
| 515 | `seo-messages.ts:36` `summary` | As of {date}, {ticker} meets {met} of {rules} in the published screening method. State: {state}. Data covers {known} of {rules}. | K {date} {ticker} spĺňa {met} z {rules} zverejnenej metodiky. Stav: {state}. Údaje pokrývajú {known} z {rules}. | |
| 516 | `seo-messages.ts:37` `summaryNoDate` | {ticker} meets {met} of {rules} in the published screening method. State: {state}. Data covers {known} of {rules}. | {ticker} spĺňa {met} z {rules} zverejnenej metodiky. Stav: {state}. Údaje pokrývajú {known} z {rules}. | |
| 517 | `seo-messages.ts:38` `summaryNoScore` | As of {date}, {ticker} has not enough data to be scored. | K {date} {ticker} nemá dosť údajov na skóre. | |

### Sector map

| # | Key (SK line) | English | Slovak | OK / suggested fix |
| --- | --- | --- | --- | --- |
| 518 | `heatmap-messages.ts:28` `navLabel` | Sector map | Mapa sektorov | |
| 519 | `heatmap-messages.ts:29` `metaTitle` | Sector map | Mapa sektorov | |
| 520 | `heatmap-messages.ts:30` `metaDescription` | Tracked tickers grouped by sector, coloured by 1-month or 3-month price change or by the share of published rules met. Informational screening only. | Sledované tickery zoskupené podľa sektora, zafarbené podľa 1-mesačnej alebo 3-mesačnej zmeny ceny alebo podľa podielu splnených zverejnených pravidiel. Len informačný prehľad. | |
| 521 | `heatmap-messages.ts:31` `title` | Sector map | Mapa sektorov | |
| 522 | `heatmap-messages.ts:32` `lede` | The tracked tickers grouped by sector. Each tile shows its value as text and as a colour. Informational screening only. | Sledované tickery zoskupené podľa sektora. Každá dlaždica ukazuje hodnotu textom aj farbou. Len informačný prehľad. | |
| 523 | `heatmap-messages.ts:33` `metricLabel` | Colour by | Farba podľa | |
| 524 | `heatmap-messages.ts:34` `metrics.1m` | 1-month price change | 1-mesačná zmena ceny | |
| 525 | `heatmap-messages.ts:34` `metrics.3m` | 3-month price change | 3-mesačná zmena ceny | |
| 526 | `heatmap-messages.ts:34` `metrics.rules` | Share of rules met | Podiel splnených pravidiel | |
| 527 | `heatmap-messages.ts:35` `average` | Sector average | Priemer sektora | |
| 528 | `heatmap-messages.ts:36` `tickers` | {n} of {total} tickers with data | {n} z {total} tickerov s údajmi | |
| 529 | `heatmap-messages.ts:37` `noValue` | no data | bez údajov | |
| 530 | `heatmap-messages.ts:38` `empty` | No tracked tickers yet. | Zatiaľ nie sú sledované žiadne tickery. | |
| 531 | `heatmap-messages.ts:39` `sectorEmpty` | No data for this sector | Pre tento sektor nie sú údaje | |
| 532 | `heatmap-messages.ts:40` `legendTitle` | How to read the colours | Ako čítať farby | |
| 533 | `heatmap-messages.ts:41` `legendPrice` | Blue tiles are up, orange tiles are down, and the sign (+ or −) is written on every tile. Stronger colour means a larger move. Grey means close to flat or no data. | Modré dlaždice rástli, oranžové klesli a znamienko (+ alebo −) je napísané na každej dlaždici. Silnejšia farba znamená väčší pohyb. Sivá znamená takmer nulovú zmenu alebo chýbajúce údaje. | |
| 534 | `heatmap-messages.ts:42` `legendRules` | Darker blue means a larger share of the rules with data are met. The percentage is written on every tile. Grey means no data. | Tmavšia modrá znamená väčší podiel splnených pravidiel z tých, ktoré mali údaje. Percento je napísané na každej dlaždici. Sivá znamená chýbajúce údaje. | |
| 535 | `heatmap-messages.ts:43` `note1m` | Change in closing price over the last 21 trading sessions. | Zmena záverečnej ceny za posledných 21 obchodných dní. | |
| 536 | `heatmap-messages.ts:44` `note3m` | Change in closing price over the last 63 trading sessions. | Zmena záverečnej ceny za posledných 63 obchodných dní. | |
| 537 | `heatmap-messages.ts:45` `noteRules` | Rules met out of the rules that had data for the ticker on its last score date. | Splnené pravidlá z pravidiel, ktoré mali pre ticker údaje v dátume posledného skóre. | |
| 538 | `heatmap-messages.ts:46` `scope` | Only tickers in the tracked universe appear. Prices come from the same daily series as the stock screen. | Zobrazené sú len tickery zo sledovaného zoznamu. Ceny pochádzajú z rovnakého denného radu ako prehľad akcií. | |
| 539 | `heatmap-messages.ts:47` `asOf` | Scores as of {date} | Skóre k {date} | |

### Track record

| # | Key (SK line) | English | Slovak | OK / suggested fix |
| --- | --- | --- | --- | --- |
| 540 | `messages.ts:1303` `trackRecord.title` | Track record | História záznamov | |
| 541 | `messages.ts:1304` `trackRecord.lede` | Three dated snapshots of the full sample universe, broken criteria included. A live alert history needs a persistent event log, which is not connected yet. | Tri datované snímky celého ukážkového zoznamu vrátane porušených kritérií. Živá história upozornení potrebuje trvalý záznam udalostí, ktorý zatiaľ nie je pripojený. | |
| 542 | `messages.ts:1305` `trackRecord.note` | All scores and the benchmark on this page are synthetic. They are not past results and they do not measure returns. | Všetky skóre aj porovnávací index na tejto stránke sú syntetické. Nie sú to minulé výsledky a nemerajú výnosy. | |
| 543 | `messages.ts:1306` `trackRecord.liveLede` | Dated screening records and the returns observed after each signal. | Datované záznamy hodnotení a výnosy namerané po jednotlivých signáloch. | |
| 544 | `messages.ts:1307` `trackRecord.liveNote` | This is a record of past screening signals for information only. Past returns do not predict future returns. | Ide o prehľad minulých signálov na informačné účely. Minulé výnosy nepredpovedajú budúce výnosy. | |
| 545 | `messages.ts:1308` `trackRecord.summaryTitle` | Recorded history | Zaznamenaná história | |
| 546 | `messages.ts:1309` `trackRecord.summaryOne` | 1 snapshot. First recorded date: {date}. | Počet snímok: 1. Prvý záznam: {date}. | |
| 547 | `messages.ts:1310` `trackRecord.summary` | {count} snapshots. First recorded date: {date}. | Počet snímok: {count}. Prvý záznam: {date}. | |
| 548 | `messages.ts:1311` `trackRecord.none` | none yet | zatiaľ žiadny | |
| 549 | `messages.ts:1312` `trackRecord.hitRate` | 20-trading-day SPY beat rate: {rate} across {n} measured buy signals. | Podiel nákupných signálov, ktoré za 20 obchodných dní prekonali SPY: {rate} z {n} vyhodnotených. | |
| 550 | `messages.ts:1313` `trackRecord.smallSample` | {n} buy signals, too few to conclude. | Počet nákupných signálov: {n}. Vzorka je príliš malá na záver. | |
| 551 | `messages.ts:1314` `trackRecord.excluded` | Signals from before the log started on {date} are not included. | Signály spred {date}, keď sa záznam začal viesť, nie sú zahrnuté. | |
| 552 | `messages.ts:1315` `trackRecord.periodTitle` | By period | Podľa obdobia | |
| 553 | `messages.ts:1316` `trackRecord.periodMonth` | Month | Mesiac | |
| 554 | `messages.ts:1317` `trackRecord.periodYear` | Year | Rok | |
| 555 | `messages.ts:1318` `trackRecord.periodN` | Measured | Vyhodnotené | |
| 556 | `messages.ts:1319` `trackRecord.periodHit` | Beat SPY | Prekonali SPY | |
| 557 | `messages.ts:1320` `trackRecord.periodExcess` | Mean vs SPY | Priemer voči SPY | |
| 558 | `messages.ts:1321` `trackRecord.periodSpy` | SPY change | Zmena SPY | |
| 559 | `messages.ts:1322` `trackRecord.periodSpyRow` | SPY, {from} to {to} | SPY, {from} až {to} | |
| 560 | `messages.ts:1323` `trackRecord.periodNote` | Each row uses the 20-trading-day window. Periods are calendar months while the log is under a year old, calendar years after that. A period where the signals trailed SPY is listed the same way as any other. | Každý riadok používa okno 20 obchodných dní. Obdobia sú kalendárne mesiace, kým je záznam mladší ako rok, potom kalendárne roky. Obdobie, v ktorom signály zaostali za SPY, je uvedené rovnako ako ostatné. | |
| 561 | `messages.ts:1324` `trackRecord.methodLine` | Universe: {universe} tickers. Log start: {date}. Signals: {n}. No costs or slippage are included. | Zoznam: {universe} tickerov. Začiatok záznamu: {date}. Signály: {n}. Bez nákladov a preklzu. | |
| 562 | `messages.ts:1325` `trackRecord.backtest` | Backtest: not shown. This page covers only signals recorded on the day they were made. | Spätný test: nezobrazený. Stránka obsahuje len signály zaznamenané v deň, keď vznikli. | |
| 563 | `messages.ts:1326` `trackRecord.worstTitle` | Weakest outcomes | Najslabšie výsledky | |
| 564 | `messages.ts:1327` `trackRecord.worstNote` | The measured windows that trailed SPY the most. Losers stay in the record. | Vyhodnotené okná, ktoré za SPY zaostali najviac. Stratové signály ostávajú v zázname. | |
| 565 | `messages.ts:1328` `trackRecord.window` | Window | Okno | |
| 566 | `messages.ts:1329` `trackRecord.worstCell` | {stock} · vs SPY {excess} | {stock} · voči SPY {excess} | |
| 567 | `messages.ts:1330` `trackRecord.signalsTitle` | Signals | Signály | |
| 568 | `messages.ts:1331` `trackRecord.empty` | No real snapshots or signals have been recorded yet. History will appear after the next scoring run. | Zatiaľ nie sú uložené žiadne skutočné snímky ani signály. História sa začne tvoriť po ďalšom hodnotení. | |
| 569 | `messages.ts:1332` `trackRecord.noSignals` | No signals have been recorded yet. | Zatiaľ nebol zaznamenaný žiadny signál. | |
| 570 | `messages.ts:1333` `trackRecord.date` | Date | Dátum | |
| 571 | `messages.ts:1335` `trackRecord.state` | Tier and state | Úroveň a stav | |
| 572 | `messages.ts:1336` `trackRecord.stateOnly` | Rule state | Stav pravidiel | |
| 573 | `messages.ts:1337` `trackRecord.ruleEvent` | Recorded rule event | Zaznamenaná udalosť pravidiel | |
| 574 | `messages.ts:1338` `trackRecord.signalTiers.SETUP` | Conditions met | Podmienky splnené | |
| 575 | `messages.ts:1338` `trackRecord.signalTiers.BROKEN` | Criteria broken | Kritériá porušené | |
| 576 | `messages.ts:1338` `trackRecord.signalTiers.STARTER` | Starter | Úvodná | |
| 577 | `messages.ts:1338` `trackRecord.signalTiers.STANDARD` | Standard | Štandardná | |
| 578 | `messages.ts:1338` `trackRecord.signalTiers.FULL` | Full | Plná | |
| 579 | `messages.ts:1338` `trackRecord.signalTiers.ADD_THIRD` | Add 1/3 | Prikúpiť 1/3 | |
| 580 | `messages.ts:1338` `trackRecord.signalTiers.ADD_HALF` | Add 1/2 | Prikúpiť 1/2 | |
| 581 | `messages.ts:1338` `trackRecord.signalTiers.NONE` | No new money | Bez nových peňazí | |
| 582 | `messages.ts:1339` `trackRecord.return1` | 1 trading day | 1 obchodný deň | |
| 583 | `messages.ts:1340` `trackRecord.return5` | 5 trading days | 5 obchodných dní | |
| 584 | `messages.ts:1341` `trackRecord.return20` | 20 trading days | 20 obchodných dní | |
| 585 | `messages.ts:1342` `trackRecord.return60` | 60 trading days | 60 obchodných dní | |
| 586 | `messages.ts:1343` `trackRecord.returnCell` | {stock} · vs SPY {excess} | {stock} · voči SPY {excess} | |
| 587 | `messages.ts:1344` `trackRecord.pending` | Pending | Čaká sa | |
| 588 | `messages.ts:1345` `trackRecord.method` | Returns use the stored closing price on the signal date and the close after 1, 5, 20 or 60 shared trading sessions. SPY uses the same dates. A window stays pending until both closing prices exist. | Výnos sa počíta z uloženej zatváracej ceny v deň signálu a zo zatváracej ceny po 1, 5, 20 alebo 60 spoločných obchodných dňoch. SPY používa rovnaké dátumy. Kým obe ceny nie sú k dispozícii, výsledok čaká. | |
| 589 | `messages.ts:1346` `trackRecord.benchmarkTitle` | Synthetic benchmark | Syntetický porovnávací index | |
| 590 | `messages.ts:1347` `trackRecord.benchmarkName` | Synthetic benchmark | Syntetický index | |
| 591 | `messages.ts:1348` `trackRecord.benchmarkNote` | Illustrative index level. No comparison or return claim is made. | Ilustračná úroveň indexu. Nejde o porovnanie ani o tvrdenie o výnosoch. | |
| 592 | `messages.ts:1349` `trackRecord.logTitle` | Screening log | Záznam hodnotení | |
| 593 | `messages.ts:1350` `trackRecord.snapshot` | Snapshot of {date} | Snímka z {date} | |
| 594 | `messages.ts:1351` `trackRecord.olderSnapshot` | Snapshot of {date}, {count} | Snímka z {date}, {count} | |

### Portfolio

| # | Key (SK line) | English | Slovak | OK / suggested fix |
| --- | --- | --- | --- | --- |
| 595 | `messages.ts:1354` `portfolio.held` | In portfolio | V portfóliu | |
| 596 | `messages.ts:1355` `portfolio.heldNoSignal` | In portfolio, no signal for another purchase | V portfóliu, bez signálu na ďalší nákup | |
| 597 | `messages.ts:1356` `portfolio.title` | Owner's portfolio | Portfólio prevádzkovateľa | |
| 598 | `messages.ts:1357` `portfolio.lede` | A dated view of the positions held by the site owner. The figures here are sample data until a live feed is connected. | Datovaný prehľad pozícií prevádzkovateľa stránky. Kým nebude pripojený živý zdroj, zobrazené údaje sú ukážkové. | |
| 599 | `messages.ts:1358` `portfolio.liveLede` | A delayed, dated view of the positions held by the site owner. | Oneskorene zverejnený prehľad pozícií prevádzkovateľa stránky. | |
| 600 | `messages.ts:1359` `portfolio.disclosure` | The site owner holds the positions shown. This page is informational and is not an investment recommendation. | Prevádzkovateľ stránky drží zobrazené pozície. Stránka má informačný charakter a nie je investičným odporúčaním. | |
| 601 | `messages.ts:1360` `portfolio.sampleDisclosure` | These sample positions do not show the site owner's holdings. The future live page will show positions the owner holds. This page is informational and is not an investment recommendation. | Tieto ukážkové pozície nezobrazujú skutočné portfólio prevádzkovateľa. Budúca živá verzia ukáže pozície, ktoré drží. Stránka má informačný charakter a nie je investičným odporúčaním. | |
| 602 | `messages.ts:1361` `portfolio.delay` | Published one trading day after the statement date. | Zverejnené jeden obchodný deň po dátume výpisu. | |
| 603 | `messages.ts:1362` `portfolio.asOf` | As of {date} | Stav k {date} | |
| 604 | `messages.ts:1363` `portfolio.chartTitle` | Since {date} | Od {date} | |
| 605 | `messages.ts:1364` `portfolio.chartNote` | Portfolio return uses time-weighted return (TWR). SPY is a sample benchmark on the same base. Values shown here are synthetic. | Výnos portfólia vychádza z časovo váženého výnosu (TWR). Ukážkový porovnávací index SPY má rovnaký základ. Zobrazené hodnoty sú syntetické. | |
| 606 | `messages.ts:1365` `portfolio.liveChartNote` | Both lines start at zero on the first date. The portfolio line chains daily returns net of deposits (time-weighted return). SPY uses the last close on or before each date. | Obe čiary začínajú k prvému dátumu na nule. Čiara portfólia reťazí denné výnosy po odpočte vkladov (časovo vážený výnos). SPY používa posledné zatváracie ceny k danému dátumu alebo pred ním. | |
| 607 | `messages.ts:1366` `portfolio.historyBuilding` | History builds from {date}; the broker report currently provides only {n} points. | História sa buduje od {date}; výkaz od brokera zatiaľ poskytuje iba {n} bodov. | |
| 608 | `messages.ts:1367` `portfolio.twrSince` | Time-weighted return since start | Časovo vážený výnos od začiatku | |
| 609 | `messages.ts:1368` `portfolio.kpiCurrent` | Return since start | Zhodnotenie od začiatku | |
| 610 | `messages.ts:1369` `portfolio.kpiSince` | Time-weighted, net of deposits | Časovo vážené, po odpočte vkladov | |
| 611 | `messages.ts:1370` `portfolio.kpiBenchmark` | SPY over the same period | SPY za rovnaké obdobie | |
| 612 | `messages.ts:1371` `portfolio.kpiDifference` | Versus SPY | Oproti SPY | |
| 613 | `messages.ts:1372` `portfolio.kpiAhead` | ahead of SPY | pred SPY | |
| 614 | `messages.ts:1373` `portfolio.kpiBehind` | behind SPY | za SPY | |
| 615 | `messages.ts:1374` `portfolio.kpiDrawdown` | Largest drop from a peak | Najväčší pokles z vrcholu | |
| 616 | `messages.ts:1375` `portfolio.chartAria` | Portfolio and SPY, change in percent since the first date, zero is the starting value | Portfólio a SPY, zmena v percentách od prvého dátumu, nula je východisková hodnota | |
| 617 | `messages.ts:1376` `portfolio.benchmarkSince` | SPY since start | SPY od začiatku | |
| 618 | `messages.ts:1377` `portfolio.portfolioLine` | Portfolio | Portfólio | |
| 619 | `messages.ts:1378` `portfolio.benchmarkLine` | SPY benchmark | Porovnávací index SPY | |
| 620 | `messages.ts:1379` `portfolio.weightsTitle` | Position weights | Váhy pozícií | |
| 621 | `messages.ts:1381` `portfolio.weight` | Weight | Váha | |

### Methodology

| # | Key (SK line) | English | Slovak | OK / suggested fix |
| --- | --- | --- | --- | --- |
| 622 | `messages.ts:1384` `methodology.title` | Methodology | Metodika | |
| 623 | `messages.ts:1385` `methodology.lede` | Every visitor sees the same result from the same rules. A score describes which published conditions a stock meets. It does not take anyone's finances or goals into account. | Každý návštevník vidí rovnaký výsledok z rovnakých pravidiel. Skóre opisuje, ktoré zverejnené podmienky akcia spĺňa. Neprihliada na financie ani ciele konkrétneho čitateľa. | |
| 624 | `messages.ts:1386` `methodology.scoreTitle` | How the percentage is calculated | Ako sa počíta percento | |
| 625 | `messages.ts:1387` `methodology.scoreBody` | Nine core rules use data collected at least quarterly. The percentage divides points met by points with data among those rules. A core rule without data is omitted and the page shows how many core rules have data. Ad hoc catalyst findings appear separately as a bonus and never change the percentage or displayed band. | Deväť hlavných pravidiel používa údaje zbierané aspoň štvrťročne. Percento je podiel splnených bodov z bodov hlavných pravidiel s údajmi. Hlavné pravidlo bez údajov sa vynechá a stránka uvádza, koľko hlavných pravidiel má údaje. Príležitostné zistenia o katalyzátoroch sa zobrazujú osobitne ako bonus a nemenia percento ani zobrazený stupeň. | |
| 626 | `messages.ts:1388` `methodology.groupMax` | Up to {max} points | Najviac {max} bodov | |
| 627 | `messages.ts:1389` `methodology.versionLine` | Ruleset {version}, rules as of {date}. | Sada pravidiel {version}, pravidlá k {date}. | |
| 628 | `messages.ts:1390` `methodology.workedTitle` | Worked examples | Vzorové príklady | |
| 629 | `messages.ts:1391` `methodology.workedBody` | Replaying the stored scores of 9 October 2026 under these rules, AMD, DDOG, NVDA and SNOW each had 17 of the 23 points that had data. That is 74%, above the 72% step, so each reached Setup. | Pri spätnom prepočte uložených skóre z 9. októbra 2026 podľa týchto pravidiel mali AMD, DDOG, NVDA a SNOW po 17 z 23 bodov, ktoré mali údaje. To je 74 %, nad hranicou 72 %, takže každá dosiahla stav Podmienky splnené. | |
| 630 | `messages.ts:1392` `methodology.workedCap` | Now take a ticker with data for only 17 of the 23 core points that meets 14 of them. That is 82%, enough for Setup, but 17 is under 19, so it is shown as Watch and flagged as incomplete data. | Teraz vezmite ticker s údajmi len pre 17 z 23 bodov hlavných pravidiel, z ktorých spĺňa 14. To je 82 %, dosť na stav Podmienky splnené, ale 17 je menej ako 19, takže sa zobrazí ako Sledovanie a označí ako neúplné údaje. | |
| 631 | `messages.ts:1393` `methodology.limitsTitle` | Limits | Obmedzenia | |
| 632 | `messages.ts:1394` `methodology.limitsBody` | A rule without data is left out of the percentage instead of counting as a miss, so a ticker with gaps can look better than one with full data. The coverage guard caps only the top step: a ticker with data for few rules can still reach Watch. Some thresholds await review. A changed rule gets a new ruleset version. | Pravidlo bez údajov sa vynechá z percenta a nepočíta sa ako nesplnené, takže ticker s medzerami môže vyzerať lepšie ako ticker s úplnými údajmi. Ochrana pokrytia obmedzuje len najvyšší stupeň: ticker s údajmi pre málo pravidiel môže stále dosiahnuť Sledovanie. Niektoré prahy čakajú na kontrolu. Zmenené pravidlo dostane novú verziu sady pravidiel. | |
| 633 | `messages.ts:1395` `methodology.rejectionTitle` | Rejection rules | Vylučovacie pravidlá | |
| 634 | `messages.ts:1396` `methodology.rejectionBody` | These override the total and move a ticker to Criteria broken: declining revenue, an earnings miss together with a guidance cut, a close below MA200, MA50 below MA200, and a no-revenue or meme-pump flag. | Tieto pravidlá majú prednosť pred súčtom a presunú ticker do stavu Kritériá porušené: klesajúce tržby, zisk pod odhadom spolu so zníženým výhľadom, cena pod MA200, MA50 pod MA200 a príznak firmy bez tržieb alebo meme pumpy. | |
| 635 | `messages.ts:1397` `methodology.historyBody` | Invalid inputs and price histories shorter than 200 bars get no score and no state other than Insufficient data. MA200 needs 200 bars and the MA50 slope needs 60. | Neplatné vstupy a cenová história kratšia ako 200 záznamov nedostanú skóre ani iný stav než Nedostatok údajov. MA200 potrebuje 200 záznamov a sklon MA50 potrebuje 60. | |
| 636 | `messages.ts:1398` `methodology.dataTitle` | Data and audit | Údaje a overiteľnosť | |
| 637 | `messages.ts:1399` `methodology.dataBody` | The site currently runs on synthetic price series and illustrative structured flags. The sample universe holds the 28 tickers named in the investing guide and seven labelled extensions scored by the same rules. Each company page lists its rule hits and inputs. No live quotes, licensed data feed or alert history are connected. The guide's personal capital and position rules are left out of this public screen. | Stránka zatiaľ beží na syntetických cenových radoch a ilustračných štruktúrovaných príznakoch. Ukážkový zoznam obsahuje 28 tickerov z investičnej príručky a sedem označených rozšírení, ktoré sa hodnotia rovnakými pravidlami. Na stránke každej spoločnosti sú jej splnené pravidlá aj vstupy. Nie sú pripojené živé kurzy, licencovaný zdroj údajov ani história upozornení. Osobné pravidlá príručky o kapitáli a veľkosti pozícií sú z tohto verejného prehľadu vynechané. | |
| 638 | `messages.ts:1400` `methodology.dataBodyLive` | The screen combines collected SEC filings, daily prices from Twelve Data and public macro data (10-year yield from FRED) with market calculations. Verified AI research supplies checked facts from filings and releases; AI findings do not award points on their own. Unknown fields stay unknown. Each company page shows rule results and sources. Some thresholds await review. Personal capital and position rules from the guide are excluded. | Prehľad spája zbierané podania SEC, denné ceny od poskytovateľa Twelve Data a verejné makro údaje (výnos 10-ročných dlhopisov z FRED) s výpočtami z trhu. Overený výskum AI dodáva kontrolované fakty z podaní a správ; samotné zistenia AI neprideľujú body. Neznáme polia zostávajú neznáme. Stránka spoločnosti ukazuje výsledky pravidiel a zdroje. Niektoré prahy čakajú na kontrolu. Osobné pravidlá kapitálu a pozícií z príručky sú vynechané. | |

### Insider filings

| # | Key (SK line) | English | Slovak | OK / suggested fix |
| --- | --- | --- | --- | --- |
| 639 | `messages.ts:1418` `insiders.title` | Insider filings | Obchody insiderov | |
| 640 | `messages.ts:1419` `insiders.lede` | Recent Form 4 transactions reported to the SEC for companies in the screening universe. | Nedávne transakcie vo formulároch Form 4 nahlásené americkej komisii SEC pri firmách zo sledovaného zoznamu. | |
| 641 | `messages.ts:1420` `insiders.note` | A filing records what was reported. It does not explain why an insider traded or predict the stock's return. | Formulár zaznamenáva nahlásenú transakciu. Nevysvetľuje dôvod obchodu ani nepredpovedá výnos akcie. | |
| 642 | `messages.ts:1421` `insiders.empty` | No displayable Form 4 transactions are available yet. | Zatiaľ nie sú k dispozícii žiadne transakcie Form 4 povolené na zobrazenie. | |
| 643 | `messages.ts:1424` `insiders.role` | Role | Vzťah k firme | |
| 644 | `messages.ts:1425` `insiders.event` | Event | Udalosť | |
| 645 | `messages.ts:1426` `insiders.shares` | Shares | Akcie | |
| 646 | `messages.ts:1427` `insiders.value` | Reported value | Nahlásená hodnota | |
| 647 | `messages.ts:1428` `insiders.date` | Transaction date | Dátum transakcie | |
| 648 | `messages.ts:1429` `insiders.sec` | SEC filing | Podanie SEC | |
| 649 | `messages.ts:1430` `insiders.openSec` | Open Form 4 on SEC.gov | Otvoriť Form 4 na SEC.gov | |
| 650 | `messages.ts:1431` `insiders.notReported` | Not reported | Neuvedená | |
| 651 | `messages.ts:1432` `insiders.unknown` | Not specified | Nešpecifikované | |
| 652 | `messages.ts:1433` `insiders.director` | Director | Člen predstavenstva | |
| 653 | `messages.ts:1434` `insiders.officer` | Officer | Vedúci pracovník | |
| 654 | `messages.ts:1435` `insiders.tenPercent` | 10% owner | Vlastník 10 % akcií | |
| 655 | `messages.ts:1436` `insiders.other` | Other | Iný vzťah | |
| 656 | `messages.ts:1437` `insiders.codesTitle` | Form 4 codes | Kódy Form 4 | |
| 657 | `messages.ts:1439` `insiders.codes.P` | P: open-market purchase | P: nákup na voľnom trhu | |
| 658 | `messages.ts:1440` `insiders.codes.S` | S: open-market sale | S: predaj na voľnom trhu | |
| 659 | `messages.ts:1441` `insiders.codes.A` | A: grant, award or other acquisition | A: pridelenie akcií, odmena alebo iné nadobudnutie | |
| 660 | `messages.ts:1442` `insiders.codes.M` | M: option exercise or conversion | M: uplatnenie opcie alebo konverzia | |
| 661 | `messages.ts:1443` `insiders.codes.F` | F: shares used to pay tax or exercise price | F: akcie použité na úhradu dane alebo realizačnej ceny | |

### Error pages

| # | Key (SK line) | English | Slovak | OK / suggested fix |
| --- | --- | --- | --- | --- |
| 662 | `messages.ts:1403` `errors.notFoundTitle` | Page not found | Stránka sa nenašla | |
| 663 | `messages.ts:1404` `errors.notFoundBody` | The address may be mistyped, or the ticker is not in the sample universe. | Adresa môže byť preklepnutá alebo ticker nie je v ukážkovom zozname. | |
| 664 | `messages.ts:1405` `errors.notFoundBodyLive` | The address may be mistyped, or the ticker is not in the screening universe. | Adresa môže byť preklepnutá alebo ticker nie je v zozname sledovaných akcií. | |
| 665 | `messages.ts:1406` `errors.notFoundAction` | Open the stock screen | Otvoriť prehľad akcií | |
| 666 | `messages.ts:1407` `errors.errorTitle` | This screen could not be loaded | Tento prehľad sa nepodarilo načítať | |
| 667 | `messages.ts:1408` `errors.errorBody` | Something failed while the page was being scored. Try again. If it keeps failing, the data source may be unavailable. | Pri hodnotení stránky sa niečo pokazilo. Skúste to znova. Ak chyba pretrváva, zdroj údajov môže byť nedostupný. | |
| 668 | `messages.ts:1409` `errors.retry` | Try again | Skúsiť znova | |
| 669 | `messages.ts:1410` `errors.homeAction` | Back to home | Späť na úvod | |
| 670 | `messages.ts:1411` `errors.requestIdHint` | If you contact us, quote this reference: | Ak nás budete kontaktovať, uveďte tento kód: | |
| 671 | `messages.ts:1412` `errors.rateLimitedTitle` | Too many requests | Príliš veľa požiadaviek | |
| 672 | `messages.ts:1413` `errors.rateLimitedBody` | You sent requests faster than we allow. Wait a moment and try again. | Poslali ste požiadavky rýchlejšie, než dovoľujeme. Chvíľu počkajte a skúste to znova. | |
| 673 | `messages.ts:1414` `errors.maintenanceTitle` | Back shortly | Čoskoro späť | |
| 674 | `messages.ts:1415` `errors.maintenanceBody` | The site is down for maintenance. Please try again in a few minutes. | Stránka je nedostupná pre údržbu. Skúste to znova o niekoľko minút. | |

### Legal pages: disclaimer, privacy, terms

| # | Key (SK line) | English | Slovak | OK / suggested fix |
| --- | --- | --- | --- | --- |
| 675 | `legal-messages.ts:87` `operator.title` | Who runs this site | Kto web prevádzkuje | |
| 676 | `legal-messages.ts:88` `operator.name` | Operator | Prevádzkovateľ | |
| 677 | `legal-messages.ts:89` `operator.address` | Address | Adresa | |
| 678 | `legal-messages.ts:90` `operator.contactEmail` | Contact email | Kontaktný e-mail | |
| 679 | `legal-messages.ts:91` `operator.companyId` | Company id | IČO | |
| 680 | `legal-messages.ts:92` `operator.todo` | Owner to fill in before public launch. These details are placeholders. | Majiteľ doplní pred verejným spustením. Tieto údaje sú zástupné. | |
| 681 | `legal-messages.ts:95` `common.draft` | Draft | Návrh | |
| 682 | `legal-messages.ts:96` `common.updated` | Last updated: {date} | Posledná aktualizácia: {date} | |
| 683 | `legal-messages.ts:97` `common.contactLead` | Questions, access or deletion requests: write to | Otázky, žiadosti o prístup alebo vymazanie: píšte na | |
| 684 | `legal-messages.ts:98` `common.disclaimerLink` | Read the full disclaimer | Prečítať celé upozornenie | |
| 685 | `legal-messages.ts:100` `short` | Informational screening only. Not financial advice, no recommendation, no offer. Past results do not predict future results. You decide and you bear the risk. Data may be incomplete or delayed. | Iba informačný prehľad. Nie je to finančné poradenstvo, odporúčanie ani ponuka. Minulé výsledky nepredpovedajú budúce. Rozhodujete vy a riziko znášate vy. Údaje môžu byť neúplné alebo oneskorené. | |
| 686 | `legal-messages.ts:102` `disclaimer.title` | Disclaimer | Upozornenie | |
| 687 | `legal-messages.ts:103` `disclaimer.lede` | InvestBuddy shows scores from published rules. It is a screening tool, and it is not a financial adviser. | InvestBuddy ukazuje skóre podľa zverejnených pravidiel. Je to nástroj na prehľad, nie finančný poradca. | |
| 688 | `legal-messages.ts:104` `disclaimer.s1Title` | Informational screening only | Iba informačný prehľad | |
| 689 | `legal-messages.ts:105` `disclaimer.s1` | Everything on this site is general information. A score, a state or a list shows how a company fits a set of written rules on the day it was computed. It does not look at your situation. | Všetko na tomto webe sú všeobecné informácie. Skóre, stav alebo zoznam ukazuje, ako firma zodpovedá súboru písaných pravidiel v deň, keď sa vypočítalo. Vašu situáciu nezohľadňuje. | |
| 690 | `legal-messages.ts:106` `disclaimer.s2Title` | Not financial advice | Nie je to finančné poradenstvo | |
| 691 | `legal-messages.ts:107` `disclaimer.s2` | Nothing here is financial, investment, tax or legal advice, and nothing is a personal recommendation. We do not know your goals, income, savings or risk tolerance. | Nič tu nie je finančné, investičné, daňové ani právne poradenstvo a nič nie je osobné odporúčanie. Nepoznáme vaše ciele, príjem, úspory ani toleranciu rizika. | |
| 692 | `legal-messages.ts:108` `disclaimer.s3Title` | No recommendation and no offer | Žiadne odporúčanie ani ponuka | |
| 693 | `legal-messages.ts:109` `disclaimer.s3` | No page, score, alert or mail is a recommendation to hold, sell or trade any security, and none is an offer or a solicitation of any kind. | Žiadna stránka, skóre, upozornenie ani e-mail nie je odporúčaním držať, predať či obchodovať s cenným papierom a nie je ani ponukou či výzvou na uzavretie obchodu. | |
| 694 | `legal-messages.ts:110` `disclaimer.s4Title` | Past results do not predict future results | Minulé výsledky nepredpovedajú budúce | |
| 695 | `legal-messages.ts:111` `disclaimer.s4` | A company that met the rules before may not meet them tomorrow. The track record page shows earlier signals with their outcomes, and those outcomes say nothing certain about what comes next. | Firma, ktorá pravidlá splnila v minulosti, ich zajtra splniť nemusí. Stránka so záznamom ukazuje skoršie signály s ich výsledkami a tie nehovoria nič isté o tom, čo príde. | |
| 696 | `legal-messages.ts:112` `disclaimer.s5Title` | You decide and you bear the risk | Rozhodujete vy a riziko znášate vy | |
| 697 | `legal-messages.ts:113` `disclaimer.s5` | Any decision you make is yours. Investing can lose part or all of the money put in. Talk to a licensed adviser if you need advice for your own situation. | Každé rozhodnutie je vaše. Investovanie môže znamenať stratu časti alebo celej vloženej sumy. Ak potrebujete radu pre vlastnú situáciu, obráťte sa na licencovaného poradcu. | |
| 698 | `legal-messages.ts:114` `disclaimer.s6Title` | Data may be incomplete or delayed | Údaje môžu byť neúplné alebo oneskorené | |
| 699 | `legal-messages.ts:115` `disclaimer.s6` | Prices, filings and other inputs come from third parties and from our own collection. They can be late, wrong or missing, and a score built on them can be wrong too. Check important figures at the original source. | Ceny, podania a ďalšie vstupy pochádzajú od tretích strán a z nášho vlastného zberu. Môžu meškať, byť chybné alebo chýbať a skóre z nich môže byť tiež chybné. Dôležité čísla si overte v pôvodnom zdroji. | |
| 700 | `legal-messages.ts:118` `privacy.title` | Privacy notice | Zásady ochrany súkromia | |
| 701 | `legal-messages.ts:119` `privacy.lede` | This page says what personal data the site handles, why, for how long, and how to reach us. | Táto stránka hovorí, aké osobné údaje web spracúva, prečo, ako dlho a ako nás zastihnete. | |
| 702 | `legal-messages.ts:120` `privacy.s1Title` | Who is responsible | Kto zodpovedá za údaje | |
| 703 | `legal-messages.ts:121` `privacy.s1` | The operator listed below decides why and how personal data is handled on this site. | O tom, prečo a ako sa osobné údaje na tomto webe spracúvajú, rozhoduje prevádzkovateľ uvedený nižšie. | |
| 704 | `legal-messages.ts:122` `privacy.s2Title` | Server logs | Záznamy servera | |
| 705 | `legal-messages.ts:123` `privacy.s2` | When you open a page, the server and the hosting software record the request: time, page address, response code, and technical details your browser sends, which can include your IP address. We use this to run the site, find faults and block abuse. We do not use it to build profiles of visitors. | Keď otvoríte stránku, server a hostingový softvér zaznamenajú požiadavku: čas, adresu stránky, kód odpovede a technické údaje, ktoré posiela váš prehliadač, medzi ktoré môže patriť aj IP adresa. Používame to na prevádzku webu, hľadanie chýb a zabránenie zneužitiu. Nevytvárame z toho profily návštevníkov. | |
| 706 | `legal-messages.ts:124` `privacy.s3Title` | Cookies and browser storage | Cookies a úložisko v prehliadači | |
| 707 | `legal-messages.ts:125` `privacy.s3` | The site sets no tracking or advertising cookies. If you use the language switch, one cookie remembers your language. Your colour theme choice is kept in your browser's local storage. Both stay on your device and hold no personal data. | Web nenastavuje sledovacie ani reklamné cookies. Ak použijete prepínač jazyka, jedna cookie si zapamätá váš jazyk. Voľba farebného motívu sa ukladá v lokálnom úložisku prehliadača. Oboje zostáva na vašom zariadení a neobsahuje osobné údaje. | |
| 708 | `legal-messages.ts:126` `privacy.s4Title` | Analytics | Analytika | |
| 709 | `legal-messages.ts:127` `privacy.s4` | Analytics are off by default. If we turn them on, we use a tool that sets no cookies and does not follow you across sites, and it respects the Do Not Track and Global Privacy Control signals from your browser. This page will say so when it happens. | Analytika je predvolene vypnutá. Ak ju zapneme, použijeme nástroj, ktorý nenastavuje cookies, nesleduje vás naprieč webmi a rešpektuje signály Do Not Track a Global Privacy Control z vášho prehliadača. Táto stránka to uvedie, keď sa to stane. | |
| 710 | `legal-messages.ts:128` `privacy.s5Title` | Waitlist email | E-mail z čakacej listiny | |
| 711 | `legal-messages.ts:129` `privacy.s5` | If the waitlist is open and you join it, we store your email address, your language, the page you signed up from, the time you agreed and which consent wording you saw. We send a confirmation mail first and use the address only for what you ticked: one mail when the site opens and, if you chose it, the weekly mail. An address that is not confirmed is deleted after 14 days. A confirmed address is kept until you unsubscribe. | Ak je čakacia listina otvorená a pridáte sa, uložíme vašu e-mailovú adresu, jazyk, stránku, z ktorej ste sa prihlásili, čas súhlasu a znenie súhlasu, ktoré ste videli. Najprv pošleme potvrdzovací e-mail a adresu používame len na to, čo ste zaškrtli: jeden e-mail pri otvorení webu a, ak ste si ho vybrali, týždenný e-mail. Nepotvrdená adresa sa po 14 dňoch zmaže. Potvrdená adresa sa uchováva, kým sa neodhlásite. | |
| 712 | `legal-messages.ts:130` `privacy.s6Title` | After you unsubscribe | Po odhlásení | |
| 713 | `legal-messages.ts:131` `privacy.s6` | When you unsubscribe, we keep the address on a suppression list, marked as unsubscribed. We do this so that nobody can add it again and mail you by mistake. The list is used for nothing else. | Keď sa odhlásite, adresu ponecháme v zozname vylúčených, označenú ako odhlásenú. Robíme to preto, aby ju nikto nemohol pridať znova a omylom vám písať. Zoznam sa nepoužíva na nič iné. | |
| 714 | `legal-messages.ts:132` `privacy.s7Title` | Who else sees the data | Kto ďalší údaje vidí | |
| 715 | `legal-messages.ts:133` `privacy.s7` | Service providers that host the site and send our mail process data for us under our instructions. We do not sell personal data and we do not pass it on for advertising. | Poskytovatelia služieb, ktorí web hostujú a posielajú našu poštu, spracúvajú údaje pre nás podľa našich pokynov. Osobné údaje nepredávame a neposkytujeme ich na reklamu. | |
| 716 | `legal-messages.ts:134` `privacy.s8Title` | Your rights | Vaše práva | |
| 717 | `legal-messages.ts:135` `privacy.s8` | You can ask us for a copy of your data, ask us to correct or delete it, ask us to limit its use, or object to it. You can also complain to the data protection authority in your country. To have your waitlist address deleted, including from the suppression list, write to the contact address below. | Môžete nás požiadať o kópiu svojich údajov, o ich opravu alebo vymazanie, o obmedzenie ich používania, alebo proti nim namietať. Sťažnosť môžete podať aj na úrade na ochranu osobných údajov vo svojej krajine. Ak chcete vymazať svoju adresu z čakacej listiny, aj zo zoznamu vylúčených, napíšte na kontakt nižšie. | |
| 718 | `legal-messages.ts:138` `terms.title` | Terms of use | Podmienky používania | |
| 719 | `legal-messages.ts:139` `terms.lede` | These are the rules for using the site. By using it, you accept them. | Toto sú pravidlá používania webu. Používaním ich prijímate. | |
| 720 | `legal-messages.ts:140` `terms.s1Title` | What the site is | Čo je tento web | |
| 721 | `legal-messages.ts:141` `terms.s1` | InvestBuddy is an informational screening site. It shows scores, rules, data and a record of earlier signals. Read the disclaimer page too, it is part of these terms. | InvestBuddy je informačný web na prehľad firiem. Ukazuje skóre, pravidlá, údaje a záznam skorších signálov. Prečítajte si aj stránku s upozornením, je súčasťou týchto podmienok. | |
| 722 | `legal-messages.ts:142` `terms.s2Title` | Use at your own risk | Používanie na vlastné riziko | |
| 723 | `legal-messages.ts:143` `terms.s2` | You use the site and its content at your own risk. We do not promise that it is complete, current or free of errors, or that it is suited to your purpose. | Web a jeho obsah používate na vlastné riziko. Nesľubujeme, že je úplný, aktuálny alebo bez chýb, ani že sa hodí na váš účel. | |
| 724 | `legal-messages.ts:144` `terms.s3Title` | No advice | Nie je to poradenstvo | |
| 725 | `legal-messages.ts:145` `terms.s3` | Content is not advice and not a recommendation. See the disclaimer. | Obsah nie je poradenstvo ani odporúčanie. Pozrite si upozornenie. | |
| 726 | `legal-messages.ts:147` `terms.s4` | The site is in beta. Features, scores and pages can change or go away without notice. It is free to use while in beta. Paid plans may come later, and any price will be shown before you pay. | Web je v beta prevádzke. Funkcie, skóre a stránky sa môžu zmeniť alebo zaniknúť bez upozornenia. Počas bety je používanie zadarmo. Platené plány môžu prísť neskôr a cenu uvidíte skôr, než zaplatíte. | |
| 727 | `legal-messages.ts:148` `terms.s5Title` | Acceptable use | Prijateľné používanie | |
| 728 | `legal-messages.ts:149` `terms.s5` | Do not attack the site, overload it, scrape it at a rate that harms it, or try to get at data that is not public. We can block access if you do. | Web nenapádajte, nepreťažujte ho, nesťahujte ho tempom, ktoré mu škodí, ani sa nepokúšajte získať údaje, ktoré nie sú verejné. Ak to urobíte, môžeme vám prístup zablokovať. | |
| 729 | `legal-messages.ts:150` `terms.s6Title` | Content and rights | Obsah a práva | |
| 730 | `legal-messages.ts:151` `terms.s6` | The site's design, text and code belong to the operator or its licensors. You may read, quote short parts with a link back, and keep a copy for your own use. Copying the whole site or reselling its content needs our written permission. Third-party data stays under its owners' terms. | Dizajn, texty a kód webu patria prevádzkovateľovi alebo jeho poskytovateľom licencií. Môžete čítať, citovať krátke časti s odkazom späť a uložiť si kópiu pre vlastnú potrebu. Kopírovanie celého webu alebo predaj jeho obsahu vyžaduje náš písomný súhlas. Údaje tretích strán zostávajú pod podmienkami ich vlastníkov. | |
| 731 | `legal-messages.ts:152` `terms.s7Title` | Liability | Zodpovednosť | |
| 732 | `legal-messages.ts:153` `terms.s7` | To the extent the law allows, we are not liable for losses that come from using the site or relying on its content. This does not limit liability that the law does not allow us to limit. | V rozsahu, ktorý zákon dovoľuje, nezodpovedáme za straty, ktoré vzniknú používaním webu alebo spoliehaním sa na jeho obsah. Toto neobmedzuje zodpovednosť, ktorú zákon obmedziť nedovoľuje. | |
| 733 | `legal-messages.ts:154` `terms.s8Title` | Changes and law | Zmeny a právo | |
| 734 | `legal-messages.ts:155` `terms.s8` | We may change these terms and the new text applies from the date shown on this page. Slovak law applies, subject to any mandatory consumer rules of your own country. TODO for the owner: confirm the governing law and courts with a lawyer. | Tieto podmienky môžeme zmeniť a nové znenie platí od dátumu uvedeného na tejto stránke. Uplatňuje sa slovenské právo, s výhradou záväzných spotrebiteľských pravidiel vašej krajiny. TODO pre majiteľa: rozhodné právo a súdy potvrďte s právnikom. | |

### Waitlist form and confirm pages (only when WAITLIST is on)

| # | Key (SK line) | English | Slovak | OK / suggested fix |
| --- | --- | --- | --- | --- |
| 735 | `messages.ts:1561` `waitlist.formTitle` | Join the waitlist | Pridajte sa na čakaciu listinu | |
| 736 | `messages.ts:1562` `waitlist.email` | Email address | E-mailová adresa | |
| 737 | `messages.ts:1563` `waitlist.consentLaunch` | Send me one mail when InvestBuddy opens to the public. | Pošlite mi jeden mail, keď sa InvestBuddy otvorí verejnosti. | |
| 738 | `messages.ts:1564` `waitlist.consentWeekly` | Also send me the free weekly Slovak mail once it starts. Optional. | Posielajte mi aj bezplatný týždenný mail v slovenčine, keď sa začne. Nepovinné. | |
| 739 | `messages.ts:1565` `waitlist.submit` | Join the waitlist | Pridať sa na listinu | |
| 740 | `messages.ts:1566` `waitlist.sending` | Sending… | Odosielam… | |
| 741 | `messages.ts:1567` `waitlist.success` | Thanks. If the address is valid, a confirmation mail is on its way. Open the link in it to finish. | Ďakujeme. Ak je adresa platná, potvrdzovací mail je na ceste. Dokončite prihlásenie odkazom v ňom. | |
| 742 | `messages.ts:1568` `waitlist.errorEmail` | Enter a valid email address. | Zadajte platnú e-mailovú adresu. | |
| 743 | `messages.ts:1569` `waitlist.errorConsent` | Tick the first box to join. | Na prihlásenie zaškrtnite prvé políčko. | |
| 744 | `messages.ts:1570` `waitlist.errorRate` | Too many tries. Wait a minute and try again. | Príliš veľa pokusov. Počkajte minútu a skúste znova. | |
| 745 | `messages.ts:1571` `waitlist.errorGeneric` | Something went wrong. Try again in a moment. | Niečo sa pokazilo. Skúste to o chvíľu znova. | |
| 746 | `messages.ts:1572` `waitlist.confirmTitle` | Confirm your address | Potvrďte adresu | |
| 747 | `messages.ts:1573` `waitlist.confirmBody` | Press the button to join the waitlist. | Tlačidlom dokončíte prihlásenie na čakaciu listinu. | |
| 748 | `messages.ts:1574` `waitlist.confirmButton` | Confirm my address | Potvrdiť adresu | |
| 749 | `messages.ts:1575` `waitlist.confirmedTitle` | You are on the list | Ste na listine | |
| 750 | `messages.ts:1576` `waitlist.confirmedBody` | Your address is confirmed. We will send one mail when the site opens. | Vaša adresa je potvrdená. Pošleme jeden mail, keď sa stránka otvorí. | |
| 751 | `messages.ts:1577` `waitlist.alreadyBody` | This address was already confirmed. | Táto adresa už bola potvrdená. | |
| 752 | `messages.ts:1578` `waitlist.expiredTitle` | This link has expired | Odkaz vypršal | |
| 753 | `messages.ts:1579` `waitlist.expiredBody` | Links work for 7 days. Sign up again to get a new one. | Odkazy platia 7 dní. Prihláste sa znova a dostanete nový. | |
| 754 | `messages.ts:1580` `waitlist.invalidTitle` | This link does not work | Odkaz nefunguje | |
| 755 | `messages.ts:1581` `waitlist.invalidBody` | Check that you copied the whole link, or sign up again. | Skontrolujte, či ste skopírovali celý odkaz, alebo sa prihláste znova. | |
| 756 | `messages.ts:1582` `waitlist.unsubscribeTitle` | Unsubscribe | Odhlásenie | |
| 757 | `messages.ts:1583` `waitlist.unsubscribeBody` | Press the button to stop all mail from the waitlist. | Tlačidlom zastavíte všetky maily z čakacej listiny. | |
| 758 | `messages.ts:1584` `waitlist.unsubscribeButton` | Unsubscribe | Odhlásiť sa | |
| 759 | `messages.ts:1585` `waitlist.unsubscribedTitle` | You are unsubscribed | Ste odhlásený | |
| 760 | `messages.ts:1586` `waitlist.unsubscribedBody` | We will not mail this address again. | Na túto adresu už nebudeme písať. | |
| 761 | `messages.ts:1587` `waitlist.backHome` | Back to the home page | Späť na úvodnú stránku | |

### Waitlist mails (only when WAITLIST is on)

| # | Key (SK line) | English | Slovak | OK / suggested fix |
| --- | --- | --- | --- | --- |
| 762 | `messages.ts:1548` `mail.confirmSubject` | Confirm your InvestBuddy waitlist sign-up | Potvrďte prihlásenie na čakaciu listinu InvestBuddy | |
| 763 | `messages.ts:1549` `mail.confirmIntro` | You asked to join the InvestBuddy waitlist. Confirm this address to finish signing up. | Požiadali ste o zaradenie na čakaciu listinu InvestBuddy. Potvrďte túto adresu a prihlásenie bude hotové. | |
| 764 | `messages.ts:1550` `mail.confirmAction` | Confirm my address | Potvrdiť adresu | |
| 765 | `messages.ts:1551` `mail.confirmLinkHint` | If the button does not work, open this link: {url} | Ak tlačidlo nefunguje, otvorte tento odkaz: {url} | |
| 766 | `messages.ts:1552` `mail.confirmExpiry` | The link works for 7 days. If you did not sign up, ignore this mail and we will delete your address. | Odkaz platí 7 dní. Ak ste sa neprihlásili vy, tento mail ignorujte a vašu adresu zmažeme. | |
| 767 | `messages.ts:1553` `mail.welcomeSubject` | You are on the InvestBuddy waitlist | Ste na čakacej listine InvestBuddy | |
| 768 | `messages.ts:1554` `mail.welcomeIntro` | Your address is confirmed. Thank you for joining. | Vaša adresa je potvrdená. Ďakujeme, že ste sa pridali. | |
| 769 | `messages.ts:1555` `mail.welcomeLaunch` | We will send one mail when the site opens to the public. | Pošleme jeden mail, keď sa stránka otvorí verejnosti. | |
| 770 | `messages.ts:1556` `mail.welcomeWeekly` | You also asked for the free weekly Slovak mail. It will arrive once it is ready. | Zároveň ste si vyžiadali bezplatný týždenný mail v slovenčine. Príde, keď bude pripravený. | |
| 771 | `messages.ts:1557` `mail.unsubscribeLabel` | Unsubscribe | Odhlásiť sa | |
| 772 | `messages.ts:1558` `mail.unsubscribeLine` | Unsubscribe: {url} | Odhlásiť sa: {url} | |

### Page titles and descriptions (meta)

| # | Key (SK line) | English | Slovak | OK / suggested fix |
| --- | --- | --- | --- | --- |
| 773 | `messages.ts:806` `meta.homeTitle` | InvestBuddy: rule-based stock screening you can audit | InvestBuddy: výber akcií podľa pravidiel, ktorý si overíte | |
| 774 | `messages.ts:807` `meta.homeDescription` | A daily score for growth stocks built from published rules. Every ticker shows the rules it met, the rules it missed and the data behind them. | Denné skóre rastových akcií podľa zverejnených pravidiel. Pri každom tickeri vidíte, ktoré pravidlá splnil, ktoré nie a z akých údajov vychádzajú. | |
| 775 | `messages.ts:808` `meta.dashboardTitle` | Stock screen | Prehľad akcií | |
| 776 | `messages.ts:809` `meta.dashboardDescription` | Search, filter and sort growth stocks grouped by rule state. | Rastové akcie podľa stavu pravidiel s vyhľadávaním, filtrovaním a radením. | |
| 777 | `messages.ts:810` `meta.scannerTitle` | Scanner | Skener | |
| 778 | `messages.ts:811` `meta.scannerDescription` | Search, filter and sort every ticker in the sample universe by score and rule state. | Vyhľadávanie, filtrovanie a radenie všetkých tickerov z ukážkového zoznamu podľa skóre a stavu pravidiel. | |
| 779 | `messages.ts:813` `meta.companyDescription` | Score breakdown, rule hits and price chart for {ticker} on sample data. | Rozpis skóre, splnené pravidlá a cenový graf pre {ticker} na ukážkových údajoch. | |
| 780 | `messages.ts:814` `meta.companyDescriptionLive` | Score breakdown, rule hits and price chart for {ticker} from recorded scans. | Rozpis skóre, splnené pravidlá a cenový graf pre {ticker} zo zaznamenaných skenov. | |
| 781 | `messages.ts:815` `meta.trackRecordTitle` | Track record | História záznamov | |
| 782 | `messages.ts:816` `meta.trackRecordDescription` | Dated screening snapshots, signal events and measured returns against SPY. | Datované snímky hodnotení, signály a namerané výnosy voči SPY. | |
| 783 | `messages.ts:817` `meta.insidersTitle` | Insider filings | Obchody insiderov | |
| 784 | `messages.ts:818` `meta.insidersDescription` | Recent SEC Form 4 transactions for stocks in the screening universe. | Nedávne transakcie z formulárov SEC Form 4 pri akciách zo sledovaného zoznamu. | |
| 785 | `messages.ts:819` `meta.portfolioTitle` | Owner's portfolio | Portfólio prevádzkovateľa | |
| 786 | `messages.ts:820` `meta.portfolioDescription` | Delayed portfolio weights and rebased performance beside the SPY benchmark. | Oneskorene zverejnené váhy pozícií a vývoj portfólia porovnaný s indexom SPY. | |
| 787 | `messages.ts:821` `meta.methodologyTitle` | Methodology | Metodika | |
| 788 | `messages.ts:822` `meta.methodologyDescription` | The published rules behind every InvestBuddy score and rule state. | Zverejnené pravidlá, z ktorých vzniká každé skóre a stav v InvestBuddy. | |
| 789 | `messages.ts:823` `meta.privacyTitle` | Privacy | Ochrana súkromia | |
| 790 | `messages.ts:824` `meta.termsTitle` | Terms | Podmienky používania | |
| 791 | `messages.ts:825` `meta.notFoundTitle` | Page not found | Stránka sa nenašla | |
| 792 | `messages.ts:826` `meta.ideasTitle` | Trade ideas | Investičné nápady | |
| 793 | `messages.ts:827` `meta.ideasDescription` | Changes in action labels and setup ratings from reconciled facts and rule scores, newest first. | Zmeny v označeniach akcií a hodnoteniach nastavenia zo zosúladených faktov a skóre, od najnovších. | |
| 794 | `messages.ts:828` `meta.sizingTitle` | How to size this | Ako určiť veľkosť pozície | |
| 795 | `messages.ts:829` `meta.sizingDescription` | Illustrative position percentages by account and cash range, with per-name limits and add rules. | Ilustračné percentá pozície podľa veľkosti účtu a hotovosti, s limitom na jednu firmu a pravidlami prikupovania. | |

### Telegram alerts, weekly summary, discovery

| # | Key (SK line) | English | Slovak | OK / suggested fix |
| --- | --- | --- | --- | --- |
| 796 | `format.ts:95` `bands.red` | Criteria broken | Kritériá porušené | |
| 797 | `format.ts:95` `bands.orange` | Not now | Mimo výberu | |
| 798 | `format.ts:95` `bands.yellow` | Waiting | Čakanie | |
| 799 | `format.ts:95` `bands.blue` | Watching | Sledovanie | |
| 800 | `format.ts:95` `bands.green` | Conditions met | Podmienky splnené | |
| 801 | `format.ts:95` `bands.gray` | Not enough data | Nedostatok údajov | |
| 802 | `format.ts:96` `greenAdvice` | Buy zone | Zóna nákupu | |
| 803 | `format.ts:97` `noData` | no data | bez údajov | |
| 804 | `format.ts:98` `was` | Was | Bolo | |
| 805 | `format.ts:99` `now` | Now | Teraz | |
| 806 | `format.ts:100` `first` | First rating | Prvé hodnotenie | |
| 807 | `format.ts:101` `confirmations` | Confirmations | Potvrdenia | |
| 808 | `format.ts:102` `noLongerMeets` | No longer meets | Už nespĺňa | |
| 809 | `format.ts:103` `nowMeets` | Now meets | Teraz spĺňa | |
| 810 | `format.ts:104` `chips.revenue` | Revenue growth | Rast tržieb | |
| 811 | `format.ts:104` `chips.guidance` | Guidance raised | Zvýšený výhľad | |
| 812 | `format.ts:104` `chips.catalyst` | Product catalyst | Produktový katalyzátor | |
| 813 | `format.ts:104` `chips.volume` | Volume | Objem | |
| 814 | `format.ts:104` `chips.insider` | Insiders (Form 4) | Insideri (Form 4) | |
| 815 | `format.ts:105` `coverage` | Data: ${known} of ${total} points have verified sources | Údaje: ${known} z ${total} bodov má overené zdroje | |
| 816 | `format.ts:106` `open` | Open ${ticker} | Otvoriť ${ticker} | |
| 817 | `format.ts:107` `methodology` | Methodology | Metodika | |
| 818 | `format.ts:108` `disclaimer` | Informational screening under the published methodology, not personal advice. | Informačný skríning podľa zverejnenej metodiky, nie osobné odporúčanie. | |
| 819 | `format.ts:217` `scoreRelative` | Score ${p} of ${m} evidenced (${pct} %), data coverage ${cov} % | Skóre ${p} z ${m} doložených (${pct} %), pokrytie údajov ${cov} % | |
| 820 | `format.ts:218` `scorePlain` | Score ${p} points | Skóre ${p} bodov | |
| 821 | `format.ts:219` `whatHappened` | What happened | Čo sa stalo | |
| 822 | `format.ts:219` `whyItMatters` | Why it matters | Prečo na tom záleží | |
| 823 | `format.ts:219` `setup` | Setup | Nastavenie | |
| 824 | `format.ts:219` `company` | Company | Firma | |
| 825 | `format.ts:219` `entry` | Entry | Vstup | |
| 826 | `format.ts:219` `catalyst` | Catalyst | Katalyzátor | |
| 827 | `format.ts:219` `numbers` | Numbers | Čísla | |
| 828 | `format.ts:219` `plan` | Plan | Plán | |
| 829 | `format.ts:219` `evidence` | Evidence | Dôkazy | |
| 830 | `format.ts:220` `ratings.Very strong` | Very strong | Veľmi silné | |
| 831 | `format.ts:220` `ratings.Strong` | Strong | Silné | |
| 832 | `format.ts:220` `ratings.Good` | Good | Dobré | |
| 833 | `format.ts:220` `ratings.Neutral` | Neutral | Neutrálne | |
| 834 | `format.ts:220` `ratings.Weak` | Weak | Slabé | |
| 835 | `format.ts:221` `planOwner.start` | When to start | Kedy začať | |
| 836 | `format.ts:221` `planOwner.add` | When to add | Kedy prikúpiť | |
| 837 | `format.ts:221` `planOwner.stop` | When to stop | Kedy skončiť | |
| 838 | `format.ts:221` `planOwner.cost` | Opportunity cost | Náklady príležitosti | |
| 839 | `format.ts:222` `planPublic.trigger` | Trigger | Spúšťač | |
| 840 | `format.ts:222` `planPublic.invalidation` | Invalidation | Čo nápad zruší | |
| 841 | `format.ts:222` `planPublic.cost` | Opportunity cost | Náklady príležitosti | |
| 842 | `weekly.ts:42` `title` | Weekly summary · week ${week} (scores of ${asOf}) | Týždenný prehľad · týždeň ${week} (skóre z ${asOf}) | |
| 843 | `weekly.ts:43` `counts` | Tickers per status | Počet tickerov podľa stavu | |
| 844 | `weekly.ts:44` `up` | Moved up | Posun nahor | |
| 845 | `weekly.ts:45` `down` | Moved down | Posun nadol | |
| 846 | `weekly.ts:46` `none` | none | žiadne | |
| 847 | `weekly.ts:48` `empty` | No scores yet. | Zatiaľ bez skóre. | |
| 848 | `discovery.ts:49` `title` | New candidates · week of ${week} | Noví kandidáti · týždeň od ${week} | |
| 849 | `discovery.ts:50` `intro` | Names outside the tracked universe that passed this week's screen. They are listed for review and are not scored daily yet. | Firmy mimo sledovaného univerza, ktoré prešli týždenným výberom. Sú len na posúdenie a zatiaľ sa denne neskórujú. | |
| 850 | `discovery.ts:51` `surfaced` | Why it surfaced | Prečo sa objavila | |
| 851 | `discovery.ts:52` `rule` | Rule score | Skóre pravidiel | |
| 852 | `discovery.ts:53` `growth` | Revenue growth ${current}% year over year (previous quarter ${prior}%) | Rast tržieb ${current} % medziročne (predchádzajúci štvrťrok ${prior} %) | |
| 853 | `discovery.ts:54` `kinds.price_volume` | Price and volume move | Pohyb ceny a objemu | |
| 854 | `discovery.ts:54` `kinds.theme` | Theme | Téma | |
| 855 | `discovery.ts:54` `kinds.frames` | Revenue growth, SEC data | Rast tržieb, údaje SEC | |
| 856 | `discovery.ts:54` `kinds.clinical_trial` | Clinical trial update | Aktualizácia klinickej štúdie | |
| 857 | `discovery.ts:54` `kinds.ownership` | Ownership filing (13D/13G) | Oznámenie o vlastníctve (13D/13G) | |
| 858 | `discovery.ts:54` `kinds.thirteenf` | 13F holding | Držba z 13F | |
| 859 | `discovery.ts:55` `other` | Source | Zdroj | |
| 860 | `discovery.ts:56` `methodology` | Methodology | Metodika | |
| 861 | `discovery.ts:57` `empty` | No candidates this week. | Tento týždeň bez kandidátov. | |

### Ideas (404 unless ADVICE_OUTPUT is on)

| # | Key (SK line) | English | Slovak | OK / suggested fix |
| --- | --- | --- | --- | --- |
| 862 | `messages.ts:1447` `ideas.title` | Trade ideas | Investičné nápady | |
| 863 | `messages.ts:1448` `ideas.lede` | Only changes are listed, newest first. Each idea rests on reconciled facts and rule scores. Cash stays uninvested when nothing qualifies. | Zobrazujú sa iba zmeny, od najnovších. Každý nápad vychádza zo zosúladených faktov a skóre podľa pravidiel. Keď nič nevyhovuje, hotovosť zostáva nezainvestovaná. | |
| 864 | `messages.ts:1449` `ideas.empty` | No ideas yet. A card appears here only when an action or a setup rating changes. | Zatiaľ žiadne nápady. Karta sa objaví, len keď sa zmení akcia alebo hodnotenie nastavenia. | |
| 865 | `messages.ts:1453` `ideas.size` | Size | Veľkosť | |
| 866 | `messages.ts:1454` `ideas.sizeNote` | A share of a full position in your own portfolio. Not an amount and not tailored to you. | Podiel plnej pozície vo vašom vlastnom portfóliu. Nie je to suma a nie je to prispôsobené vám. | |
| 867 | `messages.ts:1455` `ideas.tiers.NONE` | No new money | Žiadne nové peniaze | |
| 868 | `messages.ts:1455` `ideas.tiers.STARTER` | Starter, about 1/3 of a full position | Úvodná, asi 1/3 plnej pozície | |
| 869 | `messages.ts:1455` `ideas.tiers.STANDARD` | Standard, about 2/3 of a full position | Štandardná, asi 2/3 plnej pozície | |
| 870 | `messages.ts:1455` `ideas.tiers.FULL` | Full position | Plná pozícia | |
| 871 | `messages.ts:1455` `ideas.tiers.ADD_THIRD` | Add about 1/3 of a full position | Prikúpiť asi 1/3 plnej pozície | |
| 872 | `messages.ts:1455` `ideas.tiers.ADD_HALF` | Add about 1/2 of a full position | Prikúpiť asi 1/2 plnej pozície | |
| 873 | `messages.ts:1456` `ideas.tiersShort.NONE` | No new money | Bez nových peňazí | |
| 874 | `messages.ts:1456` `ideas.tiersShort.STARTER` | Starter | Úvodná | |
| 875 | `messages.ts:1456` `ideas.tiersShort.STANDARD` | Standard | Štandardná | |
| 876 | `messages.ts:1456` `ideas.tiersShort.FULL` | Full | Plná | |
| 877 | `messages.ts:1456` `ideas.tiersShort.ADD_THIRD` | Add 1/3 | Prikúpiť 1/3 | |
| 878 | `messages.ts:1456` `ideas.tiersShort.ADD_HALF` | Add 1/2 | Prikúpiť 1/2 | |
| 879 | `messages.ts:1457` `ideas.actions.WATCH` | Watch | Sledovať | |
| 880 | `messages.ts:1457` `ideas.actions.START_POSITION` | Start position | Otvoriť pozíciu | |
| 881 | `messages.ts:1457` `ideas.actions.ADD` | Add | Prikúpiť | |
| 882 | `messages.ts:1457` `ideas.actions.HIGH_CONVICTION_ADD` | High-conviction add | Výrazne prikúpiť | |
| 883 | `messages.ts:1457` `ideas.actions.HOLD` | Hold | Držať | |
| 884 | `messages.ts:1457` `ideas.actions.REDUCE` | Reduce | Znížiť | |
| 885 | `messages.ts:1457` `ideas.actions.THESIS_BROKEN` | Thesis broken | Investičná téza neplatí | |
| 886 | `messages.ts:1457` `ideas.actions.CSPX_ALLOCATION` | CSPX allocation | Pridelenie do CSPX | |
| 887 | `messages.ts:1458` `ideas.whatHappened` | What happened | Čo sa stalo | |
| 888 | `messages.ts:1459` `ideas.whyItMatters` | Why it matters | Prečo na tom záleží | |
| 889 | `messages.ts:1460` `ideas.setup` | Setup | Nastavenie | |
| 890 | `messages.ts:1461` `ideas.company` | Company | Firma | |
| 891 | `messages.ts:1462` `ideas.entry` | Entry | Vstup | |
| 892 | `messages.ts:1463` `ideas.catalyst` | Catalyst | Katalyzátor | |
| 893 | `messages.ts:1464` `ideas.numbers` | Numbers | Čísla | |
| 894 | `messages.ts:1465` `ideas.plan` | Plan | Plán | |
| 895 | `messages.ts:1466` `ideas.amountNow` | Amount now | Suma teraz | |
| 896 | `messages.ts:1467` `ideas.trigger` | Add or upgrade trigger | Spúšťač pridania alebo zvýšenia | |
| 897 | `messages.ts:1468` `ideas.invalidation` | Invalidation | Čo nápad zruší | |
| 898 | `messages.ts:1469` `ideas.opportunityCost` | Opportunity cost | Náklady príležitosti | |
| 899 | `messages.ts:1470` `ideas.evidence` | Evidence | Dôkazy | |
| 900 | `messages.ts:1471` `ideas.unconfirmed` | UNCONFIRMED | NEPOTVRDENÉ | |
| 901 | `messages.ts:1472` `ideas.unconfirmedNote` | A key claim is not confirmed by two agents or by a checked quote. | Kľúčové tvrdenie nepotvrdili dvaja agenti ani overený citát. | |
| 902 | `messages.ts:1473` `ideas.carried` | Carried data from {date} | Prenesené údaje z {date} | |
| 903 | `messages.ts:1474` `ideas.carriedNote` | Some inputs are carried forward from an older scan, not fresh. | Niektoré vstupy sú prenesené zo staršieho skenu, nie sú čerstvé. | |
| 904 | `messages.ts:1475` `ideas.conflict` | RULES CONFLICT | KONFLIKT PRAVIDIEL | |
| 905 | `messages.ts:1476` `ideas.conflictLabel` | Conflict noted: {note} | Zaznamenaný konflikt: {note} | |
| 906 | `messages.ts:1477` `ideas.shownInEnglish` | Shown in English | Preklad nie je dostupný, text je v angličtine | |
| 907 | `messages.ts:1478` `ideas.downgraded` | Downgraded from {action} | Znížené z {action} | |
| 908 | `messages.ts:1479` `ideas.rulesNote` | Action, size tier and ratings come from fixed rules, from data alone. The wording is generated from the same inputs. | Akciu, veľkosť a hodnotenia určujú pevné pravidlá, výlučne z údajov. Text sa generuje z rovnakých vstupov. | |
| 909 | `messages.ts:1480` `ideas.dated` | Idea of {date} | Nápad z {date} | |
| 910 | `messages.ts:1482` `ideas.listLabel` | Trade ideas, newest first | Investičné nápady, od najnovších | |
| 911 | `messages.ts:1483` `ideas.externalLink` | opens in a new tab | otvorí sa na novej karte | |
| 912 | `messages.ts:1484` `ideas.ratings.Very strong` | Very strong | Veľmi silné | |
| 913 | `messages.ts:1484` `ideas.ratings.Strong` | Strong | Silné | |
| 914 | `messages.ts:1484` `ideas.ratings.Good` | Good | Dobré | |
| 915 | `messages.ts:1484` `ideas.ratings.Neutral` | Neutral | Neutrálne | |
| 916 | `messages.ts:1484` `ideas.ratings.Weak` | Weak | Slabé | |

### Sizing (404 unless ADVICE_OUTPUT is on)

| # | Key (SK line) | English | Slovak | OK / suggested fix |
| --- | --- | --- | --- | --- |
| 917 | `messages.ts:1487` `sizing.title` | How to size this | Ako určiť veľkosť pozície | |
| 918 | `messages.ts:1488` `sizing.lede` | An illustrative guide to the share of your own total portfolio for one name. These draft percentages are the same for every reader and are not tailored to your circumstances. | Ilustračný návod na podiel jednej firmy vo vašom celkovom portfóliu. Tieto návrhové percentá sú rovnaké pre každého a nie sú prispôsobené vašej situácii. | |
| 919 | `messages.ts:1489` `sizing.draft` | Draft values for review, not settled thresholds. | Návrhové hodnoty na posúdenie, nie schválené hranice. | |
| 920 | `messages.ts:1490` `sizing.matrixTitle` | Position size by account range | Veľkosť pozície podľa rozsahu účtu | |
| 921 | `messages.ts:1491` `sizing.matrixNote` | The table uses 10% to 30% cash. Percentages refer to the total portfolio, not the cash balance. Add rows show an increase to an existing position. | Tabuľka počíta s 10 až 30 % hotovosti. Percentá sa vzťahujú na celé portfólio, nie na hotovosť. Riadky prikúpenia znamenajú zvýšenie existujúcej pozície. | |
| 922 | `messages.ts:1492` `sizing.account` | Total portfolio value | Hodnota celého portfólia | |
| 923 | `messages.ts:1493` `sizing.under5` | Under EUR 5,000 | Menej ako 5 000 EUR | |
| 924 | `messages.ts:1494` `sizing.five25` | EUR 5,000 to 25,000 | 5 000 až 25 000 EUR | |
| 925 | `messages.ts:1495` `sizing.twentyfive100` | EUR 25,000 to 100,000 | 25 000 až 100 000 EUR | |
| 926 | `messages.ts:1496` `sizing.over100` | Over EUR 100,000 | Viac ako 100 000 EUR | |
| 927 | `messages.ts:1497` `sizing.starter` | Starter | Úvodná | |
| 928 | `messages.ts:1498` `sizing.standard` | Standard | Štandardná | |
| 929 | `messages.ts:1499` `sizing.full` | Full | Plná | |
| 930 | `messages.ts:1500` `sizing.addThird` | Add one third of full | Prikúpenie tretiny plnej | |
| 931 | `messages.ts:1501` `sizing.addHalf` | Add one half of full | Prikúpenie polovice plnej | |
| 932 | `messages.ts:1502` `sizing.cap` | Hard cap per name | Pevný limit na firmu | |
| 933 | `messages.ts:1503` `sizing.cashTitle` | Adjust for cash | Úprava podľa hotovosti | |
| 934 | `messages.ts:1504` `sizing.cashLow` | Under 10% cash: halve the table amount. Fund new positions only from the monthly contribution. | Menej ako 10 % hotovosti: použite polovicu hodnoty z tabuľky. Nové pozície financujte iba z mesačného vkladu. | |
| 935 | `messages.ts:1505` `sizing.cashMiddle` | 10% to 30% cash: use the table amount. | 10 až 30 % hotovosti: použite hodnotu z tabuľky. | |
| 936 | `messages.ts:1506` `sizing.cashHigh` | Over 30% cash: use the table amount, spread over three monthly tranches, with at most one third of idle cash in a month. | Viac ako 30 % hotovosti: použite hodnotu z tabuľky, rozložte ju do troch mesačných častí a za mesiac použite najviac tretinu voľnej hotovosti. | |
| 937 | `messages.ts:1507` `sizing.addTitle` | Before an add | Pred prikúpením | |
| 938 | `messages.ts:1508` `sizing.addRule` | At most one add per month, and only on an ADD signal. Leave room below the cap; if price drift has already put the name at or above it, wait. Never add past the cap. | Najviac jedno prikúpenie za mesiac a len pri signáli Prikúpiť. Nechajte rezervu pod limitom. Ak rast ceny už dostal pozíciu na limit alebo nad neho, počkajte. Nikdy neprikupujte nad limit. | |
| 939 | `messages.ts:1509` `sizing.reduceRule` | A REDUCE signal points back toward the standard size or the cap. It does not set a transaction amount. | Signál na zníženie pozície ukazuje späť k štandardnej veľkosti alebo k limitu. Neurčuje sumu transakcie. | |
| 940 | `messages.ts:1510` `sizing.exampleTitle` | Worked example | Príklad výpočtu | |
| 941 | `messages.ts:1511` `sizing.example` | For an illustrative EUR 20,000 portfolio with 20% cash, a STARTER tier is 2% of the total portfolio, or EUR 400. The per-name cap is 8%, or EUR 1,600. An ADD_THIRD tier is another 2 percentage points before checking the current holding against that cap. | Pri ilustračnom portfóliu 20 000 EUR s 20 % hotovosti tvorí úvodná pozícia 2 % celého portfólia, teda 400 EUR. Limit na jednu firmu je 8 %, teda 1 600 EUR. Prikúpenie tretiny plnej pozície pridáva ďalšie 2 percentuálne body, až po kontrole existujúcej pozície voči limitu. | |
| 942 | `messages.ts:1512` `sizing.privacy` | This page asks for no balance and sends or stores no personal account values. | Táto stránka nežiada zostatok a neposiela ani neukladá osobné údaje o účte. | |
| 943 | `messages.ts:1513` `sizing.disclaimer` | Illustrative sizing guide only. It is informational screening, not personal investment advice. You decide whether any position suits you. | Len ilustračný návod na veľkosť pozície. Ide o informačný prehľad, nie o osobné investičné odporúčanie. O vhodnosti pozície rozhodujete vy. | |

### Owner allocation (private, OWNER_VIEW)

| # | Key (SK line) | English | Slovak | OK / suggested fix |
| --- | --- | --- | --- | --- |
| 944 | `messages.ts:1516` `ownerAllocation.title` | Owner monthly allocation | Mesačné rozdelenie hotovosti majiteľa | |
| 945 | `messages.ts:1517` `ownerAllocation.lede` | An illustration of how the current free cash could be split between signals. The amount follows the tier and account limits; it does not change the stock's result. | Ilustračné rozdelenie aktuálnej voľnej hotovosti medzi signály. Sumu určujú stupeň signálu a limity účtu; výsledok akcie nemení. | |
| 946 | `messages.ts:1518` `ownerAllocation.disclaimer` | Private owner illustration. These draft amounts are educational, not advice or a personalised recommendation. Results depend on the stock, not on the amount assigned. | Súkromný príklad majiteľa. Návrhové sumy slúžia na vysvetlenie, nie ako rada ani osobné odporúčanie. Výsledok závisí od akcie, nie od pridelenej sumy. | |
| 947 | `messages.ts:1519` `ownerAllocation.noBaseline` | No private portfolio baseline is available. | Súkromný základ portfólia nie je dostupný. | |
| 948 | `messages.ts:1520` `ownerAllocation.noSignals` | No current signal qualifies. The cash carries forward unchanged. | Žiadny aktuálny signál nespĺňa podmienky. Hotovosť sa celá prenesie ďalej. | |
| 949 | `messages.ts:1521` `ownerAllocation.cashTitle` | Cash available this month | Hotovosť dostupná tento mesiac | |
| 950 | `messages.ts:1522` `ownerAllocation.asOf` | Baseline of {date} | Stav k {date} | |
| 951 | `messages.ts:1523` `ownerAllocation.monthly` | Monthly contribution | Mesačný vklad | |
| 952 | `messages.ts:1524` `ownerAllocation.freeCash` | Free broker cash | Voľná hotovosť u brokera | |
| 953 | `messages.ts:1525` `ownerAllocation.reserve` | Held for adds | Rezerva na prikúpenie | |
| 954 | `messages.ts:1526` `ownerAllocation.carried` | Cash carried forward | Prenesená hotovosť | |
| 955 | `messages.ts:1527` `ownerAllocation.unknown` | Not recorded | Nezaznamenané | |
| 956 | `messages.ts:1528` `ownerAllocation.monthlyMissing` | The monthly contribution is missing, so the add reserve and cash-drag note cannot be calculated. | Mesačný vklad chýba, preto nie je možné určiť rezervu na prikúpenie ani upozornenie na nevyužitú hotovosť. | |
| 957 | `messages.ts:1529` `ownerAllocation.cashDrag` | Free cash is above three monthly contributions. Review the idle cash, but no purchase is forced. | Voľná hotovosť presahuje tri mesačné vklady. Skontrolujte ju, nákup sa však nevynucuje. | |
| 958 | `messages.ts:1530` `ownerAllocation.suggestions` | Signal amounts and reasons | Sumy a dôvody podľa signálov | |
| 959 | `messages.ts:1532` `ownerAllocation.tier` | Tier | Stupeň | |
| 960 | `messages.ts:1533` `ownerAllocation.amount` | Illustrative amount | Ilustračná suma | |
| 961 | `messages.ts:1534` `ownerAllocation.reason` | Why this amount | Dôvod sumy | |
| 962 | `messages.ts:1535` `ownerAllocation.wait` | Wait | Počkať | |
| 963 | `messages.ts:1536` `ownerAllocation.capped` | The amount was limited. | Suma bola obmedzená. | |
| 964 | `messages.ts:1537` `ownerAllocation.historyNote` | The Flex baseline does not record executed add dates. Adds wait until this month's trade history is confirmed. | Podklad Flex neobsahuje dátumy vykonaných prikúpení. Prikúpenia čakajú na potvrdenie obchodov v tomto mesiaci. | |
| 965 | `messages.ts:1538` `ownerAllocation.tiers.NONE` | None | Žiadny | |
| 966 | `messages.ts:1538` `ownerAllocation.tiers.STARTER` | Starter | Úvodná | |
| 967 | `messages.ts:1538` `ownerAllocation.tiers.STANDARD` | Standard | Štandardná | |
| 968 | `messages.ts:1538` `ownerAllocation.tiers.FULL` | Full | Plná | |
| 969 | `messages.ts:1538` `ownerAllocation.tiers.ADD_THIRD` | Add | Prikúpenie | |
| 970 | `messages.ts:1538` `ownerAllocation.tiers.ADD_HALF` | High-conviction add | Silné prikúpenie | |
| 971 | `messages.ts:1540` `ownerAllocation.reasons.TIER_AMOUNT` | Tier share of starting free cash. | Podiel stupňa na počiatočnej voľnej hotovosti. | |
| 972 | `messages.ts:1540` `ownerAllocation.reasons.ORDER_CEILING` | The order ceiling reduced the tier amount. | Horná hranica objednávky znížila sumu. | |
| 973 | `messages.ts:1540` `ownerAllocation.reasons.CASH_LIMIT` | Remaining cash limited this add. | Prikúpenie obmedzila zostávajúca hotovosť. | |
| 974 | `messages.ts:1541` `ownerAllocation.reasons.RESERVE_LIMIT` | The follow-on reserve limits new positions. | Novú pozíciu obmedzila rezerva na prikúpenie. | |
| 975 | `messages.ts:1541` `ownerAllocation.reasons.NAME_CAP` | The per-name portfolio cap limits this order. | Objednávku obmedzil limit jednej firmy v portfóliu. | |
| 976 | `messages.ts:1542` `ownerAllocation.reasons.BELOW_MINIMUM` | The amount is below the minimum order or fee threshold. | Suma je nižšia než minimum objednávky alebo hranica poplatku. | |
| 977 | `messages.ts:1542` `ownerAllocation.reasons.NO_CASH` | No free cash is available. | Nie je voľná hotovosť. | |
| 978 | `messages.ts:1543` `ownerAllocation.reasons.NO_BUY_SIGNAL` | This signal calls for no new money. | Tento signál nepočíta s novým vkladom. | |
| 979 | `messages.ts:1543` `ownerAllocation.reasons.ADD_ALREADY_THIS_MONTH` | An add is already recorded for this ticker this month. | Pri tomto tickeri už bolo v mesiaci zaznamenané prikúpenie. | |
| 980 | `messages.ts:1544` `ownerAllocation.reasons.ADD_HISTORY_UNKNOWN` | Executed add history is unavailable; confirm it before assigning money. | Chýba história vykonaných prikúpení; pred pridelením sumy ju treba potvrdiť. | |
| 981 | `messages.ts:1544` `ownerAllocation.reasons.DUPLICATE_SIGNAL` | Another signal for this ticker was already considered. | Ďalší signál pre tento ticker už bol vyhodnotený. | |

### Owner research card (private Telegram)

| # | Key (SK line) | English | Slovak | OK / suggested fix |
| --- | --- | --- | --- | --- |
| 982 | `research-card.ts:18` `happened` | What happened | Čo sa stalo | |
| 983 | `research-card.ts:18` `why` | Why it matters | Prečo na tom záleží | |
| 984 | `research-card.ts:18` `setup` | Setup: not rated, outside the scored universe | Nastavenie: nehodnotené, mimo bodovaného výberu | |
| 985 | `research-card.ts:18` `numbers` | Numbers | Čísla | |
| 986 | `research-card.ts:18` `plan` | Plan | Plán | |
| 987 | `research-card.ts:18` `now` | Now | Teraz | |
| 988 | `research-card.ts:18` `upgrade` | Upgrade | Potvrdenie | |
| 989 | `research-card.ts:18` `invalidation` | Invalidation | Čo zmení záver | |
| 990 | `research-card.ts:18` `cost` | Opportunity cost | Náklady príležitosti | |
| 991 | `research-card.ts:18` `evidence` | Evidence | Dôkazy | |
| 992 | `research-card.ts:18` `coverage` | Coverage | Pokrytie | |
| 993 | `research-card.ts:18` `pipeline` | Pipeline | História | |
| 994 | `research-card.ts:18` `owner` | Owner page | Stránka vlastníka | |
| 995 | `research-card.ts:18` `unconfirmed` | UNCONFIRMED | NEPOTVRDENÉ | |
| 996 | `research-card.ts:18` `notScored` | not scored yet | zatiaľ nebodované | |
| 997 | `research-card.ts:18` `outside` | outside scoring coverage | mimo pokrytia skórovania | |
| 998 | `research-card.ts:18` `proposed` | promotion proposed | navrhnuté zaradenie | |

### Plural forms

| # | Key (SK line) | English | Slovak | OK / suggested fix |
| --- | --- | --- | --- | --- |
| 999 | `messages.ts:1590` `plurals.tickers.few` | {n} tickers | {n} tickery | |
| 1000 | `messages.ts:1590` `plurals.tickers.many` | {n} tickers | {n} tickera | |
| 1001 | `messages.ts:1590` `plurals.tickers.other` | {n} tickers | {n} tickerov | |
| 1002 | `messages.ts:1591` `plurals.sampleTickers.one` | {n} sample ticker | {n} ukážkový ticker | |
| 1003 | `messages.ts:1591` `plurals.sampleTickers.few` | {n} sample tickers | {n} ukážkové tickery | |
| 1004 | `messages.ts:1591` `plurals.sampleTickers.many` | {n} sample tickers | {n} ukážkového tickera | |
| 1005 | `messages.ts:1591` `plurals.sampleTickers.other` | {n} sample tickers | {n} ukážkových tickerov | |

## Slovak text outside the dictionaries

These strings are written inline in code and have no English dictionary key. English is the text next to them in the same line.

| # | File:line | English | Slovak | Where | OK / suggested fix |
| --- | --- | --- | --- | --- | --- |
| I1 | `src/jobs/digest.ts:34` | Daily rule summary {date} | Denný prehľad pravidiel {date} | Digest mail subject | |
| I2 | `src/jobs/digest.ts:36` | Rule state changes on {date}: | Zmeny stavov pravidiel k {date}: | Digest mail body | |
| I3 | `src/jobs/digest.ts:37` | {ticker}: first rating {state} ({score} points). | {ticker}: nové hodnotenie {state} ({score} bodov). | Digest mail body | |
| I4 | `src/jobs/digest.ts:37` | {ticker}: {previousState} → {currentState} ({previousScore} → {currentScore} points). | {ticker}: {previousState} → {currentState} ({previousScore} → {currentScore} bodov). | Digest mail body | |
| I5 | `src/jobs/digest.ts:37` | No rule states changed today. | Dnes sa stav pravidiel nezmenil. | Digest mail body | |
| I6 | `src/jobs/digest.ts:38` | This is an informational screen based on the published methodology. It is not personal investment advice. The full alert log and methodology are available in the app. | Tento prehľad je len informačný skríning podľa zverejnenej metodiky. Nie je to osobné investičné odporúčanie. Úplný záznam upozornení a metodiku nájdete v aplikácii. | Digest mail closing line | |
| I7 | `src/security/rate-limit.ts:66` | Too many requests. Try again shortly. | Príliš veľa požiadaviek. Skúste to neskôr. | Plain-text 429 answer, both languages in one line | |
| I8 | `src/ideas/localize.ts:14` | Earnings release | Výsledková správa | Evidence label on idea cards (hidden unless ADVICE_OUTPUT) | |
| I9 | `src/ideas/localize.ts:14` | SEC XBRL / SEC XBRL facts | Výkaz SEC XBRL | Evidence label | |
| I10 | `src/ideas/localize.ts:14` | Earnings call | Hovor o výsledkoch | Evidence label | |
| I11 | `src/ideas/localize.ts:14` | Press release | Tlačová správa | Evidence label | |
| I12 | `src/ideas/localize.ts:14` | Investor presentation | Prezentácia pre investorov | Evidence label | |
| I13 | `src/jobs/research-notify.ts:104` | Weekly research review | Týždenný prehľad výskumu | Owner private Telegram | |
| I14 | `src/jobs/research-notify.ts:105` | Reviews overdue | Termín kontroly uplynul | Owner private Telegram | |
| I15 | `src/jobs/research-notify.ts:106` | Unallocated cash | Nepridelená hotovosť | Owner private Telegram | |
| I16 | `src/jobs/research-notify.ts:106` | no amount pending an approved rule | bez sumy, pravidlo ešte nebolo schválené | Owner private Telegram | |
| I17 | `src/app/[locale]/owner/research/[symbol]/page.tsx:37-46` | Research state / Coverage / In scoring coverage / Outside scoring coverage / Promotion / Verified facts / UNCONFIRMED / Unconfirmed leads / fetch failed / None. / History | Stav výskumu / Pokrytie / V pokrytí skórovania / Mimo pokrytia skórovania / Zaradenie / Overené zistenia / NEPOTVRDENÉ / Nepotvrdené podnety / načítanie zlyhalo / Žiadne. / História | Owner research page (OWNER_VIEW, private) | |

Count: 1005 dictionary strings and 17 inline entries.
