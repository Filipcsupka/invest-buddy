import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
const scores = vi.fn();
vi.mock("@/data/store", () => ({ latestScores: () => scores() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/en" }));
import { Footer, Nav } from "./nav";

const originalMode = process.env.DATA_MODE;
const originalAdvice = process.env.ADVICE_OUTPUT;
afterEach(() => { scores.mockReset(); process.env.DATA_MODE = originalMode; if (originalAdvice === undefined) delete process.env.ADVICE_OUTPUT; else process.env.ADVICE_OUTPUT = originalAdvice; });

it.each(["en", "sk"] as const)("hides sizing navigation while advice is off (%s)", (locale) => {
  process.env.ADVICE_OUTPUT = "off";
  expect(renderToStaticMarkup(<Nav locale={locale} />)).not.toContain(`href="/${locale}/sizing"`);
  process.env.ADVICE_OUTPUT = "on";
  expect(renderToStaticMarkup(<Nav locale={locale} />)).toContain(`href="/${locale}/sizing"`);
});

it.each(["en", "sk"] as const)("links the scanner and keeps the heat map link (%s)", (locale) => {
  const html = renderToStaticMarkup(<Nav locale={locale} />);
  expect(html).toContain(`href="/${locale}/dashboard"`);
  expect(html).toContain(locale === "en" ? "Dashboard" : "Prehľad");
  expect(html).not.toContain("data jobs and judge");
  expect(html).toContain(`href="/${locale}/scanner"`);
  expect(html).toContain(`href="/${locale}/heatmap"`);
  expect(html).toContain(`href="/${locale}/etf"`);
  expect(html).toContain(`href="/${locale}/etf/track-record"`);
  expect(html).toContain(locale === "en" ? "Stocks" : "Akcie");
});

it("lists Markets as a neutral preview until identity resolves", () => {
  const saved = process.env.MARKETS_VIEWS;
  process.env.MARKETS_VIEWS = "on";
  try {
    const html = renderToStaticMarkup(<Nav locale="en" />);
    for (const route of ["indices", "forex", "crypto", "economy", "congress", "news", "screener"]) {
      expect(html).not.toContain(`href="/en/${route}"`);
      expect(html).toContain(`href="/en/plus-preview?page=${route}"`);
    }
    const owner = renderToStaticMarkup(<Nav locale="en" marketsViewable />);
    for (const route of ["indices", "forex", "crypto", "economy", "congress", "news", "screener"]) expect(owner).toContain(`href="/en/${route}"`);
    process.env.MARKETS_VIEWS = "off";
    expect(renderToStaticMarkup(<Nav locale="en" />)).not.toContain("page=indices");
  } finally {
    if (saved === undefined) delete process.env.MARKETS_VIEWS; else process.env.MARKETS_VIEWS = saved;
  }
});

it.each(["en", "sk"] as const)("server-renders no per-user state in the %s shell", (locale) => {
  const saved = { auth: process.env.AUTH, markets: process.env.MARKETS_VIEWS, use: process.env.EODHD_PRIVATE_USE };
  Object.assign(process.env, { AUTH: "on", MARKETS_VIEWS: "on", EODHD_PRIVATE_USE: "on" });
  try {
    const html = renderToStaticMarkup(<Nav locale={locale} />);
    // The islands render their pending skeleton on the server: no badge, email, plan, sign-out or owner link in shared HTML.
    expect(html).toContain(locale === "en" ? "Checking sign-in" : "Overujeme prihlásenie");
    expect(html).not.toMatch(/Signed in as owner|Prihlásený ako vlastník|account\/sign-out|@/);
    // Vendor pages lead to the preview in shared HTML, without flashing a blur before identity resolves.
    for (const route of ["dashboard", "scanner", "track-record", "insiders", "portfolio", "etf"]) expect(html).not.toContain(`href="/${locale}/${route}"`);
    expect(html).not.toContain('data-locked=""');
    expect(html).not.toContain("Soon");
    expect(html).toContain(`href="/${locale}/methodology"`);
  } finally {
    for (const [key, value] of [["AUTH", saved.auth], ["MARKETS_VIEWS", saved.markets], ["EODHD_PRIVATE_USE", saved.use]] as const) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

it.each(["en", "sk"])("keeps the shared footer free of fixture labels in db mode (%s)", async (locale) => {
  process.env.DATA_MODE = "db";
  scores.mockResolvedValue({ rows: [], sample: false, lastUpdated: null, stale: false });
  const html = renderToStaticMarkup(await Footer({ locale: locale as "en" | "sk" }));
  expect(html).not.toMatch(/SAMPLE DATA|UKÁŽKOVÉ ÚDAJE|sample data|ukážkových údajoch/i);
});

it.each([["en", "Collapse sidebar"], ["sk", "Zbaliť bočný panel"]] as const)("renders a labelled sidebar collapse button (%s)", (locale, label) => {
  const html = renderToStaticMarkup(<Nav locale={locale} />);
  expect(html).toMatch(new RegExp(`<button[^>]*class="side-toggle"[^>]*aria-controls="side-panel"[^>]*aria-label="${label}"`));
  expect(html).toContain(`title="${label}"`);
});

it.each(["en", "sk"] as const)("renders the static %s footer without reading scores", async (locale) => {
  const html = renderToStaticMarkup(await Footer({ locale, data: false }));
  expect(scores).not.toHaveBeenCalled();
  expect(html).toContain(`href="/${locale}/legal/privacy"`);
  expect(html).not.toMatch(/SAMPLE DATA|UKÁŽKOVÉ ÚDAJE/);
});
