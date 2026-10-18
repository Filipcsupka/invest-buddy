import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
vi.mock("@/db/pool", () => ({ getPool: () => ({ query }) }));
vi.mock("react", async (importOriginal) => ({ ...await importOriginal<typeof import("react")>(), cache: (fn: unknown) => fn }));

describe("public horizon observations", () => {
  const originalMode = process.env.DATA_MODE;
  beforeEach(() => { query.mockReset(); delete process.env.DATA_MODE; });
  afterEach(() => { if (originalMode === undefined) delete process.env.DATA_MODE; else process.env.DATA_MODE = originalMode; });

  it("uses computed observed profiles and does not join owner overrides", async () => {
    query.mockResolvedValue({ rows: [{ ticker: "AAA", observed_profile: "sustained", input_values: { atrPercent: 3 } }] });
    const { publicHorizons } = await import("./public-horizons");
    expect(await publicHorizons()).toEqual({ AAA: { ticker: "AAA", profile: "sustained", values: { atrPercent: 3 } } });
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain("kind='computed'");
    expect(sql).toContain("observed_profile");
    expect(sql).not.toContain("override");
  });

  it("leaves fixture profiles empty", async () => {
    process.env.DATA_MODE = "fixture";
    const { publicHorizons } = await import("./public-horizons");
    expect(await publicHorizons()).toEqual({});
    expect(query).not.toHaveBeenCalled();
  });
});
