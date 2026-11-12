import { notFound } from "next/navigation";
import { flags } from "@/config/flags";
import { getViewer } from "@/viewer/get-viewer";
import { canUseVendorData, isOwner, type Viewer } from "@/viewer/viewer";

/** Market data requires an owner session or an active Plus entitlement. */
export function marketsViewable(viewer: Viewer, env: Record<string, string | undefined> = process.env): boolean {
  return flags(env).MARKETS_VIEWS && !viewer.preview && canUseVendorData(viewer, env) && (isOwner(viewer) || Boolean(viewer.userId && (viewer.plan === "plus" || viewer.plan === "trial")));
}

export async function assertViewable(source = "eodhd"): Promise<void> {
  // Source is accepted for collector-specific page loaders.
  if (source.length === 0 || !marketsViewable(await getViewer())) notFound();
}
