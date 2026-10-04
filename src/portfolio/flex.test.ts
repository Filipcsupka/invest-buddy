import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { FlexService } from "./flex";
import { normalizeFlex, tradingDayAfter } from "./model";
import { MemoryPortfolioRepository } from "../db/portfolio";

const fixture = new URL("./fixtures/flex.xml", import.meta.url);

describe("Flex portfolio", () => {
  it("polls retry codes without exposing credentials", async () => {
    const urls: string[] = [];
    let calls = 0;
    const transport = async (url: string) => {
      urls.push(url);
      calls++;
      if (calls === 1) return '<FlexStatementResponse><Status>Success</Status><ReferenceCode>REF</ReferenceCode></FlexStatementResponse>';
      if (calls === 2) return '<FlexStatementResponse><ErrorCode>1019</ErrorCode></FlexStatementResponse>';
      return readFile(fixture, "utf8");
    };
    expect(await new FlexService("SECRET", "QUERY", transport, async () => {}).statement()).toContain("FlexQueryResponse");
    expect(urls).toHaveLength(3);
    expect(urls[0]).toContain("SendRequest");
    expect(urls[1]).toContain("GetStatement");
  });

  it("publishes only weights, rebased NAV, TWR and benchmark", async () => {
    const xml = await readFile(fixture, "utf8");
    const provider = { bars: async () => [
      { date: "2025-08-07", open: 100, high: 100, low: 100, close: 100, volume: 1 },
      { date: "2025-08-08", open: 101, high: 101, low: 101, close: 101, volume: 1 },
    ] };
    const snapshot = await normalizeFlex(xml, provider);
    expect(snapshot.publishOn).toBe("2025-08-11");
    expect(snapshot.weights).toEqual([{ symbol: "NVDA", weightPercent: 60 }, { symbol: "MSFT", weightPercent: 40 }]);
    expect(snapshot.series[1]).toMatchObject({ nav: 101.5, twrPercent: 1.5, benchmark: 101 });
    expect(JSON.stringify(snapshot)).not.toMatch(/PRIVATE-ACCOUNT|120000|80000|190000|deposit|CASH/);
    const repository = new MemoryPortfolioRepository();
    await repository.save(snapshot);
    expect(await repository.latestPublished("2025-08-10")).toBeNull();
    expect(await repository.latestPublished("2025-08-11")).toEqual(snapshot);
    await expect(normalizeFlex("<bad>", provider)).rejects.toThrow();
    expect(await repository.latestPublished("2025-08-11")).toEqual(snapshot);
    expect(tradingDayAfter("2025-08-08")).toBe("2025-08-11");
  });
});
