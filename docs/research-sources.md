# Research sources for position rules (PM1)

Checked 2026-10-14 for task PM1 in `docs/roadmap/lane-positions.md`. Papers were opened where the host allowed it. Quotes are exact; page numbers are the printed ones. Nothing here comes from memory. Downloaded files were kept outside the repo.

Status words:

- VERIFIED: the primary text was opened and the quote is from it.
- PARTLY: the primary text confirms the direction, but a figure comes from a secondary page.
- UNVERIFIED: the primary text was not opened. The reason is given.

## Summary

| Rule area | Claim | Status |
| --- | --- | --- |
| General | Most stocks underperform T-bills (Bessembinder et al.) | VERIFIED, but the table cited the wrong paper |
| General | Many stocks lose most of their value for good (Cembalest) | VERIFIED |
| Take profit | Investors sell winners and hold losers (Odean, Shefrin and Statman) | PARTLY |
| Stop / exit | Time-series momentum (Moskowitz et al.) | VERIFIED, futures only |
| Stop / exit | Trend following since 1880 (Hurst et al.) | PARTLY |
| Stop | Stop-loss rules (Kaminski and Lo) | VERIFIED for abstracts; random-walk result is from the 2008 working paper |
| Exit | 10-month moving average rule (Faber) | VERIFIED in the 2013 update, index level |
| Rebalance | Vanguard rebalancing | VERIFIED, asset allocation only |
| Stop | O'Neil 7 to 8 percent loss rule | UNVERIFIED |
| Take profit | Sell half after +100 percent | UNVERIFIED, no source found |
| Exit | Fisher, three reasons to sell | UNVERIFIED (book not opened) |
| Averaging down (EN7) | Any support for adding to a falling stock | No source found |

## Sources

### 1. Bessembinder, Chen, Choi and Wei, "Long-Term Shareholder Returns: Evidence from 64,000 Global Stocks", Financial Analysts Journal 79(3), 2023. VERIFIED, with a correction

- The evidence table in `lane-positions.md` attributes 55.2% and 57.4% to Bessembinder, "Do Stocks Outperform Treasury Bills?", JFE 2018. That is wrong. The 2018 JFE paper (vol. 129, pp. 440 to 457) covers US stocks since 1926. The two figures are from the 2023 FAJ paper on global stocks, 1990 to 2020.
- Quote (CFA Institute page): "The majority, 55.2% of U.S. stocks and 57.4% of non-U.S. stocks, underperform one-month U.S. Treasury bills" "in terms of compound returns over the full sample."
- Sample, from the same page: more than 64,000 global common stocks, January 1990 to December 2020. The top 2.4% of firms created all of the net global wealth.
- URL: https://rpc.cfainstitute.org/research/financial-analysts-journal/2023/long-term-shareholder-returns-evidence-from-64000-global-stocks (DOI 10.1080/0015198X.2023.2188870). Same sentence on https://wpcarey.asu.edu/department-finance/faculty-research/do-stocks-outperform-treasury-bills.
- Not done: the paper PDF was not opened (SSRN returned 403), so no page number. The figures come from the journal's abstract page.
- What it supports: single stocks often lose to cash. It says nothing about when to add, trim or exit.

### 2. J.P. Morgan, Cembalest, "The Agony and the Ecstasy", Eye on the Market special edition, 2 September 2014. VERIFIED

- Opened the PDF and read the text.
- p. 1: "Using a universe of Russell 3000 companies since 1980, roughly 40% of all stocks have suffered a permanent 70%+ decline from their peak value."
- p. 4, the definition: "a decline of 70% or more in the price of a stock from its peak, after which there was little recovery such that the eventual loss from the peak is 60% or more." Universe: all Russell 3000 members 1980 to 2014, "a database of 13,000" stocks.
- pp. 1 and 6: "The return on the median stock since its inception vs. an investment in the Russell 3000 Index was -54%." "Two-thirds of all stocks underperformed", and "for 40% of all stocks, their absolute returns were negative."
- URL: https://www.chase.com/content/dam/privatebanking/en/mobile/documents/eotm/eotm_2014_09_02_agonyescstasy.pdf
- Note: the "40% lost 70% or more" figure needs the definition above (little recovery). It is not 40% of stocks falling 70% at any time.

### 3. Odean, "Are Investors Reluctant to Realize Their Losses?", Journal of Finance 53(5), 1998, pp. 1775 to 1798. PARTLY

- Abstract, verified on the author's page: "These investors demonstrate a strong preference for realizing winners rather than losers." Sample: "10,000 accounts at a large discount brokerage house". Also: it "does not appear to be motivated by a desire to rebalance portfolios" and "is non-optimal and leads to lower after-tax returns" for taxable accounts. "Tax-motivated selling is most evident in December."
- URL: https://faculty.haas.berkeley.edu/odean/papers/disposition/disposition.html
- The 14.8% gains realized and 9.8% losses realized figures are UNVERIFIED. They appear only in the Wikipedia summary. The paper PDF on the author's site could not be read as text, and no table was seen. Do not quote these two numbers until a table is checked.
- What it supports: a bias in retail behaviour. It is not a test of any exit rule.

### 4. Shefrin and Statman, "The Disposition to Sell Winners Too Early and Ride Losers Too Long", Journal of Finance 40(3), 1985, pp. 777 to 790. UNVERIFIED

- Title, volume and pages confirmed from a library catalogue record. The paper and its full abstract were not opened.
- The direction is the same as Odean, which is verified above.

### 5. Moskowitz, Ooi and Pedersen, "Time series momentum", Journal of Financial Economics 104(2), 2012, pp. 228 to 250. VERIFIED, futures only

