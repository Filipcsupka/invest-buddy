import type pg from "pg";
import { getEntitlement, type Entitlement } from "@/db/entitlements";
import { TRIAL_DAYS } from "@/auth/trial";

export type Plan = "free" | "plus" | "trial";
export type PlanState = { plan: Plan; endsAt: Date | null };

/**
 * The plan a resolved entitlement gives. A trial is the manual Plus row grantFirstTrial writes:
 * exactly TRIAL_DAYS long with an end date. getEntitlement already returns Free once it ends.
 */
export function planFor(entitlement: Pick<Entitlement, "tier" | "source" | "startsAt" | "endsAt">): PlanState {
  if (entitlement.tier !== "plus") return { plan: "free", endsAt: null };
  const { source, startsAt, endsAt } = entitlement;
  const trial = source === "manual" && startsAt !== null && endsAt !== null && endsAt.getTime() - startsAt.getTime() === TRIAL_DAYS * 86_400_000;
  return { plan: trial ? "trial" : "plus", endsAt };
}

/** One indexed read per call. Callers cache it per request through the viewer, never in a shared cache. */
export async function customerPlan(db: Pick<pg.Pool, "query">, userId: string, at = new Date()): Promise<PlanState> {
  return planFor(await getEntitlement(db, userId, at));
}
