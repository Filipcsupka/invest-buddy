import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DataStatus } from "./data-status";
import { COVERAGE_GUARD_POINTS, COVERAGE_GUARD_PERCENT, STALE_AFTER_DAYS, DATASET_IDS, coverageOf, datasetState, type DatasetDates } from "@/data/data-freshness";
import { CORE_MAX } from "@/engine/display-score";
import { getDataStatusMessages } from "@/i18n/data-status-messages";

const NOW = Date.parse("2026-10-16T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString().slice(0, 10);

describe("dataset state", () => {
  it("is none without a date or with a bad one", () => {
    expect(datasetState("prices", null, NOW)).toBe("none");
    expect(datasetState("prices", "not a date", NOW)).toBe("none");
  });

  it("is stale only past each dataset limit", () => {
    for (const id of DATASET_IDS) {
      const limit = STALE_AFTER_DAYS[id];
      expect(datasetState(id, daysAgo(limit - 1), NOW)).toBe("current");
      expect(datasetState(id, daysAgo(limit + 1), NOW)).toBe("stale");
    }
  });

  it("accepts a timestamp and a future date", () => {
    expect(datasetState("news", `${daysAgo(1)}T08:00:00Z`, NOW)).toBe("current");
    expect(datasetState("news", daysAgo(-2), NOW)).toBe("current");
  });
});

describe("coverage badge levels", () => {
  it("has the 80% guard from the scorer", () => {
    expect(COVERAGE_GUARD_POINTS).toBe(Math.ceil(CORE_MAX * 0.8));
  });

  it("is full when every core rule has data", () => {
    expect(coverageOf(9, 9, CORE_MAX).level).toBe("full");
  });

  it("is partial above the guard and limited below it", () => {
    expect(coverageOf(8, 9, COVERAGE_GUARD_POINTS).level).toBe("partial");
    expect(coverageOf(6, 9, COVERAGE_GUARD_POINTS - 1).level).toBe("limited");
  });

  it("is none with no known rule", () => {
    expect(coverageOf(0, 9, 0).level).toBe("none");
  });
});

const dates: DatasetDates = { prices: daysAgo(1), fundamentals: daysAgo(200), filings: null, insider: daysAgo(10), macro: daysAgo(3), news: daysAgo(30) };

describe("DataStatus block", () => {
  it("shows stale, no data and the coverage line in both languages", () => {
    for (const locale of ["en", "sk"] as const) {
      const t = getDataStatusMessages(locale);
      const html = renderToStaticMarkup(<DataStatus locale={locale} lastUpdated="2026-10-15" stale={false} detail={{ datasets: dates, coverage: coverageOf(8, 9, COVERAGE_GUARD_POINTS), now: NOW }} />);
      expect(html).toContain(t.title);
      expect(html).toContain(`data-dataset="fundamentals" data-state="stale"`);
      expect(html).toContain(`data-dataset="filings" data-state="none"`);
      expect(html).toContain(`data-dataset="prices" data-state="current"`);
      expect(html).toContain(t.state.stale);
      expect(html).toContain(t.state.none);
      expect(html).toContain(`${t.coverageLabel}: ${t.level.partial}`);
      expect(html).toContain(locale === "en" ? "8 of 9 core rules have data" : "8 z 9 základných pravidiel má údaje");
      expect(html).toContain(`${COVERAGE_GUARD_POINTS}`);
    }
  });

  it("uses the same coverage figures in EN and SK (dates are formatted per locale)", () => {
    const figures = (locale: "en" | "sk") => renderToStaticMarkup(<DataStatus locale={locale} lastUpdated={null} stale={false} detail={{ datasets: { ...dates, prices: null, fundamentals: null, insider: null, macro: null, news: null }, coverage: coverageOf(6, 9, 15), now: NOW }} />).replace(/<[^>]+>/g, " ").match(/\d+/g)?.join(",");
    expect(figures("en")).toBe(figures("sk"));
  });

  it("notes the guard when coverage is limited and omits the analyst count", () => {
    const html = renderToStaticMarkup(<DataStatus locale="en" lastUpdated={null} stale={false} detail={{ datasets: dates, coverage: coverageOf(5, 9, 12), now: NOW }} />);
    expect(html).toContain(`Below the ${COVERAGE_GUARD_PERCENT}% coverage guard`);
    expect(html.toLowerCase()).not.toContain("analyst");
  });

  it("shows no coverage when there is no score", () => {
    const html = renderToStaticMarkup(<DataStatus locale="en" lastUpdated={null} stale={false} detail={{ datasets: dates, coverage: null, now: NOW }} />);
    expect(html).toContain("No score yet");
    expect(html).not.toContain("Data coverage:");
  });

  it("keeps the existing output without detail", () => {
    const html = renderToStaticMarkup(<DataStatus locale="en" lastUpdated="2026-10-01" stale />);
    expect(html).toContain("Stale since");
    expect(html).not.toContain("data-data-status");
  });
});

describe("banned wording", () => {
  const banned = /\b(reliab\w*|trust\w*|confiden\w*|safe|recommend\w*|buy|sell|accurate|guarantee\w*)\b|spoľahliv\w*|dôveryhodn\w*|istot\w*|odporúč\w*|nákup\w*|predaj\w*|presn\w*|zaručen\w*/i;
  it("keeps the strings neutral in both languages", () => {
    for (const locale of ["en", "sk"] as const) {
      expect(JSON.stringify(getDataStatusMessages(locale))).not.toMatch(banned);
    }
  });
  it("has no price strings", () => {
    expect(JSON.stringify(getDataStatusMessages("en"))).not.toMatch(/\$|USD|EUR|€/);
  });
});
