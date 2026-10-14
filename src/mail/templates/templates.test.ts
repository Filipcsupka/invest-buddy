import { afterEach, describe, expect, it } from "vitest";
import { locales, type Locale } from "@/i18n";
import { confirmMail } from "./confirm";
import { welcomeMail } from "./welcome";

const confirmUrl = "https://invest.example.test/en/waitlist/confirm?token=abc";
const unsubscribeUrl = "https://invest.example.test/en/waitlist/unsubscribe?token=7.sig";
const unsubscribePostUrl = "https://invest.example.test/api/waitlist/unsubscribe?token=7.sig";

const renders = (locale: Locale) => ({
  confirm: confirmMail({ to: "a@example.test", locale, confirmUrl, unsubscribeUrl }),
  welcome: welcomeMail({ to: "a@example.test", locale, unsubscribeUrl, unsubscribePostUrl, weekly: false }),
  welcomeWeekly: welcomeMail({ to: "a@example.test", locale, unsubscribeUrl, unsubscribePostUrl, weekly: true }),
});

// W10 wording gate: no action words while ADVICE_OUTPUT is off, plus the dictionary's filler and dash rules.
const bannedEn = /\b(buy|sell|hold|add|reduce|target|recommend\w*|rating|outperform|underperform|start position|EUR)\b|€/i;
const bannedSk = /(kúp|kup|nákup|predaj|predať|prikúp|zníž|odporúč|cieľov|hodnotenie akcie)/i;
const filler = /[–—]|\b(robust|seamless|leverage|unlock|empower|crucial|delve)\b/i;

afterEach(() => { delete process.env.OPERATOR_DISCLOSURE_EN; });

describe.each(locales)("mail templates (%s)", (locale) => {
  const set = renders(locale);

  it.each(Object.entries(set))("%s matches its snapshot", (_name, mail) => {
    expect({ subject: mail.subject, headers: mail.headers, text: mail.text, html: mail.html }).toMatchSnapshot();
  });

  it.each(Object.entries(set))("%s has no advice wording, dashes or filler words", (_name, mail) => {
    const prose = `${mail.subject}\n${mail.text}`.replace(/https?:\/\/\S+/g, "");
    expect(bannedEn.test(prose)).toBe(false);
    expect(bannedSk.test(prose)).toBe(false);
    expect(filler.test(prose)).toBe(false);
  });

  it.each(Object.entries(set))("%s ends with the not-advice line and an unsubscribe link", (_name, mail) => {
    expect(mail.text).toContain(unsubscribeUrl);
    expect(mail.text.trimEnd().endsWith(unsubscribeUrl)).toBe(true);
    expect(mail.text).toMatch(locale === "sk" ? /Nejde o osobné investičné poradenstvo/ : /No personal investment advice/);
  });

  it.each(Object.entries(set))("%s HTML has no scripts, only absolute https links and no images", (_name, mail) => {
    const html = mail.html ?? "";
    expect(html).not.toMatch(/<script|javascript:|\son\w+=|<iframe|<form/i);
    for (const match of html.matchAll(/(?:href|src)="([^"]*)"/g)) expect(match[1], match[0]).toMatch(/^https:\/\//);
    // No remote images are used; if one is ever added it needs alt text.
    for (const img of html.matchAll(/<img\b[^>]*>/gi)) expect(img[0]).toMatch(/\balt="[^"]+"/);
    expect(html).toContain(`<html lang="${locale}">`);
  });
});

describe("confirm mail", () => {
  it("links to the confirm page and does not confirm by itself", () => {
    const mail = confirmMail({ to: "a@example.test", locale: "en", confirmUrl, unsubscribeUrl });
    expect(mail.text).toContain(confirmUrl);
    expect(mail.html).toContain(`href="${confirmUrl}"`);
    expect(mail.to).toBe("a@example.test");
  });

  it("escapes the link in HTML", () => {
    const mail = confirmMail({ to: "a@example.test", locale: "en", confirmUrl: "https://x.test/?a=1&b=<2>", unsubscribeUrl });
    expect(mail.html).toContain("a=1&amp;b=&lt;2&gt;");
    expect(mail.html).not.toContain("<2>");
  });
});

describe("welcome mail", () => {
  it("adds the one-click List-Unsubscribe headers", () => {
    const mail = welcomeMail({ to: "a@example.test", locale: "en", unsubscribeUrl, unsubscribePostUrl, weekly: false });
    expect(mail.headers).toEqual({ "List-Unsubscribe": `<${unsubscribePostUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
  });

  it("mentions the weekly mail only when it was asked for", () => {
    const without = welcomeMail({ to: "a@example.test", locale: "en", unsubscribeUrl, unsubscribePostUrl, weekly: false });
    const withWeekly = welcomeMail({ to: "a@example.test", locale: "en", unsubscribeUrl, unsubscribePostUrl, weekly: true });
    expect(without.text).not.toMatch(/weekly/i);
    expect(withWeekly.text).toMatch(/weekly Slovak mail/);
  });

  it("puts the operator line before the not-advice line when it is set", () => {
    process.env.OPERATOR_DISCLOSURE_EN = "Operated by Example s.r.o., Bratislava.";
    const mail = welcomeMail({ to: "a@example.test", locale: "en", unsubscribeUrl, unsubscribePostUrl, weekly: false });
    expect(mail.text.indexOf("Operated by Example")).toBeGreaterThan(0);
    expect(mail.text.indexOf("Operated by Example")).toBeLessThan(mail.text.indexOf("No personal investment advice"));
    expect(mail.html).toContain("Operated by Example s.r.o., Bratislava.");
  });
});
