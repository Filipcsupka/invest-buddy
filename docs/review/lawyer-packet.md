# Lawyer review packet

Prepared 2026-10-16 from `origin/main` at 585ad3d. This lists every public place where wording could read as regulated: investment advice, a recommendation, an offer, a performance claim. It is a working list for a lawyer, not legal advice. Slovak text was never reviewed by a native speaker either (see `docs/review/sk-native-review.md`).

## How to read this

- Every row gives the file and line of the exact text, English and Slovak. Text is copied from the code as of the commit above.
- The `Now` column says what a visitor can reach with the code defaults in `src/config/flags.ts`: `PAYWALL`, `AUTH`, `BILLING`, `WAITLIST`, `ADVICE_OUTPUT` and `OWNER_VIEW` are off, `INSIDERS_PAGE` is on, `IDEAS_PAGE` is on only in fixture mode. The deployed environment was not checked. If the live site sets any of these flags, the `Now` column changes.
- `Hidden: ADVICE_OUTPUT` means the text appears only when that flag is on. `src/proxy.ts:37,39` returns 404 for `/sizing` and `/ideas` while it is off. `docs/wording-gate.md` is the owner's list of what the flag holds back.
- `Hidden: WAITLIST` means `/pricing`, the landing waitlist block and the waitlist API return 404 while `WAITLIST` is off (`src/proxy.ts:38`, `src/app/[locale]/page.tsx:36-37`, `src/waitlist/handlers.ts:38`).
- `Hidden: PAYWALL` means `/scanner` returns 404 while `PAYWALL` is off (`src/proxy.ts:36`).
- `Owner only: OWNER_VIEW` text sits on private routes.
- Product limit, from ADR-001 (`~/Documents/ops-brain/projects/investing-platform/decisions/ADR-001-product-positioning.md`): public output is informational screening only.

For a 20-minute pass: read sections A, B and the disclaimer rows of I, then the questions at the end. Sections C to H and J are reference lists for follow-up.

Two things in `docs/wording-gate.md` no longer match the code. Its home-page quote reads "Ten rules add up to 25 points" and "no instructions to buy or sell", while `home.buildBody` now says "Nine core rules" and `home.leavesOutBody` says "no position sizes, price targets or personal trade instructions". Its track record quote says "30-day SPY beat rate", while `trackRecord.hitRate` now says "20-trading-day". The tables below use the current code.

## A. The ADR-001 disclaimer and where it is rendered

The shared line is `common.disclaimer`. A shorter one, `common.ogDisclaimer`, goes on share images. The footer and the legal pages use a third text, `short`. Telegram and email carry their own variants. Several different sentences carry the same message, so the lawyer may want one agreed wording.

| # | Where it shows | Source (EN line / SK line) | English | Slovak | Now |
| --- | --- | --- | --- | --- | --- |
| 1 | Shared line, see render list below | `messages.ts:102` / `896`<br>`common.disclaimer` | Informational screening only. Same rules for every visitor. No personal investment advice. | Iba informačný prehľad podľa pravidiel. Rovnaké pravidlá pre každého návštevníka. Nejde o osobné investičné poradenstvo. | Public |
| 2 | Share image of each company page (`src/og/card.tsx:58`, set in `src/app/[locale]/company/[ticker]/opengraph-image.tsx:31`) | `messages.ts:103` / `897`<br>`common.ogDisclaimer` | Informational screening only. No personal investment advice. | Iba informačný prehľad. Nejde o osobné investičné poradenstvo. | Public |
| 3 | Footer of every page (`src/components/nav.tsx:73`) and top of each legal page (`src/components/legal-page.tsx:25`) | `legal-messages.ts:24` / `100`<br>`short` | Informational screening only. Not financial advice, no recommendation, no offer. Past results do not predict future results. You decide and you bear the risk. Data may be incomplete or delayed. | Iba informačný prehľad. Nie je to finančné poradenstvo, odporúčanie ani ponuka. Minulé výsledky nepredpovedajú budúce. Rozhodujete vy a riziko znášate vy. Údaje môžu byť neúplné alebo oneskorené. | Public |
| 4 | Meta description of each company page, built in `src/seo/ticker-text.ts:29,38`, used in `src/app/[locale]/company/[ticker]/layout.tsx:22` | `seo-messages.ts:22` / `33`<br>`description` | {ticker} meets {met} of {rules} as of {date}. State: {state}. Data for {known} of {rules}. Informational screening, not advice. | {ticker} spĺňa {met} z {rules} k {date}. Stav: {state}. Údaje pre {known} z {rules}. Informatívny prehľad, nie poradenstvo. | Public |
| 5 | Same, when the stored date is missing (`src/seo/ticker-text.ts:38`) | `seo-messages.ts:23` / `34`<br>`descriptionNoDate` | {ticker} meets {met} of {rules}. State: {state}. Data for {known} of {rules}. Informational screening, not advice. | {ticker} spĺňa {met} z {rules}. Stav: {state}. Údaje pre {known} z {rules}. Informatívny prehľad, nie poradenstvo. | Public |
| 6 | Same, for a ticker without enough data (`src/seo/ticker-text.ts:29`) | `seo-messages.ts:24` / `35`<br>`descriptionNoScore` | {ticker} has not enough data to score as of {date}. Informational screening, not advice. | {ticker} nemá k {date} dosť údajov na skóre. Informatívny prehľad, nie poradenstvo. | Public |
| 7 | Idea note above the idea card on the company page (`src/app/[locale]/company/[ticker]/page.tsx:287`) | `messages.ts:431` / `1225`<br>`company.ideaNote` | Informational screening output from the same rules. Not personal advice. | Informačný výstup z rovnakých pravidiel. Nie je to osobné odporúčanie. | Hidden: ADVICE_OUTPUT |
| 8 | Top of `/sizing` (`src/app/[locale]/sizing/page.tsx:36`) | `messages.ts:719` / `1513`<br>`sizing.disclaimer` | Illustrative sizing guide only. It is informational screening, not personal investment advice. You decide whether any position suits you. | Len ilustračný návod na veľkosť pozície. Ide o informačný prehľad, nie o osobné investičné odporúčanie. O vhodnosti pozície rozhodujete vy. | Hidden: ADVICE_OUTPUT |
| 9 | Private owner pages (`src/app/[locale]/owner-allocation/page.tsx:28`, `src/app/[locale]/owner/research/[symbol]/page.tsx:38`) | `messages.ts:724` / `1518`<br>`ownerAllocation.disclaimer` | Private owner illustration. These draft amounts are educational, not advice or a personalised recommendation. Results depend on the stock, not on the amount assigned. | Súkromný príklad majiteľa. Návrhové sumy slúžia na vysvetlenie, nie ako rada ani osobné odporúčanie. Výsledok závisí od akcie, nie od pridelenej sumy. | Owner only: OWNER_VIEW |

Where `common.disclaimer` is rendered (each place shows the text of the first row above):

| # | Where | File:line | Now |
| --- | --- | --- | --- |
| R1 | Directly under the score and status widget on a company page, `id="score-disclaimer"` | `src/components/status-slider.tsx:194` | Public |
| R2 | Inside each idea card (company page card shows evidence only while the flag is off) | `src/components/idea-card.tsx:124` | Public |
| R3 | Home page datasheet | `src/components/datasheet.tsx:62` | Public |
| R4 | Dashboard table caption | `src/app/[locale]/dashboard/page.tsx:42`, `src/components/scanner-table.tsx:153` | Public |
| R5 | Track record header and each daily table | `src/app/[locale]/track-record/page.tsx:108,153` | Public |
| R6 | Methodology header | `src/app/[locale]/methodology/page.tsx:26` | Public |
| R7 | Insider filings page | `src/app/[locale]/insiders/page.tsx:31` | Public |
| R8 | Sector map legend | `src/app/[locale]/heatmap/page.tsx:80` | Public |
| R9 | Every mail footer | `src/mail/templates/layout.ts:20,50` | Hidden: WAITLIST |
| R10 | Landing waitlist block | `src/components/launch-section.tsx:32,46` | Hidden: WAITLIST |
| R11 | Pricing page header | `src/app/[locale]/pricing/page.tsx:35` | Hidden: WAITLIST |
| R12 | Scanner | `src/app/[locale]/scanner/page.tsx:126` | Hidden: PAYWALL |
| R13 | Ideas list | `src/app/[locale]/ideas/page.tsx:36` | Hidden: ADVICE_OUTPUT |

