import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { parseAiCards } from "@/ai-cards/parse";

const enabled = vi.fn();
const auth = vi.fn();
const data = vi.fn();
vi.mock("@/config/flags", () => ({ flags: () => ({ OWNER_VIEW: enabled() }) }));
vi.mock("next/headers", () => ({ headers: async () => ({ get: () => "Basic test" }) }));
vi.mock("../owner/research/auth", () => ({ ownerResearchAuthorized: () => auth() }));
vi.mock("@/data/ai-cards", () => ({ aiCardsData: () => data() }));
import Page, { generateMetadata } from "./page";

afterEach(() => { enabled.mockReset(); auth.mockReset(); data.mockReset(); });
const props = (locale: string) => ({ params: Promise.resolve({ locale }) });

it("requires owner access before loading cards", async () => {
  enabled.mockReturnValue(false);
  await expect(Page(props("en"))).rejects.toThrow(/404|NOT_FOUND/);
  enabled.mockReturnValue(true); auth.mockReturnValue(false);
  await expect(Page(props("en"))).rejects.toThrow(/404|NOT_FOUND/);
  expect(data).not.toHaveBeenCalled();
  expect((await generateMetadata(props("en"))).robots).toEqual({ index: false, follow: false });
});

it("places a later reduce call outside active buy ideas and shows EN/SK copy", async () => {
  enabled.mockReturnValue(true); auth.mockReturnValue(true);
  const first = parseAiCards("VLX — START POSITION — €40–60\n20 October 2026\nFirst card\n")[0];
  const second = parseAiCards("VLX — REDUCE — €0\n21 October 2026\nLater card\n")[0];
  data.mockResolvedValue({ cards: [{ ...second, id: 2, parentId: null, importedAt: "" }, { ...first, id: 1, parentId: null, importedAt: "" }], comparison: { VLX: null }, sample: false });
  const en = renderToStaticMarkup(await Page(props("en")));
  expect(en).toContain("Active buy ideas <small>(0)</small>");
  expect(en).toContain("Reduce or stop adding <small>(1)</small>");
  expect(en).toContain("Not covered by our data");
  expect(en).toContain("First card");
  const sk = renderToStaticMarkup(await Page(props("sk")));
  expect(sk).toContain("Aktívne nápady na nákup");
});
