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
