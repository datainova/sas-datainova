export interface CursorPayload {
  id: string;
  createdAt: string;
}

export const encodeCursor = (payload: CursorPayload) => {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
};

export const decodeCursor = (cursor?: string | null): CursorPayload | null => {
  if (!cursor) {
    return null;
  }

  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf-8");
    const parsed = JSON.parse(decoded) as CursorPayload;
    if (!parsed.id || !parsed.createdAt) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const pageResponse = (itemsLength: number, limit: number, next?: string | null) => ({
  page: {
    size: limit,
    next: next ?? null,
  },
  count: itemsLength,
});
