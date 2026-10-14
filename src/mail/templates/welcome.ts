import { getMessages, type Locale } from "@/i18n";
import type { MailMessage } from "../mailer";
import { renderLayout } from "./layout";

export interface WelcomeInput {
  to: string;
  locale: Locale;
  /** Page the person can open to unsubscribe. */
  unsubscribeUrl: string;
  /** Endpoint for the one-click List-Unsubscribe header. */
  unsubscribePostUrl: string;
  weekly: boolean;
}

export function welcomeMail(input: WelcomeInput): MailMessage {
  const m = getMessages(input.locale).mail;
  const { text, html } = renderLayout({
    locale: input.locale,
    title: m.welcomeSubject,
    paragraphs: [m.welcomeIntro, m.welcomeLaunch, ...(input.weekly ? [m.welcomeWeekly] : [])],
    unsubscribeUrl: input.unsubscribeUrl,
  });
  return {
    to: input.to,
    subject: m.welcomeSubject,
    text,
    html,
    headers: { "List-Unsubscribe": `<${input.unsubscribePostUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}
