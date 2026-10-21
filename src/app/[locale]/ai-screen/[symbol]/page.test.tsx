import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { parseAiCards } from "@/ai-cards/parse";

const data = vi.fn();
vi.mock("@/data/ai-cards", () => ({ aiCardsData: () => data() }));
import Page from "./page";

it("shows the full latest card and older calls for one symbol", async () => {
  const newer = parseAiCards("ABBN — HOLD — €0\n21 October 2026\nLater summary\n")[0];
  const older = parseAiCards("ABBN — START — €40–60\n20 October 2026\nEarlier summary\n")[0];
  data.mockResolvedValue({ cards: [{ ...newer, id: 2, parentId: null, importedAt: "" }, { ...older, id: 1, parentId: null, importedAt: "" }], comparison: {}, sample: false });
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ locale: "en", symbol: "ABBN" }) }));
  expect(html).toContain("Later summary");
  expect(html).toContain("Earlier summary");
  expect(html).toContain("Original card");
  expect(html).toContain('id="history"');
});
