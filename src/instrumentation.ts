import type { Instrumentation } from "next";

/** React may fail after a page function returns; capture those server render failures too. */
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  if (context.routeType !== "render") return;
  const route = context.routePath;
  const locale = /^\/(en|sk)(?:\/|$)/.exec(request.path)?.[1] ?? null;
  const requestId = request.headers["x-request-id"];
  const start = Number(request.headers["x-request-start-ms"]);
  const durationMs = Number.isFinite(start) && start > 0 ? Math.max(0, Date.now() - start) : 0;
  const stack = error instanceof Error ? error.stack?.split("\n").slice(1).filter((line: string) => /^\s*at\s/.test(line)).join("\n") : undefined;
  console.error(JSON.stringify({ event: "http_request", route, locale, status: 500, durationMs, requestId, message: "Page render failed", ...(stack ? { stack } : {}) }));
};