- Opened the PDF. Abstract, p. 228: "We document significant time series momentum in equity index, currency, commodity, and bond futures for each of the 58 liquid instruments we consider."
- p. 228: "persistence in returns for one to 12 months that partially reverses over longer horizons".
- p. 228 (introduction): "almost five dozen diverse futures and forward contracts" over "more than 25 years of data". Tested instruments are futures and forwards, not single stocks.
- URL: https://w4.stern.nyu.edu/facdir/lpederse/papers/TimeSeriesMomentum.pdf

### 6. Hurst, Ooi and Pedersen, "A Century of Evidence on Trend-Following Investing", Journal of Portfolio Management, 2017. PARTLY

- Only the AQR landing page was opened. Quote: "we construct a time series momentum strategy back to 1880 and find that the strategy was consistently profitable over the next 110 years."
- The page does not list the assets. The paper itself was not opened (the PDF link returned an HTML page). No page or figure to cite.
- URL: https://www.aqr.com/Insights/Research/Journal-Article/A-Century-of-Evidence-on-Trend-Following-Investing

### 7. Kaminski and Lo, "When do stop-loss rules stop losses?", Journal of Financial Markets 18, 2014, pp. 234 to 254. VERIFIED (abstracts only)

- 2014 abstract (RePEc): "Using daily futures price data, we provide an empirical analysis of stop-loss policies applied to a buy-and-hold strategy using index futures contracts." And: "At longer sampling frequencies, certain stop-loss policies can increase expected return while substantially reducing volatility."
- The random-walk and momentum statements are from the 2008 SIFR working paper abstract, not the 2014 text: "under the Random Walk Hypothesis, simple 0/1 stop-loss rules always decrease a strategy's expected return, but in the presence of momentum, stop-loss rules can add value."
- The main text was not read (the MIT repository returned HTTP 429), so no page numbers or figures from the body.
- URLs: https://ideas.repec.org/a/eee/finmar/v18y2014icp234-254.html and https://swopec.hhs.se/sifrwp/abs/sifrwp0063.htm
- Note: tested on index futures, not single stocks.

### 8. Faber, "A Quantitative Approach to Tactical Asset Allocation", Journal of Wealth Management, Spring 2007. VERIFIED in the 2013 update

- Opened the 2013 update from the author's site, not the 2007 journal text. The update is dated "May 2006, Working Paper; Spring 2007, The Journal of Wealth Management; February 2009, Update; February 2013, Update".
- Rule: "BUY RULE Buy when monthly price > 10-month SMA. SELL RULE Sell and move to cash when monthly price < 10-month SMA."
- Abstract: "Overall, we find that the models have performed well in real-time, achieving equity like returns with bond like volatility and drawdowns."
- Scope: five asset classes (US stocks, foreign stocks, bonds, real estate, commodities), and the S&P 500 back to 1901. Index level, not single stocks. Page numbers were not pinned (the text extraction lost them).
- URL: https://mebfaber.com/wp-content/uploads/2016/05/SSRN-id962461.pdf

### 9. Vanguard, Zilbering, Jaconetti and Kinniry, "Best practices for portfolio rebalancing". VERIFIED, asset allocation only

- Read the AAII Journal reprint (p. 24 of the journal). Quote: "Using broad U.S. stock and bond market data from 1926 through 2009, we at the Vanguard Investment Strategy Group found that there is no optimal frequency or threshold when selecting a rebalancing strategy."
- Also: "annual or semiannual monitoring, with rebalancing at 5% thresholds, is likely to produce a reasonable balance between risk control and cost minimization for most investors."
- URL: https://www.aaii.com/files/journal/pdf/best-practices-for-portfolio-rebalancing.pdf
- Stocks and bond funds, not single stocks. It does not apply to trimming a winner.

### 10. O'Neil, "How to Make Money in Stocks" (7 to 8 percent loss rule). UNVERIFIED

- Only secondary summaries were found, for example https://www.moomoo.com/au/learn/when-to-sell-stock-the-7-8-sell-rule. They agree on 7% to 8%, but the book's own sentence was not seen. No test of the rule was found.
- One summary pairs it with taking gains at 20% to 25%. Also unverified.

### 11. "Sell half after +100 percent". UNVERIFIED, no source

- No book, paper or regulator text was found for this rule.

### 12. Fisher, "Common Stocks and Uncommon Profits" (three reasons to sell). UNVERIFIED

- Secondary pages quote: "three reasons, and three reasons only, for the sale of any common stock which has been originally selected according to the investment principles already discussed." The first reason is a mistake in the original purchase.
- The wording of reasons two and three was not found verbatim. The book was not opened.
- Also quoted by secondary pages: "If the job has been correctly done when a common stock is purchased, the time to sell it is - almost never." Not checked against the book.

### 13. Averaging down. No supporting source found

- Searched for tests of adding to falling single stocks. Results were broker blogs and one small experiment from a Croatian journal (https://hrcak.srce.hr/en/213576, abstract only), which reads the behaviour as aversion to a sure loss. That is a behaviour result, not evidence that the strategy pays.
- No peer-reviewed test that supports averaging down was found. This is the result of one search round, not proof that none exists.
- The point that EN7 conflicts with the Guide's "Stop Adding If" list comes from the lane file and was not rechecked here.

## What the verified sources can and cannot support

- Supported: most single stocks underperform cash, and a large share suffer lasting 70% falls (sources 1, 2). That is a reason for position limits and for a clear exit test. It is not a reason to add on a dip.
- Supported at index or futures level only: trend rules (5, 7, 8). No source here tests a trend or stop rule on single stocks.
- Behaviour: investors hold losers and sell winners (3). Verified in direction only.
- Not supported by anything opened: a fixed percent stop, a take-profit trim, averaging down.
