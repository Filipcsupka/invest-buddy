import { logIngestRequest } from "../../ingest/request-log";
import { createConfirmHandler } from "@/waitlist/link-handlers";
import { waitlistDeps } from "@/waitlist/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handle = createConfirmHandler(waitlistDeps);

/** Confirm button on the confirm page. Behind the WAITLIST flag. */
export const POST = (request: Request) => logIngestRequest("/api/waitlist/confirm", request, () => handle(request));
