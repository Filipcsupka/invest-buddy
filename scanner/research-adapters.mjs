import { runCli } from "./run-scan.mjs";
import { usageFromEnvelope } from "./extraction-log.mjs";
import { attachClaudeUsage, attachCliUsage, cutoffError } from "./anthropic-cutoff.mjs";

const countTools = (envelope) => {
  // Claude's JSON envelope does not always include the tool transcript.
  if (Number.isInteger(envelope?.web_searches) && Number.isInteger(envelope?.web_fetches)) return { webSearches: envelope.web_searches, webFetches: envelope.web_fetches };
  const calls = envelope?.tool_uses ?? envelope?.toolUses ?? envelope?.messages;
  if (!Array.isArray(calls)) return { webSearches: null, webFetches: null };
  const names = [];
  const visit = (v) => {
    if (Array.isArray(v)) return v.forEach(visit);
    if (!v || typeof v !== "object") return;
    if ((v.type === "tool_use" || v.name === "WebSearch" || v.name === "WebFetch") && typeof v.name === "string") names.push(v.name);
    for (const [key, value] of Object.entries(v)) if (key !== "input" && key !== "result") visit(value);
  };
  visit(calls);
  return { webSearches: names.filter((n) => n === "WebSearch").length, webFetches: names.filter((n) => n === "WebFetch").length };
};

export const claudeResearchAdapter = {
  name: "claude",
  available(env = process.env) {
    return env.CLAUDE_CODE_OAUTH_TOKEN || env.ANTHROPIC_API_KEY || env.CLAUDE_CONFIG_DIR
      ? { ok: true, reason: null } : { ok: false, reason: "Claude auth is unavailable" };
  },
  async quota() { return null; }, // RS5 owns live quota inspection.
  async run({ prompt, model = "sonnet", maxTurns, timeoutMs, workDir }) {
    const args = ["-p", "--output-format", "json", "--no-session-persistence", "--permission-mode", "dontAsk", "--tools", "WebSearch,WebFetch", "--allowedTools", "WebSearch,WebFetch", "--max-turns", String(maxTurns), "--model", model];
    let stdout;
    try { ({ out: stdout } = await runCli("claude", args, prompt, { timeoutMs, cwd: workDir })); }
    catch (error) {
      let parsed;
      try { parsed = JSON.parse(error.stdout); } catch { /* CLI text */ }
      // A valid result can mention production capacity or limits as a research fact.
      const cutoffInput = parsed?.type === "result" && !parsed.is_error && !parsed.error ? { stderr: error.stderr, message: error.message } : error;
      throw cutoffError(cutoffInput) ?? attachCliUsage(error);
    }
    let envelope;
    try { envelope = JSON.parse(stdout); } catch { throw new Error("claude output is not JSON"); }
    if (envelope.is_error || envelope.type === "error" || envelope.error) {
      throw cutoffError(envelope) ?? attachClaudeUsage(new Error(`claude error: ${String(envelope.result ?? envelope.error?.message ?? envelope.subtype ?? "unknown").slice(0, 200)}`), envelope);
    }
    if (Array.isArray(envelope.permission_denials) && envelope.permission_denials.length) throw attachClaudeUsage(new Error("claude attempted a tool that is not allowed"), envelope);
    if (Number.isInteger(envelope.num_turns) && envelope.num_turns > maxTurns) throw attachClaudeUsage(new Error("claude exceeded max turns"), envelope);
    return { text: envelope.result, usage: usageFromEnvelope(envelope), ...countTools(envelope), costUsd: typeof envelope.total_cost_usd === "number" ? envelope.total_cost_usd : null, cutoff: null, model: Object.keys(envelope.modelUsage ?? {})[0] || model };
  },
};

export function researchAdapter(name = "claude") {
  if (name === "claude") return claudeResearchAdapter;
  if (name === "codex") throw new Error("Research Codex adapter is not available until RS7");
  throw new Error(`Unknown research adapter: ${name}`);
}
