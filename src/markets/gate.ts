import { notFound } from "next/navigation";
import { flags } from "@/config/flags";
import { getViewer, isOwner, type Viewer } from "@/viewer/get-viewer";

/** Market views are owner-only (session user id in OWNER_USER_IDS). A feature flag never authenticates a visitor. */
export function marketsViewable(viewer: Pick<Viewer, "owner">, env: Record<string, string | undefined> = process.env): boolean {
  return flags(env).MARKETS_VIEWS && isOwner(viewer);
}

export async function assertViewable(source = "eodhd"): Promise<void> {
  // Source is accepted for collector-specific page loaders; every market view stays owner-only until display rights are cleared.
  if (source.length === 0 || !marketsViewable(await getViewer())) notFound();
}
