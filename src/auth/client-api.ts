/**
 * Thin typed client for the customer sign-in endpoints served by the auth handler (`/api/auth/*`, Better Auth, built on branch
 * Filipcsupka/auth-core). Browser only. No dependency: plain `fetch` with JSON. Every call resolves to an outcome; nothing throws.
 *
 * Endpoints (owner decision 2026-11-09: launch without an email provider, so email + password, Google, and recovery codes):
 *   POST /api/auth/sign-up/email      { name, email, password, callbackURL }       Better Auth core
 *   POST /api/auth/sign-in/email      { email, password, callbackURL }             Better Auth core
 *   POST /api/auth/sign-in/social     { provider: "google", callbackURL, ... }     Better Auth core
 *   POST /api/auth/recovery/codes     {}  -> { codes: string[] }                   ASSUMED shape, confirm against docs/auth.md
 *   POST /api/auth/recovery/reset     { email, code, newPassword } -> { remaining? } ASSUMED shape, confirm against docs/auth.md
 *   POST /api/auth/sign-in/magic-link { email, callbackURL }                       kept behind a prop, off by default
 *
 * When the handler is not deployed yet (404, 405, 501 or a non-JSON answer) the outcome is `unavailable`, so the UI can say "Sign-in
 * opens soon" instead of crashing.
 */

export const AUTH_BASE = "/api/auth";

/** Password rules shown inline and checked before any request. The server enforces its own copy. */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;
export const RECOVERY_CODE_COUNT = 10;

/** Cookie the auth handler sets next to the (httpOnly) session cookie so static pages can swap the account entry without a server read. */
export const SESSION_HINT_COOKIE = "ib_signed_in";

export type Failure =
  | { kind: "rate-limited"; retryAfter: number | null }
  | { kind: "invalid-email" }
  | { kind: "weak-password" }
  | { kind: "unavailable" }
  | { kind: "network" }
  | { kind: "error"; status: number };

export type GoogleOutcome = { kind: "redirect"; url: string } | Failure;
export type SignUpOutcome = { kind: "signed-up"; recoveryCodes: string[] | null } | { kind: "exists" } | Failure;
export type SignInOutcome = { kind: "signed-in"; url: string | null } | { kind: "wrong-credentials" } | Failure;
export type CodesOutcome = { kind: "codes"; codes: string[] } | Failure;
export type ResetOutcome = { kind: "reset"; remaining: number | null } | { kind: "bad-code" } | Failure;
export type MagicLinkOutcome = { kind: "sent" } | Failure;

/** Error codes that can come back on the sign-in page as `?error=` after a failed redirect. */
export type CallbackError = "expired" | "denied" | "rate-limited" | "error";

type Fetch = typeof fetch;

/**
 * A same-site path to return to after sign-in. Anything else (absolute URLs, protocol-relative `//host`, backslashes, control characters,
 * the auth API itself) falls back to the locale home. This value ends up in a redirect, so it is the open-redirect guard.
 */
export function safeNext(next: string | null | undefined, fallback: string): string {
  if (!next || next.length > 512) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return fallback;
  if (next.startsWith(`${AUTH_BASE}/`) || next === AUTH_BASE) return fallback;
  return next;
}

