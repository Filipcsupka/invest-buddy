import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, it } from "vitest";

// Next turns every export of a "use client" module into a client reference on the server. A server page may render
// such an export as a JSX element, but calling it throws at render time, which vitest does not reproduce.
const dir = "src/app/[locale]/(app)/indices";
const moduleFile = (from: string, spec: string) => [".tsx", ".ts"].map((ext) => resolve(dirname(from), spec) + ext).find(existsSync);

it.each(["page.tsx", "[symbol]/page.tsx"])("%s uses values from client modules only as JSX elements", (page) => {
  const file = `${dir}/${page}`;
  const source = readFileSync(file, "utf8");
  const body = source.replace(/^import .*$/gm, "");
  for (const [, names, spec] of source.matchAll(/^import \{([^}]*)\} from "(\.[^"]+)";$/gm)) {
    const target = moduleFile(file, spec!);
    if (!target || !/^["']use client["']/.test(readFileSync(target, "utf8"))) continue;
    for (const name of names!.split(",").map((part) => part.trim()).filter((part) => part && !part.startsWith("type "))) {
      const uses = [...body.matchAll(new RegExp(`(<\\/?)?\\b${name}\\b`, "g"))];
      expect(uses.filter((use) => !use[1]).map((use) => use[0]), `${name} from ${spec}`).toEqual([]);
    }
  }
});
