import { randomBytes, createHash } from "crypto";
import { addHours } from "date-fns";

export interface GeneratedToken {
  token: string;
  hash: string;
  expiresAt: Date;
}

export function generateToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function generateTimedToken(hoursValid = 24): GeneratedToken {
  const token = generateToken();
  const hash = hashToken(token);
  const expiresAt = addHours(new Date(), hoursValid);
  return { token, hash, expiresAt };
}
