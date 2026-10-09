import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The scanner image copies files by name. A local import that is not copied crashes the job at start.
test("every relative import of the scanner entry points is copied into the image", () => {
  const dockerfile = readFileSync(new URL("../Dockerfile", import.meta.url), "utf8");
  const copied = new Set(dockerfile.split("\n").filter((l) => l.startsWith("COPY scanner/")).flatMap((l) => l.split(/\s+/).slice(1, -1)).map((p) => p.replace(/^scanner\//, "")));
  const seen = new Set(["run-scan.mjs", "run-extract.mjs", "run-judge.mjs"]);
  const queue = [...seen];
  const missing = [];
  while (queue.length) {
    const file = queue.pop();
    assert.ok(copied.has(file), `${file} is not in the scanner Dockerfile COPY list`);
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    for (const match of source.matchAll(/from\s+["']\.\/([\w.-]+\.mjs)["']/g)) if (!seen.has(match[1])) { seen.add(match[1]); queue.push(match[1]); }
  }
  assert.deepEqual(missing, []);
});
