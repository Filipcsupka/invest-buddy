import { logIngestRequest } from "../ingest/request-log";
import { createSignupHandler } from "@/waitlist/handlers";
import { waitlistDeps } from "@/waitlist/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handle = createSignupHandler(waitlistDeps);

/** Public waitlist sign-up (double opt-in). Behind the WAITLIST flag. */
export const POST = (request: Request) => logIngestRequest("/api/waitlist", request, () => handle(request));
