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

test("ETF prompt names the output schema file", () => {
  assert.match(read(promptPath), /etf-output\.schema\.json/);
});

test("ETF prompt says to use null instead of guessing", () => {
  const prompt = read(promptPath);
  assert.match(prompt, /null instead of guessing/i);
  assert.match(prompt, /never invent[^.]*price/i, "forbids invented prices");
});

test("ETF prompt requires verbatim, machine-checked quotes", () => {
  const prompt = read(promptPath);
  assert.match(prompt, /quote[^.]*verbatim/i, "quote copied verbatim");
  assert.match(prompt, /machine-checked/i);
  assert.match(prompt, /unverified/i, "says what happens when a quote is not found");
});

test("ETF prompt mentions every required candidate field and evidence claim", () => {
  const prompt = read(promptPath);
  const item = JSON.parse(read(schemaPath)).properties.candidates.items;
  for (const field of item.required) assert.ok(prompt.includes(`\`${field}\``) || prompt.includes(`\`${field}.`), `mentions ${field}`);
  for (const claim of item.properties.evidence.items.properties.claim.enum) assert.ok(prompt.includes(`\`${claim}\``), `lists claim ${claim}`);
  for (const assetClass of item.properties.assetClass.enum) assert.ok(prompt.includes(`\`${assetClass}\``), `lists asset class ${assetClass}`);
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
