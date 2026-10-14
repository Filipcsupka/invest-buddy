import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RULES_SNAPSHOT, RULESET_VERSION } from "./rules";

/** Hash of RULES_SNAPSHOT per ruleset version. Change a rule value: bump the version, add the new pair here and a changelog entry. */
const KNOWN_HASHES: Record<string, string> = {
  "2026-10-11.2+2026-10-14.3": "1e7a969e2afa65307469507dd37a5073e14759dd686a40181235830c877b02f3",
};

/** JSON with object keys sorted, so a reordered key does not change the hash. */
const stableStringify = (value: unknown): string =>
  Array.isArray(value) ? `[${value.map(stableStringify).join(",")}]`
  : value && typeof value === "object" ? `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(",")}}`
  : JSON.stringify(value) ?? "null";

const hash = (value: unknown) => createHash("sha256").update(stableStringify(value)).digest("hex");

describe("rules config", () => {
  it("has a hash for the current version, so a changed value needs a version bump", () => {
    expect(KNOWN_HASHES[RULESET_VERSION], `no hash recorded for ${RULESET_VERSION}`).toBeDefined();
    expect(hash(RULES_SNAPSHOT)).toBe(KNOWN_HASHES[RULESET_VERSION]);
  });
  it("has a changelog entry for the current version", () => {
    const changelog = readFileSync(join(__dirname, "../../docs/rules-changelog.md"), "utf8");
    expect(changelog).toContain(`\`${RULESET_VERSION}\``);
  });
  it("combines the score and signal versions", () => {
    expect(RULESET_VERSION).toBe(`${RULES_SNAPSHOT.scoreRulesVersion}+${RULES_SNAPSHOT.signalRules.version}`);
  });
});
