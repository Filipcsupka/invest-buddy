import { describe, expect, it } from "vitest";
import { buildDigest } from "./digest";
import type { AlertChange } from "../db/types";

const alert: AlertChange = { ticker: "NVDA", asOf: "2025-08-09", previousState: "Watch", currentState: "Setup met (>=18)", previousScore: 16, currentScore: 19 };

describe("digest", () => {
  it("uses rule states and informational wording in English and Slovak", () => {
    const en = buildDigest("reader@example.com", alert.asOf, [alert], "en");
    const sk = buildDigest("reader@example.com", alert.asOf, [alert], "sk");
    expect(en.text).toContain("NVDA: Watch → Setup met (>=18)");
    expect(en.text).toContain("informational screen");
    expect(sk.text).toContain("Zmeny stavov pravidiel");
    expect(sk.text).toContain("informačný skríning");
    for (const message of [en, sk]) {
      expect(message.text).not.toMatch(/\b(buy|sell|kúp|predaj|EUR)\b|—/i);
    }
  });

  it("describes an empty day", () => {
    expect(buildDigest("reader@example.com", alert.asOf, [], "en").text).toContain("No rule states changed today.");
    expect(buildDigest("reader@example.com", alert.asOf, [], "sk").text).toContain("Dnes sa stav pravidiel nezmenil.");
  });
});
