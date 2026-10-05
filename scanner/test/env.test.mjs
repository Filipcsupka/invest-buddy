import test from "node:test";
import assert from "node:assert/strict";
import { agentEnv } from "../run-scan.mjs";

// USER is needed on macOS: the claude CLI looks up its login in the keychain by user name and reports "Not logged in" without it.
test("agent environment contains only CLI requirements", () => {
  assert.deepEqual(agentEnv({ PATH: "/bin", HOME: "/home/x", CODEX_HOME: "/auth", INGEST_TOKEN: "secret", DATABASE_URL: "secret", CLAUDE_CODE_OAUTH_TOKEN: "auth", HTTPS_PROXY: "proxy", LC_CTYPE: "UTF-8", USER: "filip" }), { PATH: "/bin", HOME: "/home/x", CODEX_HOME: "/auth", CLAUDE_CODE_OAUTH_TOKEN: "auth", HTTPS_PROXY: "proxy", LC_CTYPE: "UTF-8", USER: "filip" });
});
