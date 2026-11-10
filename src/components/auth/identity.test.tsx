import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import type { IdentityState } from "./identity-store";

const state = vi.hoisted(() => ({ current: { status: "pending" } as IdentityState }));
vi.mock("next/navigation", () => ({ usePathname: () => "/en/dashboard" }));
vi.mock("./identity-store", async (importOriginal) => ({ ...(await importOriginal<typeof import("./identity-store")>()), useIdentity: () => state.current }));
import { IdentityChip, IdentityPanel, TopBarIdentity } from "./identity";
import { NavLinks } from "../nav-links";

afterEach(() => { state.current = { status: "pending" }; });
const ready = (me: Extract<IdentityState, { status: "ready" }>["me"]) => { state.current = { status: "ready", me }; };
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

it("reserves the space with a skeleton and a live region while the state loads", () => {
  const html = renderToStaticMarkup(<IdentityPanel locale="en" auth />);
  expect(html).toContain('aria-live="polite"');
  expect(text(html)).toContain("Checking sign-in");
  expect(html).not.toContain("Sign out");
});

it.each([["en", "Not signed in", "Sign in", "Create free account"], ["sk", "Neprihlásený", "Prihlásiť sa", "Vytvoriť účet zdarma"]] as const)("shows %s visitors the state and both buttons when AUTH is on", (locale, state, signIn, create) => {
  ready({ kind: "anon", markets: false });
  const html = renderToStaticMarkup(<IdentityPanel locale={locale} auth />);
  expect(text(html)).toContain(state);
  expect(html).toContain(`href="/${locale}/sign-in?next=%2Fen%2Fdashboard&amp;mode=sign-in"`);
  expect(text(html)).toContain(signIn);
  expect(text(html)).toContain(create);
  expect(html).not.toContain("owner-sign-in");
});

it("shows only a quiet owner sign-in link when AUTH is off", () => {
  ready({ kind: "anon", markets: false });
  const html = renderToStaticMarkup(<IdentityPanel locale="en" auth={false} />);
  expect(html).toContain('href="/en/owner-sign-in"');
  expect(text(html)).toContain("Owner sign-in");
  expect(html).not.toContain("/en/sign-in?");
  expect(renderToStaticMarkup(<IdentityChip locale="en" auth={false} />)).not.toContain("<a");
});

it.each([["en", "Owner", "Signed in as owner", "Sign out"], ["sk", "Vlastník", "Prihlásený ako vlastník", "Odhlásiť sa"]] as const)("shows the %s owner badge, state text and a sign-out form", (locale, badge, stateText, signOut) => {
  ready({ kind: "owner", markets: true });
  const html = renderToStaticMarkup(<IdentityPanel locale={locale} auth />);
  expect(text(html)).toContain(badge);
  expect(text(html)).toContain(stateText);
  expect(html).toMatch(/<form[^>]*action="\/api\/owner\/logout" method="post"><input type="hidden" name="locale" value="(en|sk)"\/><button type="submit"[^>]*>/);
  expect(text(html)).toContain(signOut);
  expect(html).not.toContain("/sign-in?");
  expect(text(renderToStaticMarkup(<IdentityChip locale={locale} auth />))).toContain(badge);
});

it("shows a customer's email, plan with trial days, Account and Sign out", () => {
  ready({ kind: "customer", email: "ana@example.com", plan: "trial", trialDaysLeft: 11, markets: false });
  const html = renderToStaticMarkup(<IdentityPanel locale="en" auth />);
  expect(text(html)).toContain("ana@example.com");
  expect(text(html)).toContain("Trial · 11 days left");
  expect(html).toContain('href="/en/account"');
  expect(html).toContain('action="/api/auth/account/sign-out"');
  ready({ kind: "customer", email: "ana@example.com", plan: "trial", trialDaysLeft: 3, markets: false });
  expect(text(renderToStaticMarkup(<IdentityPanel locale="sk" auth />))).toContain("Skúška · zostáva 3 dni");
  for (const plan of ["free", "plus"] as const) {
    ready({ kind: "customer", email: "ana@example.com", plan, markets: false });
    expect(text(renderToStaticMarkup(<IdentityPanel locale="en" auth />))).toContain(plan === "free" ? "Free" : "Plus");
  }
});

it("puts the visitor buttons into the static top bar HTML, with no flag involved", () => {
  state.current = { status: "server" };
  const saved = process.env.AUTH;
  for (const auth of ["on", "off"]) {
    process.env.AUTH = auth;
    const html = renderToStaticMarkup(<TopBarIdentity locale="en" />);
    expect(html).toContain('href="/en/sign-in?next=%2Fen%2Fdashboard&amp;mode=sign-in"');
    expect(text(html)).toContain("Create free account");
    expect(html).not.toMatch(/Owner|Open app|@/);
  }
  if (saved === undefined) delete process.env.AUTH; else process.env.AUTH = saved;
  // In the browser, a visitor with the sign-in hint and no cached answer sees a short skeleton instead.
  state.current = { status: "pending" };
  expect(renderToStaticMarkup(<TopBarIdentity locale="en" />)).not.toContain("sign-in?");
});

it("gives the marketing top bar sign-in buttons for visitors and Open app for anyone signed in", () => {
  ready({ kind: "anon", markets: false });
  let html = renderToStaticMarkup(<TopBarIdentity locale="en" />);
  expect(text(html)).toContain("Sign in");
  expect(text(html)).toContain("Create free account");
  expect(html).not.toContain("Open app");
  ready({ kind: "owner", markets: true });
  html = renderToStaticMarkup(<TopBarIdentity locale="en" />);
  expect(text(html)).toContain("Owner");
  expect(html).toMatch(/href="\/en\/dashboard"[^>]*>Open app</);
  expect(text(html)).not.toContain("Sign in");
  expect(text(html)).not.toContain("Create free account");
  ready({ kind: "customer", email: "ana@example.com", plan: "plus", markets: false });
  html = renderToStaticMarkup(<TopBarIdentity locale="sk" />);
  expect(text(html)).toContain("Plus");
  expect(text(html)).toContain("Otvoriť aplikáciu");
});

const items = [{ href: "/dashboard", text: "Stock screen", icon: "dashboard", locked: true }, { href: "/methodology", text: "Methodology" }];
const lock = { soon: "Soon", locked: "locked, opens soon" };

it("blurs locked items for everyone but the owner and links them to the opens-soon page", () => {
  for (const current of [{ status: "server" }, { status: "pending" }, { status: "ready", me: { kind: "anon", markets: false } }, { status: "ready", me: { kind: "customer", email: "a@b.cz", plan: "plus", markets: false } }] as IdentityState[]) {
    state.current = current;
    const html = renderToStaticMarkup(<NavLinks locale="en" label="Stocks" items={items} lock={lock} />);
    expect(html).toContain('href="/en/opens-soon?page=dashboard"');
    expect(html).toContain('aria-label="Stock screen, locked, opens soon"');
    expect(html).not.toContain('href="/en/dashboard"');
    expect(html).toContain('href="/en/methodology"');
  }
  ready({ kind: "owner", markets: true });
  const owner = renderToStaticMarkup(<NavLinks locale="en" label="Stocks" items={items} lock={lock} />);
  expect(owner).toContain('href="/en/dashboard"');
  expect(owner).not.toContain("opens-soon");
});
