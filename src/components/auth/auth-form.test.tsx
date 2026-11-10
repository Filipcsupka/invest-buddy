import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getAuthMessages } from "@/i18n/auth-messages";
import { AuthForm, initialState, noticeFor, type AuthState } from "./auth-form";
import { RecoveryCodes } from "./recovery-codes";
import { ResetForm } from "./reset-form";

vi.mock("next/navigation", () => ({ usePathname: () => "/en", notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
import SignIn from "@/app/[locale]/(marketing)/sign-in/page";
import Reset from "@/app/[locale]/(marketing)/reset/page";

const render = (props: Partial<Parameters<typeof AuthForm>[0]> = {}) => renderToStaticMarkup(<AuthForm locale="en" next="/en" {...props} />);
const codes = Array.from({ length: 10 }, (_, i) => `K${i}M4X7P2QZ`);

describe("AuthForm", () => {
  it("opens on sign-up: email and a new password with the length rule, no magic link", () => {
    const html = render();
    expect(html).not.toContain("Google");
    expect(html).toMatch(/aria-pressed="true"[^>]*>Create account</);
    expect(html).toContain('autoComplete="new-password"');
    expect(html).toContain('autoComplete="email"');
    expect(html).toContain('type="password"');
    expect(html).toContain("At least 10 characters");
    expect(html).toMatch(/aria-label="Show password"[^>]*aria-pressed="false"|aria-pressed="false"[^>]*aria-label="Show password"/);
    expect(html).toContain("Create free account");
    expect(html).not.toContain("Email me a sign-in link");
    expect(html).toMatch(/<input type="checkbox" name="marketing"\/>/);
    expect(html).toContain('href="/en/legal/terms"');
    expect(html).toMatch(/role="status"[^>]*aria-live="polite"/);
  });

  it("opens on sign-in with current-password, username autocomplete and the recovery link", () => {
    const html = render({ mode: "sign-in" });
    expect(html).toMatch(/aria-pressed="true"[^>]*>Sign in</);
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain('autoComplete="username"');
    expect(html).not.toContain("At least 10 characters");
    expect(html).toContain('href="/en/reset"');
  });

  it("keeps the email link behind a prop, sign-in mode only", () => {
    expect(render({ mode: "sign-in", magicLink: true })).toContain("Email me a sign-in link instead");
    expect(render({ mode: "sign-up", magicLink: true })).not.toContain("Email me a sign-in link instead");
  });

  it.each([["expired", "That link has expired"], ["denied", "Sign-in was cancelled"], ["rate-limited", "Too many attempts"], ["error", "Something went wrong"]] as const)("shows the %s state from a failed redirect", (error, title) => {
    expect(render({ error })).toContain(title);
  });

  it("writes every state in both locales, and errors say what to do next", () => {
    const states: AuthState[] = [{ kind: "wrong-credentials" }, { kind: "exists" }, { kind: "expired" }, { kind: "denied" }, { kind: "rate-limited", retryAfter: 30 }, { kind: "network" }, { kind: "unavailable" }, { kind: "error" }];
    for (const locale of ["en", "sk"] as const) {
      const t = getAuthMessages(locale);
      for (const state of states) {
        const notice = noticeFor(state, t, 30);
        expect(notice, state.kind).not.toBeNull();
        expect(notice!.body.length, state.kind).toBeGreaterThan(20);
      }
      expect(noticeFor({ kind: "rate-limited", retryAfter: 30 }, t, 30)!.body).toContain("30");
      expect(noticeFor({ kind: "idle" }, t, 0)).toBeNull();
    }
    expect(initialState(null)).toEqual({ kind: "idle" });
  });

  it("hides its heading when the page supplies one", () => {
    expect(render({ hideHeading: true })).not.toMatch(/<h[12]/);
    expect(render({ headingLevel: 2 })).toMatch(/<h2[^>]*>Sign in or create a free account<\/h2>/);
  });
});

describe("RecoveryCodes", () => {
  it("lists the codes, offers copy and download, and keeps Continue locked until the box is ticked", () => {
    const html = renderToStaticMarkup(<RecoveryCodes locale="en" email="jana@example.com" initial={codes} onContinue={() => {}} />);
    for (const code of codes) expect(html).toContain(code);
    expect(html).toContain("Without a code we cannot reset it.");
    expect(html).toContain("Copy codes");
    expect(html).toContain("Download as .txt");
    expect(html).toMatch(/<input type="checkbox"\/>|<input type="checkbox"[^>]*>/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Continue<\/button>/);
  });

  it("shows a loading state while codes are requested", () => {
    expect(renderToStaticMarkup(<RecoveryCodes locale="sk" email="jana@example.com" initial={null} onContinue={() => {}} />)).toContain("Vytvárame kódy");
  });
});

describe("ResetForm", () => {
  it("asks for email, one recovery code and a new password, with autocomplete hints and the honest limit", () => {
    const html = renderToStaticMarkup(<ResetForm locale="en" />);
    expect(html).toContain('autoComplete="username"');
    expect(html).toContain('autoComplete="one-time-code"');
    expect(html).toContain('autoComplete="new-password"');
    expect(html).toContain("At least 10 characters");
    expect(html).toContain("Without a recovery code we cannot reset your password.");
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
  });
});

describe("sign-in and reset pages", () => {
  const page = async (query: Record<string, string>, locale = "en") => renderToStaticMarkup(await SignIn({ params: Promise.resolve({ locale }), searchParams: Promise.resolve(query) }));

  it("has one h1, keeps a safe next path and drops an unsafe one", async () => {
    const ok = await page({ next: "/en/methodology" });
    expect(ok.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(await page({ next: "https://evil.example" })).not.toContain("evil.example");
  });

  it("shows only the opens-soon notice, with no Google button or form, while AUTH is off", async () => {
    const off = process.env.AUTH;
    delete process.env.AUTH;
    try {
      const html = await page({ mode: "sign-in" });
      expect(html).toContain("Sign-in opens soon");
      expect(html).not.toContain("<form");
      expect(html).not.toContain("Google");
      expect(html).not.toMatch(/owner.?sign/i);
    } finally {
      if (off === undefined) delete process.env.AUTH; else process.env.AUTH = off;
    }
  });

  it("opens the sign-in mode from the query and shows callback errors, in Slovak too", async () => {
    process.env.AUTH = "on";
    try {
      expect(await page({ mode: "sign-in" })).toContain('autoComplete="current-password"');
      expect(await page({ error: "access_denied" }, "sk")).toContain("Prihlásenie bolo zrušené");
    } finally { delete process.env.AUTH; }
  });

  it("renders the reset page as a static shell", async () => {
    const html = renderToStaticMarkup(await Reset({ params: Promise.resolve({ locale: "sk" }) }));
    expect(html).toContain("Obnova hesla");
  });
});
