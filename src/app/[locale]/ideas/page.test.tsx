import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
const enabled = vi.fn();
const ideas = vi.fn();
vi.mock("@/data/ideas-store", () => ({ ideasEnabled: () => enabled(), latestIdeas: () => ideas() }));
import Ideas from "./page";
import { sampleIdeas } from "@/ideas/fixtures";

const originalMode = process.env.DATA_MODE;
const originalAdvice = process.env.ADVICE_OUTPUT;
afterEach(() => { enabled.mockReset(); ideas.mockReset(); process.env.DATA_MODE = originalMode; if (originalAdvice === undefined) delete process.env.ADVICE_OUTPUT; else process.env.ADVICE_OUTPUT = originalAdvice; });

it.each(["en", "sk"])("shows an empty live idea list without fixture labels (%s)", async (locale) => {
  process.env.DATA_MODE = "db";
  process.env.ADVICE_OUTPUT = "on";
  enabled.mockReturnValue(true);
  ideas.mockResolvedValue({ rows: [], sample: false });
  const html = renderToStaticMarkup(await Ideas({ params: Promise.resolve({ locale }) }));
  expect(html).not.toMatch(/SAMPLE DATA|UKÁŽKOVÉ DÁTA/);
  expect(html).toContain(locale === "en" ? "No ideas yet" : "Zatiaľ žiadne nápady");
});

it.each(["en", "sk"])("hides %s ideas while ADVICE_OUTPUT is off", async (locale) => {
  process.env.ADVICE_OUTPUT = "off";
  enabled.mockReturnValue(true);
  await expect(Ideas({ params: Promise.resolve({ locale }) })).rejects.toThrow(/404|NOT_FOUND/);
  expect(ideas).not.toHaveBeenCalled();
});

it.each(["en", "sk"])("keeps owner EUR amounts off the public %s ideas list", async (locale) => {
  process.env.ADVICE_OUTPUT = "on";
  enabled.mockReturnValue(true);
  ideas.mockResolvedValue({ rows: sampleIdeas.slice(0, 1), sample: false });
  const html = renderToStaticMarkup(await Ideas({ params: Promise.resolve({ locale }) }));
  expect(html).not.toMatch(/EUR|€|Amount now|Suma teraz/);
  expect(html).toContain(locale === "en" ? "Add 1/3" : "Prikúpiť 1/3");
});
