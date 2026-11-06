import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const shares = vi.fn();
vi.mock("@/data/flag-facts", () => ({ latestShareCounts: (tickers: string[]) => shares(tickers), storedShareCounts: async () => [] }));
import Scanner from "./page";

const env = { PAYWALL: process.env.PAYWALL, DATA_MODE: process.env.DATA_MODE };
beforeEach(() => { process.env.PAYWALL = "on"; process.env.DATA_MODE = "fixture"; });
afterEach(() => {
  for (const [key, value] of Object.entries(env)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  shares.mockReset();
});
const render = async (locale: string, query: Record<string, string> = {}) => renderToStaticMarkup(await Scanner({ params: Promise.resolve({ locale }), searchParams: Promise.resolve(query) }));
const rowCount = (html: string) => [...html.matchAll(/<tbody>(.*?)<\/tbody>/g)]
  .flatMap((match) => match[1].split("</tr>").filter((row) => row.includes("data-state="))).length;

describe("scanner floor page", () => {
  it.each([
    ["en", /(\d+) of (\d+) tickers, floor applied/, "Remove the floor", "no data", /\d+ tickers? (is|are) below the floor/],
    ["sk", /(\d+) z (\d+) tickerov, filter likvidity použitý/, "Zrušiť filter likvidity", "bez údajov", /\d+ tickerov? (je|sú) pod filtrom/],
  ])("hides tickers below the market cap floor by default and links to remove it, %s", async (locale, line, remove, noData, hidden) => {
    shares.mockImplementation(async (tickers: string[]) => Object.fromEntries(tickers.map((t) => [t, 1_000])));
    const html = await render(locale);
    const [, count, total] = html.match(line) ?? [];
    expect(Number(total)).toBeGreaterThan(Number(count));
    expect(rowCount(html)).toBe(Number(count));
    expect(html).toContain(remove);
    expect(html).toContain(`href="/${locale}/scanner?floor=off"`);
    expect(html).toMatch(hidden);
    expect(html).not.toContain(noData);

    const off = await render(locale, { floor: "off" });
    expect(rowCount(off)).toBe(Number(total));
    expect(off).toContain('name="floor" value="off"');
    expect(off).toContain(`href="/${locale}/scanner"`);
    expect(off).not.toContain(remove);
  });

  it("marks tickers without a stored share count instead of hiding them, EN and SK", async () => {
    shares.mockResolvedValue({});
    const en = await render("en");
    expect(en).toContain(">no data<");
    expect(en).toContain('href="/en/company/NVDA"');
    expect(en).toMatch(/(\d+) of \1 tickers, floor applied/);
    expect(await render("sk")).toContain(">bez údajov<");
  });

  it("is visible with the paywall flag off", async () => {
    process.env.PAYWALL = "off";
    shares.mockResolvedValue({});
    expect(await render("en")).toContain('href="/en/company/NVDA"');
  });
});
