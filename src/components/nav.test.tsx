import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
const scores = vi.fn();
vi.mock("@/data/store", () => ({ latestScores: () => scores() }));
import { Footer } from "./nav";

const originalMode = process.env.DATA_MODE;
afterEach(() => { scores.mockReset(); process.env.DATA_MODE = originalMode; });

it.each(["en", "sk"])("keeps the shared footer free of fixture labels in db mode (%s)", async (locale) => {
  process.env.DATA_MODE = "db";
  scores.mockResolvedValue({ rows: [], sample: false, lastUpdated: null, stale: false });
  const html = renderToStaticMarkup(await Footer({ locale: locale as "en" | "sk" }));
  expect(html).not.toMatch(/SAMPLE DATA|UKÁŽKOVÉ DÁTA|sample data|ukážkových údajoch/i);
});