The line sits next to the score on company pages (`status-slider.tsx:194`), as ADR-001 asks. The dashboard rows point at it with `aria-describedby`. `/portfolio` shows returns and uses its own notice (section H) instead of this line. No `common.disclaimer` render was found in `src/app/[locale]/portfolio/page.tsx`.

## B. Status and band names

The six names are public today. The green name has two versions: "Conditions met" (default) and "Buy zone" (only with `ADVICE_OUTPUT` on, `src/components/status-slider.tsx:23`, `src/engine/status.ts:126-133`). A lawyer objection to the public names needs a product decision, per `docs/wording-gate.md`.

| # | Where it shows | Source (EN line / SK line) | English | Slovak | Now |
| --- | --- | --- | --- | --- | --- |
| 10 | Status chip, scanner filter, share image, SEO text | `messages.ts:152` / `946`<br>`states.setup` | Conditions met | Podmienky splnené | Public |
| 11 | Status chip, scanner filter, share image, SEO text | `messages.ts:153` / `947`<br>`states.watch` | Watching | Sledovanie | Public |
| 12 | Status chip, scanner filter, share image, SEO text | `messages.ts:154` / `948`<br>`states.pullback` | Pullback in uptrend | Pokles v rastovom trende | Public |
| 13 | Status chip, scanner filter, share image, SEO text | `messages.ts:155` / `949`<br>`states.wait` | Waiting | Čakanie | Public |
| 14 | Status chip, scanner filter, share image, SEO text | `messages.ts:156` / `950`<br>`states.ignore` | Not now | Mimo výberu | Public |
| 15 | Status chip, scanner filter, share image, SEO text | `messages.ts:157` / `951`<br>`states.broken` | Criteria broken | Kritériá porušené | Public |
| 16 | Status chip, scanner filter, share image, SEO text | `messages.ts:158` / `952`<br>`states.insufficient` | Not enough data | Nedostatok údajov | Public |
| 17 | Green name when `ADVICE_OUTPUT` is on | `messages.ts:171` / `965`<br>`status.advice.setup` | Buy zone | Zóna nákupu | Hidden: ADVICE_OUTPUT |
| 18 | Headline above the score when `ADVICE_OUTPUT` is on | `messages.ts:180` / `974`<br>`status.headlineAdvice.setup` | Buy zone: {points} of {max} points. | Zóna nákupu: {points} z {max} bodov. | Hidden: ADVICE_OUTPUT |
| 19 | Headline above the score, default | `messages.ts:177` / `971`<br>`status.headline.setup` | Conditions met: {points} of {max} points. | Podmienky splnené: {points} z {max} bodov. | Public |
| 20 | Legend: what the green step means (methodology page) | `messages.ts:221` / `1015`<br>`status.meaning.setup` | At least 72% of core rule points with data, at least 80% core weight covered, and no rejection rule. | Aspoň 72 % bodov hlavných pravidiel s údajmi, pokrytie aspoň 80 % ich váhy a žiadne vylučovacie pravidlo. | Public |
| 21 | Legend: what the Watching step means | `messages.ts:220` / `1014`<br>`status.meaning.watch` | At least 60% of core rule points with data, or a higher percentage with less than 80% core weight covered. | Aspoň 60 % bodov hlavných pravidiel s údajmi alebo vyššie percento pri pokrytí menej ako 80 % ich váhy. | Public |
| 22 | Legend: what Not now means | `messages.ts:218` / `1012`<br>`status.meaning.ignore` | Too few published conditions are met. | Splnených je príliš málo zverejnených podmienok. | Public |
| 23 | Legend: what Criteria broken means | `messages.ts:217` / `1011`<br>`status.meaning.broken` | A rejection rule applies, so the points do not count. | Platí vylučovacie pravidlo, takže body sa nepočítajú. | Public |
| 24 | Why-list when a rejection rule applies | `messages.ts:195` / `989`<br>`status.brokenBecause` | Rejected by: {reasons} | Vylúčené pre: {reasons} | Public |

## C. Action, size and plan wording held behind ADVICE_OUTPUT

None of this is reachable while the flag is off. `docs/wording-gate.md` lists the full set including the rest of `sizing.*`. These are the rows with the most advice-like verbs. Public cards never show a stored EUR amount even when the flag is on.

