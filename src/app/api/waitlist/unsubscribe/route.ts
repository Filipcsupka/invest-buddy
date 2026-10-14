import { logIngestRequest } from "../../ingest/request-log";
import { createUnsubscribeHandler } from "@/waitlist/link-handlers";
import { waitlistDeps } from "@/waitlist/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handle = createUnsubscribeHandler(waitlistDeps);

/** One-click unsubscribe (List-Unsubscribe-Post) and the unsubscribe page button. Behind the WAITLIST flag. */
export const POST = (request: Request) => logIngestRequest("/api/waitlist/unsubscribe", request, () => handle(request));
