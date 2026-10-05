#!/usr/bin/env node
// Read-only reachability probe for candidate free data sources.
// No dependencies, no database, no secrets. One GET/POST per source.
// Usage: node scripts/probe-sources.mjs [--json] [--only id,id]
// Env:   SEC_USER_AGENT (required for sec.gov hosts, e.g. "InvestBuddy you@example.com")
// Run it the same way locally and inside a cluster pod (kubectl exec -i ... -- node - < this file)
// to tell "needs an account" from "blocked by egress" from "works".

const SEC_UA = process.env.SEC_USER_AGENT || "";
const BROWSER_UA = "Mozilla/5.0 (X11; Linux x86_64) InvestBuddyProbe";
const args = process.argv.slice(2);
const only = args.includes("--only") ? new Set(args[args.indexOf("--only") + 1].split(",")) : null;
const asJson = args.includes("--json");

const json = (check) => (body) => { const data = JSON.parse(body); return check(data); };
const has = (needle) => (body) => body.includes(needle) || `missing "${needle}"`;

// auth: none | key-free | key-needed (probe does not call keyed endpoints with real keys)
const SOURCES = [
  { id: "sec-frames", auth: "none", ua: "sec", url: "https://data.sec.gov/api/xbrl/frames/us-gaap/Revenues/USD/CY2025Q2.json",
    ok: json((d) => Array.isArray(d.data) && d.data.length > 100 || "no data[]") },
  { id: "sec-getcurrent-13d", auth: "none", ua: "sec", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=SCHEDULE%2013D&output=atom&count=5",
    ok: has("<feed") },
  { id: "sec-13f-datasets-page", auth: "none", ua: "sec", url: "https://www.sec.gov/data-research/sec-markets-data/form-13f-data-sets",
    ok: has("form13f.zip") },
  { id: "sec-efts-fulltext", auth: "none", ua: "sec", url: "https://efts.sec.gov/LatestSearch/rest/search-index?q=%22raises%20guidance%22&forms=8-K",
    ok: json((d) => Boolean(d.hits) || "no hits (expect 403 for scripts)"), expectBlocked: true },
  { id: "alphavantage-earnings-calendar", auth: "key-free", url: "https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&horizon=3month&apikey=demo",
    ok: has("symbol,name,reportDate,fiscalDateEnding,estimate"), note: "demo key proves reachability only; real free key needed for production (25/day)" },
  { id: "nasdaq-earnings-calendar", auth: "none", ua: "browser", url: `https://api.nasdaq.com/api/calendar/earnings?date=${new Date().toISOString().slice(0, 10)}`,
    ok: json((d) => Array.isArray(d?.data?.rows) || "no rows"), note: "undocumented; ToS unverified; prototype only" },
  { id: "openfda-drugsfda", auth: "none", url: "https://api.fda.gov/drug/drugsfda.json?limit=1", ok: json((d) => Array.isArray(d.results) || "no results") },
  { id: "clinicaltrials-v2", auth: "none", url: "https://clinicaltrials.gov/api/v2/studies?query.term=obesity&pageSize=1&fields=NCTId,LastUpdatePostDate",
    ok: json((d) => Array.isArray(d.studies) || "no studies") },
  { id: "usaspending-awards", auth: "none", method: "POST", url: "https://api.usaspending.gov/api/v2/search/spending_by_award/",
    body: { filters: { keywords: ["Palantir"], time_period: [{ start_date: "2026-01-01", end_date: "2026-10-01" }], award_type_codes: ["A", "B", "C", "D"] }, fields: ["Award ID", "Recipient Name", "Award Amount", "Start Date"], limit: 2 },
    ok: json((d) => Array.isArray(d.results) || "no results") },
  { id: "fda-press-rss", auth: "none", ua: "browser", url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml", ok: has("<rss") },
  { id: "openfigi-mapping", auth: "none", method: "POST", url: "https://api.openfigi.com/v3/mapping",
    body: [{ idType: "TICKER", idValue: "NVDA", exchCode: "US" }], ok: json((d) => Boolean(d?.[0]?.data?.[0]?.figi) || "no figi") },
  { id: "finra-short-interest", auth: "none", url: "https://api.finra.org/data/group/otcMarket/name/consolidatedShortInterest?limit=1", ok: has("symbolCode"), note: "auth/redistribution unverified" },
  { id: "google-news-rss", auth: "none", ua: "browser", url: "https://news.google.com/rss/search?q=NVDA+when:1d&hl=en-US&gl=US&ceid=US:en", ok: has("<rss"), note: "no documented API terms; internal signal only" },
  { id: "gdelt-doc2", auth: "none", url: "https://api.gdeltproject.org/api/v2/doc/doc?query=nvidia&mode=artlist&format=json&maxrecords=2", ok: json((d) => Array.isArray(d.articles) || "no articles"), note: "1 request per 5 s" },
  { id: "fed-h15-csv", auth: "none", url: "https://www.federalreserve.gov/datadownload/Output.aspx?rel=H15&series=bf17364827e38702b42a58cf8eaa3f78&lastobs=3&from=&to=&filetype=csv&label=include&layout=seriescolumn", ok: has("Series Description") },
  { id: "fomc-calendar-page", auth: "none", url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm", ok: has("FOMC Meetings") },
  { id: "ecb-fx", auth: "none", url: "https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?lastNObservations=2&format=csvdata", ok: has("OBS_VALUE") },
  { id: "cftc-cot", auth: "none", url: "https://www.cftc.gov/dea/newcot/deafut.txt", ok: (b) => b.length > 1000 || "short body" },
  { id: "cboe-vix-history", auth: "none", url: "https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv", ok: has("CLOSE") },
  { id: "eia-demo", auth: "key-free", url: "https://api.eia.gov/v2/electricity/retail-sales/data/?api_key=DEMO_KEY&length=1", ok: json((d) => Boolean(d.response || d.warnings) || "no response"), note: "DEMO_KEY for probing; free key for production" },
  { id: "github-releases", auth: "none", ua: "browser", url: "https://api.github.com/repos/vercel/next.js/releases?per_page=1", ok: json((d) => Array.isArray(d) || "not array"), note: "60/h unauthenticated" },
  { id: "finnhub-earnings", auth: "key-needed", url: "https://finnhub.io/api/v1/calendar/earnings?from=2026-10-01&to=2026-10-10", expectStatus: 401, ok: () => true },
  { id: "fmp-earnings", auth: "key-needed", url: "https://financialmodelingprep.com/stable/earnings-calendar?apikey=demo", expectStatus: 401, ok: () => true },
];

async function probe(source) {
  const headers = { Accept: "*/*" };
  if (source.ua === "sec") headers["User-Agent"] = SEC_UA || "InvestBuddyProbe (set SEC_USER_AGENT)";
  else headers["User-Agent"] = source.ua === "browser" ? BROWSER_UA : "InvestBuddyProbe";
  if (source.body) headers["Content-Type"] = "application/json";
  const started = Date.now();
  try {
    const response = await fetch(source.url, { method: source.method ?? "GET", headers, body: source.body ? JSON.stringify(source.body) : undefined, redirect: "follow", signal: AbortSignal.timeout(20000) });
    const text = await response.text();
    const ms = Date.now() - started;
    if (source.expectStatus) return { id: source.id, verdict: response.status === source.expectStatus ? "NEEDS_KEY" : "UNEXPECTED", status: response.status, ms, auth: source.auth };
    if (!response.ok) return { id: source.id, verdict: response.status === 403 || response.status === 429 ? "BLOCKED" : "HTTP_ERROR", status: response.status, ms, auth: source.auth, note: source.note };
    let result;
    try { result = source.ok(text); } catch (error) { result = `parse: ${error.message}`; }
    return { id: source.id, verdict: result === true ? "OK" : "BAD_BODY", status: response.status, ms, bytes: text.length, auth: source.auth, detail: result === true ? undefined : result, note: source.note };
  } catch (error) {
    return { id: source.id, verdict: "UNREACHABLE", status: 0, ms: Date.now() - started, auth: source.auth, detail: `${error.name}: ${error.cause?.code ?? error.message}` };
  }
}

const selected = SOURCES.filter((s) => !only || only.has(s.id));
const results = [];
for (const source of selected) {
  results.push(await probe(source));
  await new Promise((r) => setTimeout(r, source.id.startsWith("sec-") ? 300 : 150)); // stay under SEC 10 req/s and be polite elsewhere
}
if (asJson) process.stdout.write(JSON.stringify({ at: new Date().toISOString(), host: process.env.HOSTNAME ?? "local", results }, null, 2) + "\n");
else {
  for (const r of results) console.log(`${r.verdict.padEnd(11)} ${String(r.status).padEnd(4)} ${String(r.ms).padStart(5)}ms  ${r.id.padEnd(32)} auth=${r.auth}${r.detail ? `  ${r.detail}` : ""}${r.note ? `  # ${r.note}` : ""}`);
}
