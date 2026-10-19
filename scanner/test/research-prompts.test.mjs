import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const types = readFileSync(join(root, "src/research/types.ts"), "utf8");

// Read the validator's own table rather than keeping a second list of field/kind pairs in the test.
const fieldBlock = types.match(/const FIELD_KINDS:[^=]+=\s*\{([^}]*)\};/)?.[1];
assert.ok(fieldBlock, "FIELD_KINDS table is readable");
const fieldKinds = Object.fromEntries([...fieldBlock.matchAll(/^\s*(\w+):\s*(\[[^\]]+\]),?$/gm)]
  .map(([, field, kinds]) => [field, JSON.parse(kinds)]));
const fields = JSON.parse(types.match(/export const SCORE_FIELDS = (\[[^\]]+\]) as const;/)?.[1] ?? "null");
assert.deepEqual(Object.keys(fieldKinds).sort(), fields.sort(), "FIELD_KINDS covers every score field");

const polarityBlock = types.match(/const FIELD_POLARITY:[^=]+=\s*\{([^}]*)\};/)?.[1];
assert.ok(polarityBlock, "FIELD_POLARITY table is readable");
const fieldPolarity = Object.fromEntries([...polarityBlock.matchAll(/(\w+):\s*"([^"]+)"/g)]
  .map(([, field, polarity]) => [field, polarity]));

for (const name of ["research-daily.md", "research-weekly.md", "research-deepdive.md"]) {
  test(`${name} lists every validator field/kind pair and polarity`, () => {
    const prompt = readFileSync(join(root, "scanner/prompts", name), "utf8");
    const section = prompt.match(/## Score fields\n([\s\S]*?)(?=\n## |$)/)?.[1];
    assert.ok(section, "Score fields section is present");
    const rows = Object.fromEntries([...section.matchAll(/^- `([^`]+)`: (.+)$/gm)]
      .map(([, field, rule]) => [field, rule]));
    assert.deepEqual(Object.keys(rows).sort(), fields, "one row per score field");
    for (const [field, kinds] of Object.entries(fieldKinds)) {
      const [kindText, polarityText] = rows[field].split("; polarity ");
      assert.ok(polarityText, `${field} has a polarity rule`);
      assert.deepEqual([...kindText.matchAll(/`([^`]+)`/g)].map((m) => m[1]), kinds, `${field} kinds match FIELD_KINDS`);
      const allowed = fieldPolarity[field] ? [fieldPolarity[field]] : ["positive", "negative", "neutral"];
      assert.deepEqual([...polarityText.matchAll(/`([^`]+)`/g)].map((m) => m[1]), allowed, `${field} polarity matches FIELD_POLARITY`);
    }
  });
}
