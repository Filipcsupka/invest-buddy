"use client";
import { useSyncExternalStore, type ReactNode } from "react";
import { hasSessionHint } from "@/auth/client-api";

const noop = () => () => {};

/**
 * Swaps one element for another once the session hint cookie is seen. The server always renders `signedOut`, so the cached HTML is the
 * same for every visitor; a signed-in visitor sees the swap right after hydration. Display only: the server still checks access.
 */
export function SignedInSwap({ signedOut, signedIn }: { signedOut: ReactNode; signedIn: ReactNode }) {
  const hint = useSyncExternalStore(noop, () => hasSessionHint(), () => false);
  return <>{hint ? signedIn : signedOut}</>;
}
