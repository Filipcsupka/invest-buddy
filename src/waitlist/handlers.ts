import { z } from "zod";
import { flags } from "@/config/flags";
import { readBoundedBody } from "@/app/api/ingest/read-bounded-body";
import { createLimiter, clientKey, type Limiter } from "@/security/rate-limit";
import { CONSENT_TEXT_VERSION } from "./consent";
import { signUp, type WaitlistDeps } from "./service";

/** Lower-case letters, digits, underscore and hyphen. The pages send priceVariant `a` or `b`. */
const label = z.string().regex(/^[a-z0-9_-]{1,32}$/);

export const signupSchema = z.object({
  email: z.string().trim().max(254).pipe(z.email()),
  locale: z.enum(["en", "sk"]),
  /** The launch notice box. Required: without it nothing is stored. */
  consentLaunch: z.literal(true),
  /** The free weekly Slovak mail. Optional and separate. */
  consentWeekly: z.boolean().default(false),
  priceVariant: label.optional(),
  source: label.optional(),
  /** Honeypot: people leave it empty, bots fill it. */
  website: z.string().max(500).optional(),
});

const BODY_LIMIT = 4096;
const json = (body: Record<string, unknown>, status: number, headers?: Record<string, string>) => Response.json(body, { status, headers });

export function signupLimiter(): Limiter {
  const perMinute = Number(process.env.WAITLIST_RATE_PER_MIN);
  return createLimiter({ perMinute: Number.isFinite(perMinute) && perMinute > 0 ? Math.floor(perMinute) : 5 });
}

/**
 * POST /api/waitlist. Answers the same success for a new, repeated and confirmed address, so the reply does not say which addresses are on the list.
 * `deps` returns null when the database or mail setup is missing.
 */
export function createSignupHandler(getDeps: () => WaitlistDeps | null, limiter: Limiter = signupLimiter()) {
  return async function handle(request: Request): Promise<Response> {
    if (!flags().WAITLIST) return json({ error: "Not found" }, 404);
    const limit = limiter.take(clientKey(request.headers));
    if (!limit.ok) return json({ error: "Rate limit exceeded" }, 429, { "Retry-After": String(limit.retryAfter) });

    const text = await readBoundedBody(request, BODY_LIMIT);
    if (text === null) return json({ error: "Payload too large" }, 413);
    let raw: unknown;
    try { raw = JSON.parse(text); } catch { return json({ error: "Invalid JSON" }, 400); }

    const parsed = signupSchema.safeParse(raw);
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      return json({ error: "Invalid body", field: field === "consentLaunch" ? "consent" : field === "email" ? "email" : "form" }, 400);
    }
    const body = parsed.data;
    // A filled honeypot gets the normal answer and nothing is stored.
    if (body.website) return json({ ok: true }, 200);

    let deps: WaitlistDeps | null = null;
    try { deps = getDeps(); } catch { deps = null; }
    if (!deps) return json({ error: "Waitlist unavailable" }, 503);
    try {
      await signUp(deps, {
        email: body.email,
        locale: body.locale,
        source: body.source ?? null,
        priceVariant: body.priceVariant ?? null,
        consentLaunch: true,
        consentWeekly: body.consentWeekly,
        consentTextVersion: CONSENT_TEXT_VERSION,
      });
    } catch {
      return json({ error: "Database unavailable" }, 503);
    }
    return json({ ok: true }, 200);
  };
}
