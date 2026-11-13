import { describe, expect, it } from "vitest";
import { safeMessage } from "./safe-message";

describe("safeMessage", () => {
  it.each(["api_token", "api_key", "access_token", "clientToken", "private-key", "key", "token", "t", "q"])("redacts %s query parameters", (name) => {
    expect(safeMessage(`https://example.test/?${name}=credential&ok=yes`)).toBe(`https://example.test/?${name}=[redacted]&ok=yes`);
    expect(safeMessage(`failed ${name}=credential`)).not.toContain("credential");
  });
  it("bounds messages, strips line breaks and removes bearer credentials", () => {
    const message = safeMessage(`failed\nBearer credential ${"x".repeat(300)}`);
    expect(message).not.toContain("credential");
    expect(message).not.toContain("\n");
    expect(message).toHaveLength(200);
  });
});
