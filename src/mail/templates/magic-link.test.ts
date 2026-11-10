import { expect, it } from "vitest";
import { magicLinkMail, verifyEmailMail } from "./magic-link";

it.each(["en", "sk"] as const)("builds the %s sign-in mail as text and HTML without list headers", (locale) => {
  const mail = magicLinkMail({ to: "a@example.test", url: "https://invest.example/en/account/magic-link?token=abc&x=\"1\"", locale });
  expect(mail.subject).toBe(locale === "sk" ? "Prihlásenie do InvestBuddy" : "Sign in to InvestBuddy");
  expect(mail.text).toContain("https://invest.example/en/account/magic-link?token=abc");
  expect(mail.html).toContain("token=abc&amp;x=&quot;1&quot;");
  expect(mail.html).not.toContain('x="1"');
  expect(mail.headers).toBeUndefined();
});

it("keeps the verification mail separate from the sign-in mail", () => {
  const mail = verifyEmailMail({ to: "a@example.test", url: "https://invest.example/verify", locale: "sk" });
  expect(mail.subject).toBe("Potvrďte e-mail pre InvestBuddy");
  expect(mail.headers).toBeUndefined();
});
