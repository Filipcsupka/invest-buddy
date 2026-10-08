import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

/** Correlate page logs with browser responses without copying request contents into logs. */
export function proxy(request: NextRequest) {
  const requestId = randomUUID();
  const incoming = new Headers(request.headers);
  incoming.set("x-request-id", requestId);
  incoming.set("x-request-start-ms", String(Date.now()));
  const response = NextResponse.next({ request: { headers: incoming } });
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = { matcher: ["/", "/(en|sk)/:path*"] };
