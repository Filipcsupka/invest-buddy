import { createHash } from "node:crypto";
import type { PipelineState } from "./types";

export interface AlertFingerprint {
  state: PipelineState;
  action: string | null;
  tier: string | null;
  confirmedKeys: string[];
  close: number | null;
  ratings: { company: string; entry: string; catalyst: string } | null;
  relativeScore: number | null;
  band: string | null;
  amountMinEur: number;
  amountMaxEur: number;
  promotionStatus: string;
}

export interface AlertDecision { send: boolean; reason: string }
const RATINGS = ["Weak", "Neutral", "Good", "Strong", "Very strong"];
const URGENT = new Set<PipelineState>(["BROKEN", "REDUCE"]);
const CARD_STATES = new Set<PipelineState>(["WATCH", "START_READY", "ADD_READY", "REDUCE", "BROKEN"]);

export function fingerprintHash(value: AlertFingerprint): string {
  return createHash("sha256").update(JSON.stringify({ ...value, confirmedKeys: [...new Set(value.confirmedKeys)].sort() })).digest("hex").slice(0, 20);
}

/** The caller supplies only verified, confirmed, eligible finding keys. */
export function materialChange(current: AlertFingerprint, previous: AlertFingerprint | null, lastAt: string | null, now: Date,
  context: { reviewWithNegative?: boolean } = {}): AlertDecision {
  if (!CARD_STATES.has(current.state) && current.promotionStatus !== "proposed" && !context.reviewWithNegative)
    return { send: false, reason: "state has no routine card" };
  const reason = !previous
    ? CARD_STATES.has(current.state) || current.promotionStatus === "proposed" || context.reviewWithNegative ? "first card" : null
    : current.state !== previous.state && CARD_STATES.has(current.state) ? "state changed"
    : current.action !== previous.action || current.tier !== previous.tier ? "action changed"
    : current.promotionStatus === "proposed" && previous.promotionStatus !== "proposed" ? "promotion proposed"
    : context.reviewWithNegative ? "negative review due"
    : current.confirmedKeys.some(key => !previous.confirmedKeys.includes(key)) ? "confirmed finding"
    : current.close !== null && previous.close !== null && previous.close > 0 && Math.abs(current.close / previous.close - 1) >= 0.1 ? "close changed"
    : current.ratings && previous.ratings && (["company", "entry", "catalyst"] as const).some(key =>
      current.ratings![key] !== previous.ratings![key] && RATINGS.indexOf(current.ratings![key]) !== RATINGS.indexOf(previous.ratings![key])) ? "rating changed"
    : current.relativeScore !== null && previous.relativeScore !== null && Math.abs(current.relativeScore - previous.relativeScore) >= 10 ? "relative score changed"
    : current.band !== previous.band ? "band changed"
    : Math.abs((current.amountMinEur + current.amountMaxEur) / 2 - (previous.amountMinEur + previous.amountMaxEur) / 2) >= 50 &&
      Math.abs((current.amountMinEur + current.amountMaxEur) / 2 - (previous.amountMinEur + previous.amountMaxEur) / 2) >= Math.max((previous.amountMinEur + previous.amountMaxEur) / 2, 1) * 0.25 ? "amount changed"
    : null;
  if (!reason) return { send: false, reason: "no material change" };
  if (lastAt && !(URGENT.has(current.state) && previous?.state !== current.state) && now.getTime() - new Date(lastAt).getTime() < 3 * 86400_000)
    return { send: false, reason: "three-day cooldown" };
  return { send: true, reason };
}
