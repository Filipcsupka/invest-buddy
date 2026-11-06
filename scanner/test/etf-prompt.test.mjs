import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const promptPath = join(root, "scanner/prompts/etf-research.md");
const docsPath = join(root, "docs/etf-research.md");
const schemaPath = join(root, "scanner/schema/etf-output.schema.json");

const read = (path) => readFileSync(path, "utf8");
const placeholdersIn = (text) => new Set([...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]));

// The docs list the runner's placeholders as table rows that start with | `{{name}}` |.
function documentedPlaceholders() {
  const section = read(docsPath).match(/## Placeholders\n([\s\S]*?)(?=\n## |$)/)?.[1];
  assert.ok(section, "docs/etf-research.md has a Placeholders section");
  return new Set([...section.matchAll(/^\| `\{\{(\w+)\}\}`/gm)].map((m) => m[1]));
}

test("ETF prompt file exists", () => {
  assert.ok(existsSync(promptPath), "scanner/prompts/etf-research.md exists");
  assert.ok(read(promptPath).trim().length > 0, "prompt is not empty");
});

test("ETF prompt names the three calls", () => {
  const prompt = read(promptPath);
  for (const call of ["BUY_ZONE", "WATCH", "AVOID"]) assert.match(prompt, new RegExp(`\\b${call}\\b`), `mentions ${call}`);
});

test("ETF prompt calls match the schema enum", () => {
  const schema = JSON.parse(read(schemaPath));
  assert.deepEqual(schema.properties.candidates.items.properties.call.enum, ["BUY_ZONE", "WATCH", "AVOID"]);
});

test("ETF prompt uses stored data without web research", () => {
  const prompt = read(promptPath);
  assert.match(prompt, /no web access/i);
  assert.match(prompt, /stored catalog rows/i);
  assert.match(prompt, /null/);
  assert.match(prompt, /do not[^.]*invent a price/i);
  assert.match(prompt, /evidence to an empty array/i);
  assert.doesNotMatch(prompt, /browse the web|use issuer fund pages|fresh news/i);
});

test("ETF prompt names every model decision and copied catalog field", () => {
  const prompt = read(promptPath);
  for (const field of ["symbol", "exchange", "name", "ISIN", "assetClass", "region", "cost", "price", "evidence", "call", "conviction", "thesis", "whatHappened", "whyItMatters", "plan", "risks"])
    assert.ok(prompt.toLowerCase().includes(field.toLowerCase()), `mentions ${field}`);
});

test("ETF prompt has no worked example output", () => {
  const prompt = read(promptPath);
  assert.doesNotMatch(prompt, /```/, "no fenced block");
  assert.doesNotMatch(prompt, /\{\s*"(asOf|candidates|symbol)"/, "no inline JSON example");
});

test("every documented placeholder appears in the prompt, and no others", () => {
  const documented = documentedPlaceholders();
  assert.ok(documented.size > 0, "docs list at least one placeholder");
  assert.ok(documented.has("asOf"), "asOf is documented");
  const used = placeholdersIn(read(promptPath));
  for (const name of documented) assert.ok(used.has(name), `{{${name}}} appears in the prompt`);
  for (const name of used) assert.ok(documented.has(name), `{{${name}}} is listed in docs/etf-research.md`);
});
