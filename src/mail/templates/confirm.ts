import { getMessages, type Locale } from "@/i18n";
import type { MailMessage } from "../mailer";
import { renderLayout } from "./layout";

export interface ConfirmInput { to: string; locale: Locale; confirmUrl: string; unsubscribeUrl: string }

/** Double opt-in mail. The link opens a page with a button; opening the link alone confirms nothing. */
export function confirmMail(input: ConfirmInput): MailMessage {
  const m = getMessages(input.locale).mail;
  const { text, html } = renderLayout({
    locale: input.locale,
    title: m.confirmSubject,
    paragraphs: [m.confirmIntro, m.confirmExpiry],
    action: { label: m.confirmAction, url: input.confirmUrl },
    afterAction: [m.confirmLinkHint.replace("{url}", input.confirmUrl)],
    unsubscribeUrl: input.unsubscribeUrl,
  });
  return { to: input.to, subject: m.confirmSubject, text, html };
}
