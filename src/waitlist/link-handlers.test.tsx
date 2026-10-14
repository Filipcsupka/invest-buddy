import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfirmPanel, UnsubscribePanel } from "@/components/waitlist-status";
import { MemoryWaitlistRepository } from "@/db/waitlist-memory";
import { getMessages } from "@/i18n";
import { MemoryMailer } from "@/mail/mailer";
import { createSignupHandler } from "./handlers";
import { createConfirmHandler, createUnsubscribeHandler } from "./link-handlers";
import { confirmView, unsubscribeView } from "./states";
import { unsubscribeToken } from "./tokens";
import { createLimiter } from "@/security/rate-limit";
import type { WaitlistDeps } from "./service";

const secret = "test-secret-0123456789";
const hour = 3_600_000;
let now: number;
let repo: MemoryWaitlistRepository;
let mailer: MemoryMailer;
const deps = (): WaitlistDeps => ({ repo, mailer, secret, baseUrl: "https://invest.example.test" });

const formPost = (path: string, fields: Record<string, string>, headers: Record<string, string> = {}) =>
  new Request(`https://invest.example.test${path}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", ...headers }, body: new URLSearchParams(fields).toString() });

async function signUp(over: Record<string, unknown> = {}) {
  const handle = createSignupHandler(deps, createLimiter({ perMinute: 100 }));
  const response = await handle(new Request("https://invest.example.test/api/waitlist", { method: "POST", body: JSON.stringify({ email: "p@example.test", locale: "en", consentLaunch: true, consentWeekly: true, ...over }) }));
  expect(response.status).toBe(200);
}
const lastToken = (kind: "confirm" | "unsubscribe", message = mailer.sent.at(-1)!) => new RegExp(`/waitlist/${kind}\\?token=([^\\s&"]+)`).exec(message.text)![1];

beforeEach(() => {
  now = Date.UTC(2026, 9, 14);
  repo = new MemoryWaitlistRepository(() => now);
  mailer = new MemoryMailer();
  process.env.WAITLIST = "on";
});
afterEach(() => { delete process.env.WAITLIST; });

describe("confirm", () => {
  it("shows a button for a valid link and changes nothing until the button is pressed", async () => {
    await signUp();
    const token = decodeURIComponent(lastToken("confirm"));
    expect(await confirmView(deps(), token, undefined)).toBe("button");
    expect(await confirmView(deps(), token, undefined)).toBe("button");
    expect(repo.rows[0].status).toBe("pending");
    expect(mailer.sent).toHaveLength(1);
  });

  it("confirms on POST, redirects, and sends the welcome mail once", async () => {
    await signUp();
    const token = decodeURIComponent(lastToken("confirm"));
    const handle = createConfirmHandler(deps);
    const first = await handle(formPost("/api/waitlist/confirm", { token, locale: "en" }));
    expect(first.status).toBe(303);
    expect(first.headers.get("location")).toBe("/en/waitlist/confirm?result=confirmed");
    expect(repo.rows[0].status).toBe("confirmed");
    expect(mailer.sent).toHaveLength(2);
    expect(mailer.sent[1].subject).toBe("You are on the InvestBuddy waitlist");
    expect(mailer.sent[1].text).toMatch(/weekly Slovak mail/);
    // Reused link: harmless, no second welcome mail.
    const again = await handle(formPost("/api/waitlist/confirm", { token, locale: "en" }));
    expect(again.headers.get("location")).toBe("/en/waitlist/confirm?result=already");
    expect(mailer.sent).toHaveLength(2);
    expect(await confirmView(deps(), token, undefined)).toBe("already");
  });

  it("keeps the confirmation when the welcome mail fails", async () => {
    await signUp({ locale: "sk" });
    const token = decodeURIComponent(lastToken("confirm"));
    mailer.failWith = new Error("down");
    const response = await createConfirmHandler(deps)(formPost("/api/waitlist/confirm", { token, locale: "sk" }));
    expect(response.headers.get("location")).toBe("/sk/waitlist/confirm?result=confirmed");
    expect(repo.rows[0].status).toBe("confirmed");
  });

  it("reports an expired token after 7 days", async () => {
    await signUp();
    const token = decodeURIComponent(lastToken("confirm"));
    now += 7 * 24 * hour + 1;
    expect(await confirmView(deps(), token, undefined)).toBe("expired");
    const response = await createConfirmHandler(deps)(formPost("/api/waitlist/confirm", { token, locale: "en" }));
    expect(response.headers.get("location")).toBe("/en/waitlist/confirm?result=expired");
    expect(repo.rows[0].status).toBe("pending");
  });

  it("reports a tampered, empty or oversized token as invalid", async () => {
    await signUp();
    const token = decodeURIComponent(lastToken("confirm"));
    const handle = createConfirmHandler(deps);
    for (const bad of [`${token}x`, token.slice(1), "", "a".repeat(500)]) {
      const response = await handle(formPost("/api/waitlist/confirm", { token: bad, locale: "en" }));
      expect(response.headers.get("location")).toBe("/en/waitlist/confirm?result=invalid");
    }
    expect(await confirmView(deps(), undefined, undefined)).toBe("invalid");
    expect(repo.rows[0].status).toBe("pending");
  });

  it("is closed with the flag off and unavailable without a database", async () => {
    process.env.WAITLIST = "off";
    expect((await createConfirmHandler(deps)(formPost("/api/waitlist/confirm", { token: "x" }))).status).toBe(404);
    process.env.WAITLIST = "on";
    expect((await createConfirmHandler(() => null)(formPost("/api/waitlist/confirm", { token: "x" }))).status).toBe(503);
  });
});

describe("unsubscribe", () => {
  async function confirmed() {
    await signUp();
    await createConfirmHandler(deps)(formPost("/api/waitlist/confirm", { token: decodeURIComponent(lastToken("confirm")), locale: "en" }));
    return decodeURIComponent(lastToken("unsubscribe", mailer.sent[1]));
  }

  it("takes the one-click POST from a mail client and is idempotent", async () => {
    const token = await confirmed();
    const handle = createUnsubscribeHandler(deps);
    const oneClick = () => formPost(`/api/waitlist/unsubscribe?token=${encodeURIComponent(token)}`, { "List-Unsubscribe": "One-Click" });
    const first = await handle(oneClick());
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ status: "unsubscribed" });
    expect(repo.rows[0].status).toBe("unsubscribed");
    const second = await handle(oneClick());
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ status: "already" });
  });

  it("the header link in the welcome mail points at this endpoint", async () => {
    const token = await confirmed();
    expect(mailer.sent[1].headers?.["List-Unsubscribe"]).toBe(`<https://invest.example.test/api/waitlist/unsubscribe?token=${encodeURIComponent(token)}>`);
    expect(mailer.sent[1].headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("the page button posts token and locale and redirects back", async () => {
    const token = await confirmed();
    expect(unsubscribeView(deps(), token, undefined)).toBe("button");
    const response = await createUnsubscribeHandler(deps)(formPost("/api/waitlist/unsubscribe", { token, locale: "sk" }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/sk/waitlist/unsubscribe?result=unsubscribed");
    expect(repo.rows[0].status).toBe("unsubscribed");
  });

  it("refuses a tampered or foreign token and leaves the row alone", async () => {
    const token = await confirmed();
    const handle = createUnsubscribeHandler(deps);
    const [id, sig] = token.split(".");
    for (const bad of [`${id}.${sig.slice(1)}A`, `${Number(id) + 1}.${sig}`, unsubscribeToken(Number(id), "another-secret-0123456789"), "", "1"]) {
      const api = await handle(formPost(`/api/waitlist/unsubscribe?token=${encodeURIComponent(bad)}`, {}));
      expect(api.status).toBe(400);
      const page = await handle(formPost("/api/waitlist/unsubscribe", { token: bad, locale: "en" }));
      expect(page.headers.get("location")).toBe("/en/waitlist/unsubscribe?result=invalid");
    }
    expect(repo.rows[0].status).toBe("confirmed");
    expect(unsubscribeView(deps(), "nope", undefined)).toBe("invalid");
  });

  it("works for a person who never confirmed, and a later sign-up neither mails nor reopens the row", async () => {
    await signUp();
    const token = decodeURIComponent(lastToken("unsubscribe"));
    const response = await createUnsubscribeHandler(deps)(formPost(`/api/waitlist/unsubscribe?token=${encodeURIComponent(token)}`, {}));
    expect(response.status).toBe(200);
    expect(repo.rows[0].status).toBe("unsubscribed");
    now += 25 * hour;
    await signUp();
    expect(repo.rows[0].status).toBe("unsubscribed");
    expect(mailer.sent).toHaveLength(1);
  });
});

describe("pages", () => {
  const en = getMessages("en").waitlist;
  const sk = getMessages("sk").waitlist;

  it("renders a POST form with token and locale for the button views, and none otherwise", () => {
    const button = renderToStaticMarkup(<ConfirmPanel locale="sk" labels={sk} view="button" token="abc" />);
    expect(button).toContain('method="post"');
    expect(button).toContain('action="/api/waitlist/confirm"');
    expect(button).toContain('name="token" value="abc"');
    expect(button).toContain('name="locale" value="sk"');
    expect(button).toContain(sk.confirmButton);
    for (const view of ["confirmed", "already", "expired", "invalid"] as const) expect(renderToStaticMarkup(<ConfirmPanel locale="en" labels={en} view={view} token="abc" />)).not.toContain("<form");
  });

  it("renders each state with its own text in both languages", () => {
    const texts = (labels: typeof en) => ({
      confirmed: labels.confirmedBody, already: labels.alreadyBody, expired: labels.expiredBody, invalid: labels.invalidBody,
    });
    for (const [locale, labels] of [["en", en], ["sk", sk]] as const) {
      for (const [view, text] of Object.entries(texts(labels))) {
        expect(renderToStaticMarkup(<ConfirmPanel locale={locale} labels={labels} view={view as "confirmed"} token="" />)).toContain(text);
      }
      expect(renderToStaticMarkup(<UnsubscribePanel locale={locale} labels={labels} view="button" token="1.x" />)).toContain('action="/api/waitlist/unsubscribe"');
      expect(renderToStaticMarkup(<UnsubscribePanel locale={locale} labels={labels} view="unsubscribed" token="" />)).toContain(labels.unsubscribedBody);
      expect(renderToStaticMarkup(<UnsubscribePanel locale={locale} labels={labels} view="invalid" token="" />)).toContain(labels.invalidBody);
    }
  });
});
