import { flags } from "@/config/flags";
import { readBoundedBody } from "@/app/api/ingest/read-bounded-body";
import { confirmSignup, unsubscribeSignup, type WaitlistDeps } from "./service";

const BODY_LIMIT = 2048;
const json = (body: Record<string, unknown>, status: number) => Response.json(body, { status });
const redirect = (path: string) => new Response(null, { status: 303, headers: { location: path, "cache-control": "no-store" } });

async function form(request: Request): Promise<URLSearchParams | null> {
  const text = await readBoundedBody(request, BODY_LIMIT);
  return text === null ? null : new URLSearchParams(text);
}

const localeOf = (value: string | null) => (value === "sk" ? "sk" : "en");

/** POST /api/waitlist/confirm: the button on the confirm page. Redirects back to that page with the outcome. */
export function createConfirmHandler(getDeps: () => WaitlistDeps | null) {
  return async function handle(request: Request): Promise<Response> {
    if (!flags().WAITLIST) return json({ error: "Not found" }, 404);
    const fields = await form(request);
    if (!fields) return json({ error: "Payload too large" }, 413);
    const locale = localeOf(fields.get("locale"));
    const token = fields.get("token") ?? "";
    let deps: WaitlistDeps | null = null;
    try { deps = getDeps(); } catch { deps = null; }
    if (!deps) return json({ error: "Waitlist unavailable" }, 503);
    try {
      const result = await confirmSignup(deps, token.length > 200 ? "" : token);
      return redirect(`/${locale}/waitlist/confirm?result=${result.status}`);
    } catch {
      return json({ error: "Database unavailable" }, 503);
    }
  };
}

/**
 * POST /api/waitlist/unsubscribe. Two callers:
 * - a mail client doing the one-click unsubscribe (RFC 8058): token in the query, answered with JSON;
 * - the button on the unsubscribe page: token and locale in the form, answered with a redirect back to the page.
 * Repeating it is harmless.
 */
export function createUnsubscribeHandler(getDeps: () => WaitlistDeps | null) {
  return async function handle(request: Request): Promise<Response> {
    if (!flags().WAITLIST) return json({ error: "Not found" }, 404);
    const fields = await form(request);
    if (!fields) return json({ error: "Payload too large" }, 413);
    const human = fields.has("locale");
    const locale = localeOf(fields.get("locale"));
    const token = new URL(request.url).searchParams.get("token") ?? fields.get("token") ?? "";
    let deps: WaitlistDeps | null = null;
    try { deps = getDeps(); } catch { deps = null; }
    if (!deps) return json({ error: "Waitlist unavailable" }, 503);
    try {
      const result = await unsubscribeSignup(deps, token.length > 200 ? "" : token);
      if (human) return redirect(`/${locale}/waitlist/unsubscribe?result=${result.status}`);
      return result.status === "invalid" ? json({ error: "Invalid token" }, 400) : json({ status: result.status }, 200);
    } catch {
      return json({ error: "Database unavailable" }, 503);
    }
  };
}
