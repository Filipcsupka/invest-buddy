import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import type pg from "pg";

/**
 * Raw response store (roadmap D17, migration 033). Keeps the body a source returned, gzip in Postgres, no expiry.
 * Bodies sit in TOAST for now. Callers only use putSnapshot and getSnapshot, so a later move to files or
 * object storage changes this module only.
 */
export const MAX_SNAPSHOT_BYTES = 20 * 1024 * 1024;

export class SnapshotTooLarge extends Error {
  constructor(readonly sizeBytes: number) { super(`snapshot is ${sizeBytes} bytes, limit is ${MAX_SNAPSHOT_BYTES}`); this.name = "SnapshotTooLarge"; }
}

export interface PutSnapshotInput {
  sourceId: string;
  key: string;
  body: string | Uint8Array;
  contentType: string;
  meta?: Record<string, unknown>;
  fetchedAt?: Date;
}
export interface PutSnapshotResult { id: number; contentHash: string; sizeBytes: number; stored: boolean }
export interface Snapshot {
  id: number;
  sourceId: string;
  key: string;
  fetchedAt: Date;
  contentHash: string;
  contentType: string;
  sizeBytes: number;
  body: Buffer;
  meta: Record<string, unknown>;
}

const toBuffer = (body: string | Uint8Array) => (typeof body === "string" ? Buffer.from(body, "utf8") : Buffer.from(body));

/** sha256 of the uncompressed bytes, hex. Same bytes always give the same hash. */
export const hashBody = (body: string | Uint8Array) => createHash("sha256").update(toBuffer(body)).digest("hex");

/** Stores the body unless this (source, key, hash) is already stored. Throws SnapshotTooLarge over 20 MB uncompressed. */
export async function putSnapshot(db: Pick<pg.Pool, "query">, input: PutSnapshotInput): Promise<PutSnapshotResult> {
  const raw = toBuffer(input.body);
  if (raw.length > MAX_SNAPSHOT_BYTES) throw new SnapshotTooLarge(raw.length);
  const contentHash = createHash("sha256").update(raw).digest("hex");
  const inserted = await db.query<{ id: string }>(
    `INSERT INTO raw_snapshots (source_id, key, fetched_at, content_hash, content_type, size_bytes, body, meta)
     VALUES ($1, $2, COALESCE($3::timestamptz, now()), $4, $5, $6, $7, $8::jsonb)
     ON CONFLICT (source_id, key, content_hash) DO NOTHING RETURNING id`,
    [input.sourceId, input.key, input.fetchedAt ?? null, contentHash, input.contentType, raw.length, gzipSync(raw), JSON.stringify(input.meta ?? {})]);
  if (inserted.rows[0]) return { id: Number(inserted.rows[0].id), contentHash, sizeBytes: raw.length, stored: true };
  const existing = await db.query<{ id: string }>("SELECT id FROM raw_snapshots WHERE source_id=$1 AND key=$2 AND content_hash=$3", [input.sourceId, input.key, contentHash]);
  return { id: Number(existing.rows[0].id), contentHash, sizeBytes: raw.length, stored: false };
}

type Row = { id: string; source_id: string; key: string; fetched_at: Date; content_hash: string; content_type: string; size_bytes: string; body: Buffer; meta: Record<string, unknown> };
const toSnapshot = (row: Row): Snapshot => ({
  id: Number(row.id), sourceId: row.source_id, key: row.key, fetchedAt: row.fetched_at, contentHash: row.content_hash,
  contentType: row.content_type, sizeBytes: Number(row.size_bytes), body: gunzipSync(row.body), meta: row.meta,
});
const COLUMNS = "id, source_id, key, fetched_at, content_hash, content_type, size_bytes, body, meta";

/** One snapshot by id, or null. */
export async function getSnapshot(db: Pick<pg.Pool, "query">, id: number): Promise<Snapshot | null> {
  const result = await db.query<Row>(`SELECT ${COLUMNS} FROM raw_snapshots WHERE id=$1`, [id]);
  return result.rows[0] ? toSnapshot(result.rows[0]) : null;
}

/** The most recently fetched snapshot for a source and key, or null. */
export async function getLatestSnapshot(db: Pick<pg.Pool, "query">, sourceId: string, key: string): Promise<Snapshot | null> {
  const result = await db.query<Row>(`SELECT ${COLUMNS} FROM raw_snapshots WHERE source_id=$1 AND key=$2 ORDER BY fetched_at DESC, id DESC LIMIT 1`, [sourceId, key]);
  return result.rows[0] ? toSnapshot(result.rows[0]) : null;
}
