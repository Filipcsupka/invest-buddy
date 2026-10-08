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
  expect(empty).not.toMatch(/SAMPLE DATA|UKÁŽKOVÉ DÁTA/);
  const rows = (await scoredUniverse()).slice(0, 1);
  scores.mockResolvedValue({ rows, sample: false, lastUpdated: "2026-01-01", stale: true });
  const old = renderToStaticMarkup(await Home(props(locale)));
  expect(old).toContain(locale === "en" ? "Stale since" : "Zastarané od");
  expect(old).not.toMatch(/SAMPLE DATA|UKÁŽKOVÉ DÁTA|Sample extension/);
});
