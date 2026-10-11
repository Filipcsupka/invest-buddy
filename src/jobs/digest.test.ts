import { describe, expect, it } from "vitest";
import { bandChanges, buildDigest, deliverTelegram } from "./digest";
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
  const other: AlertChange = { ticker: "AMD", asOf: alert.asOf, previousState: "Wait", currentState: "Ignore", previousScore: 13, currentScore: 9 };
  const base = { asOf: alert.asOf, alerts: [alert], locale: "sk" as const, notifier, target: "@invest_test", adviceOutput: false, site: "https://x.test" };

  it("posts one message per changed ticker and skips a rerun", async () => {
    sent.length = 0;
    const log = new MemoryDeliveryLog();
    expect(await deliverTelegram({ ...base, alerts: [alert, other], log })).toEqual({ sent: 2, duplicates: 0, empty: false });
    expect(await deliverTelegram({ ...base, alerts: [alert, other], log })).toEqual({ sent: 0, duplicates: 2, empty: false });
    expect(sent).toHaveLength(2);
    expect(sent[0]).toContain("<b>AMD</b>");
    expect(sent[1]).toContain("Bolo: 🔵 Sledovanie (16) → Teraz: 🟢 (19 / 25)");
    expect(sent[1]).toContain("https://x.test/sk/company/NVDA");
    expect([...log.keys].sort()).toEqual(["telegram|@invest_test|2025-08-09|alert:sk:AMD", "telegram|@invest_test|2025-08-09|alert:sk:NVDA"]);
  });

  it("only posts the ticker that is new on a later run", async () => {
    sent.length = 0;
    const log = new MemoryDeliveryLog();
    await deliverTelegram({ ...base, log });
    expect(await deliverTelegram({ ...base, alerts: [alert, other], log })).toEqual({ sent: 1, duplicates: 1, empty: false });
    expect(sent).toHaveLength(2);
  });

  it("skips an empty day unless asked to post it, and posts it as escaped HTML", async () => {
    sent.length = 0;
    const log = new MemoryDeliveryLog();
    expect((await deliverTelegram({ ...base, alerts: [], log })).empty).toBe(true);
    expect((await deliverTelegram({ ...base, alerts: [], log, postEmpty: true })).sent).toBe(1);
    expect(sent[0]).toContain("Dnes sa stav pravidiel nezmenil.");
  });

  it("releases only the failed ticker, still posts the others, and retries it next run", async () => {
    sent.length = 0;
    const log = new MemoryDeliveryLog();
    const flaky = { send: async (text: string) => { if (text.includes("<b>AMD</b>")) throw new Error("down"); sent.push(text); } };
    await expect(deliverTelegram({ ...base, alerts: [alert, other], notifier: flaky, log })).rejects.toThrow("down");
    expect(sent).toHaveLength(1);
    expect([...log.keys]).toEqual(["telegram|@invest_test|2025-08-09|alert:sk:NVDA"]);
    expect(await deliverTelegram({ ...base, alerts: [alert, other], log })).toEqual({ sent: 1, duplicates: 1, empty: false });
  });

  it("names a first rating instead of printing null", async () => {
    sent.length = 0;
    const first = { ...alert, previousState: null, previousScore: null };
    await deliverTelegram({ ...base, locale: "en", alerts: [first], log: new MemoryDeliveryLog() });
    expect(sent[0]).toContain("First rating: 🟢 (19 / 25)");
    expect(sent[0]).not.toContain("null");
  });

  it("filters alerts whose band did not change", () => {
    expect(bandChanges([{ ...alert, previousState: "Setup met (>=18)" }, other]).map((a) => a.ticker)).toEqual(["AMD"]);
  });

  it("follows ADVICE_OUTPUT in the post", async () => {
    sent.length = 0;
    await deliverTelegram({ ...base, adviceOutput: true, log: new MemoryDeliveryLog() });
    expect(sent[0]).toContain("Zóna nákupu");
  });
});
