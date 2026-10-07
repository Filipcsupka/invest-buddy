# Sizing guide (draft, 2026-10-06)

Purpose: the product states a signal from data. Readers have different accounts and cash, so size is a generic guide, not a number from the owner's portfolio. Sources came from web search summaries and were not fetched in full. Numbers in the matrix are design choices, not published standards. Not legal advice.

## What the sources say

- Single-stock concentration: 5% or more of a portfolio is treated as concentrated by Fidelity and T. Rowe Price, above 10% needs planning (secondary summary: panaprium.com/blogs/i/how-to-size-stock-positions). David Gardner caps an initial position at 5% (nasdaq.com article, "Rule Breaker investor trait no. 5").
- Institutional cap: the EU UCITS 5/10/40 rule limits one issuer to 10% of NAV and the sum of holdings above 5% to 40% (maples.com).
- Scale in: Motley Fool "buying in thirds" starts at about one third of a full position and adds as conviction grows (fool.com). IBD style pyramiding buys half first and adds smaller amounts on confirmation. The exact add triggers (2-3%, 4-5%) come from secondary summaries and are unverified.
- Risk-based sizing (1-2% of account at risk, ATR stops) is built for trading with hard stops. For a long-term product it is only a cross-check. Kelly needs calibrated probabilities that a screening tool does not have, so it is not used.
- Cash and averaging: Vanguard found lump sum beat dollar-cost averaging over 3 months in about 68% of cases (MSCI World, 1976 to 2022). A "5 to 20% cash" convention has no primary source, so it is a design choice.

## Regulatory notes (unverified for SK and CZ)

- US: Lowe v. SEC (1985) and the SEC publisher test: impersonal, bona fide, general and regular circulation.
- EU: MiFID II investment advice means a personal recommendation. Generic content can still be an "investment recommendation" under MAR Article 20 and Delegated Regulation 2016/958, with objectivity and conflict disclosure duties.
- Safer wording: "screening signal", "illustrative sizing guide", "percent of your own portfolio", "not tailored to you", disclose the publisher's own positions, do not store the reader's balance on the server.
- Ask a lawyer before a paid launch.

## Draft matrix (placeholders)

Percent of the reader's own total portfolio per name. STARTER is about one third of a full position.

| Signal | under 5k EUR | 5 to 25k | 25 to 100k | over 100k |
|---|---|---|---|---|
| STARTER | 3% | 2% | 1.5% | 1% |
| STANDARD | 5% | 4% | 3% | 2.5% |
| FULL | 7% | 6% | 5% | 4% |
| ADD | + 1/3 of full | + 1/3 | + 1/3 | + 1/3 |
| HIGH_CONVICTION_ADD | + 1/2 of full | + 1/2 | + 1/2 | + 1/2 |
| Cap per name | 10% | 8% | 7% | 5% |

Small accounts get larger percentages only because fees and whole shares make tiny positions impractical. A cleaner option is the same percentages for everyone and an index fund suggestion for accounts under 5k.

Cash adjustment:

| Cash level | Multiplier | Rule |
|---|---|---|
| under 10% | 0.5 | Fund new buys only from the monthly contribution. |
| 10 to 30% | 1.0 | Use the table. |
| over 30% | 1.0 | Spread over three monthly tranches, at most a third of idle cash a month. |

Adding rules: one add a month, only on an ADD signal, never above the cap, no ADD when price drift already put the name above its cap (show WAIT), REDUCE trims to STANDARD or to the cap.

Owner's own example: EUR 200 a month, so a starter is a share of that month's contribution and a full position builds over several months.

## Owner monthly allocation

This is a private, educational illustration for the owner's account. It does not change a screening signal, and it is not advice or a personalised recommendation. Results depend on the stock and its business, not on the number of euros assigned to an order. Public pages do not use the owner's cash balance to decide an action.

The budget is current free broker cash, including money carried from earlier months. The monthly contribution is used to set the add reserve and the cash-drag threshold; it is not a monthly spending target. For a EUR 200 contribution and EUR 200 free cash, a STARTER is 20% of free cash, or EUR 40. The starter is kept between EUR 40 and EUR 70 per order. STANDARD, FULL and ADD have larger draft shares. Only a HIGH_CONVICTION_ADD signal can reach the draft 50% of starting free cash for one ticker after a material event. A higher amount does not make the underlying signal stronger.

