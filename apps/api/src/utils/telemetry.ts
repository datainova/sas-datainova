import { prisma } from '@datainova/database';
import type { Prisma } from '@prisma/client';

type TelemetryEventInput = {
  name: string;
  orgId?: string | null;
  userId?: string | null;
  metadata?: Record<string, unknown>;
  sessionId?: string | null;
};

export const recordTelemetryEvent = async ({
  name,
  orgId,
  userId,
  metadata,
  sessionId
}: TelemetryEventInput) => {
  try {
    await prisma.telemetryEvent.create({
      data: {
        name,
        orgId: orgId ?? null,
        userId: userId ?? null,
        sessionId: sessionId ?? null,
        metadata: (metadata ?? {}) as Prisma.InputJsonValue
      }
    });
  } catch (error) {
    // Telemetry must never block the main flow.
  }
};
