import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { createInflateRaw } from "node:zlib";

export interface ZipEntry { name: string; method: number; compressedSize: number; size: number; offset: number }

/** Reads the central directory of a zip file on disk. No zip64: the 13F data sets are far below 4 GB. */
export async function listZip(path: string): Promise<ZipEntry[]> {
  const handle = await open(path, "r");
  try {
    const { size } = await handle.stat();
    const tailLength = Math.min(size, 22 + 65535);
    const tail = Buffer.alloc(tailLength);
    await handle.read(tail, 0, tailLength, size - tailLength);
    let end = -1;
    for (let i = tailLength - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { end = i; break; }
    if (end < 0) throw new Error("Not a zip file: end of central directory not found");
    const count = tail.readUInt16LE(end + 10), directorySize = tail.readUInt32LE(end + 12), directoryOffset = tail.readUInt32LE(end + 16);
    if (count === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) throw new Error("zip64 archives are not supported");
    const directory = Buffer.alloc(directorySize);
    await handle.read(directory, 0, directorySize, directoryOffset);
    const entries: ZipEntry[] = [];
    let position = 0;
    for (let i = 0; i < count; i++) {
      if (directory.readUInt32LE(position) !== 0x02014b50) throw new Error("Corrupt zip central directory");
      const nameLength = directory.readUInt16LE(position + 28), extraLength = directory.readUInt16LE(position + 30), commentLength = directory.readUInt16LE(position + 32);
      const entry = { method: directory.readUInt16LE(position + 10), compressedSize: directory.readUInt32LE(position + 20), size: directory.readUInt32LE(position + 24),
        offset: directory.readUInt32LE(position + 42), name: directory.subarray(position + 46, position + 46 + nameLength).toString("utf8") };
      if (entry.compressedSize === 0xffffffff || entry.size === 0xffffffff || entry.offset === 0xffffffff) throw new Error("zip64 entries are not supported");
      entries.push(entry);
      position += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  } finally { await handle.close(); }
}

/** Streams one entry's bytes, inflating as it goes. Memory use is one chunk, not the entry. */
export async function entryStream(path: string, entry: ZipEntry): Promise<Readable> {
  if (entry.method !== 0 && entry.method !== 8) throw new Error(`Unsupported zip method ${entry.method} for ${entry.name}`);
  const handle = await open(path, "r");
  let dataStart: number;
  try {
    const header = Buffer.alloc(30);
    await handle.read(header, 0, 30, entry.offset);
    if (header.readUInt32LE(0) !== 0x04034b50) throw new Error("Corrupt zip local header");
    dataStart = entry.offset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
  } finally { await handle.close(); }
  const raw = createReadStream(path, { start: dataStart, end: dataStart + entry.compressedSize - 1 });
  return entry.method === 8 ? raw.pipe(createInflateRaw()) : raw;
}

/** Tab separated rows from a zip entry, keyed by header name (upper case). */
export async function* tsvRows(path: string, entry: ZipEntry): AsyncGenerator<Record<string, string>> {
  const lines = createInterface({ input: await entryStream(path, entry), crlfDelay: Infinity });
  let header: string[] | undefined;
  for await (const line of lines) {
    if (!line) continue;
    const cells = line.split("\t");
    if (!header) { header = cells.map((cell) => cell.trim().toUpperCase()); continue; }
    const row: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) row[header[i]] = cells[i] ?? "";
    yield row;
  }
}
