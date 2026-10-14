import type { PriceVariantId } from "@/config/plans";
import type { Locale } from "@/i18n";

// Request shape of POST /api/waitlist (docs/roadmap/lane-web.md, W14):
// email, locale, consent boolean, honeypot field, price variant.
export interface WaitlistPayload {
  email: string;
  locale: Locale;
  consent: boolean;
  website: string;
  priceVariant: PriceVariantId;
}

export type WaitlistOutcome = "ok" | "invalid" | "rate_limited" | "failed";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validEmail(value: string): boolean {
  const email = value.trim();
  return email.length <= 254 && EMAIL.test(email);
}

export function buildPayload(input: { email: string; consent: boolean; website: string }, locale: Locale, priceVariant: PriceVariantId): WaitlistPayload {
  return { email: input.email.trim(), locale, consent: input.consent, website: input.website, priceVariant };
}

/** Posts the signup. The API answers the same neutral success for new and known addresses. */
export async function submitWaitlist(payload: WaitlistPayload, send: typeof fetch = fetch): Promise<WaitlistOutcome> {
  try {
    const res = await send("/api/waitlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    if (res.ok) return "ok";
    if (res.status === 429) return "rate_limited";
    if (res.status === 400 || res.status === 422) return "invalid";
    return "failed";
  } catch {
    return "failed";
  }
}