The calculation takes each signal in score order. It uses the tier percentage of the starting free cash, then checks the tier's euro floor and ceiling, the order's maximum share of that cash, the cash left after earlier suggestions, and the per-name cap from `src/engine/sizing.ts`. The cap is a percentage of total portfolio value, including cash; existing holdings count toward it. The lowest applicable limit wins, and the private view states why. If the result falls below the configured minimum order or would make the estimated broker fee exceed the configured fee percentage, the result is **wait** and no cash is assigned. The broker numbers are placeholders until the owner checks the actual IBKR account and market.

About one third of the monthly contribution is reserved for adds. New positions cannot spend that reserve, while a qualifying add can. An add to one ticker is limited to once per calendar month; the Flex baseline currently has no executed trade dates, so the owner view shows **wait** for adds until that history is confirmed. It does not treat an idea as an executed order. If no signal qualifies, all free cash carries forward. When free cash exceeds three monthly contributions, the page flags possible cash drag for review but never forces a purchase. There is no stop-loss distance in the formula: this is a long-term thesis process, and an invalidated thesis belongs in the separate thesis-break checklist.

All numeric choices in `src/engine/allocation-config.ts` are placeholders for owner sign-off. In particular, the owner needs to settle tier percentages and order ceilings, the one-third reserve, the cash-drag threshold, and the minimum order and fee assumptions for IBKR. The worked EUR 200 example describes the owner's preference, not an empirical return rule.

The research is background for these design choices, not proof that a given percentage is optimal:

- [Endowus](https://help.endowus.com/hc/en-us/articles/4410130228377-What-is-a-Core-Satellite-investment-strategy) and [Legal & General](https://www.legalandgeneral.com/investments/stocks-and-shares-isa/guides/core-and-satellite-investing/) describe a diversified core with narrower conviction-based satellites. That supports separating an add tier, but neither guide sets our order percentages.
- [Fidelity](https://www.fidelity.com/learning-center/wealth-management-insights/concentrated-stock-positions?ccsource=Hub5Q) treats a single equity position at 5% or more as potentially concentrated. [T. Rowe Price](https://www.troweprice.com/en/us/insights/concentrated-company-stock-reduce-concentration-risk) says 5% to 10% merits attention and above 10% generally needs more planning. The [UCITS Article 52](https://eur-lex.europa.eu/eli/dir/2009/65/2023-01-01/eng) 5/10/40 issuer rule applies to regulated funds, not to this personal portfolio; it is only a concentration reference. The actual draft cap is the existing account-bucket rule in `src/engine/sizing.ts`.
- [Kauffman Fellows](https://www.kauffmanfellows.org/journal/venture-fund-portfolio-construction) discusses follow-on reserves in venture fund construction. [VCBeast](https://vcbeast.com/follow-on-reserve-strategy-how-much-when-deploy) is a secondary guide to that practice. Venture funds and a personal brokerage account differ, so one third here is an owner placeholder, not a transferred benchmark.
- [Vanguard's cost-averaging study](https://corporate.vanguard.com/content/dam/corp/research/pdf/cost_averaging_invest_now_or_temporarily_hold_your_cash.pdf) found lump-sum investment beat a three-month averaging plan about 68% of the time in its historical global-equity comparison. Averaging can reduce regret for some investors. We hold unused cash for a real signal, rather than drip-feeding it blindly, while the cash-drag note makes prolonged waiting visible.
- [Fractional Kelly research](https://faculty.wharton.upenn.edu/wp-content/uploads/2013/05/Wyner_2012_Partial_3.pdf) concerns sizing from estimated return and risk. We have no calibrated edge estimates for these signals, so Kelly or fractional Kelly is not used to compute an amount.
- [ESMA's statement on investment recommendations on social media](https://www.esma.europa.eu/sites/default/files/library/esma70-154-2780_esmas_statement_on_investment_recommendations_on_social_media.pdf) shows why wording and conflict disclosure matter even for broad public communications. Calling a page educational does not by itself decide its legal status. The public product remains informational screening, and a lawyer must review the wording before a paid launch.
