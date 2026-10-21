import { join } from "node:path";
import { expect, it } from "vitest";
import { importAiCardsFile } from "./ai-cards-import";

it("previews the sample without a database connection", async () => {
  const result = await importAiCardsFile(join(process.cwd(), "src/ai-cards/__fixtures__/sample.txt"), true);
  expect(result).toEqual({ parsed: 5, inserted: 0, duplicate: 0 });
});
