import { useSyncExternalStore } from "react";
import { hasSessionHint } from "@/auth/client-api";
import type { Me } from "@/app/api/me/me";

export type { Me };
/** `server`: the shared HTML and the hydration pass, where nobody is known. `pending`: in the browser, waiting for /api/me. */
export type IdentityState = { status: "server" } | { status: "pending" } | { status: "ready"; me: Me };

/**
 * Who is signed in, for the nav island. Browser only; the server snapshot is always `pending`, so no user data is ever rendered into
 * shared HTML. Without the `ib_signed_in` hint the visitor is anonymous and /api/me is not called. With it, the island shows a
 * non-identifying skeleton until /api/me answers; no email or plan is ever stored in the browser, so a reused tab cannot show the
 * previous account. All mounted islands share one request.
 */
export const ME_URL = "/api/me";
export const ME_CACHE_KEY = "ib_me";

const PENDING: IdentityState = { status: "pending" };
const SERVER: IdentityState = { status: "server" };
const ANON: Me = { kind: "anon", markets: false };
const ANON_STATE: IdentityState = { status: "ready", me: ANON };

let state: IdentityState | null = null;
let inflight = false;
let hinted: boolean | null = null;
let started = false;
const listeners = new Set<() => void>();

function emit(next: IdentityState): void {
  state = next;
  for (const listener of listeners) listener();
}

/** Only shapes the island can render; anything else counts as anonymous. */
export function parseMe(raw: unknown): Me | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (value.kind === "anon") return ANON;
  if (value.kind === "owner") return { kind: "owner", markets: value.markets === true };
  if (value.kind === "customer" && typeof value.email === "string" && (value.plan === "free" || value.plan === "passive" || value.plan === "plus" || value.plan === "trial")) {
    const days = typeof value.trialDaysLeft === "number" && Number.isFinite(value.trialDaysLeft) ? Math.max(0, Math.floor(value.trialDaysLeft)) : undefined;
    return value.plan === "trial" ? { kind: "customer", email: value.email, plan: "trial", trialDaysLeft: days ?? 0, markets: false } : { kind: "customer", email: value.email, plan: value.plan, markets: false };
  }
  return null;
}

/** Older builds kept the last answer in sessionStorage. Remove it so a previous account's email can never be read back. */
function clearLegacyCache(): void {
  try {
    window.sessionStorage.removeItem(ME_CACHE_KEY);
  } catch {
    /* storage blocked: nothing was stored */
  }
}

function initial(): IdentityState {
  clearLegacyCache();
  hinted = hasSessionHint();
  return hinted ? PENDING : ANON_STATE;
}

async function load(): Promise<void> {
  if (inflight) return;
  if (!hasSessionHint()) {
    emit(ANON_STATE);
    return;
  }
  inflight = true;
  try {
    const response = await fetch(ME_URL, { credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" } });
    const me = response.ok ? parseMe(await response.json().catch(() => null)) ?? ANON : null;
    if (me) emit({ status: "ready", me });
    else if (state?.status !== "ready") emit(ANON_STATE);
  } catch {
    // Offline or blocked: keep the last known state, or show the anonymous controls rather than an endless skeleton.
    if (state?.status !== "ready") emit(ANON_STATE);
  } finally {
    inflight = false;
  }
}

/** Sign-in or sign-out in another tab flips the hint; check it when this tab comes back. No request unless it changed. */
function onVisible(): void {
  if (document.visibilityState !== "visible") return;
  const now = hasSessionHint();
  if (now === hinted) return;
  hinted = now;
  // A different session may now be behind the cookie: drop the old answer until /api/me confirms the new one.
  emit(now ? PENDING : ANON_STATE);
  void load();
}

export function getSnapshot(): IdentityState {
  return (state ??= initial());
}

export function getServerSnapshot(): IdentityState {
  return SERVER;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!started) {
    started = true;
    getSnapshot();
    if (hinted) void load();
    document.addEventListener("visibilitychange", onVisible);
  }
  return () => {
    listeners.delete(listener);
  };
}

/** Called before a sign-out form posts: drop the in-memory answer and any legacy stored one, so nothing of the old account is shown. */
export function forgetIdentity(): void {
  clearLegacyCache();
  if (state?.status === "ready") emit(PENDING);
}

/** Test seam. */
export function resetIdentityStore(): void {
  if (started && typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
  state = null;
  inflight = false;
  hinted = null;
  started = false;
  listeners.clear();
}

/** The shared identity state for client islands. Pending on the server and during hydration. */
export function useIdentity(): IdentityState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