| # | Where it shows | Source (EN line / SK line) | English | Slovak | Now |
| --- | --- | --- | --- | --- | --- |
| 25 | Idea card action label (`src/components/idea-card.tsx`) | `messages.ts:663` / `1457`<br>`ideas.actions.START_POSITION` | Start position | Otvoriť pozíciu | Hidden: ADVICE_OUTPUT |
| 26 | Idea card action label (`src/components/idea-card.tsx`) | `messages.ts:663` / `1457`<br>`ideas.actions.ADD` | Add | Prikúpiť | Hidden: ADVICE_OUTPUT |
| 27 | Idea card action label (`src/components/idea-card.tsx`) | `messages.ts:663` / `1457`<br>`ideas.actions.HIGH_CONVICTION_ADD` | High-conviction add | Výrazne prikúpiť | Hidden: ADVICE_OUTPUT |
| 28 | Idea card action label (`src/components/idea-card.tsx`) | `messages.ts:663` / `1457`<br>`ideas.actions.HOLD` | Hold | Držať | Hidden: ADVICE_OUTPUT |
| 29 | Idea card action label (`src/components/idea-card.tsx`) | `messages.ts:663` / `1457`<br>`ideas.actions.REDUCE` | Reduce | Znížiť | Hidden: ADVICE_OUTPUT |
| 30 | Idea card action label (`src/components/idea-card.tsx`) | `messages.ts:663` / `1457`<br>`ideas.actions.WATCH` | Watch | Sledovať | Hidden: ADVICE_OUTPUT |
| 31 | Idea card action label (`src/components/idea-card.tsx`) | `messages.ts:663` / `1457`<br>`ideas.actions.THESIS_BROKEN` | Thesis broken | Investičná téza neplatí | Hidden: ADVICE_OUTPUT |
| 32 | Idea card action label (`src/components/idea-card.tsx`) | `messages.ts:663` / `1457`<br>`ideas.actions.CSPX_ALLOCATION` | CSPX allocation | Pridelenie do CSPX | Hidden: ADVICE_OUTPUT |
| 33 | Idea card size tier | `messages.ts:661` / `1455`<br>`ideas.tiers.STARTER` | Starter, about 1/3 of a full position | Úvodná, asi 1/3 plnej pozície | Hidden: ADVICE_OUTPUT |
| 34 | Idea card size tier | `messages.ts:661` / `1455`<br>`ideas.tiers.STANDARD` | Standard, about 2/3 of a full position | Štandardná, asi 2/3 plnej pozície | Hidden: ADVICE_OUTPUT |
| 35 | Idea card size tier | `messages.ts:661` / `1455`<br>`ideas.tiers.FULL` | Full position | Plná pozícia | Hidden: ADVICE_OUTPUT |
| 36 | Idea card size tier | `messages.ts:661` / `1455`<br>`ideas.tiers.ADD_THIRD` | Add about 1/3 of a full position | Prikúpiť asi 1/3 plnej pozície | Hidden: ADVICE_OUTPUT |
| 37 | Idea card size tier | `messages.ts:661` / `1455`<br>`ideas.tiers.ADD_HALF` | Add about 1/2 of a full position | Prikúpiť asi 1/2 plnej pozície | Hidden: ADVICE_OUTPUT |
| 38 | Idea card size tier | `messages.ts:661` / `1455`<br>`ideas.tiers.NONE` | No new money | Žiadne nové peniaze | Hidden: ADVICE_OUTPUT |
| 39 | Idea card plan label | `messages.ts:673` / `1467`<br>`ideas.trigger` | Add or upgrade trigger | Spúšťač pridania alebo zvýšenia | Hidden: ADVICE_OUTPUT |
| 40 | Idea card downgrade line | `messages.ts:684` / `1478`<br>`ideas.downgraded` | Downgraded from {action} | Znížené z {action} | Hidden: ADVICE_OUTPUT |
| 41 | Company page section title | `messages.ts:430` / `1224`<br>`company.ideaTitle` | Latest trade idea | Posledný investičný nápad | Hidden: ADVICE_OUTPUT |
| 42 | Company page, no card yet | `messages.ts:432` / `1226`<br>`company.noIdea` | No trade idea for this stock yet. A card appears only when the action or the setup rating changes. | Pre túto akciu zatiaľ nie je investičný nápad. Karta sa objaví, len keď sa zmení akcia alebo hodnotenie nastavenia. | Hidden: ADVICE_OUTPUT |
| 43 | Navigation link and page title | `messages.ts:129` / `923`<br>`nav.ideas` | Ideas | Nápady | Hidden: ADVICE_OUTPUT |
| 44 | `/ideas` page title | `messages.ts:653` / `1447`<br>`ideas.title` | Trade ideas | Investičné nápady | Hidden: ADVICE_OUTPUT |
| 45 | `/ideas` page intro | `messages.ts:654` / `1448`<br>`ideas.lede` | Only changes are listed, newest first. Each idea rests on reconciled facts and rule scores. Cash stays uninvested when nothing qualifies. | Zobrazujú sa iba zmeny, od najnovších. Každý nápad vychádza zo zosúladených faktov a skóre podľa pravidiel. Keď nič nevyhovuje, hotovosť zostáva nezainvestovaná. | Hidden: ADVICE_OUTPUT |
| 46 | Sizing page rule for adds (`/sizing`) | `messages.ts:714` / `1508`<br>`sizing.addRule` | At most one add per month, and only on an ADD signal. Leave room below the cap; if price drift has already put the name at or above it, wait. Never add past the cap. | Najviac jedno prikúpenie za mesiac a len pri signáli Prikúpiť. Nechajte rezervu pod limitom. Ak rast ceny už dostal pozíciu na limit alebo nad neho, počkajte. Nikdy neprikupujte nad limit. | Hidden: ADVICE_OUTPUT |
| 47 | Sizing page rule for reductions | `messages.ts:715` / `1509`<br>`sizing.reduceRule` | A REDUCE signal points back toward the standard size or the cap. It does not set a transaction amount. | Signál na zníženie pozície ukazuje späť k štandardnej veľkosti alebo k limitu. Neurčuje sumu transakcie. | Hidden: ADVICE_OUTPUT |
| 48 | Sizing page worked example | `messages.ts:717` / `1511`<br>`sizing.example` | For an illustrative EUR 20,000 portfolio with 20% cash, a STARTER tier is 2% of the total portfolio, or EUR 400. The per-name cap is 8%, or EUR 1,600. An ADD_THIRD tier is another 2 percentage points before checking the current holding against that cap. | Pri ilustračnom portfóliu 20 000 EUR s 20 % hotovosti tvorí úvodná pozícia 2 % celého portfólia, teda 400 EUR. Limit na jednu firmu je 8 %, teda 1 600 EUR. Prikúpenie tretiny plnej pozície pridáva ďalšie 2 percentuálne body, až po kontrole existujúcej pozície voči limitu. | Hidden: ADVICE_OUTPUT |
| 49 | Track record tier labels, signal column | `messages.ts:544` / `1338`<br>`trackRecord.signalTiers.ADD_THIRD` | Add 1/3 | Prikúpiť 1/3 | Hidden: ADVICE_OUTPUT |
| 50 | Track record tier labels, signal column | `messages.ts:544` / `1338`<br>`trackRecord.signalTiers.ADD_HALF` | Add 1/2 | Prikúpiť 1/2 | Hidden: ADVICE_OUTPUT |
| 51 | Telegram green name when the flag is on (`src/notify/format.ts:119`) | `format.ts:80` / `96`<br>`greenAdvice` | Buy zone | Zóna nákupu | Hidden: ADVICE_OUTPUT |

## D. Company page flags block

Added 2026-10-16 (TASK-090). Rendered by `src/components/flags-block.tsx`, used at `src/app/[locale]/company/[ticker]/page.tsx:181`. Public. The labels are risk-like ("Flagged", "Share count growth") and each is a fixed numeric test, not a view on the stock.

| # | Where it shows | Source (EN line / SK line) | English | Slovak | Now |
| --- | --- | --- | --- | --- | --- |
| 52 | Flags block intro | `messages.ts:474` / `1268`<br>`flags.note` | Flags sit apart from the score and never change it. Each one is a stored fact checked against a fixed line, the same for every visitor. Missing data shows as no data, not as a pass. | Príznaky stoja bokom od skóre a nikdy ho nemenia. Každý je uložený údaj porovnaný s pevnou hranicou, rovnaký pre každého návštevníka. Chýbajúce údaje sa zobrazia ako bez údajov, nie ako splnené. | Public |
| 53 | Flag state label | `messages.ts:475` / `1269`<br>`flags.state.flagged` | Flagged | Označené | Public |
| 54 | Flag state label | `messages.ts:475` / `1269`<br>`flags.state.clear` | Not flagged | Neoznačené | Public |
| 55 | Flag state label | `messages.ts:475` / `1269`<br>`flags.state.noData` | No data | Bez údajov | Public |
| 56 | Flag name | `messages.ts:476` / `1270`<br>`flags.names.dilution` | Share count growth | Rast počtu akcií | Public |
| 57 | Flag name | `messages.ts:476` / `1270`<br>`flags.names.illiquid` | Low trading volume | Nízky objem obchodovania | Public |
| 58 | Flag name | `messages.ts:476` / `1270`<br>`flags.names.interestCover` | Interest cover | Krytie úrokov | Public |
| 59 | Flag name | `messages.ts:476` / `1270`<br>`flags.names.shortInterest` | Short interest | Krátke pozície | Public |
| 60 | Flag name | `messages.ts:476` / `1270`<br>`flags.names.drawdown` | Drop from the 20-day high | Pokles od 20-dňového maxima | Public |
| 61 | Flag test sentence | `messages.ts:478` / `1272`<br>`flags.thresholds.dilution` | Flagged when the reported share count is up {percent} or more over about a year. | Označené, keď je vykázaný počet akcií za približne rok vyšší o {percent} alebo viac. | Public |
| 62 | Flag test sentence | `messages.ts:479` / `1273`<br>`flags.thresholds.illiquid` | Flagged when average daily trading value over {days} sessions is under {amount}. | Označené, keď je priemerná denná hodnota obchodov za {days} dní nižšia ako {amount}. | Public |
| 63 | Flag test sentence | `messages.ts:480` / `1274`<br>`flags.thresholds.interestCover` | Flagged when operating income covers interest expense less than {times} times. | Označené, keď prevádzkový zisk pokrýva úrokové náklady menej ako {times}-krát. | Public |
| 64 | Flag test sentence | `messages.ts:481` / `1275`<br>`flags.thresholds.shortInterest` | Flagged when short interest is {percent} or more of float. | Označené, keď krátke pozície tvoria {percent} alebo viac voľne obchodovateľných akcií. | Public |
| 65 | Flag test sentence | `messages.ts:482` / `1276`<br>`flags.thresholds.drawdown` | Flagged when the last close is {percent} or more under the 20-day high. | Označené, keď je posledná záverečná cena o {percent} alebo viac pod 20-dňovým maximom. | Public |

## E. Telegram and email alerts

One digest channel gets the same message for everyone (`docs/alerts-telegram.md:3`). The code does not say whether the channel is public or private: the setup note allows either (`docs/alerts-telegram.md:29`). `docs/alerts-telegram.md:60` records that a public channel "falls under the same open lawyer question as the paid feed (tasks-open G5)". Alert text is built with `adviceOutput` read from the flag at send time. The private owner card mode uses action words and is for the owner's private channel only (`docs/alerts-telegram.md:24`).

