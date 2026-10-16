# Product

<!-- impeccable:product-schema 1 -->

Sources: the coordinator brief for the web redesign, the project vault (`projects/investing-platform/PRODUCT.md`, `MVP.md`), and ADR-001. Nothing here comes from a user interview.

## Platform

web

## Users

Retail investors in Slovakia and the Czech Republic who hold, or plan to hold, US growth stocks over years. They want a disciplined checklist they can check against their own reading. They do not want tips. They open the site at a desk, often in the evening after work and sometimes during the day, and they read in Slovak or English.

## Product Purpose

InvestBuddy runs one published, rule-based screening method over a fixed universe of growth stocks every trading day. Each ticker gets a score from 0 to 25 (fundamentals 10, technical 10, macro 5) and a rule state. The site shows which rules a ticker met, which it missed, and why it was rejected. Success means a visitor can see how any score was reached and check it against the published rules without trusting anyone's opinion.

## Positioning

The method is public and the output is the same for every visitor. The track record lists every state change, including tickers that later broke their criteria. ADR-001 defines the product as informational screening: no personal advice, no position sizing, no portfolio inputs, no price targets, no return claims, no urgency.

## Operating Context

- Dashboard: today's scored universe grouped by rule state.
- Scanner: the whole universe as a sortable, filterable table.
- Company page: score breakdown, every rule hit, the price chart with MA50, MA200 and the 5 to 10% dip zone.
- Methodology: the rules in full, read before trusting a score.
- Track record: dated snapshots, losers included.
- Visitors compare the score with their own research and their broker's chart. Nothing on the site places an order.

## Capabilities and Constraints

- Rule states and thresholds: Setup met (18 or more), Watch (15 to 17), Pullback in uptrend (a Watch qualifier), Wait (12 to 14), Ignore (under 12), Criteria broken (any rejection rule), Insufficient data (invalid inputs or fewer than 200 bars).
- Bilingual: English and Slovak, with locale routes `/en` and `/sk`. Slovak numbers use a decimal comma.
- The current build runs on synthetic sample data. Every page that shows a price or a score must say SAMPLE DATA.
- A disclaimer sits beside every score and alert, and the operator's position disclosure appears on every screen that shows scores.
- Light and dark themes both ship; the visitor's system setting decides first, and a toggle overrides it.
- Undecided: pricing and paid tiers, the email alert design, the final operator disclosure text, and legal copy.

## Brand Commitments

- Name: InvestBuddy.
- Voice: calm, plain, specific. Sentences a careful analyst would write to a friend. No sales language, no hype, no urgency.
- Rule-state labels describe a state of the rules, never an instruction to the reader.
- Anti-references: generic fintech purple gradients, neon crypto dashboards, stock photos of people in suits, Robinhood-style confetti and gamified celebration.

## Evidence on Hand

- The scoring engine and its tests (`src/engine`), and a 35-name synthetic sample universe (`src/data/fixtures.ts`): 28 tickers named in the investing guide and seven labelled sample extensions.
- No live market data, no subscribers, no testimonials, no measured returns. None of these may be invented.

## Visual Direction

A modern app shell: navy left sidebar, cool light ground (near-black in dark mode), white rounded cards, Manrope headings over Inter text, signal blue with one orange call to action. The state strip, state chips, rule rows, score dial and tier badges stay as signature parts. Details in `DESIGN.md`.

## Product Principles

1. Show the working. Every score links to the rules and inputs behind it.
2. Same output for everyone. Nothing is personalised and nothing tells a reader what to do with money.
3. Publish the misses. Broken criteria and losers stay in the record.
4. Quiet by default. The interface is an instrument for reading, not a feed that competes for attention.
