import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { flags } from "@/config/flags";
import { ownerAuthorized } from "@/app/[locale]/owner/auth";

/** The same owner password used by /owner/research. A feature flag never authenticates a visitor. */
export function marketsViewable(authorization: string | null, env: Record<string, string | undefined> = process.env): boolean {
  return flags(env).MARKETS_VIEWS && ownerAuthorized(authorization, env.OWNER_RESEARCH_PASSWORD);
}

export async function assertViewable(source = "eodhd"): Promise<void> {
  // Source is accepted for collector-specific page loaders; every market view stays owner-only until display rights are cleared.
  if (source.length === 0 || !marketsViewable((await headers()).get("authorization"))) notFound();
}