| # | Where it shows | Source (EN line / SK line) | English | Slovak | Now |
| --- | --- | --- | --- | --- | --- |
| 66 | Disclaimer line at the end of every alert, weekly, discovery and idea card message (`src/notify/format.ts:168,322`, `src/notify/weekly.ts:125`, `src/notify/discovery.ts:107`) | `format.ts:92` / `108`<br>`disclaimer` | Informational screening under the published methodology, not personal advice. | Informačný skríning podľa zverejnenej metodiky, nie osobné odporúčanie. | Public (if the channel is public) |
| 67 | Green band name in alerts, default | `format.ts:79` / `95`<br>`bands.green` | Conditions met | Podmienky splnené | Public (if the channel is public) |
| 68 | Alert line when a rule starts to pass | `format.ts:87` / `103`<br>`nowMeets` | Now meets | Teraz spĺňa | Public (if the channel is public) |
| 69 | Alert line when a rule stops passing | `format.ts:86` / `102`<br>`noLongerMeets` | No longer meets | Už nespĺňa | Public (if the channel is public) |
| 70 | Alert line for a first rating | `format.ts:84` / `100`<br>`first` | First rating | Prvé hodnotenie | Public (if the channel is public) |
| 71 | Alert chip for insider activity | `format.ts:88` / `104`<br>`chips.insider` | Insiders (Form 4) | Insideri (Form 4) | Public (if the channel is public) |
| 72 | Idea card plan labels in public mode | `format.ts:214` / `222`<br>`planPublic.trigger` | Trigger | Spúšťač | Public (if the channel is public) |
| 73 | Idea card plan labels in public mode | `format.ts:214` / `222`<br>`planPublic.invalidation` | Invalidation | Čo nápad zruší | Public (if the channel is public) |
| 74 | Idea card plan label, owner mode | `format.ts:213` / `221`<br>`planOwner.start` | When to start | Kedy začať | Owner private channel only |
| 75 | Idea card plan label, owner mode | `format.ts:213` / `221`<br>`planOwner.add` | When to add | Kedy prikúpiť | Owner private channel only |
| 76 | Weekly summary heading | `weekly.ts:35` / `44`<br>`up` | Moved up | Posun nahor | Public (if the channel is public) |
| 77 | Weekly summary heading | `weekly.ts:36` / `45`<br>`down` | Moved down | Posun nadol | Public (if the channel is public) |
| 78 | Weekly discovery message intro (`src/notify/discovery.ts`) | `discovery.ts:39` / `50`<br>`intro` | Names outside the tracked universe that passed this week's screen. They are listed for review and are not scored daily yet. | Firmy mimo sledovaného univerza, ktoré prešli týždenným výberom. Sú len na posúdenie a zatiaľ sa denne neskórujú. | Public (if the channel is public) |
| 79 | Weekly discovery heading per name | `discovery.ts:40` / `51`<br>`surfaced` | Why it surfaced | Prečo sa objavila | Public (if the channel is public) |
| 80 | Owner research card line (`src/notify/research-card.ts`) | `research-card.ts:17` / `18`<br>`setup` | Setup: not rated, outside the scored universe | Nastavenie: nehodnotené, mimo bodovaného výberu | Owner private channel only |

Email and one inline text are not in the dictionaries. The daily digest mail body is hard-coded in `src/jobs/digest.ts`:

| # | Where | Source | English | Slovak | Now |
| --- | --- | --- | --- | --- | --- |
| 81 | Digest mail, closing line | `src/jobs/digest.ts:47` / `src/jobs/digest.ts:38` | This is an informational screen based on the published methodology. It is not personal investment advice. The full alert log and methodology are available in the app. | Tento prehľad je len informačný skríning podľa zverejnenej metodiky. Nie je to osobné investičné odporúčanie. Úplný záznam upozornení a metodiku nájdete v aplikácii. | Public (if the digest is sent to readers; delivery audience not checked) |
| 82 | Digest mail, first rating line | `src/jobs/digest.ts:46` / `src/jobs/digest.ts:37` | {ticker}: first rating {state} ({score} points). | {ticker}: nové hodnotenie {state} ({score} bodov). | Public (if the digest is sent to readers; delivery audience not checked) |

## F. Methodology and home page text

Public. Home page rows are on the landing page, methodology rows on `/methodology`. The `dataBodyLive` row names "Verified AI research", which the lawyer may want to see.

| # | Where it shows | Source (EN line / SK line) | English | Slovak | Now |
| --- | --- | --- | --- | --- | --- |
| 83 | Home page, what the screen leaves out | `messages.ts:344` / `1138`<br>`home.leavesOutBody` | Every visitor sees the same result. There are no position sizes, price targets or personal trade instructions. A score says which published conditions a stock meets today, and it knows nothing about your money or your goals. | Každý návštevník vidí rovnaký výsledok. Nenájdete tu veľkosť pozícií, cieľové ceny ani osobné pokyny k obchodom. Skóre hovorí, ktoré zverejnené podmienky akcia dnes spĺňa, a o vašich peniazoch ani cieľoch nevie nič. | Public |
| 84 | Home page, how a score is built | `messages.ts:340` / `1134`<br>`home.buildBody` | Nine core rules make the public percentage. Each checks collected data you can inspect on the company page. Ad hoc catalyst evidence is shown separately. A rejection rule overrides the percentage. | Deväť hlavných pravidiel tvorí verejné percento. Každé kontroluje zbierané údaje, ktoré nájdete na stránke spoločnosti. Príležitostné zistenia o katalyzátoroch sa zobrazujú osobitne. Vylučovacie pravidlo má prednosť pred percentom. | Public |
| 85 | Home page, status explainer ("{setup}" is the green name) | `messages.ts:342` / `1136`<br>`home.statusBody` | Five steps from Criteria broken to {setup}, set by the published rules. Gray means not enough data to score. | Päť stupňov od Kritériá porušené po {setup} podľa zverejnených pravidiel. Sivá znamená, že na skóre nie je dosť údajov. | Public |
| 86 | Home page, record block | `messages.ts:346` / `1140`<br>`home.recordBody` | The track record keeps dated screening snapshots and later signal outcomes, including criteria that broke. | História uchováva datované hodnotenia a neskoršie výsledky signálov vrátane porušených kritérií. | Public |
| 87 | Methodology intro | `messages.ts:591` / `1385`<br>`methodology.lede` | Every visitor sees the same result from the same rules. A score describes which published conditions a stock meets. It does not take anyone's finances or goals into account. | Každý návštevník vidí rovnaký výsledok z rovnakých pravidiel. Skóre opisuje, ktoré zverejnené podmienky akcia spĺňa. Neprihliada na financie ani ciele konkrétneho čitateľa. | Public |
| 88 | Methodology, percentage calculation | `messages.ts:593` / `1387`<br>`methodology.scoreBody` | Nine core rules use data collected at least quarterly. The percentage divides points met by points with data among those rules. A core rule without data is omitted and the page shows how many core rules have data. Ad hoc catalyst findings appear separately as a bonus and never change the percentage or displayed band. | Deväť hlavných pravidiel používa údaje zbierané aspoň štvrťročne. Percento je podiel splnených bodov z bodov hlavných pravidiel s údajmi. Hlavné pravidlo bez údajov sa vynechá a stránka uvádza, koľko hlavných pravidiel má údaje. Príležitostné zistenia o katalyzátoroch sa zobrazujú osobitne ako bonus a nemenia percento ani zobrazený stupeň. | Public |
| 89 | Methodology, worked example (names AMD, DDOG, NVDA, SNOW) | `messages.ts:597` / `1391`<br>`methodology.workedBody` | Replaying the stored scores of 9 October 2026 under these rules, AMD, DDOG, NVDA and SNOW each had 17 of the 23 points that had data. That is 74%, above the 72% step, so each reached Setup. | Pri spätnom prepočte uložených skóre z 9. októbra 2026 podľa týchto pravidiel mali AMD, DDOG, NVDA a SNOW po 17 z 23 bodov, ktoré mali údaje. To je 74 %, nad hranicou 72 %, takže každá dosiahla stav Podmienky splnené. | Public |
| 90 | Methodology, worked cap example | `messages.ts:598` / `1392`<br>`methodology.workedCap` | Now take a ticker with data for only 17 of the 23 core points that meets 14 of them. That is 82%, enough for Setup, but 17 is under 19, so it is shown as Watch and flagged as incomplete data. | Teraz vezmite ticker s údajmi len pre 17 z 23 bodov hlavných pravidiel, z ktorých spĺňa 14. To je 82 %, dosť na stav Podmienky splnené, ale 17 je menej ako 19, takže sa zobrazí ako Sledovanie a označí ako neúplné údaje. | Public |
| 91 | Methodology, limits | `messages.ts:600` / `1394`<br>`methodology.limitsBody` | A rule without data is left out of the percentage instead of counting as a miss, so a ticker with gaps can look better than one with full data. The coverage guard caps only the top step: a ticker with data for few rules can still reach Watch. Some thresholds await review. A changed rule gets a new ruleset version. | Pravidlo bez údajov sa vynechá z percenta a nepočíta sa ako nesplnené, takže ticker s medzerami môže vyzerať lepšie ako ticker s úplnými údajmi. Ochrana pokrytia obmedzuje len najvyšší stupeň: ticker s údajmi pre málo pravidiel môže stále dosiahnuť Sledovanie. Niektoré prahy čakajú na kontrolu. Zmenené pravidlo dostane novú verziu sady pravidiel. | Public |
| 92 | Methodology, rejection rules | `messages.ts:602` / `1396`<br>`methodology.rejectionBody` | These override the total and move a ticker to Criteria broken: declining revenue, an earnings miss together with a guidance cut, a close below MA200, MA50 below MA200, and a no-revenue or meme-pump flag. | Tieto pravidlá majú prednosť pred súčtom a presunú ticker do stavu Kritériá porušené: klesajúce tržby, zisk pod odhadom spolu so zníženým výhľadom, cena pod MA200, MA50 pod MA200 a príznak firmy bez tržieb alebo meme pumpy. | Public |
| 93 | Methodology, data and audit | `messages.ts:606` / `1400`<br>`methodology.dataBodyLive` | The screen combines collected SEC filings, daily prices from Twelve Data and public macro data (10-year yield from FRED) with market calculations. Verified AI research supplies checked facts from filings and releases; AI findings do not award points on their own. Unknown fields stay unknown. Each company page shows rule results and sources. Some thresholds await review. Personal capital and position rules from the guide are excluded. | Prehľad spája zbierané podania SEC, denné ceny od poskytovateľa Twelve Data a verejné makro údaje (výnos 10-ročných dlhopisov z FRED) s výpočtami z trhu. Overený výskum AI dodáva kontrolované fakty z podaní a správ; samotné zistenia AI neprideľujú body. Neznáme polia zostávajú neznáme. Stránka spoločnosti ukazuje výsledky pravidiel a zdroje. Niektoré prahy čakajú na kontrolu. Osobné pravidlá kapitálu a pozícií z príručky sú vynechané. | Public |
| 94 | Rule name, accumulation | `messages.ts:246` / `1040`<br>`rules.accumulation` | Insider or institutional accumulation | Nákupy insiderov alebo inštitúcií | Public |
| 95 | Rule name, catalyst | `messages.ts:245` / `1039`<br>`rules.catalyst` | Curated product catalyst | Produktový katalyzátor z vybraného zoznamu | Public |
| 96 | Rule name, rotation | `messages.ts:251` / `1045`<br>`rules.rotation` | Growth-sector rotation flag | Príznak rotácie do rastových sektorov | Public |
| 97 | Home page meta description | `messages.ts:13` / `807`<br>`meta.homeDescription` | A daily score for growth stocks built from published rules. Every ticker shows the rules it met, the rules it missed and the data behind them. | Denné skóre rastových akcií podľa zverejnených pravidiel. Pri každom tickeri vidíte, ktoré pravidlá splnil, ktoré nie a z akých údajov vychádzajú. | Public |
| 98 | Dashboard meta description | `messages.ts:15` / `809`<br>`meta.dashboardDescription` | Search, filter and sort growth stocks grouped by rule state. | Rastové akcie podľa stavu pravidiel s vyhľadávaním, filtrovaním a radením. | Public |

