import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { errorStack, writeHttpLog } from "./api/ingest/request-log";

/** Log a page invocation with only bounded route metadata and safe error details. */
export function withPageLog<P extends { params: Promise<{ locale: string }> }, R>(route: string, render: (props: P) => Promise<R>): (props: P) => Promise<R> {
  return async (props) => {
    const start = performance.now();
    const { locale } = await props.params;
    let requestId: string = randomUUID();
    try { requestId = (await headers()).get("x-request-id") ?? requestId; } catch { /* Direct component tests have no request context. */ }
    try {
      const result = await render(props);
      writeHttpLog({ route, locale, status: 200, durationMs: Math.round(performance.now() - start), requestId });
      return result;
    } catch (error) {
      const digest = error instanceof Error && "digest" in error ? String(error.digest) : "";
      const redirectStatus = digest.startsWith("NEXT_REDIRECT;") ? Number(/;(\d{3});?$/.exec(digest)?.[1]) : NaN;
      const status = digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404") ? 404 : Number.isFinite(redirectStatus) ? redirectStatus : 500;
      // Error messages may contain submitted data or credentials. Log a fixed message and frame locations only.
      const message = status === 404 ? "Page not found" : status >= 300 && status < 400 ? "Page redirected" : "Page render failed";
      const stack = errorStack(error);
      writeHttpLog({ route, locale, status, durationMs: Math.round(performance.now() - start), requestId, message, ...(stack ? { stack } : {}) }, true);
      throw error;
    }
  };
}
