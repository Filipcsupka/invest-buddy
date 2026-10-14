import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { scoredUniverse } from "@/data/scored";

const scores = vi.fn();
const universe = vi.fn();
vi.mock("@/data/store", () => ({ latestScores: () => scores(), instrumentUniverse: () => universe() }));

import SiteImage from "@/app/[locale]/opengraph-image";
import CompanyImage from "@/app/[locale]/company/[ticker]/opengraph-image";

const MAX_BYTES = 150_000;
const original = process.env.ADVICE_OUTPUT;
afterEach(() => { if (original === undefined) delete process.env.ADVICE_OUTPUT; else process.env.ADVICE_OUTPUT = original; });

async function load() {
  const rows = await scoredUniverse();
  scores.mockResolvedValue({ rows, sample: true, lastUpdated: rows[0].result.asOf, stale: false });
  universe.mockResolvedValue(rows.map((row) => row.instrument));
  return rows[0].instrument.ticker;
}
const bytes = async (res: Response) => new Uint8Array(await res.arrayBuffer());
const isPng = (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

it.each(["en", "sk"])("serves the %s site image as a small cached PNG", async (locale) => {
  const res = (await SiteImage({ params: Promise.resolve({ locale }) })) as Response;
  const body = await bytes(res);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("image/png");
  expect(res.headers.get("cache-control")).toContain("max-age=300");
  expect(isPng(body)).toBe(true);
  expect(body.length).toBeLessThan(MAX_BYTES);
});

it.each(["en", "sk"])("serves the %s company image as a small cached PNG", async (locale) => {
  const ticker = await load();
  const res = (await CompanyImage({ params: Promise.resolve({ locale, ticker: ticker.toLowerCase() }) })) as Response;
  const body = await bytes(res);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("image/png");
  expect(res.headers.get("cache-control")).toContain("max-age=300");
  expect(isPng(body)).toBe(true);
  expect(body.length).toBeLessThan(MAX_BYTES);
});

it("gives an unknown ticker or locale a 404, not an image", async () => {
  await load();
  await expect(CompanyImage({ params: Promise.resolve({ locale: "en", ticker: "ZZZZ" }) })).rejects.toThrow();
  await expect(SiteImage({ params: Promise.resolve({ locale: "xx" }) })).rejects.toThrow();
});

it("renders the same company image with ADVICE_OUTPUT on and off, and never reads the flag", async () => {
  const ticker = await load();
  const render = async (flag: string) => {
    process.env.ADVICE_OUTPUT = flag;
    return bytes((await CompanyImage({ params: Promise.resolve({ locale: "en", ticker }) })) as Response);
  };
  expect(Buffer.from(await render("on")).equals(Buffer.from(await render("off")))).toBe(true);
  for (const file of ["src/og/card.tsx", "src/app/[locale]/company/[ticker]/opengraph-image.tsx", "src/app/[locale]/opengraph-image.tsx"]) {
    const source = readFileSync(file, "utf8");
    expect(source, file).not.toMatch(/flags\(|process\.env\.ADVICE|\.action|\.tier|sizing/);
  }
});

it("labels sample and stale company images instead of presenting them as live", async () => {
  const ticker = await load();
  const rows = (await scoredUniverse());
  const render = async (sample: boolean, stale: boolean) => {
    scores.mockResolvedValue({ rows, sample, lastUpdated: rows[0].result.asOf, stale });
    return Buffer.from(await bytes((await CompanyImage({ params: Promise.resolve({ locale: "en", ticker }) })) as Response));
  };
  const live = await render(false, false);
  const sample = await render(true, false);
  const stale = await render(false, true);
  expect(sample.equals(live)).toBe(false);
  expect(stale.equals(live)).toBe(false);
  expect(stale.equals(sample)).toBe(false);
});

it("uses a dedicated short disclaimer key in both locales", () => {
  for (const m of [messages.en, messages.sk]) {
    expect(m.common.ogDisclaimer.length).toBeGreaterThan(20);
    expect(m.common.ogDisclaimer.length).toBeLessThan(m.common.disclaimer.length);
    expect(m.common.ogStale).toBeTruthy();
  }
  expect(readFileSync("src/og/card.tsx", "utf8")).not.toContain('split(". ")');
});