## G. Track record statements

Public at `/track-record` (`src/app/[locale]/track-record/page.tsx`). The sample-data note `trackRecord.note` shows while data is synthetic, `liveNote` once real signals exist. "Buy signals" in `hitRate` and `smallSample` is existing public wording; `docs/wording-gate.md` treats it as a historical count.

| # | Where it shows | Source (EN line / SK line) | English | Slovak | Now |
| --- | --- | --- | --- | --- | --- |
| 99 | Notice above the page, live data (`track-record/page.tsx:49,128`) | `messages.ts:513` / `1307`<br>`trackRecord.liveNote` | This is a record of past screening signals for information only. Past returns do not predict future returns. | Ide o prehľad minulých signálov na informačné účely. Minulé výnosy nepredpovedajú budúce výnosy. | Public |
| 100 | Notice above the page, sample data (`track-record/page.tsx:128`) | `messages.ts:511` / `1305`<br>`trackRecord.note` | All scores and the benchmark on this page are synthetic. They are not past results and they do not measure returns. | Všetky skóre aj porovnávací index na tejto stránke sú syntetické. Nie sú to minulé výsledky a nemerajú výnosy. | Public |
| 101 | Hit rate line (`track-record/page.tsx:53`) | `messages.ts:518` / `1312`<br>`trackRecord.hitRate` | 20-trading-day SPY beat rate: {rate} across {n} measured buy signals. | Podiel nákupných signálov, ktoré za 20 obchodných dní prekonali SPY: {rate} z {n} vyhodnotených. | Public |
| 102 | Small sample line (`track-record/page.tsx:56`) | `messages.ts:519` / `1313`<br>`trackRecord.smallSample` | {n} buy signals, too few to conclude. | Počet nákupných signálov: {n}. Vzorka je príliš malá na záver. | Public |
| 103 | Period table note (`track-record/page.tsx:83`) | `messages.ts:529` / `1323`<br>`trackRecord.periodNote` | Each row uses the 20-trading-day window. Periods are calendar months while the log is under a year old, calendar years after that. A period where the signals trailed SPY is listed the same way as any other. | Každý riadok používa okno 20 obchodných dní. Obdobia sú kalendárne mesiace, kým je záznam mladší ako rok, potom kalendárne roky. Obdobie, v ktorom signály zaostali za SPY, je uvedené rovnako ako ostatné. | Public |
| 104 | Method (`track-record/page.tsx:104`) | `messages.ts:551` / `1345`<br>`trackRecord.method` | Returns use the stored closing price on the signal date and the close after 1, 5, 20 or 60 shared trading sessions. SPY uses the same dates. A window stays pending until both closing prices exist. | Výnos sa počíta z uloženej zatváracej ceny v deň signálu a zo zatváracej ceny po 1, 5, 20 alebo 60 spoločných obchodných dňoch. SPY používa rovnaké dátumy. Kým obe ceny nie sú k dispozícii, výsledok čaká. | Public |
| 105 | Method line, costs (`track-record/page.tsx:105`) | `messages.ts:530` / `1324`<br>`trackRecord.methodLine` | Universe: {universe} tickers. Log start: {date}. Signals: {n}. No costs or slippage are included. | Zoznam: {universe} tickerov. Začiatok záznamu: {date}. Signály: {n}. Bez nákladov a preklzu. | Public |
| 106 | Backtest statement (`track-record/page.tsx:106`) | `messages.ts:531` / `1325`<br>`trackRecord.backtest` | Backtest: not shown. This page covers only signals recorded on the day they were made. | Spätný test: nezobrazený. Stránka obsahuje len signály zaznamenané v deň, keď vznikli. | Public |
| 107 | Weakest outcomes note (`track-record/page.tsx:54`) | `messages.ts:533` / `1327`<br>`trackRecord.worstNote` | The measured windows that trailed SPY the most. Losers stay in the record. | Vyhodnotené okná, ktoré za SPY zaostali najviac. Stratové signály ostávajú v zázname. | Public |
| 108 | Chart note (`track-record/page.tsx:133`) | `messages.ts:554` / `1348`<br>`trackRecord.benchmarkNote` | Illustrative index level. No comparison or return claim is made. | Ilustračná úroveň indexu. Nejde o porovnanie ani o tvrdenie o výnosoch. | Public |
| 109 | Signal rows without the flag (`src/i18n/record-signal.ts:17`) | `messages.ts:543` / `1337`<br>`trackRecord.ruleEvent` | Recorded rule event | Zaznamenaná udalosť pravidiel | Public |
| 110 | Meta description | `messages.ts:22` / `816`<br>`meta.trackRecordDescription` | Dated screening snapshots, signal events and measured returns against SPY. | Datované snímky hodnotení, signály a namerané výnosy voči SPY. | Public |
| 111 | Landing block, only with waitlist (`src/components/launch-section.tsx`) | `launch-messages.ts:17` / `51`<br>`landing.proofRecordBody` | Each signal is stored with its date. Measured outcomes appear once a signal window has closed, losers included. | Každý signál sa ukladá s dátumom. Namerané výsledky pribudnú po uzavretí okna signálu, aj tie zlé. | Hidden: WAITLIST |

