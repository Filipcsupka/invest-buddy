import { describe, expect, it } from "vitest";
import { bandChanges, buildDigest, deliverTelegram } from "./digest";
import { MemoryDeliveryLog } from "../db/notifications";
import type { AlertChange } from "../db/types";
import { sampleIdeas } from "../ideas/fixtures";

const alert: AlertChange = { ticker: "NVDA", asOf: "2025-08-09", previousState: "Watch", currentState: "Setup met (>=18)", previousScore: 16, currentScore: 19 };

describe("digest", () => {
  it("uses rule states and informational wording in English and Slovak", () => {
    const en = buildDigest("reader@example.com", alert.asOf, [alert], "en");
    const sk = buildDigest("reader@example.com", alert.asOf, [alert], "sk");
    expect(en.text).toContain("NVDA: Watching → Conditions met");
    expect(sk.text).toContain("NVDA: Sledovanie → Podmienky splnené");
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

describe("telegram idea card", () => {
  const sent: string[] = [];
  const notifier = { send: async (text: string) => { sent.push(text); } };
  const amd: AlertChange = { ticker: "AMD", asOf: alert.asOf, previousState: "Wait", currentState: "Ignore", previousScore: 13, currentScore: 9 };
  const base = { asOf: alert.asOf, alerts: [alert, amd], locale: "en" as const, notifier, target: "@invest_test", adviceOutput: true, site: "https://x.test", ideas: { NVDA: sampleIdeas[0] }, audits: { NVDA: { evidencedMax: 23, percent: 73.9, coverage: 92 } } };

  it("sends the card for a ticker with a stored idea and the short message for one without", async () => {
    sent.length = 0;
    await deliverTelegram({ ...base, log: new MemoryDeliveryLog() });
    expect(sent[0]).toContain("<b>AMD</b>");
    expect(sent[0]).not.toContain("What happened");
    expect(sent[1]).toContain("<b>What happened</b>");
    expect(sent[1]).toContain("Score 19 of 23 evidenced (74 %), data coverage 92 %");
  });

  it("is public by default and shows the owner view only in owner mode", async () => {
    sent.length = 0;
    await deliverTelegram({ ...base, alerts: [alert], log: new MemoryDeliveryLog() });
    await deliverTelegram({ ...base, alerts: [alert], cardMode: "owner", log: new MemoryDeliveryLog() });
    expect(sent[0]).not.toMatch(/EUR|When to add/);
    expect(sent[1]).toContain("EUR 60-90");
    expect(sent[1]).toContain("When to add");
  });
});

