import { afterEach, expect, it, vi } from "vitest";
import { onRequestError } from "./instrumentation";

afterEach(() => vi.restoreAllMocks());

it("records a server render failure without its sensitive message", async () => {
  const lines: string[] = [];
  vi.spyOn(console, "error").mockImplementation((line) => { lines.push(String(line)); });
  await onRequestError(new Error("secret-token"), { path: "/en/dashboard", headers: { "x-request-id": "req-1" } } as never, { routeType: "render", routePath: "/[locale]/dashboard" } as never);
  expect(lines).toHaveLength(1);
  expect(JSON.parse(lines[0])).toMatchObject({ event: "http_request", route: "/[locale]/dashboard", locale: "en", status: 500, requestId: "req-1", message: "Page render failed" });
  expect(lines[0]).not.toContain("secret-token");
});

it("does not duplicate route handler errors or health logs", async () => {
  const output = vi.spyOn(console, "error").mockImplementation(() => {});
  await onRequestError(new Error("failure"), { path: "/api/health", headers: {} } as never, { routeType: "route", routePath: "/api/health" } as never);
  expect(output).not.toHaveBeenCalled();
});
