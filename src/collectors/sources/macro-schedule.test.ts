import { describe, expect, it } from "vitest";
import type { RequestOptions } from "./client";
import { FOMC_URL } from "./fed";
import { BLS_SCHEDULE_PAGES, blsDate, collectMacroSchedule, parseBlsSchedule, parseFomcSchedule } from "./macro-schedule";
import { fx } from "./testing";

const UA = "InvestBuddy ops@example.com";
const pageFor = (kind: "CPI" | "PPI" | "NFP") => fx("bls_schedule_cpi.html").replace(/Consumer Price Index/, kind);

function http(handler: (url: string) => string) {
  const calls: { url: string; options?: RequestOptions }[] = [];
  return { calls, async get(url: string, options?: RequestOptions) { calls.push({ url, options }); return handler(url); } };
}

describe("BLS release schedule", () => {
  it("reads BLS date formats and rejects anything else", () => {
    expect(blsDate("Nov. 10, 2026")).toBe("2026-11-10");
    expect(blsDate("May 07, 2027")).toBe("2027-05-07");
    expect(blsDate("Sept. 3, 2027")).toBe("2027-09-03");
    expect(blsDate("Jun. 04, 2027")).toBe("2027-06-04");
    expect(blsDate("Feb. 30, 2027")).toBeNull();
    expect(blsDate("TBD")).toBeNull();
  });

  it("parses the recorded CPI page", () => {
    const rows = parseBlsSchedule(fx("bls_schedule_cpi.html"), "CPI");
    expect(rows).toHaveLength(14);
    expect(rows[0]).toEqual({ kind: "CPI", date: "2026-11-10", label: "CPI (October)", referencePeriod: "October 2026", releaseTime: "08:30 AM", sourceId: "bls", sourceUrl: BLS_SCHEDULE_PAGES.CPI.url });
    expect(rows.map((r) => r.date)).toContain("2027-01-13");
    expect(rows.at(-1)?.date).toBe("2027-12-10");
  });

  it("labels the jobs report and fails on a page without the table", () => {
    expect(parseBlsSchedule(pageFor("NFP"), "NFP")[0].label).toBe("Jobs report (October)");
    expect(() => parseBlsSchedule("<html><title>Access Denied</title></html>", "CPI")).toThrow("no release-list table");
  });
});

describe("FOMC schedule", () => {
  it("keeps decision days from the Fed calendar file", () => {
    const rows = parseFomcSchedule(fx("fed_calendar.json"));
    expect(rows.map((r) => r.date)).toEqual(["2026-09-16", "2026-10-28", "2026-12-09"]);
    expect(rows[0]).toMatchObject({ kind: "FOMC", label: "FOMC decision", sourceId: "fed" });
  });
});

describe("collectMacroSchedule", () => {
  it("sends the contact User-Agent to bls.gov and keeps dates from today on", async () => {
    const stub = http((url) => url === FOMC_URL ? fx("fed_calendar.json") : pageFor("CPI"));
    const result = await collectMacroSchedule(stub, "2026-11-11", UA);
    expect(result.requests).toBe(4);
    expect(result.failures).toEqual([]);
    expect(stub.calls.filter((c) => c.url.includes("bls.gov")).every((c) => c.options?.headers?.["User-Agent"] === UA)).toBe(true);
    expect(result.results.map((r) => [r.kind, r.releases[0].date])).toEqual([["CPI", "2026-12-10"], ["PPI", "2026-12-10"], ["NFP", "2026-12-10"], ["FOMC", "2026-12-09"]]);
  });

  it("skips bls.gov without a contact address and reports each failed source", async () => {
    const stub = http((url) => { if (url === FOMC_URL) throw new Error("HTTP 503"); return pageFor("CPI"); });
    const result = await collectMacroSchedule(stub, "2026-10-19", "InvestBuddy-collector/0.1");
    expect(stub.calls.map((c) => c.url)).toEqual([FOMC_URL]);
    expect(result.results).toEqual([]);
    expect(result.failures).toHaveLength(4);
    expect(result.failures[0]).toContain("SEC_USER_AGENT");
    expect(result.failures[3]).toBe("FOMC: HTTP 503");
  });

  it("treats a schedule with no future date as a failure", async () => {
    const stub = http((url) => url === FOMC_URL ? fx("fed_calendar.json") : pageFor("CPI"));
    const result = await collectMacroSchedule(stub, "2028-01-01", UA);
    expect(result.results).toEqual([]);
    expect(result.failures).toContain("FOMC: no date on or after 2028-01-01");
  });
});
