import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import type { SourceHttp } from "./client";
import type { Company, SourceContext } from "./common";

/** Helpers for the offline tests. Nothing here touches the network. */
export const fixtureDir = join(process.cwd(), "src/collectors/sources/fixtures");
export const fx = (name: string) => readFileSync(join(fixtureDir, name), "utf8");

export interface Call { method: "GET" | "POST"; url: string; body?: unknown }
export type StubHttp = SourceHttp & { calls: Call[] };
/** The handler returns the response body, or throws. `download` writes whatever `file` returns for the URL. */
export function stubHttp(handler: (call: Call) => string, files: (url: string) => Buffer | undefined = () => undefined): StubHttp {
  const calls: Call[] = [];
  return {
    calls,
    async get(url) { const call = { method: "GET" as const, url }; calls.push(call); return handler(call); },
    async post(url, body) { const call = { method: "POST" as const, url, body }; calls.push(call); return handler(call); },
    async download(url, file) {
      calls.push({ method: "GET", url });
      const data = files(url);
      if (!data) throw new Error(`no stub file for ${url}`);
      writeFileSync(file, data);
      return data.length;
    },
  };
}

export const COMPANIES: Company[] = [
  { symbol: "NVDA", name: "NVIDIA", sector: "AI & semiconductors" },
  { symbol: "PLTR", name: "Palantir", sector: "AI & semiconductors" },
  { symbol: "SQ", name: "Block", sector: "Fintech" },
  { symbol: "GOOGL", name: "Alphabet", sector: "Platforms" },
  { symbol: "VRTX", name: "Vertex", sector: "Biotech" },
  { symbol: "REGN", name: "Regeneron", sector: "Biotech" },
  { symbol: "CRSP", name: "CRISPR", sector: "Biotech" },
];
export function context(http: SourceHttp, overrides: Partial<SourceContext> = {}): SourceContext {
  return { http, companies: COMPANIES, symbols: COMPANIES.map((company) => company.symbol), since: "2026-09-05", now: new Date("2026-10-05T12:00:00Z"), env: {}, ...overrides };
}

const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (data: Buffer) => { let c = 0xffffffff; for (const byte of data) c = table[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
/** Minimal zip writer. `stored` entries use method 0, the rest are deflated (method 8). */
export function buildZip(files: Record<string, string>, stored: string[] = []): Buffer {
  const locals: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text), method = stored.includes(name) ? 0 : 8, data = method ? deflateRawSync(raw) : raw, nameBytes = Buffer.from(name);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(method, 8);
    header.writeUInt32LE(crc32(raw), 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(raw.length, 22); header.writeUInt16LE(nameBytes.length, 26);
    locals.push(header, nameBytes, data);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(method, 10);
    entry.writeUInt32LE(crc32(raw), 16); entry.writeUInt32LE(data.length, 20); entry.writeUInt32LE(raw.length, 24); entry.writeUInt16LE(nameBytes.length, 28); entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