## H. Other public statements about the owner, portfolio, insiders and data

The portfolio rows matter for conflict-of-interest disclosure: the owner holds the positions shown. `common.operatorDisclosure` is empty in the code; text for it comes from the environment variables `OPERATOR_DISCLOSURE_EN` and `OPERATOR_DISCLOSURE_SK` (`src/i18n/index.ts:16-20`) and renders on the company page and the home datasheet (`src/components/datasheet.tsx:89`, `src/app/[locale]/company/[ticker]/page.tsx:165`). Whether the deployed environment sets it was not checked.

| # | Where it shows | Source (EN line / SK line) | English | Slovak | Now |
| --- | --- | --- | --- | --- | --- |
| 112 | Portfolio page notice, live data (`src/app/[locale]/portfolio/page.tsx:44`) | `messages.ts:565` / `1359`<br>`portfolio.disclosure` | The site owner holds the positions shown. This page is informational and is not an investment recommendation. | Prevádzkovateľ stránky drží zobrazené pozície. Stránka má informačný charakter a nie je investičným odporúčaním. | Public |
| 113 | Portfolio page notice, sample data (`src/app/[locale]/portfolio/page.tsx:44`) | `messages.ts:566` / `1360`<br>`portfolio.sampleDisclosure` | These sample positions do not show the site owner's holdings. The future live page will show positions the owner holds. This page is informational and is not an investment recommendation. | Tieto ukážkové pozície nezobrazujú skutočné portfólio prevádzkovateľa. Budúca živá verzia ukáže pozície, ktoré drží. Stránka má informačný charakter a nie je investičným odporúčaním. | Public |
| 114 | Tag in the dashboard for held tickers (`src/app/[locale]/dashboard/page.tsx:43`) | `messages.ts:561` / `1355`<br>`portfolio.heldNoSignal` | In portfolio, no signal for another purchase | V portfóliu, bez signálu na ďalší nákup | Public |
| 115 | Portfolio chart note (return since start versus SPY) | `messages.ts:571` / `1365`<br>`portfolio.liveChartNote` | Both lines start at zero on the first date. The portfolio line chains daily returns net of deposits (time-weighted return). SPY uses the last close on or before each date. | Obe čiary začínajú k prvému dátumu na nule. Čiara portfólia reťazí denné výnosy po odpočte vkladov (časovo vážený výnos). SPY používa posledné zatváracie ceny k danému dátumu alebo pred ním. | Public |
| 116 | Insider page note (`src/app/[locale]/insiders/page.tsx:33`) | `messages.ts:626` / `1420`<br>`insiders.note` | A filing records what was reported. It does not explain why an insider traded or predict the stock's return. | Formulár zaznamenáva nahlásenú transakciu. Nevysvetľuje dôvod obchodu ani nepredpovedá výnos akcie. | Public |
| 117 | Upcoming market events box (`src/components/macro-events.tsx:19`) | `messages.ts:96` / `890`<br>`common.macroEvents.note` | Dates of US data releases and Fed decisions that often move growth stocks. Informational: scores and signals do not change because of them. | Termíny amerických makroekonomických správ a rozhodnutí Fedu, ktoré často hýbu rastovými akciami. Len informatívne: skóre a signály sa nimi nemenia. | Public |
| 118 | Sector map intro (`src/app/[locale]/heatmap/page.tsx`) | `heatmap-messages.ts:9` / `32`<br>`lede` | The tracked tickers grouped by sector. Each tile shows its value as text and as a colour. Informational screening only. | Sledované tickery zoskupené podľa sektora. Každá dlaždica ukazuje hodnotu textom aj farbou. Len informačný prehľad. | Public |
| 119 | Data status block intro (`src/app/[locale]/company/[ticker]/page.tsx:182`) | `data-status-messages.ts:6` / `27`<br>`note` | Newest stored date for each dataset behind this page. Informational only. | Najnovší uložený dátum pre každú sadu údajov za touto stránkou. Len informačne. | Public |
| 120 | Operator disclosure text (empty by default) | `messages.ts:105` / `899`<br>`common.operatorDisclosure` |  |  | Env text, empty by default |

## I. Legal pages and operator placeholders

Pages: `/legal/disclaimer`, `/legal/privacy`, `/legal/terms` (rendered by `src/components/legal-page.tsx`, listed in `src/app/sitemap.ts:9`). They are public now, carry a "Draft" stamp (`legal-page.tsx:22`, `common.draft`) and the date `LEGAL_UPDATED = "2026-10-14"` (`legal-page.tsx:7`). The header of `src/i18n/legal-messages.ts:7` says: "A lawyer has not seen any of it."

The operator block on privacy and terms prints the values from `src/config/operator.ts:7-10`. All four are placeholders today:

```
name:         "TODO: operator name"        (src/config/operator.ts:7)
address:      "TODO: registered address"   (src/config/operator.ts:8)
contactEmail: "TODO: contact email"        (src/config/operator.ts:9)
companyId:    "TODO: company id"           (src/config/operator.ts:10)
```

While any field starts with `TODO`, the page also prints `operator.todo` (`legal-page.tsx:45`). The terms page also carries an unresolved note inside `terms.s8`. The privacy contact line prints `OPERATOR.contactEmail`, so it currently reads "TODO: contact email".

