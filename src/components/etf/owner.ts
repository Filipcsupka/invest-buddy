import { headers } from "next/headers";
import { marketsViewable } from "@/markets/gate";

/** Non-throwing owner check for the public ETF pages: vendor sections render only for the authenticated owner. */
export async function etfOwnerView(): Promise<boolean> {
  try { return marketsViewable((await headers()).get("authorization")); } catch { return false; }
}
