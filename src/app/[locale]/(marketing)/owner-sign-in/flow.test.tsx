import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { scoredUniverse } from "@/data/scored";
import { issueOwnerSession, OWNER_SESSION_COOKIE } from "@/security/owner-session";

const state = vi.hoisted(() => ({ cookie: "", scores: vi.fn(), changes: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: state.cookie }) }));
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/navigation")>()), usePathname: () => "/en" }));
vi.mock("@/data/store", () => ({ latestScores: () => state.scores() }));
vi.mock("@/data/state-changes", () => ({ latestStateChanges: () => state.changes() }));
import Home from "../page";
import { Nav } from "@/components/nav";
import { marketsViewable } from "@/markets/gate";

const saved = {
  privateUse: process.env.EODHD_PRIVATE_USE,
  markets: process.env.MARKETS_VIEWS,
  password: process.env.OWNER_RESEARCH_PASSWORD,
  secret: process.env.OWNER_SESSION_SECRET,
};
afterEach(() => {
  state.cookie = "";
  state.scores.mockReset();
  state.changes.mockReset();
  for (const [key, name] of [["privateUse", "EODHD_PRIVATE_USE"], ["markets", "MARKETS_VIEWS"], ["password", "OWNER_RESEARCH_PASSWORD"], ["secret", "OWNER_SESSION_SECRET"]] as const) {
    if (saved[key] === undefined) delete process.env[name]; else process.env[name] = saved[key];
  }
});

it.each(["en", "sk"])("keeps the static Welcome page data-free and shows Markets in %s only after cookie sign-in", async (locale) => {
  process.env.EODHD_PRIVATE_USE = "on";
  process.env.MARKETS_VIEWS = "on";
  process.env.OWNER_RESEARCH_PASSWORD = "test-password";
  process.env.OWNER_SESSION_SECRET = "a-secret-with-at-least-thirty-two-bytes";
  const row = (await scoredUniverse())[0];
  state.scores.mockResolvedValue({ rows: [row], sample: false, lastUpdated: "2026-11-06", stale: false });
  state.changes.mockResolvedValue([]);
  const props = { params: Promise.resolve({ locale }) };
  const publicHtml = renderToStaticMarkup(await Home(props));
  expect(publicHtml).not.toContain(row.instrument.ticker);
  expect(state.scores).not.toHaveBeenCalled();
  const publicNav = renderToStaticMarkup(<Nav locale={locale as "en" | "sk"} marketsViewable={marketsViewable(new Headers())} />);
  expect(publicNav).not.toContain(`/${locale}/indices`);

  state.cookie = `${OWNER_SESSION_COOKIE}=${issueOwnerSession("test-password")}`;
  // The Welcome page is the same static HTML for everyone: it never reads scores, even for a signed-in owner.
  const ownerHtml = renderToStaticMarkup(await Home(props));
  expect(ownerHtml).not.toContain(row.instrument.ticker);
  expect(state.scores).not.toHaveBeenCalled();
  const ownerNav = renderToStaticMarkup(<Nav locale={locale as "en" | "sk"} marketsViewable={marketsViewable(new Headers({ cookie: state.cookie }))} />);
  expect(ownerNav).toContain(`/${locale}/indices`);
});
