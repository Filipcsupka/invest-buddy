import { describe, expect, it } from "vitest";
import { classifyHost, dataSourceIdFor, displayQuoteAllowed, irDomainsFor } from "./sources";
import discovery from "../jobs/discovery-themes.json";

describe("sources", () => {
  it("classifies hosts, unknown hosts are aggregators, social wins", () => {
    expect(classifyHost("www.sec.gov")).toBe("primary");
    expect(classifyHost("www.reuters.com")).toBe("press");
    expect(classifyHost("finance.yahoo.com")).toBe("aggregator");
    expect(classifyHost("some-blog.example")).toBe("aggregator");
    expect(classifyHost("press.siemens.com", irDomainsFor("SIE"))).toBe("primary");
    expect(classifyHost("news.fixstars.com", irDomainsFor("3687"))).toBe("primary");
    expect(classifyHost("siemens.com.evil.example", irDomainsFor("SIE"))).toBe("aggregator");
    expect(classifyHost("x.com")).toBe("social");
    expect(classifyHost("user.substack.com")).toBe("social");
  });
  it("counts the company IR domain as primary, but not a look-alike", () => {
    expect(classifyHost("investors.vertiv.com", irDomainsFor("VRT"))).toBe("primary");
    expect(classifyHost("investors.vertiv.com.evil.example", irDomainsFor("VRT"))).toBe("aggregator");
    expect(classifyHost("investors.vertiv.com")).toBe("aggregator");
  });
  it("seeds the IR registry from discovery-themes.json", () => {
    for (const theme of discovery.themes) for (const b of theme.beneficiaries) {
      expect(irDomainsFor(b.symbol)).toContain(new URL(b.sourceUrl).hostname.replace(/^www\./, ""));
    }
  });
  it("maps hosts to data_sources ids", () => {
    expect(dataSourceIdFor("www.sec.gov")).toBe("sec");
    expect(dataSourceIdFor("api.fda.gov")).toBe("openfda");
    expect(dataSourceIdFor("clinicaltrials.gov")).toBe("clinicaltrials");
    expect(dataSourceIdFor("www.usaspending.gov")).toBe("usaspending");
    expect(dataSourceIdFor("www.reuters.com")).toBe("research_web");
  });
  it("allows quote display only for SEC, openFDA and USAspending", () => {
    expect(displayQuoteAllowed("www.sec.gov", "primary")).toBe(true);
    expect(displayQuoteAllowed("clinicaltrials.gov", "primary")).toBe(false);
    expect(displayQuoteAllowed("investors.vertiv.com", "primary")).toBe(false);
    expect(displayQuoteAllowed("www.reuters.com", "press")).toBe(false);
  });
});
