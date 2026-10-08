import { afterEach, expect, it, vi } from "vitest";
import { withPageLog } from "./page-log";

const props = { params: Promise.resolve({ locale: "en" }) };
afterEach(() => vi.restoreAllMocks());

it("logs one structured line for a successful page", async () => {
  const lines: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((line) => { lines.push(String(line)); return true; });
  expect(await withPageLog("/dashboard", async () => "ok")(props)).toBe("ok");
  expect(lines).toHaveLength(1);
  expect(JSON.parse(lines[0])).toMatchObject({ event: "http_request", route: "/dashboard", locale: "en", status: 200, requestId: expect.any(String), durationMs: expect.any(Number) });
});

it("logs a failed render with frames and no secret from the error", async () => {
  const lines: string[] = [];
  vi.spyOn(process.stderr, "write").mockImplementation((line) => { lines.push(String(line)); return true; });
  await expect(withPageLog("/dashboard", async () => { throw new Error("secret-token and sensitive-body"); })(props)).rejects.toThrow("secret-token");
  expect(lines).toHaveLength(1);
  const entry = JSON.parse(lines[0]);
  expect(entry).toMatchObject({ route: "/dashboard", locale: "en", status: 500, message: "Page render failed" });
  expect(entry.stack).toContain("at ");
  expect(lines.join("")).not.toMatch(/secret-token|sensitive-body/);
});

it("records a permanent redirect with its actual status", async () => {
  const lines: string[] = [];
  vi.spyOn(process.stderr, "write").mockImplementation((line) => { lines.push(String(line)); return true; });
  const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/en/dashboard;308;" });
  await expect(withPageLog("/scanner", async () => { throw redirect; })(props)).rejects.toBe(redirect);
  expect(JSON.parse(lines[0])).toMatchObject({ status: 308, message: "Page redirected" });
});
