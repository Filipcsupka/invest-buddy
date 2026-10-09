import { describe, expect, it } from "vitest";
import { localizeCodes, localizeEvidenceLabel } from "./localize";

describe("localizeCodes", () => {
  it("replaces stored action and rating codes in Slovak prose", () => {
    expect(localizeCodes("sk", "WATCH, žiadne nové peniaze. Entry je hodnotený ako Strong.")).toBe("Sledovať, žiadne nové peniaze. Vstup je hodnotený ako Silné.");
    expect(localizeCodes("sk", "Hodnotenie je Very strong, nie Weak.")).toBe("Hodnotenie je Veľmi silné, nie Slabé.");
    expect(localizeCodes("sk", "Zmena na HIGH_CONVICTION_ADD.")).toBe("Zmena na Výrazne prikúpiť.");
  });
  it("replaces raw action codes in English prose and leaves other words alone", () => {
    expect(localizeCodes("en", "A catalyst would upgrade this to HIGH_CONVICTION_ADD.")).toBe("A catalyst would upgrade this to High-conviction add.");
    expect(localizeCodes("en", "Strong entry, no ADDITIONAL risk.")).toBe("Strong entry, no ADDITIONAL risk.");
  });
  it("maps English evidence labels in Slovak and keeps form names", () => {
    expect(localizeEvidenceLabel("sk", "Earnings release")).toBe("Výsledková správa");
    expect(localizeEvidenceLabel("sk", "10-Q")).toBe("10-Q");
    expect(localizeEvidenceLabel("en", "Earnings release")).toBe("Earnings release");
  });
});
