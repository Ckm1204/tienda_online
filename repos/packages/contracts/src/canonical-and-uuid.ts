import crypto from "node:crypto";

/**
 * HU-151: Generador y validador de identificadores UUIDv7 (RFC 9562) ordenables lexicográficamente por tiempo.
 */
let lastTimestampMs = 0;
let monotonicSeq = 0;

export function newId(nowMs: number = Date.now()): string {
  if (nowMs === lastTimestampMs) {
    monotonicSeq = (monotonicSeq + 1) & 0x0fff;
  } else {
    lastTimestampMs = nowMs;
    monotonicSeq = crypto.randomInt(0, 0x0fff);
  }

  const bytes = crypto.randomBytes(16);
  const tsBig = BigInt(nowMs);

  // 48-bit big-endian unix_ts_ms
  bytes[0] = Number((tsBig >> 40n) & 0xffn);
  bytes[1] = Number((tsBig >> 32n) & 0xffn);
  bytes[2] = Number((tsBig >> 24n) & 0xffn);
  bytes[3] = Number((tsBig >> 16n) & 0xffn);
  bytes[4] = Number((tsBig >> 8n) & 0xffn);
  bytes[5] = Number(tsBig & 0xffn);

  // version 7 (0111) + 12-bit monotonic sequence in rand_a
  bytes[6] = 0x70 | ((monotonicSeq >> 8) & 0x0f);
  bytes[7] = monotonicSeq & 0xff;

  // variant RFC 4122 / 9562 (10xx)
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function isUuidV7(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

/**
 * HU-152: Serializador JSON canónico determinístico (RFC 8785 / JCS) y hash SHA-256.
 * Produce el mismo resultado en TypeScript y en Rust independientemente del orden de llaves.
 */
export function canonicalJsonStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJsonStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const sortedKeys = Object.keys(record)
    .filter((k) => record[k] !== undefined)
    .sort();
  const entries = sortedKeys.map(
    (k) => `${JSON.stringify(k)}:${canonicalJsonStringify(record[k])}`
  );
  return `{${entries.join(",")}}`;
}

export function canonicalSha256(value: unknown): string {
  const canonical = canonicalJsonStringify(value);
  const hex = crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
  return `sha256:${hex}`;
}

export function rawCanonicalSha256Hex(value: unknown): string {
  const canonical = canonicalJsonStringify(value);
  return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
}
