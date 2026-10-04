import { createHash } from "node:crypto";
import { promises as dns } from "node:dns";
import { isIP } from "node:net";
import { get } from "node:https";

export const freshnessDays: Record<string, number> = {
  revenueAccelerating: 100, revenueDeclining: 100, epsBeat: 100,
  guidanceRaised: 100, guidanceCut: 100, productCatalyst: 30,
  insiderOrInstitutionalBuying: 60, narrativeChanged: 30,
  sectorRotationIntoGrowth: 30, dataTailwind: 30,
};
export interface EvidenceRef { claim: string; url: string; publishedAt?: string; fiscalPeriod?: string; quote?: string }
export type EvidenceVerifier = (entry: EvidenceRef, asOf: string) => Promise<boolean>;
const cache = new Map<string, string>();
let lastFetch = 0;
const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLocaleLowerCase("en");
function blocked(address: string): boolean {
  if (isIP(address) === 4) {
    const [a,b] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) ||
      (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  if (isIP(address) === 6) return /^(::|::1$|f[cd]|fe[89ab]|2001:db8)/i.test(address) || (address.toLowerCase().startsWith("::ffff:") && blocked(address.slice(7)));
  return true;
}
async function safeUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error("Unsafe evidence URL");
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((item) => blocked(item.address))) throw new Error("Unsafe evidence address");
  return { url, address: addresses[0].address };
}
async function fetchPage(raw: string): Promise<string> {
  let target = raw;
  for (let redirects = 0; redirects <= 3; redirects++) {
    const { url, address } = await safeUrl(target);
    const wait = Math.max(0, 250 - (Date.now() - lastFetch));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    lastFetch = Date.now();
    const response = await new Promise<{ status: number; location?: string; body?: string }>((resolve, reject) => {
      const request = get(url, {
        lookup: (_host, _options, callback) => callback(null, address, isIP(address)),
        headers: { "user-agent": "InvestBuddy-evidence/1.0 contact: research@filipcsupka.online", accept: "text/html,text/plain;q=0.9" },
      }, (incoming) => {
        const status = incoming.statusCode ?? 0;
        if ([301,302,303,307,308].includes(status)) { incoming.resume(); resolve({ status, location: incoming.headers.location }); return; }
        if (status < 200 || status >= 300) { incoming.resume(); reject(new Error(`Evidence HTTP ${status}`)); return; }
        if (Number(incoming.headers["content-length"] ?? 0) > 2_000_000) { incoming.destroy(); reject(new Error("Evidence too large")); return; }
        const chunks: Buffer[] = [];
        let size = 0;
        incoming.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 2_000_000) { incoming.destroy(); reject(new Error("Evidence too large")); return; }
          chunks.push(chunk);
        });
        incoming.on("end", () => resolve({ status, body: Buffer.concat(chunks).toString("utf8") }));
        incoming.on("error", reject);
      });
      request.setTimeout(8000, () => request.destroy(new Error("Evidence timeout")));
      request.on("error", reject);
    });
    if (response.location) {
      if (redirects === 3) throw new Error("Evidence redirect limit");
      target = new URL(response.location, url).href;
      continue;
    }
    return response.body ?? "";
  }
  throw new Error("Evidence redirect limit");
}
export const liveVerifier: EvidenceVerifier = async (entry, asOf) => {
  const field = entry.claim.split(".").at(-1) ?? "";
  const days = freshnessDays[field] ?? 30;
  if (!entry.publishedAt || !entry.fiscalPeriod || !entry.quote || !entry.url.startsWith("https://")) return false;
  const age = (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${entry.publishedAt}T00:00:00Z`)) / 86_400_000;
  if (!Number.isFinite(age) || age < 0 || age > days) return false;
  try {
    const key = `${asOf}:${createHash("sha256").update(entry.url).digest("hex")}`;
    let page = cache.get(key);
    if (!page) { page = await fetchPage(entry.url); cache.set(key, page); }
    return normalize(page.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")).includes(normalize(entry.quote));
  } catch { return false; }
};
export const offVerifier: EvidenceVerifier = async (entry, asOf) => {
  const field = entry.claim.split(".").at(-1) ?? "";
  const age = (Date.parse(asOf) - Date.parse(entry.publishedAt ?? "")) / 86_400_000;
  return !!entry.quote && !!entry.fiscalPeriod && Number.isFinite(age) && age >= 0 && age <= (freshnessDays[field] ?? 30);
};

export const fixtureVerifier: EvidenceVerifier = async (entry, asOf) =>
  offVerifier(entry, asOf).then((fresh) => fresh &&
    entry.url === "https://investor.nvidia.com/financial-info/financial-reports-and-sec-filings/default.aspx" &&
    normalize(entry.quote ?? "") === normalize("NVIDIA announced revenue growth in its latest quarterly results."));
