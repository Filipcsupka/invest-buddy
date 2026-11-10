/** Production cookie name. `__Host-` needs Secure, Path=/ and no Domain, so plain-HTTP localhost uses the unprefixed name. */
export const CUSTOMER_SESSION_COOKIE = "__Host-ib_session";
export const CUSTOMER_COOKIE_BASE = "ib";

export function customerCookieName(kind: "session" | "session_data" | "dont_remember" | "account_data", secure: boolean): string {
  return `${secure ? "__Host-" : ""}${CUSTOMER_COOKIE_BASE}_${kind}`;
}

/** Readable by page scripts so static pages can show the account entry. Holds "1", never a token; the server ignores it. */
export const SESSION_HINT_COOKIE = "ib_signed_in";

export function sessionHintCookie(secure: boolean, maxAgeSeconds: number): string {
  return `${SESSION_HINT_COOKIE}=1; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secure ? "; Secure" : ""}`;
}

const customerCookiePattern = /(?:^|;)\s*(?:__Host-)?ib_session(?:_data)?=/;

/** True when the request carries a customer session or session cache cookie, valid or not. */
export function hasCustomerCookie(cookieHeader: string | null | undefined): boolean {
  return Boolean(cookieHeader && customerCookiePattern.test(cookieHeader));
}

/** Set-Cookie values that clear every customer cookie, for both the secure and the localhost names. */
export function clearCustomerCookies(): string[] {
  const kinds = ["session", "session_data", "dont_remember", "account_data"] as const;
  return [...kinds.flatMap((kind) => [
    `${customerCookieName(kind, true)}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
    `${customerCookieName(kind, false)}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
  ]), `${SESSION_HINT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`];
}
