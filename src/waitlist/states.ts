import { hashToken, verifyUnsubscribeToken } from "./tokens";
import type { WaitlistDeps } from "./service";

export type ConfirmView = "button" | "confirmed" | "already" | "expired" | "invalid";
export type UnsubscribeView = "button" | "unsubscribed" | "already" | "invalid";

const confirmResults = new Set<ConfirmView>(["confirmed", "already", "expired", "invalid"]);
const unsubscribeResults = new Set<UnsubscribeView>(["unsubscribed", "already", "invalid"]);

/** Which confirm page to show. Reads only; opening the link never changes a row, so a mail scanner cannot confirm. */
export async function confirmView(deps: WaitlistDeps, token: string | undefined, result: string | undefined): Promise<ConfirmView> {
  if (result && confirmResults.has(result as ConfirmView)) return result as ConfirmView;
  if (!token || token.length > 200) return "invalid";
  const state = await deps.repo.peekConfirm(hashToken(token));
  return state === "valid" ? "button" : state;
}

export function unsubscribeView(deps: WaitlistDeps, token: string | undefined, result: string | undefined): UnsubscribeView {
  if (result && unsubscribeResults.has(result as UnsubscribeView)) return result as UnsubscribeView;
  return token && verifyUnsubscribeToken(token, deps.secret) !== null ? "button" : "invalid";
}
