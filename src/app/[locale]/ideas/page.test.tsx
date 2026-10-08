import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
const enabled = vi.fn();
const ideas = vi.fn();
vi.mock("@/data/ideas-store", () => ({ ideasEnabled: () => enabled(), latestIdeas: () => ideas() }));
import Ideas from "./page";

const originalMode = process.env.DATA_MODE;
afterEach(() => { enabled.mockReset(); ideas.mockReset(); process.env.DATA_MODE = originalMode; });

it.each(["en", "sk"])("shows an empty live idea list without fixture labels (%s)", async (locale) => {
  process.env.DATA_MODE = "db";
  enabled.mockReturnValue(true);
  ideas.mockResolvedValue({ rows: [], sample: false });
  const html = renderToStaticMarkup(await Ideas({ params: Promise.resolve({ locale }) }));
  expect(html).not.toMatch(/SAMPLE DATA|UKÁŽKOVÉ DÁTA/);
  expect(html).toContain(locale === "en" ? "No ideas yet" : "Zatiaľ žiadne nápady");
});
