import { expect, it } from "vitest";
import { resolveSource } from "./source";

it("prefers utm_source, then ref, then the fallback", () => {
  expect(resolveSource({ utm_source: "Newsletter", ref: "x" }, "landing")).toBe("newsletter");
  expect(resolveSource({ ref: "friend_1" }, "landing")).toBe("friend_1");
  expect(resolveSource({}, "landing")).toBe("landing");
  expect(resolveSource(undefined, "pricing")).toBe("pricing");
});

it("rejects values outside ^[a-z0-9_-]{1,32}$", () => {
  for (const bad of ["a b", "x".repeat(33), "<script>", "a@b.co", ""]) expect(resolveSource({ utm_source: bad }, "landing")).toBe("landing");
  expect(resolveSource({ utm_source: ["twitter", "x"] }, "landing")).toBe("twitter");
});
