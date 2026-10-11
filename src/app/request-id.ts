import { randomUUID } from "node:crypto";

const accepted = /^[A-Za-z0-9._-]{8,64}$/;

/** Keep a well-formed id from the proxy or caller; otherwise make one. Odd values never reach logs. */
export function resolveRequestId(headers: Headers): string {
  const incoming = headers.get("x-request-id")?.trim();
  return incoming && accepted.test(incoming) ? incoming : randomUUID();
}