/** Loose shape check only; the server validates for real. */
export function validEmail(email: string): boolean {
  const value = email.trim();
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

export function passwordOk(password: string): boolean {
  return password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX;
}

/** Recovery codes are typed by hand: ignore case, spaces and dashes. */
export function normalizeCode(code: string): string {
  return code.replace(/[\s-]/g, "").toUpperCase();
}

/** Map an `?error=` value from the auth handler or the identity provider to one UI state. */
export function callbackError(raw: string | null | undefined): CallbackError | null {
  if (!raw) return null;
  const code = raw.toLowerCase();
  if (/expired|invalid_token|token_expired/.test(code)) return "expired";
  if (/access_denied|denied|cancel/.test(code)) return "denied";
  if (/rate|too_many/.test(code)) return "rate-limited";
  return "error";
}

function retryAfter(response: Response): number | null {
  const raw = response.headers.get("retry-after") ?? response.headers.get("x-retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(3600, Math.ceil(seconds));
  const date = Date.parse(raw);
  return Number.isNaN(date) ? null : Math.max(0, Math.min(3600, Math.ceil((date - Date.now()) / 1000)));
}

type Answer = { response: Response; json: Record<string, unknown> | null; code: string };

async function post(path: string, body: Record<string, unknown>, fetcher: Fetch): Promise<Answer | { kind: "network" }> {
  try {
    const response = await fetcher(`${AUTH_BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    });
    const type = response.headers.get("content-type") ?? "";
    const parsed: unknown = type.includes("application/json") ? await response.json().catch(() => null) : null;
    const json = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    const code = json && "code" in json ? String(json.code) : "";
    return { response, json, code };
  } catch {
    return { kind: "network" };
  }
}

/** Failures shared by every endpoint. `null` means the caller maps the status itself. */
function common({ response, json, code }: Answer): Failure | null {
  if (response.status === 429) return { kind: "rate-limited", retryAfter: retryAfter(response) };
  // No handler yet: the route does not exist, does not take POST, or something other than the auth API answered.
  if ([404, 405, 501].includes(response.status) || json === null) return { kind: "unavailable" };
  if (/INVALID_EMAIL$|^INVALID_EMAIL/.test(code)) return { kind: "invalid-email" };
  if (/PASSWORD_TOO_(SHORT|LONG)|WEAK_PASSWORD/.test(code)) return { kind: "weak-password" };
  return null;
}

const errorOf = (answer: Answer): Failure => common(answer) ?? { kind: "error", status: answer.response.status };
const strings = (value: unknown): string[] | null => (Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === "string") ? (value as string[]) : null);

/** POST /api/auth/sign-in/social with provider google. On success the browser should go to the returned provider URL. */
export async function signInWithGoogle(input: { callbackURL: string; errorCallbackURL?: string; newUserCallbackURL?: string }, fetcher: Fetch = fetch): Promise<GoogleOutcome> {
  const answer = await post("/sign-in/social", { provider: "google", callbackURL: input.callbackURL, errorCallbackURL: input.errorCallbackURL, newUserCallbackURL: input.newUserCallbackURL, disableRedirect: true }, fetcher);
  if ("kind" in answer) return answer;
  if (!answer.response.ok) return errorOf(answer);
  const url = answer.json?.url;
  if (typeof url !== "string" || !/^https:\/\//.test(url)) return { kind: "unavailable" };
  return { kind: "redirect", url };
}

/** POST /api/auth/sign-up/email. Recovery codes come back here if the handler includes them, otherwise from `createRecoveryCodes`. */
export async function signUpWithPassword(input: { email: string; password: string; callbackURL: string; marketing?: boolean }, fetcher: Fetch = fetch): Promise<SignUpOutcome> {
  const email = input.email.trim();
  if (!validEmail(email)) return { kind: "invalid-email" };
  if (!passwordOk(input.password)) return { kind: "weak-password" };
  // Better Auth requires a name; the product does not ask for one, so the part before the @ stands in until the account page edits it.
  const answer = await post("/sign-up/email", { name: email.split("@")[0], email, password: input.password, callbackURL: input.callbackURL, ...(input.marketing ? { marketing: true } : {}) }, fetcher);
  if ("kind" in answer) return answer;
  const { response, code } = answer;
  if (response.ok) return { kind: "signed-up", recoveryCodes: strings(answer.json?.recoveryCodes) };
  if ((response.status === 422 || response.status === 409 || response.status === 400) && /USER_ALREADY_EXISTS|ALREADY_EXISTS/.test(code)) return { kind: "exists" };
  return errorOf(answer);
}

/** POST /api/auth/sign-in/email. */
export async function signInWithPassword(input: { email: string; password: string; callbackURL: string }, fetcher: Fetch = fetch): Promise<SignInOutcome> {
  const email = input.email.trim();
  if (!validEmail(email)) return { kind: "invalid-email" };
  if (!input.password) return { kind: "wrong-credentials" };
  const answer = await post("/sign-in/email", { email, password: input.password, callbackURL: input.callbackURL }, fetcher);
  if ("kind" in answer) return answer;
  const { response, code } = answer;
  if (response.ok) {
    const url = answer.json?.url;
    return { kind: "signed-in", url: typeof url === "string" ? url : null };
  }
  if (response.status === 401 || /INVALID_EMAIL_OR_PASSWORD|INVALID_PASSWORD|CREDENTIAL/.test(code)) return { kind: "wrong-credentials" };
  return errorOf(answer);
}

/** POST /api/auth/recovery/codes for the signed-in user. Replaces any earlier set. */
export async function createRecoveryCodes(fetcher: Fetch = fetch): Promise<CodesOutcome> {
  const answer = await post("/recovery/codes", {}, fetcher);
  if ("kind" in answer) return answer;
  if (!answer.response.ok) return errorOf(answer);
  const codes = strings(answer.json?.codes);
  return codes ? { kind: "codes", codes } : { kind: "unavailable" };
}

/** POST /api/auth/recovery/reset: one unused recovery code sets a new password. The code is spent either way the server decides. */
export async function resetWithRecoveryCode(input: { email: string; code: string; newPassword: string }, fetcher: Fetch = fetch): Promise<ResetOutcome> {
  const email = input.email.trim();
  if (!validEmail(email)) return { kind: "invalid-email" };
  if (!passwordOk(input.newPassword)) return { kind: "weak-password" };
  const code = normalizeCode(input.code);
  if (code.length < 6) return { kind: "bad-code" };
  const answer = await post("/recovery/reset", { email, code, newPassword: input.newPassword }, fetcher);
  if ("kind" in answer) return answer;
  const { response } = answer;
  if (response.ok) {
    const remaining = answer.json?.remaining;
    return { kind: "reset", remaining: typeof remaining === "number" ? remaining : null };
  }
  if ((response.status === 400 || response.status === 401 || response.status === 403) && /CODE|RECOVERY|INVALID_EMAIL_OR/.test(answer.code)) return { kind: "bad-code" };
  return errorOf(answer);
}

/** POST /api/auth/sign-in/magic-link. Off by default (no email provider at launch). */
export async function sendMagicLink(input: { email: string; callbackURL: string; errorCallbackURL?: string }, fetcher: Fetch = fetch): Promise<MagicLinkOutcome> {
  if (!validEmail(input.email)) return { kind: "invalid-email" };
  const answer = await post("/sign-in/magic-link", { email: input.email.trim(), callbackURL: input.callbackURL, errorCallbackURL: input.errorCallbackURL }, fetcher);
  if ("kind" in answer) return answer;
  if (!answer.response.ok) return errorOf(answer);
  return { kind: "sent" };
}

/** True when the hint cookie says a session probably exists. For display only; the server decides access. */
export function hasSessionHint(cookie: string = typeof document === "undefined" ? "" : document.cookie): boolean {
  return cookie.split(";").some((part) => part.trim().startsWith(`${SESSION_HINT_COOKIE}=`));
}

/** The text file a visitor downloads with their recovery codes. */
export function recoveryCodesFile(codes: string[], header: string): string {
  return `${header}\n\n${codes.map((code, i) => `${String(i + 1).padStart(2, " ")}. ${code}`).join("\n")}\n`;
}