| # | Where it shows | Source (EN line / SK line) | English | Slovak | Now |
| --- | --- | --- | --- | --- | --- |
| 121 | Operator block note, privacy and terms (`legal-page.tsx:45`) | `legal-messages.ts:16` / `92`<br>`operator.todo` | Owner to fill in before public launch. These details are placeholders. | Majiteľ doplní pred verejným spustením. Tieto údaje sú zástupné. | Public |
| 122 | Disclaimer page intro | `legal-messages.ts:27` / `103`<br>`disclaimer.lede` | InvestBuddy shows scores from published rules. It is a screening tool, and it is not a financial adviser. | InvestBuddy ukazuje skóre podľa zverejnených pravidiel. Je to nástroj na prehľad, nie finančný poradca. | Public |
| 123 | Disclaimer page, section 1 | `legal-messages.ts:29` / `105`<br>`disclaimer.s1` | Everything on this site is general information. A score, a state or a list shows how a company fits a set of written rules on the day it was computed. It does not look at your situation. | Všetko na tomto webe sú všeobecné informácie. Skóre, stav alebo zoznam ukazuje, ako firma zodpovedá súboru písaných pravidiel v deň, keď sa vypočítalo. Vašu situáciu nezohľadňuje. | Public |
| 124 | Disclaimer page, section 2 ("Not financial advice") | `legal-messages.ts:31` / `107`<br>`disclaimer.s2` | Nothing here is financial, investment, tax or legal advice, and nothing is a personal recommendation. We do not know your goals, income, savings or risk tolerance. | Nič tu nie je finančné, investičné, daňové ani právne poradenstvo a nič nie je osobné odporúčanie. Nepoznáme vaše ciele, príjem, úspory ani toleranciu rizika. | Public |
| 125 | Disclaimer page, section 3 ("No recommendation and no offer") | `legal-messages.ts:33` / `109`<br>`disclaimer.s3` | No page, score, alert or mail is a recommendation to hold, sell or trade any security, and none is an offer or a solicitation of any kind. | Žiadna stránka, skóre, upozornenie ani e-mail nie je odporúčaním držať, predať či obchodovať s cenným papierom a nie je ani ponukou či výzvou na uzavretie obchodu. | Public |
| 126 | Disclaimer page, section 4 (past results) | `legal-messages.ts:35` / `111`<br>`disclaimer.s4` | A company that met the rules before may not meet them tomorrow. The track record page shows earlier signals with their outcomes, and those outcomes say nothing certain about what comes next. | Firma, ktorá pravidlá splnila v minulosti, ich zajtra splniť nemusí. Stránka so záznamom ukazuje skoršie signály s ich výsledkami a tie nehovoria nič isté o tom, čo príde. | Public |
| 127 | Disclaimer page, section 5 (own decision, loss of money) | `legal-messages.ts:37` / `113`<br>`disclaimer.s5` | Any decision you make is yours. Investing can lose part or all of the money put in. Talk to a licensed adviser if you need advice for your own situation. | Každé rozhodnutie je vaše. Investovanie môže znamenať stratu časti alebo celej vloženej sumy. Ak potrebujete radu pre vlastnú situáciu, obráťte sa na licencovaného poradcu. | Public |
| 128 | Disclaimer page, section 6 (data delays) | `legal-messages.ts:39` / `115`<br>`disclaimer.s6` | Prices, filings and other inputs come from third parties and from our own collection. They can be late, wrong or missing, and a score built on them can be wrong too. Check important figures at the original source. | Ceny, podania a ďalšie vstupy pochádzajú od tretích strán a z nášho vlastného zberu. Môžu meškať, byť chybné alebo chýbať a skóre z nich môže byť tiež chybné. Dôležité čísla si overte v pôvodnom zdroji. | Public |
| 129 | Terms, what the site is | `legal-messages.ts:65` / `141`<br>`terms.s1` | InvestBuddy is an informational screening site. It shows scores, rules, data and a record of earlier signals. Read the disclaimer page too, it is part of these terms. | InvestBuddy je informačný web na prehľad firiem. Ukazuje skóre, pravidlá, údaje a záznam skorších signálov. Prečítajte si aj stránku s upozornením, je súčasťou týchto podmienok. | Public |
| 130 | Terms, use at own risk | `legal-messages.ts:67` / `143`<br>`terms.s2` | You use the site and its content at your own risk. We do not promise that it is complete, current or free of errors, or that it is suited to your purpose. | Web a jeho obsah používate na vlastné riziko. Nesľubujeme, že je úplný, aktuálny alebo bez chýb, ani že sa hodí na váš účel. | Public |
| 131 | Terms, no advice | `legal-messages.ts:69` / `145`<br>`terms.s3` | Content is not advice and not a recommendation. See the disclaimer. | Obsah nie je poradenstvo ani odporúčanie. Pozrite si upozornenie. | Public |
| 132 | Terms, beta and paid plans | `legal-messages.ts:71` / `147`<br>`terms.s4` | The site is in beta. Features, scores and pages can change or go away without notice. It is free to use while in beta. Paid plans may come later, and any price will be shown before you pay. | Web je v beta prevádzke. Funkcie, skóre a stránky sa môžu zmeniť alebo zaniknúť bez upozornenia. Počas bety je používanie zadarmo. Platené plány môžu prísť neskôr a cenu uvidíte skôr, než zaplatíte. | Public |
| 133 | Terms, liability | `legal-messages.ts:77` / `153`<br>`terms.s7` | To the extent the law allows, we are not liable for losses that come from using the site or relying on its content. This does not limit liability that the law does not allow us to limit. | V rozsahu, ktorý zákon dovoľuje, nezodpovedáme za straty, ktoré vzniknú používaním webu alebo spoliehaním sa na jeho obsah. Toto neobmedzuje zodpovednosť, ktorú zákon obmedziť nedovoľuje. | Public |
| 134 | Terms, governing law (contains an owner TODO in the public text) | `legal-messages.ts:79` / `155`<br>`terms.s8` | We may change these terms and the new text applies from the date shown on this page. Slovak law applies, subject to any mandatory consumer rules of your own country. TODO for the owner: confirm the governing law and courts with a lawyer. | Tieto podmienky môžeme zmeniť a nové znenie platí od dátumu uvedeného na tejto stránke. Uplatňuje sa slovenské právo, s výhradou záväzných spotrebiteľských pravidiel vašej krajiny. TODO pre majiteľa: rozhodné právo a súdy potvrďte s právnikom. | Public |
| 135 | Privacy, who is responsible | `legal-messages.ts:45` / `121`<br>`privacy.s1` | The operator listed below decides why and how personal data is handled on this site. | O tom, prečo a ako sa osobné údaje na tomto webe spracúvajú, rozhoduje prevádzkovateľ uvedený nižšie. | Public |
| 136 | Privacy, waitlist email and retention | `legal-messages.ts:53` / `129`<br>`privacy.s5` | If the waitlist is open and you join it, we store your email address, your language, the page you signed up from, the time you agreed and which consent wording you saw. We send a confirmation mail first and use the address only for what you ticked: one mail when the site opens and, if you chose it, the weekly mail. An address that is not confirmed is deleted after 14 days. A confirmed address is kept until you unsubscribe. | Ak je čakacia listina otvorená a pridáte sa, uložíme vašu e-mailovú adresu, jazyk, stránku, z ktorej ste sa prihlásili, čas súhlasu a znenie súhlasu, ktoré ste videli. Najprv pošleme potvrdzovací e-mail a adresu používame len na to, čo ste zaškrtli: jeden e-mail pri otvorení webu a, ak ste si ho vybrali, týždenný e-mail. Nepotvrdená adresa sa po 14 dňoch zmaže. Potvrdená adresa sa uchováva, kým sa neodhlásite. | Public |
| 137 | Privacy, after unsubscribe | `legal-messages.ts:55` / `131`<br>`privacy.s6` | When you unsubscribe, we keep the address on a suppression list, marked as unsubscribed. We do this so that nobody can add it again and mail you by mistake. The list is used for nothing else. | Keď sa odhlásite, adresu ponecháme v zozname vylúčených, označenú ako odhlásenú. Robíme to preto, aby ju nikto nemohol pridať znova a omylom vám písať. Zoznam sa nepoužíva na nič iné. | Public |
| 138 | Privacy, your rights | `legal-messages.ts:59` / `135`<br>`privacy.s8` | You can ask us for a copy of your data, ask us to correct or delete it, ask us to limit its use, or object to it. You can also complain to the data protection authority in your country. To have your waitlist address deleted, including from the suppression list, write to the contact address below. | Môžete nás požiadať o kópiu svojich údajov, o ich opravu alebo vymazanie, o obmedzenie ich používania, alebo proti nim namietať. Sťažnosť môžete podať aj na úrade na ochranu osobných údajov vo svojej krajine. Ak chcete vymazať svoju adresu z čakacej listiny, aj zo zoznamu vylúčených, napíšte na kontakt nižšie. | Public |

Privacy sections s2 (server logs), s3 (cookies), s4 (analytics) and s7 (processors) are in `src/i18n/legal-messages.ts:47-57` (EN) and `:123-133` (SK) and are not repeated here.

## J. Pricing page, waitlist and sign-up wording

All of this returns 404 while `WAITLIST` is off. The pricing page says no prices exist yet. Consent wording matters for the privacy review.

