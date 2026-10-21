/** Research runs stop before the provider call only when the owner disables them. */
export async function checkResearchCaps({ env = process.env } = {}) {
  if (env.RESEARCH_ENABLED !== "on") return { ok: false, status: "killed", reason: "RESEARCH_ENABLED is not on" };
  return { ok: true, status: "ok", reason: null };
}
