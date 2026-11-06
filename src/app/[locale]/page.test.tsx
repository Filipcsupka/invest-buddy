import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { scoredUniverse } from "@/data/scored";

const scores = vi.fn();
const authHeader = vi.fn<() => string | null>(() => null);
vi.mock("next/headers", () => ({ headers: async () => ({ get: () => authHeader() }) }));
vi.mock("@/data/store", () => ({ latestScores: () => scores() }));
import Home from "./page";

const originalMode = process.env.DATA_MODE;
const originalPrivate = process.env.EODHD_PRIVATE_USE;
const originalPassword = process.env.OWNER_RESEARCH_PASSWORD;
const props = (locale: string) => ({ params: Promise.resolve({ locale }) });
afterEach(() => { scores.mockReset(); authHeader.mockReset(); authHeader.mockReturnValue(null); process.env.DATA_MODE = originalMode; process.env.EODHD_PRIVATE_USE = originalPrivate; process.env.OWNER_RESEARCH_PASSWORD = originalPassword; });

it("keeps vendor-derived scores out of the public landing while private use is on", async () => {
  process.env.EODHD_PRIVATE_USE = "on";
  process.env.OWNER_RESEARCH_PASSWORD = "private-test-password";
  scores.mockResolvedValue({ rows: [{ instrument: { ticker: "PRIVATE_EODHD_VALUE" } }], sample: false, lastUpdated: "2026-11-06", stale: false });
  const html = renderToStaticMarkup(await Home(props("en")));
  expect(html).not.toContain("PRIVATE_EODHD_VALUE");
  expect(scores).not.toHaveBeenCalled();
  expect(html).toContain("No data yet");
});

it.each(["en", "sk"])("shows empty and stale live states on home in %s", async (locale) => {
  process.env.DATA_MODE = "db";
  scores.mockResolvedValue({ rows: [], sample: false, lastUpdated: null, stale: false });
  const empty = renderToStaticMarkup(await Home(props(locale)));
  expect(empty).toContain(locale === "en" ? "No data yet" : "Zatiaľ tu nie sú údaje");
  expect(empty).not.toMatch(/SAMPLE DATA|UKÁŽKOVÉ ÚDAJE/);
  const rows = (await scoredUniverse()).slice(0, 1);
  scores.mockResolvedValue({ rows, sample: false, lastUpdated: "2026-01-01", stale: true });
  const old = renderToStaticMarkup(await Home(props(locale)));
  expect(old).toContain(locale === "en" ? "Stale since" : "Zastarané od");
  expect(old).not.toMatch(/SAMPLE DATA|UKÁŽKOVÉ ÚDAJE|Sample extension/);
  expect(old).not.toMatch(/Sample datasheet|Ukážkový list|Operator position disclosure|Zverejnenie pozícií prevádzkovateľa/);
});

it.each([["en", "Nine core rules make the public percentage", "Five steps from Criteria broken to Conditions met", "Buy zone"], ["sk", "Deväť hlavných pravidiel tvorí verejné percento", "Päť stupňov od Kritériá porušené po Podmienky splnené", "Zóna nákupu"]])("explains the core percentage and status in %s", async (locale, build, status, advice) => {
  scores.mockResolvedValue({ rows: [], sample: false, lastUpdated: null, stale: false });
  const original = process.env.ADVICE_OUTPUT;
  try {
    delete process.env.ADVICE_OUTPUT;
    const off = renderToStaticMarkup(await Home(props(locale)));
    expect(off).toContain(build);
    expect(off).toContain(status);
    expect(off).not.toContain(advice);
    process.env.ADVICE_OUTPUT = "on";
    const on = renderToStaticMarkup(await Home(props(locale)));
    expect(on).toContain(build);
    expect(on).toContain(status);
    expect(on).not.toContain(advice);
  } finally { if (original === undefined) delete process.env.ADVICE_OUTPUT; else process.env.ADVICE_OUTPUT = original; }
});
