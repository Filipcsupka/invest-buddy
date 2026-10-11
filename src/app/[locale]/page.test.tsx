import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { scoredUniverse } from "@/data/scored";

const scores = vi.fn();
vi.mock("@/data/store", () => ({ latestScores: () => scores() }));
import Home from "./page";

const originalMode = process.env.DATA_MODE;
const props = (locale: string) => ({ params: Promise.resolve({ locale }) });
afterEach(() => { scores.mockReset(); process.env.DATA_MODE = originalMode; });

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
