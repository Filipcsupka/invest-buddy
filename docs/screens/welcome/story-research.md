# Welcome story: what we took from competitors and what we left out

Sources: the vault competitor notes (`projects/investing-platform/research/competitors/_synthesis.md`, Alocano, Fundamenty.cz, Danelfin, Simply Wall St, Stock Rover, Finviz, Finex, and `research/market-homework/justetf.md`), plus the coordinator briefs `welcome-design.md` and `funnel-design.md` (2026-11-09). No competitor text was copied. No competitor is named on the page.

## Section order

Hero with the sample scoreboard (unchanged), then:

1. The problem in two sentences, the method in numbers, what InvestBuddy is, the AI judge, and where the sample universe stands.
2. How a score is built (the pinned scroll sequence), followed by the full rule checklist of one sample company.
3. What you get, area by area, with the signed-in panel preview and a sample scanner.
4. Real filings, plain numbers (SEC EDGAR).
5. Everything is on the record: the track record format, the four commitments with their status, data sources, and the comparison table.
6. Plans.
7. Questions.
8. Sign-up and sign-in.

The order follows the pattern most of the stronger landing pages share: state the problem, show the working, show what is inside, prove it with something real, then price and answer doubts. Danelfin and Simply Wall St both lead with the product itself rather than claims; Alocano and Fundamenty put pricing and the FAQ near the end of the home page.

## Adopted

| Pattern | Seen at | How it appears here |
| --- | --- | --- |
| Pass and fail rows with threshold and value | Simply Wall St, Stock Rover, synthesis item 1 | "One company, every rule": rule, what it needs, stored value, result, points, for one invented company |
| Neutral state names with the rule count | Synthesis item 2 | Six rule states, each with icon and label; the judge and checklist say "met" and "missed" |
| Disclaimer next to the score, not only in the footer | Synthesis item 3, Finex FAQ tone | ADR-001 line under the hero board, the score meter and the sign-up block |
| Method text beside any record chart | Danelfin, Stockopedia, Finax (synthesis) | The track record chart says what it is, that it is invented, and that the real record starts with live data |
| Visible locks, status never hidden | Danelfin gating, synthesis item 12 | Chips on every area: Open to all, Free account, Plus, Opens soon; blurred cells only over drawn sample art |
| Show the inside before sign-up | Fundamenty (Apple fully open), Danelfin free reports | Signed-in panel preview with every area and its tier; sample scanner with score history |
| Two plans, prices with VAT, one currency | justETF | Free and Plus, 9.90 EUR a month or 99 EUR a year, VAT included, "Opens soon" while billing is off |
| No-card trial | Stock Rover, Alocano, synthesis | "Coming with launch: a 14-day Plus trial, no card needed." Not active yet |
| Feature table by plan | Danelfin, Stock Rover | Rows come from `src/config/tiers.ts` and `TIER_LIMITS` through the pricing copy, so the page and the pricing page cannot drift |
| FAQ that answers "is this advice" plainly | Finex Premium FAQ | Seven questions, including who runs the site (placeholder until the owner decides) |
| Real, checkable numbers | Simply Wall St data footers, Alocano "limits" sections | Number tiles counted from the rule set; SEC revenue with filing links and access date |
| Comparison table | Stock Rover vs Finviz pages (format only) | InvestBuddy, your own spreadsheet, a typical screener. No product named; the screener column says what is common |
| How it works in steps | Danelfin "how it works" | The pinned score sequence plays the steps rule by rule instead of three icon cards |

## Rejected

| Pattern | Seen at | Why |
| --- | --- | --- |
| User counts ("Trusted by 150,000 investors"), member counts | Danelfin pricing page, Finex Premium | We have no users to count; PRODUCT.md forbids inventing them |
| Testimonials, anonymous or initialled | Danelfin | None exist; an unverifiable quote would be a fake |
| Win rates and return headlines | Tickeron "75%", Danelfin track record averages | ADR-001 bans return claims; the record chart has no figure on it and is labelled invented |
| Urgency: countdowns, "save 40%" banners, early-bird | Danelfin 2-year banner | Wording gate; also no price is on sale yet |
| "Most popular" plan badge | Common on pricing pages | No registered-user basis; `landing-waitlist.test.tsx` checks it stays out |
| Buy, Sell, Strong Buy, picks, "is X a good stock to buy" | Danelfin, TipRanks, Alocano verdict tags | ADR-001 and `docs/wording-gate.md` |
| Broker affiliate links next to scores | Alocano, Finex (XTB) | Reads as an instruction to trade; not decided |
| Press logos and award badges | Danelfin | None exist |
| Paid micro-trial that converts to monthly | Finex (99 Kc for 7 days) | Card-first and auto-renewing; we chose no card |
| Blurring real rows to tease Plus | Danelfin masked cells | Blur leaves data in the DOM (`docs/paywall-segments.md`); only drawn sample shapes are blurred here |

## Data on the page

- Every score, state, price and chart point on the page is SAMPLE data from seven invented companies (`src/components/welcome/sample-data.ts`), scored by the real engine. The score history column re-runs the engine on the generated bars for the last 20 sessions.
- The track record chart is a deterministic invented series. It shows the format only.
- The SEC block is the one real data set: annual revenue from the latest Form 10-K per company, read from SEC EDGAR companyfacts by `scripts/welcome-sec-facts.ts` and committed as `src/components/welcome/sec-facts.json` with the source URL, form, period end, filing date and access date. The companies were chosen outside the fixture universe so no real name sits near a sample score.
- The number tiles are counted from code: rules and points from `src/i18n/rules.ts`, rejection checks from `rejectionChecks`, locales from `src/i18n`.

## Open points for the owner

- Who runs the site: the FAQ answer is a placeholder until the operator disclosure is decided (decision 22).
- The comparison table makes general statements about "a typical screener" ("often kept private", "some products show them"). They follow the research notes, but a lawyer should look at comparative wording before launch.
- Slovak copy needs the native review (W23).
