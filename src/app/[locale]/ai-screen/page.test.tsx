import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

it("shows cards to everyone but keeps import controls for authorized owner requests", async () => {
  enabled.mockReturnValue(false);
  data.mockResolvedValue({ cards: [], comparison: {}, sample: false });
  const publicHtml = renderToStaticMarkup(await Page(props("en")));
  expect(publicHtml).toContain("No cards imported yet.");
  expect(publicHtml).not.toContain("Paste cards");
  enabled.mockReturnValue(true); auth.mockReturnValue(false);
  expect(renderToStaticMarkup(await Page(props("en")))).not.toContain("Paste cards");
  auth.mockReturnValue(true);
  expect(renderToStaticMarkup(await Page(props("en")))).toContain("Paste cards");
  expect((await generateMetadata(props("en"))).robots).toEqual({ index: false, follow: false });
});

it("places a later reduce call outside active buy ideas and shows EN/SK copy", async () => {
  enabled.mockReturnValue(false);
  const first = parseAiCards("VLX — START POSITION — €40–60\n20 October 2026\nFirst card\n")[0];
  const second = parseAiCards("VLX — REDUCE — €0\n21 October 2026\nLater card\n")[0];
  data.mockResolvedValue({ cards: [{ ...second, id: 2, parentId: null, importedAt: "" }, { ...first, id: 1, parentId: null, importedAt: "" }], comparison: { VLX: null }, sample: false });
  const en = renderToStaticMarkup(await Page(props("en")));
  expect(en).toContain("Active buy ideas <small>(0)</small>");
  expect(en).toContain("Reduce or stop adding <small>(1)</small>");
  expect(en).toContain("Not covered by our data");
  expect(en).not.toContain("First card");
  expect(en).toContain("1 earlier call");
  expect(en).toContain('href="/en/ai-screen/VLX#history"');
  expect(en).toContain("A symbol appears green when its latest card says START or ADD.");
  expect(en).toContain("Figures are the automation&#x27;s own claims");
  const sk = renderToStaticMarkup(await Page(props("sk")));
  expect(sk).toContain("Aktívne nápady na nákup");
  expect(sk).toContain("Staršia výzva: 1");
});

it.each(["en", "sk"])("renders the sample fixture once per symbol in %s", async (locale) => {
  const parsed = parseAiCards(readFileSync(join(process.cwd(), "src/ai-cards/__fixtures__/sample.txt"), "utf8"));
  const cards = parsed.flatMap((card, index) => [card, ...card.children].map((item, childIndex) => ({ ...item, id: index * 10 + childIndex, parentId: null, importedAt: "" })));
  data.mockResolvedValue({ cards, comparison: {}, sample: true });
  enabled.mockReturnValue(false);
  const html = renderToStaticMarkup(await Page(props(locale)));
  for (const symbol of ["VLX", "ABBN", "NFLX", "SPCX", "SMCI"]) {
    expect(html.match(new RegExp(`href="/${locale}/ai-screen/${symbol}"`, "g"))).toHaveLength(1);
  }
  expect(html).toContain(locale === "en" ? "Sample cards" : "Ukážkové karty");
  expect(html).not.toContain(locale === "en" ? "Paste cards" : "Vložiť karty");
});
