# Source fixtures (phase A2)

Offline samples for `src/collectors/sources/*.test.ts`. No test reads the network.

Recorded from real responses on 2026-10-05 (trimmed to a few rows, values unchanged):
`openfda_*.json`, `clinicaltrials_*.json`, `usaspending_palantir.json`, `fed_calendar.json` (kept with its byte order mark),
`fed_h15.csv`, `treasury_rates.json`, `bls_unemployment.json` (one series), `cboe_vix.csv` (header plus the last 270 rows),
`gnews_nvidia.xml` (3 items), `openfigi_cusip.json` (listings trimmed to US and UA).

Synthetic, written to match the documented or observed format. SEC endpoints need a contact User-Agent, which was not set for this work, so no SEC response was recorded:
`sec_company_tickers.json`, `sec_frame_*.json` (made-up revenue values), `sec_getcurrent_*.xml`, `sec_13f_page.html`, and `gdelt_nvidia.json` (GDELT returned 429 for every request during the recording window). The 13F zip is built inside the test.
