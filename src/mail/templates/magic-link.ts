import type { MailMessage } from "../mailer";
import { escapeHtml } from "./layout";

type AuthMailInput = { to: string; url: string; locale: "en" | "sk" };

const copy = {
  "magic-link": {
    en: { subject: "Sign in to InvestBuddy", intro: "Open this sign-in link. It expires in 15 minutes and can be used once.", action: "Continue", ignore: "If you did not request this link, ignore this email." },
    sk: { subject: "Prihlásenie do InvestBuddy", intro: "Otvorte odkaz na prihlásenie. Platí 15 minút a dá sa použiť iba raz.", action: "Pokračovať", ignore: "Ak ste o odkaz nežiadali, tento e-mail ignorujte." },
  },
  "verify-email": {
    en: { subject: "Confirm your InvestBuddy email", intro: "Open this link to confirm your email address.", action: "Confirm email", ignore: "If you did not create an account, ignore this email." },
    sk: { subject: "Potvrďte e-mail pre InvestBuddy", intro: "Otvorte tento odkaz a potvrďte svoju e-mailovú adresu.", action: "Potvrdiť e-mail", ignore: "Ak ste si účet nevytvorili, tento e-mail ignorujte." },
  },
} as const;

/** Transactional mail: no List-Unsubscribe header, no marketing footer. */
function authLinkMail(kind: keyof typeof copy, input: AuthMailInput): MailMessage {
  const m = copy[kind][input.locale];
  return {
    to: input.to,
    subject: m.subject,
    text: `${m.intro}\n\n${input.url}\n\n${m.ignore}\n`,
    html: `<!doctype html><html lang="${input.locale}"><meta charset="utf-8"><body><p>${escapeHtml(m.intro)}</p><p><a href="${escapeHtml(input.url)}">${escapeHtml(m.action)}</a></p><p>${escapeHtml(input.url)}</p><p>${escapeHtml(m.ignore)}</p></body></html>`,
  };
}

export const magicLinkMail = (input: AuthMailInput) => authLinkMail("magic-link", input);
export const verifyEmailMail = (input: AuthMailInput) => authLinkMail("verify-email", input);
