import { getMessages, type Locale } from "@/i18n";

type Kind = "notFound" | "rateLimited" | "maintenance";

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

/** Standalone page for responses made before any layout renders (proxy 404, 429, 503). Inline CSS on purpose. */
export function statusPage(kind: Kind, status: number, locale: Locale, requestId: string, retryAfterSeconds?: number): Response {
  const m = getMessages(locale);
  const e = m.errors;
  const title = kind === "notFound" ? e.notFoundTitle : kind === "rateLimited" ? e.rateLimitedTitle : e.maintenanceTitle;
  const body = kind === "notFound" ? (process.env.DATA_MODE === "fixture" ? e.notFoundBody : e.notFoundBodyLive) : kind === "rateLimited" ? e.rateLimitedBody : e.maintenanceBody;
  const action = kind === "notFound" ? e.notFoundAction : e.homeAction;
  const href = kind === "notFound" ? `/${locale}/dashboard` : `/${locale}`;
  const html = `<!doctype html><html lang="${locale}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${status} · InvestBuddy</title><style>body{margin:0;background:#eceeeb;color:#17201b;font:1rem/1.6 system-ui,sans-serif}main{max-width:42rem;margin:12vh auto;padding:2rem}h1{font-size:clamp(2rem,6vw,4rem);line-height:1.1}a{display:inline-block;margin-top:1rem;padding:.75rem 1.25rem;background:#17201b;color:white;text-decoration:none;border-radius:.25rem}small{display:block;margin-top:2rem;opacity:.75}@media(prefers-color-scheme:dark){body{background:#111416;color:#e6ebe7}a{background:#e6ebe7;color:#111416}}</style><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p><a href="${href}">${escapeHtml(action)}</a><small>${escapeHtml(e.requestIdHint)} <code>${escapeHtml(requestId)}</code></small></main></html>`;
  const headers: Record<string, string> = { "content-type": "text/html; charset=utf-8", "x-request-id": requestId, "server-timing": `rid;desc="${requestId}"`, "cache-control": "no-store" };
  if (retryAfterSeconds !== undefined) headers["retry-after"] = String(retryAfterSeconds);
  return new Response(html, { status, headers });
}
