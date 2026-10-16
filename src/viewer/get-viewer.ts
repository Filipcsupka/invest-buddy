import { headers } from "next/headers";
import { flags } from "@/config/flags";
import { PREVIEW_HEADER, resolveViewer, type Viewer } from "./viewer";

export { baseViewer, canSee, limitFor, resolveViewer, PREVIEW_HEADER, type Tier, type Viewer } from "./viewer";

/** Viewer of the current request. Reads the proxy's preview header; outside a request (direct component tests) there is none. */
export async function getViewer(): Promise<Viewer> {
  let view: string | null = null;
  try { view = (await headers()).get(PREVIEW_HEADER); } catch { /* No request context. */ }
  return resolveViewer(flags(), view);
}
