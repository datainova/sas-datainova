import { createHash } from "crypto";

export type SegmentValue = string | number | boolean;
export type SegmentKey = Record<string, SegmentValue>;

export const canonicalizeSegmentKey = (
  segment: SegmentKey | null | undefined
) => {
  if (!segment) {
    return null;
  }

  const entries = Object.entries(segment).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  return Object.fromEntries(entries) as SegmentKey;
};

export const serializeSegmentKey = (
  segment: SegmentKey | null | undefined
) => {
  const canonical = canonicalizeSegmentKey(segment);
  if (!canonical) {
    return "";
  }

  return JSON.stringify(canonical);
};

export const hashSegmentKey = (segment: SegmentKey | null | undefined) => {
  const serialized = serializeSegmentKey(segment);
  if (!serialized || serialized === "\"\"") {
    return Buffer.alloc(0);
  }

  return createHash("sha256").update(serialized).digest();
};
