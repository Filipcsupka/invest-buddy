/**
 * Data source registry: one list of every source we read, its licence class and whether its content may be shown.
 * `migrations/022_data_sources.sql` seeds the `data_sources` table from this list (a test keeps both in step).
 * Terms status is the one read on 2026-10-09 (docs/roadmap/lane-data.md, "Source terms"). A source whose terms were
 * not read stays `unknown` with display off. Nothing here is legal advice.
 */
export const LICENCE_CLASSES = ["public_gov", "public_attrib", "internal_only", "licensed", "unknown"] as const;
export type LicenceClass = (typeof LICENCE_CLASSES)[number];
export const SOURCE_KINDS = ["filings", "prices", "macro", "news", "fundamentals", "reference", "regulatory", "other"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export interface DataSource {
  id: string;
  name: string;
  kind: SourceKind;
  licenceClass: LicenceClass;
  displayAllowed: boolean;
  redistributionAllowed: boolean;
  termsUrl: string | null;
  /** Date the terms were last read; null when never read. */
  termsCheckedOn: string | null;
  attributionText: string | null;
  rateLimitNote: string | null;
  dailyCap: number | null;
  monthlyCostCapEur: number | null;
  /** Stored on documents as `meta.license_note`. */
  notes: string;
}

const CHECKED = "2026-10-09";
const source = (s: Partial<DataSource> & Pick<DataSource, "id" | "name" | "kind" | "licenceClass" | "notes">): DataSource => ({
  displayAllowed: false, redistributionAllowed: false, termsUrl: null, termsCheckedOn: null, attributionText: null,
  rateLimitNote: null, dailyCap: null, monthlyCostCapEur: null, ...s,
});

export const DATA_SOURCES: readonly DataSource[] = [
  source({ id: "sec", name: "SEC EDGAR", kind: "filings", licenceClass: "public_gov", displayAllowed: true, redistributionAllowed: true,
    termsUrl: "https://www.sec.gov/about/webmaster-frequently-asked-questions", termsCheckedOn: CHECKED,
    rateLimitNote: "Max 10 requests per second, declared User-Agent required; our code stays under 5 per second.",
    notes: "US government data from SEC EDGAR, public." }),
  source({ id: "rss", name: "GlobeNewswire RSS", kind: "news", licenceClass: "unknown",
    notes: "GlobeNewswire feed text. Redistribution terms not checked; internal signal only." }),
  source({ id: "fred", name: "FRED API", kind: "macro", licenceClass: "public_attrib", termsUrl: "https://fred.stlouisfed.org/docs/api/terms_of_use.html", termsCheckedOn: CHECKED,
    attributionText: "This product uses the FRED API but is not endorsed or certified by the Federal Reserve Bank of St. Louis",
    notes: "FRED series. Terms of the underlying data not checked; internal signal only. This product uses the FRED API but is not endorsed or certified by the Federal Reserve Bank of St. Louis. Series with a Copyright note need the owner's permission; terms do not address storage or redisplay." }),
  source({ id: "treasury", name: "US Treasury FiscalData", kind: "macro", licenceClass: "public_gov", displayAllowed: true, redistributionAllowed: true,
    termsUrl: "https://fiscaldata.treasury.gov/api-documentation/", termsCheckedOn: CHECKED, notes: "US Treasury FiscalData, public." }),
  source({ id: "ecb", name: "ECB euro reference rates", kind: "macro", licenceClass: "public_attrib", termsUrl: "https://www.ecb.europa.eu/services/using-our-site/disclaimer/html/index.en.html", termsCheckedOn: CHECKED,
    attributionText: "Source: ECB", notes: "Reuse allowed if the ECB is cited and changes are stated; the page does not name the FX feed. Display stays off until confirmed." }),
  source({ id: "fed", name: "Federal Reserve Board", kind: "macro", licenceClass: "public_gov", displayAllowed: true, redistributionAllowed: true, notes: "Federal Reserve Board public data." }),
  source({ id: "bls", name: "US Bureau of Labor Statistics", kind: "macro", licenceClass: "public_gov", displayAllowed: true, redistributionAllowed: true, notes: "US Bureau of Labor Statistics public data." }),
  source({ id: "usaspending", name: "USAspending.gov", kind: "regulatory", licenceClass: "public_gov", displayAllowed: true, redistributionAllowed: true, notes: "USAspending.gov, US government open data." }),
  source({ id: "openfda", name: "openFDA", kind: "regulatory", licenceClass: "public_gov", displayAllowed: true, redistributionAllowed: true, termsUrl: "https://open.fda.gov/terms/",
    notes: "openFDA content is public domain under CC0 1.0 (open.fda.gov/terms). Some linked data may not be public domain." }),
  source({ id: "clinicaltrials", name: "ClinicalTrials.gov", kind: "regulatory", licenceClass: "unknown", notes: "ClinicalTrials.gov (NLM). Terms text not checked; treated as not cleared for display." }),
  source({ id: "cboe", name: "Cboe VIX history", kind: "macro", licenceClass: "internal_only", termsUrl: "https://www.cboe.com/use-of-content", termsCheckedOn: CHECKED,
    notes: "Cboe file. Any use of Cboe content needs advance approval and a signed licence (use-of-content page, read 2026-10-09); internal signal only." }),
  source({ id: "gnews", name: "Google News RSS", kind: "news", licenceClass: "internal_only", termsCheckedOn: CHECKED,
    notes: "Google News feed. Feed text allows only personal, non-commercial use in a feed reader. Internal signal only." }),
  source({ id: "gdelt", name: "GDELT DOC 2.0", kind: "news", licenceClass: "unknown", notes: "GDELT DOC 2.0. Terms of use not checked; internal signal only." }),
  source({ id: "openfigi", name: "OpenFIGI", kind: "reference", licenceClass: "unknown", termsUrl: "https://www.openfigi.com/api/documentation", termsCheckedOn: CHECKED,
    rateLimitNote: "25 mapping requests per minute without key, 25 per 6 seconds with key.", notes: "OpenFIGI mapping used only to link CUSIPs to tickers; terms not checked." }),
  source({ id: "alphavantage", name: "Alpha Vantage", kind: "fundamentals", licenceClass: "internal_only", termsUrl: "https://www.alphavantage.co/terms_of_service/", termsCheckedOn: CHECKED,
    rateLimitNote: "Free key, 25 calls per day (from docs/data.md, not re-read).", dailyCap: 25, monthlyCostCapEur: 0,
    notes: "Alpha Vantage EARNINGS. Display rights not verified; internal only. The page may show only the derived EPS beat yes/no with the source name, never the estimate." }),
  source({ id: "twelvedata", name: "Twelve Data", kind: "prices", licenceClass: "internal_only", termsUrl: "https://twelvedata.com/pricing", termsCheckedOn: CHECKED,
    rateLimitNote: "Basic free plan: 8 credits per minute, 800 per day, internal non-display usage.", dailyCap: 800, monthlyCostCapEur: 0,
    notes: "Free plan is internal non-display; Grow adds internal display. Redistribution not addressed." }),
  source({ id: "tiingo", name: "Tiingo", kind: "prices", licenceClass: "internal_only", termsUrl: "https://www.tiingo.com/about/pricing", termsCheckedOn: CHECKED,
    rateLimitNote: "Starter free: 50 requests per hour, 1,000 per day, 500 symbols per month.", dailyCap: 1000, monthlyCostCapEur: 0, notes: "Starter plan is internal use only; may not display or share." }),
  source({ id: "finnhub", name: "Finnhub", kind: "fundamentals", licenceClass: "internal_only", termsUrl: "https://finnhub.io/terms-of-service", termsCheckedOn: CHECKED,
    rateLimitNote: "Global cap 30 calls per second; free limits not readable.", notes: "Plans strictly for personal use unless stated otherwise; no sharing of data or derived results. Free limits unverified." }),
  source({ id: "massive", name: "Massive (formerly Polygon)", kind: "prices", licenceClass: "unknown", termsUrl: "https://massive.com/pricing", termsCheckedOn: CHECKED,
    rateLimitNote: "Stocks Basic free: 5 calls per minute, 2 years of history.", notes: "Pricing page read; terms of service not read." }),
  source({ id: "yahoo", name: "Yahoo Finance / yfinance", kind: "prices", licenceClass: "unknown", termsUrl: "https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html",
    notes: "Excluded: terms bar commercial reuse without written permission (from a search summary; primary page not read). Do not collect." }),
  source({ id: "stooq", name: "Stooq", kind: "prices", licenceClass: "unknown", notes: "Excluded: page unreachable behind a bot wall on 2026-10-05. Do not collect." }),
  source({ id: "finra", name: "FINRA short interest", kind: "reference", licenceClass: "unknown", termsUrl: "https://www.finra.org/finra-data/browse-catalog/equity-short-interest/data", termsCheckedOn: CHECKED,
    notes: "Equity data terms not read; page mentions non-commercial use for FINRA Data views." }),
  source({ id: "nbs", name: "National Bank of Slovakia", kind: "macro", licenceClass: "unknown", notes: "Terms page not read." }),
  source({ id: "bsse", name: "Bratislava Stock Exchange", kind: "prices", licenceClass: "unknown", notes: "Trade data delayed 15 minutes; terms page not read." }),
  source({ id: "finstat", name: "Finstat and Czech registries", kind: "reference", licenceClass: "unknown", notes: "Not checked; not needed for a US growth screen." }),
  source({ id: "fmp", name: "Financial Modeling Prep", kind: "fundamentals", licenceClass: "unknown", notes: "Unverified; research notes say display needs a separate licence." }),
  source({ id: "eodhd", name: "EODHD", kind: "prices", licenceClass: "unknown", notes: "Unverified; research notes say commercial use is about 399 USD per month." }),
];

/** Collector name (`SOURCES` in the collectors registry) to registry id, where they differ. */
const COLLECTOR_SOURCE: Record<string, string> = { edgar: "sec", frames: "sec", getcurrent: "sec", "13f": "sec", vix: "cboe", "sec-frames": "sec", "sec-getcurrent": "sec", "sec-13f": "sec" };

const BY_ID = new Map(DATA_SOURCES.map((item) => [item.id, item]));

/** Registry id for a collector name or an id. */
export const sourceIdFor = (name: string): string => COLLECTOR_SOURCE[name] ?? name;
export const getSource = (name: string): DataSource | undefined => BY_ID.get(sourceIdFor(name));
export const listSources = (): readonly DataSource[] => DATA_SOURCES;

/** True only for a known source whose display flag is on. Unknown ids and `unknown` licence class return false. */
export function canDisplay(name: string): boolean {
  const found = getSource(name);
  return !!found && found.licenceClass !== "unknown" && found.displayAllowed;
}

/** Shape stored on documents as `meta.license_note` and `meta.display_allowed`. */
export function licenseFor(id: string): { license_note: string; display_allowed: boolean } {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`unknown data source: ${id}`);
  return { license_note: found.notes, display_allowed: canDisplay(id) };
}

const sql = (value: string | number | boolean | null) => value === null ? "NULL" : typeof value === "number" ? String(value) : typeof value === "boolean" ? String(value) : `'${value.replace(/'/g, "''")}'`;

/** The INSERT in `migrations/022_data_sources.sql`. A test compares the file to this text. */
export function seedSql(): string {
  const rows = DATA_SOURCES.map((s) => `  (${[s.id, s.name, s.kind, s.licenceClass, s.displayAllowed, s.redistributionAllowed, s.termsUrl, s.termsCheckedOn, s.attributionText, s.rateLimitNote, s.dailyCap, s.monthlyCostCapEur, s.notes].map(sql).join(", ")})`);
  return `INSERT INTO data_sources (id, name, kind, licence_class, display_allowed, redistribution_allowed, terms_url, terms_checked_on, attribution_text, rate_limit_note, daily_cap, monthly_cost_cap_eur, notes) VALUES\n${rows.join(",\n")}\nON CONFLICT (id) DO NOTHING;\n`;
}
