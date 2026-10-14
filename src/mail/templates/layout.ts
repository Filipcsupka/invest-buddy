import type { Locale } from "@/i18n";
import { getMessages } from "@/i18n";

export interface LayoutInput {
  locale: Locale;
  title: string;
  paragraphs: string[];
  action?: { label: string; url: string };
  /** Plain-text only line shown under the button, such as the raw link. */
  afterAction?: string[];
  unsubscribeUrl: string;
}

export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** Lines every mail ends with: operator line (when set), the not-advice line, the unsubscribe link. */
export function footerLines(locale: Locale, unsubscribeUrl: string): string[] {
  const m = getMessages(locale);
  const operator = m.common.operatorDisclosure.trim();
  return [...(operator ? [operator] : []), m.common.disclaimer, m.mail.unsubscribeLine.replace("{url}", unsubscribeUrl)];
}

/** Text and simple inline-CSS HTML. No scripts, no remote images, absolute links only. */
export function renderLayout(input: LayoutInput): { text: string; html: string } {
  const m = getMessages(input.locale);
  const footer = footerLines(input.locale, input.unsubscribeUrl);
  const text = [
    input.title,
    ...input.paragraphs,
    ...(input.action ? [`${input.action.label}: ${input.action.url}`] : []),
    ...(input.afterAction ?? []),
    m.meta.siteName,
    "--",
    ...footer,
  ].join("\n\n");

  const p = (line: string) => `<p style="margin:0 0 16px;font:16px/1.6 Arial,Helvetica,sans-serif;color:#17201b">${escapeHtml(line)}</p>`;
  const small = (line: string) => `<p style="margin:0 0 8px;font:13px/1.5 Arial,Helvetica,sans-serif;color:#4a5550">${escapeHtml(line)}</p>`;
  const unsubscribeLink = `<p style="margin:0;font:13px/1.5 Arial,Helvetica,sans-serif;color:#4a5550"><a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#4a5550">${escapeHtml(m.mail.unsubscribeLabel)}</a></p>`;
  const operator = m.common.operatorDisclosure.trim();
  const html = `<!doctype html><html lang="${input.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.title)}</title></head>`
    + `<body style="margin:0;background:#eceeeb"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eceeeb"><tr><td align="center" style="padding:24px 12px">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:4px"><tr><td style="padding:28px">`
    + `<h1 style="margin:0 0 20px;font:600 22px/1.3 Arial,Helvetica,sans-serif;color:#17201b">${escapeHtml(input.title)}</h1>`
    + input.paragraphs.map(p).join("")
    + (input.action ? `<p style="margin:0 0 20px"><a href="${escapeHtml(input.action.url)}" style="display:inline-block;padding:12px 20px;background:#17201b;color:#ffffff;text-decoration:none;border-radius:4px;font:600 16px Arial,Helvetica,sans-serif">${escapeHtml(input.action.label)}</a></p>` : "")
    + (input.afterAction ?? []).map(small).join("")
    + p(m.meta.siteName)
    + `<hr style="border:0;border-top:1px solid #d5dad6;margin:20px 0">`
    + (operator ? small(operator) : "") + small(m.common.disclaimer) + unsubscribeLink
    + `</td></tr></table></td></tr></table></body></html>`;
  return { text, html };
}