| # | Where it shows | Source (EN line / SK line) | English | Slovak | Now |
| --- | --- | --- | --- | --- | --- |
| 139 | Pricing page intro (`src/app/[locale]/pricing/page.tsx`) | `launch-messages.ts:30` / `64`<br>`pricing.lede` | Beta: free while we test. Paid plans later. No prices yet. | Beta: zadarmo, kým testujeme. Platené plány neskôr. Zatiaľ bez cien. | Hidden: WAITLIST |
| 140 | Pricing page, free section | `launch-messages.ts:32` / `66`<br>`pricing.freeBody` | The site is in beta. Reading the scores, the rules and the public record costs nothing. | Web je v beta prevádzke. Čítanie skóre, pravidiel a verejného záznamu nestojí nič. | Hidden: WAITLIST |
| 141 | Pricing page, later section | `launch-messages.ts:34` / `68`<br>`pricing.laterBody` | We may add paid plans after the beta. No plan, price or date is set, and nothing is for sale now. If a plan is added, its price will be shown before you pay. | Po bete môžeme pridať platené plány. Žiadny plán, cena ani termín nie je určený a teraz nie je nič v predaji. Ak plán pribudne, cenu uvidíte skôr, než zaplatíte. | Hidden: WAITLIST |
| 142 | Landing block, beta and plans | `launch-messages.ts:25` / `59`<br>`landing.tiersBody` | The site is in beta and free to use while we test. Paid plans may come later. There are no prices yet. | Web je v beta prevádzke a počas testovania je zadarmo. Platené plány môžu prísť neskôr. Zatiaľ nie sú žiadne ceny. | Hidden: WAITLIST |
| 143 | Landing block, waitlist pitch | `launch-messages.ts:11` / `45`<br>`landing.waitlistBody` | The screen is free to read today. Join the list and we tell you when it opens, with no other mail. | Prehľad je dnes zadarmo na čítanie. Pridajte sa do zoznamu a dáme vám vedieť, keď sa otvorí, bez inej pošty. | Hidden: WAITLIST |
| 144 | Sign-up form, consent box 1 (`src/components/waitlist-form.tsx`) | `messages.ts:769` / `1563`<br>`waitlist.consentLaunch` | Send me one mail when InvestBuddy opens to the public. | Pošlite mi jeden mail, keď sa InvestBuddy otvorí verejnosti. | Hidden: WAITLIST |
| 145 | Sign-up form, consent box 2 | `messages.ts:770` / `1564`<br>`waitlist.consentWeekly` | Also send me the free weekly Slovak mail once it starts. Optional. | Posielajte mi aj bezplatný týždenný mail v slovenčine, keď sa začne. Nepovinné. | Hidden: WAITLIST |
| 146 | Confirmation mail, expiry line | `messages.ts:758` / `1552`<br>`mail.confirmExpiry` | The link works for 7 days. If you did not sign up, ignore this mail and we will delete your address. | Odkaz platí 7 dní. Ak ste sa neprihlásili vy, tento mail ignorujte a vašu adresu zmažeme. | Hidden: WAITLIST |

Count: 146 text rows plus 13 render places for the shared disclaimer.

## Research pointers (not legal advice)

These come from `~/Documents/ops-brain/projects/investing-platform/research/competitors/sk-cz-disclaimer-patterns.md`, collected 2026-10-15 and 2026-10-16. The quotes show how licensed firms word things. They are patterns to adapt with counsel, not text cleared for reuse. Quote marks V in the source note mean the page text was fetched, S means a search extract only.

Competitor wording (exact, Slovak):

- Tatra banka blog: "Toto je marketingové oznámenie. Uvedené informácie majú informatívny charakter, nepredstavujú investičnú službu, ani investičné odporúčanie. S investovaním je spojené riziko. Návratnosť investovaných prostriedkov nie je zaručená." (fetched)
- XTB SK market analysis footer: "Marketingová komunikácia nie je investičným odporúčaním ani informáciou odporúčajúcou alebo navrhujúcou investičnú stratégiu v zmysle nariadenia Európskeho parlamentu a Rady (EÚ) č. 596/2014 zo 16. apríla 2014 o zneužívaní trhu ..." (fetched)
- XTB SK, same footer: "Marketingová komunikácia je pripravená bez zohľadnenia potrieb klienta, jeho individuálnej finančnej situácie a nijakým spôsobom nepredstavuje investičnú stratégiu." (fetched)
- Finax blog footer: "Upozornenie: Tento článok poskytuje marketingové informácie o produktoch spoločnosti Finax, o.c.p, a.s. S investovaním sa spája riziko a minulé výnosy nie sú zárukou budúcich výnosov. Spoznajte riziká, ktoré podstupujete pri investovaní." (fetched)
- Finax, backtests: "Pokiaľ nie je uvedené inak, všetky čísla viažuce sa k výnosom sú počítané na základe spätných modelov a neboli dosiahnuté našimi klientmi. Hodnota portfólia môže klesať a stúpať. Výsledkom vašej investície môže byť aj strata." (fetched)

Primary-law points found on 2026-10-16. They were read from search and page extracts. The lawyer must confirm each one against the current official text:

- Article 9 of Commission Delegated Regulation (EU) 2017/565 ("Investment advice"): a personal recommendation is one "presented as suitable for that person, or ... based on a consideration of the circumstances of that person". Also: "A recommendation shall not be considered a personal recommendation if it is issued exclusively to the public."
- Slovak securities act 566/2001 Z. z., § 6 ods. 6 (consolidated text effective 1 January 2025) defines investment advice as a personal recommendation and points to Article 9 of Regulation 2017/565 in its footnote. § 6 ods. 2 písm. e) lists "vykonávanie investičného prieskumu a finančnej analýzy alebo inej formy všeobecného odporúčania" as an ancillary service.
- MAR (Regulation 596/2014): Article 3(1)(35) defines investment recommendations as information "recommending or suggesting an investment strategy, explicitly or implicitly" about instruments or issuers, "intended for distribution channels or for the public". Article 20(1) requires persons who produce or disseminate them to present information objectively and disclose interests or conflicts. Only the English text was read.
- Czech National Bank position RS2018-08: a public or mass-sent recommendation can still be a personal one if it is "prezentována jako vhodná pro danou osobu, nebo vychází z uvážení poměrů dané osoby". Czech law, seen in a search excerpt only.
- NBS position paper (nbs.sk, 6 pages, undated): a general recommendation "by nemalo byť prijímateľom informácie v ňom obsiahnutej chápané ako vhodné pre daného prijímateľa". It cites older paragraph numbers (§ 6 ods. 7 and 8, § 71o, § 132e) and Directive 2006/73/ES, so treat it as an older interpretation.

Not found: a current NBS statement under the 2025 consolidated text, any Slovak or Czech court or regulator case on rule-based scores, and the Slovak wording of MAR Article 3(1)(35). The research note lists the ESMA marketing communication guidance as not fetched.

## Questions for the lawyer

1. Is the shared line `common.disclaimer` ("Informational screening only. Same rules for every visitor. No personal investment advice.") enough next to a score, or should it name that this is not an investment recommendation or an offer, in the terms used by Slovak law?
2. Several versions of the disclaimer run in parallel: `common.disclaimer`, the shorter share-image line, the footer `short` text, and the alert line. Should one wording replace them, and should the Slovak use "odporúčanie" or "poradenstvo" consistently?
3. Do the six public status names, in particular "Conditions met" / "Podmienky splnené" as the top step, read as a recommendation under Article 9 of Regulation 2017/565 or as an implicit investment strategy under MAR Article 3(1)(35)?
4. If the rule-count score can count as "implicitly" suggesting a strategy, which Article 20 duties apply to this site, and does the owner's own holding in the shown positions (`portfolio.disclosure`, the empty `OPERATOR_DISCLOSURE_*` text) need a stronger conflict statement on every score page?
5. What must change before `ADVICE_OUTPUT` can go on: the action labels (Start position, Add, Reduce), the size tiers, the plan text, `/sizing`, and the "Buy zone" name? Which of these can never be public under ADR-001?
6. The track record page says "buy signals" and reports a rate of beating SPY. Is that wording acceptable as a historical count, and are the "no costs or slippage" and "backtest: not shown" lines enough as performance disclosure?
7. The Telegram digest goes to one channel that may be public. Does a public daily feed of status changes need more than the one-line disclaimer, and does a paid version change the answer (tasks-open G5)?
8. The flags block labels ("Flagged", "Share count growth", "Interest cover", "Short interest") describe fixed numeric tests. Is any of this a statement about the quality of an issuer that needs a source or a caveat?
9. The public methodology says "Verified AI research supplies checked facts" and shows model-reading labels. Is a statement about AI use required, or risky, in this context?
10. The legal pages are public with placeholder operator data and a TODO inside the governing-law text. May they stay public in this state, and what must the operator block contain (name, seat, company id, contact)?
11. The terms name Slovak law and leave courts open. Is that right for visitors in other EU countries, and are the liability and consumer-rights sentences valid as written?
12. Does the waitlist and any later paid plan change the classification of the site, for example once prices or paid signal access exist, and does the Slovak privacy text (waitlist retention, consent wording, suppression list) meet GDPR as written?
