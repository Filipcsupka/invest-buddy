import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RULES_SNAPSHOT, RULESET_VERSION } from "./rules";

/** Hash of RULES_SNAPSHOT per ruleset version. Change a rule value: bump the version, add the new pair here and a changelog entry. */
const KNOWN_HASHES: Record<string, string> = {
  "2026-10-11.2+2026-10-14.3": "8367de5800418f616fe4ed8e5ee3069864f684d82853c48f0d115881e032aea3",
};

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

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
