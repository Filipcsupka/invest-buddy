import { randomUUID } from "node:crypto";

const failureReasons = new Set([
  "Ingest unavailable", "Unauthorized", "Database unavailable", "Invalid query",
  "Invalid body", "Invalid JSON", "Invalid scan", "Payload too large",
  "Rate limit exceeded", "Budget unavailable", "Unknown symbol",
  "asOf must be YYYY-MM-DD", "maxSymbols must be 1-40", "days must be 1-365",
]);
const caughtStacks = new WeakMap<Request, string>();

function errorStack(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  // Stack messages can contain submitted data. Keep only frame locations.
  return error.stack?.split("\n").slice(1).filter((line) => /^\s*at\s/.test(line)).join("\n");
}

export function recordIngestError(request: Request, error: unknown): void {
  const stack = errorStack(error);
  if (stack) caughtStacks.set(request, stack);
}

export async function logIngestRequest(route: string, request: Request, handle: () => Promise<Response>): Promise<Response> {
  const requestId = randomUUID();
  const start = performance.now();
  try {
    const response = await handle();
    response.headers.set("x-request-id", requestId);
    let reason: string | undefined;
    if (response.status >= 400) {
      try {
        const body = await response.clone().json() as { error?: unknown };
        if (typeof body.error === "string" && failureReasons.has(body.error)) reason = body.error;
      } catch { /* A non-JSON failure still gets its status. */ }
    }
    const stack = caughtStacks.get(request);
    caughtStacks.delete(request);
    process.stdout.write(`${JSON.stringify({ event: "http_request", route, method: request.method, status: response.status, durationMs: Math.round(performance.now() - start), requestId, ...(reason ? { reason } : {}), ...(stack ? { stack } : {}) })}\n`);
    return response;
  } catch (error) {
    caughtStacks.delete(request);
    process.stderr.write(`${JSON.stringify({ event: "http_request", route, method: request.method, status: 500, durationMs: Math.round(performance.now() - start), requestId, reason: "Unhandled error", stack: errorStack(error) })}\n`);
    throw error;
  }
}
