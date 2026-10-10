import { describe, expect, it } from "vitest";
import { buildDigest, deliverTelegram, telegramDigest } from "./digest";
import { MemoryDeliveryLog } from "../db/notifications";
import type { AlertChange } from "../db/types";

const alert: AlertChange = { ticker: "NVDA", asOf: "2025-08-09", previousState: "Watch", currentState: "Setup met (>=18)", previousScore: 16, currentScore: 19 };

describe("digest", () => {
  it("uses rule states and informational wording in English and Slovak", () => {
    const en = buildDigest("reader@example.com", alert.asOf, [alert], "en");
    const sk = buildDigest("reader@example.com", alert.asOf, [alert], "sk");
    expect(en.text).toContain("NVDA: Watch → Setup met ≥18");
    expect(sk.text).toContain("NVDA: Sledovanie → Podmienky splnené ≥18");
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

describe("telegram delivery", () => {
  const sent: string[] = [];
  const notifier = { send: async (text: string) => { sent.push(text); } };
  const base = { asOf: alert.asOf, alerts: [alert], locale: "sk" as const, notifier, target: "@invest_test" };

  it("posts once per day and skips a rerun", async () => {
    sent.length = 0;
    const log = new MemoryDeliveryLog();
    expect(await deliverTelegram({ ...base, log })).toBe("sent");
    expect(await deliverTelegram({ ...base, log })).toBe("duplicate");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("NVDA: Sledovanie → Podmienky splnené ≥18");
    expect(sent[0]).toContain("/sk/dashboard");
  });

  it("skips an empty day unless asked to post it", async () => {
    sent.length = 0;
    const log = new MemoryDeliveryLog();
    expect(await deliverTelegram({ ...base, alerts: [], log })).toBe("empty");
    expect(await deliverTelegram({ ...base, alerts: [], log, postEmpty: true })).toBe("sent");
    expect(sent[0]).toContain("Dnes sa stav pravidiel nezmenil.");
  });

  it("releases the claim when the send fails so the next run retries", async () => {
    const log = new MemoryDeliveryLog();
    const failing = { send: async () => { throw new Error("down"); } };
    await expect(deliverTelegram({ ...base, notifier: failing, log })).rejects.toThrow("down");
    expect(log.keys.size).toBe(0);
    expect(await deliverTelegram({ ...base, log })).toBe("sent");
  });

  it("names a first rating instead of printing null", () => {
    const first = { ...alert, previousState: null, previousScore: null };
    expect(telegramDigest(alert.asOf, [first], "en")).toContain("NVDA: first rating Setup met ≥18 (19 points).");
    expect(telegramDigest(alert.asOf, [first], "en")).not.toContain("null");
  });
});
