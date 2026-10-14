import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const revalidateTag = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidateTag, unstable_cache: (fn: unknown) => fn }));
import { POST } from "./route";

const req = (auth?: string, body?: string) => new Request("http://localhost/api/revalidate", { method: "POST", headers: auth ? { authorization: auth } : {}, body });
const original = process.env.INGEST_TOKEN;
beforeEach(() => { process.env.INGEST_TOKEN = "secret"; revalidateTag.mockClear(); });
afterEach(() => { if (original === undefined) delete process.env.INGEST_TOKEN; else process.env.INGEST_TOKEN = original; });

describe("POST /api/revalidate", () => {
  it("returns 401 without a token", async () => {
    expect((await POST(req())).status).toBe(401);
    expect((await POST(req("Bearer wrong"))).status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
  it("returns 503 when INGEST_TOKEN is unset", async () => {
    delete process.env.INGEST_TOKEN;
    expect((await POST(req("Bearer secret"))).status).toBe(503);
  });
  it("returns 200 and purges every tag with a token", async () => {
    const res = await POST(req("Bearer secret"));
    expect(res.status).toBe(200);
    expect(revalidateTag.mock.calls.map((c) => c[0]).sort()).toEqual(["ideas", "portfolio", "scores"]);
  });
  it("purges only the tags asked for and rejects unknown ones", async () => {
    expect((await POST(req("Bearer secret", JSON.stringify({ tags: ["scores"] })))).status).toBe(200);
    expect(revalidateTag.mock.calls.map((c) => c[0])).toEqual(["scores"]);
    expect((await POST(req("Bearer secret", JSON.stringify({ tags: ["x"] })))).status).toBe(400);
  });
  it("rejects a body over 1 KB", async () => {
    expect((await POST(req("Bearer secret", JSON.stringify({ tags: ["scores"], pad: "x".repeat(2000) })))).status).toBe(413);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
