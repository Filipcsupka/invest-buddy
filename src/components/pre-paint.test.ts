import { expect, it } from "vitest";
import { sideScript, themeScript } from "./pre-paint";

it("exports plain strings so the server layout can inline them", () => {
  expect(typeof themeScript).toBe("string");
  expect(typeof sideScript).toBe("string");
});

it("reads only the stored values it knows and guards storage", () => {
  expect(themeScript).toContain('localStorage.getItem("ib-theme")');
  expect(sideScript).toContain('localStorage.getItem("ib-side")');
  expect(sideScript).toMatch(/v==="full"\|\|v==="rail"/);
  for (const script of [themeScript, sideScript]) expect(script).toMatch(/^try\{.*\}catch\(e\)\{\}$/);
  // Run it against a stub document: a stored rail choice lands on <html data-side>.
  const doc = { documentElement: { dataset: {} as Record<string, string> } };
  new Function("localStorage", "document", sideScript)({ getItem: () => "rail" }, doc);
  expect(doc.documentElement.dataset.side).toBe("rail");
  new Function("localStorage", "document", sideScript)({ getItem: () => { throw new Error("blocked"); } }, { documentElement: { dataset: {} } });
});
