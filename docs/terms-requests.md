# Permission requests to data providers

Drafts for the owner to send. Nothing here has been sent. Each draft asks for a yes or no with conditions. Until a written yes arrives, the matching `data_sources` row stays `display_allowed = false` (see `docs/roadmap/lane-data.md`, D2 and D42). Nothing in the roadmap window may rely on an answer.

Fill in before sending: `[OPERATOR NAME]`, `[CONTACT EMAIL]`, `[SITE URL]`. The operator identity is owner decision 22 and is not recorded in the repository.

Facts used in every draft, all checked against repository files:

- Product: invest-buddy, a web tool that screens US growth stocks and shows informational scores (ADR-001: informational screening only, no advice).
- Users: none yet. A free tier and a paid tier are planned, with a waitlist launch at the end of 2026.
- Today the provider's data is used internally only.

How to track: when you send a request, fill the "Sent" column in the table in `docs/data-inventory.md` (section "Terms requests"). When an answer arrives, fill "Answered", then open a PR that updates the `data_sources` row (`terms_url`, `terms_checked_on`, `licence_class`, `display_allowed`) and attach the reply.

## 1. Alpha Vantage

Where: the contact or sales form linked from https://www.alphavantage.co/terms_of_service/ (the terms grant personal, non-commercial use unless agreed otherwise in writing).

Subject: Written permission to display EPS data and to use the API commercially

> Hello,
>
> I run invest-buddy ([SITE URL]), a small web tool that screens US growth stocks and shows informational scores. It has no users yet; a public launch with a free and a paid tier is planned for the end of 2026.
>
> I use a free API key for the EARNINGS and EARNINGS_CALENDAR endpoints (reported EPS, estimated EPS, report dates). Today I store the data for internal use only.
>
> I would like to know whether I may:
> 1. show on a public company page whether a company beat or missed its EPS estimate (a yes or no, with the source named);
> 2. show the reported EPS and the estimate as numbers;
> 3. use the API inside a product that has paid subscribers.
>
> For each point, please answer yes or no and state any conditions (attribution text, a paid plan, limits on volume or history, a fee). If a licence agreement is needed, please say so and what it costs.
>
> Thank you,
> [OPERATOR NAME], [CONTACT EMAIL]

## 2. Cboe

Where: permissions@cboe.com. The page https://www.cboe.com/use-of-content says any use of Cboe content needs approval in advance and a signed licence.

Subject: Licence request: flags derived from VIX daily close

> Hello,
>
> I run invest-buddy ([SITE URL]), a small web tool that screens US growth stocks and shows informational scores. It has no users yet; a public launch is planned for the end of 2026.
>
> I download the VIX historical data CSV from cboe.com once a day and keep it internal. I would like to show a derived market-mood flag on the site (for example "volatility elevated" or "calm", based on thresholds applied to the VIX daily close), without showing the VIX values themselves.
>
> May I do this? Please answer yes or no, and state any conditions: a signed licence, a fee, attribution, a delay, or limits on what may be displayed. If a derived flag is not allowed, please say whether showing the daily close would be.
>
> Thank you,
> [OPERATOR NAME], [CONTACT EMAIL]

Fallback if the answer is no: D25 computes a 20-day realised volatility of SPY from our own bars (`RV20_SPY`).

## 3. Twelve Data

Where: support contact on https://twelvedata.com (or the sales form). The pricing page lists the free plan as "Internal non-display usage" and Grow as "Internal display data access", and says plans are for "personal, internal, and non-commercial purposes".

Subject: Display of daily closes on a public company page

> Hello,
>
> I run invest-buddy ([SITE URL]), a small web tool that screens US growth stocks. It has no users yet; a public launch with a free and a paid tier is planned for the end of 2026.
>
> I use the free plan for end-of-day bars of about 37 US tickers. I want to show a price chart of daily closes on each public company page.
>
> Questions:
> 1. Does "internal display data access" on the Grow plan cover showing daily closes in a chart on a public web page to anonymous visitors and to paying subscribers?
> 2. If not, which plan or licence does?
> 3. May I show a derived view instead (for example percent change over 1, 3 and 12 months, with no raw close series)?
> 4. Is use inside a product with paid subscribers allowed on any self-serve plan?
>
> Please answer yes or no for each, with conditions and prices.
>
> Thank you,
> [OPERATOR NAME], [CONTACT EMAIL]

## 4. FINRA

Where: FINRA Data support (the contact route listed on https://www.finra.org/finra-data). The short interest data page mentions "non-commercial use" for FINRA Data views, and the Equity Terms of Service have not been read.

Subject: Redistribution of equity short interest data

> Hello,
>
> I run invest-buddy ([SITE URL]), a small web tool that screens US growth stocks. It has no users yet; a public launch is planned for the end of 2026.
>
> I would like to use the consolidated equity short interest data (shares short, average daily volume, days to cover, by settlement date) through the FINRA API. I want to store it and show it for a short list of tickers on public company pages.
>
> Questions:
> 1. May the data be stored and shown on a public website, including to paying subscribers?
> 2. Is a fee or a data licence needed, and which API credential type applies?
> 3. What attribution is required, and is there a delay before display?
>
> Please answer yes or no for each, with conditions.
>
> Thank you,
> [OPERATOR NAME], [CONTACT EMAIL]

## 5. Finnhub

Where: Finnhub support (the contact route on https://finnhub.io). The terms at https://finnhub.io/terms-of-service say plans are strictly for personal use unless stated otherwise, and forbid sharing data or derived results. The roadmap treats this as no business use, even internal, without written approval (D29). Do not create a key before a yes.

Subject: Written permission for business use and display

> Hello,
>
> I run invest-buddy ([SITE URL]), a small web tool that screens US growth stocks. It has no users yet; a public launch with a free and a paid tier is planned for the end of 2026.
>
> I would like to use Finnhub's analyst recommendation trends (and earnings data, if included) once a day for about 150 tickers.
>
> Questions:
> 1. May I use the API on the free plan inside a business product, for internal analysis only?
> 2. May I show the data, or results derived from it, on a public website?
> 3. If not, which plan covers each case, and at what price?
> 4. Which endpoints are included in the free plan and at what rate limit?
>
> Please answer yes or no for each, with conditions.
>
> Thank you,
> [OPERATOR NAME], [CONTACT EMAIL]

## 6. GDELT

Where: the contact address on https://www.gdeltproject.org (the terms of use were not read when this was written; read them first and cite the page in the request if they cover it).

Subject: Terms for commercial use of the GDELT DOC 2.0 API

> Hello,
>
> I run invest-buddy ([SITE URL]), a small web tool that screens US growth stocks. It has no users yet; a public launch is planned for the end of 2026.
>
> I query the GDELT DOC 2.0 API a few times a day for headline counts and links about 37 listed companies, and I keep the results internal.
>
> Questions:
> 1. May I use the API in a commercial product?
> 2. May I show headline titles and links to the original articles on a public company page?
> 3. What attribution or rate limits apply?
>
> Please answer yes or no for each, with conditions.
>
> Thank you,
> [OPERATOR NAME], [CONTACT EMAIL]
