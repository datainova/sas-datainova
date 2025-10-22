import { PrismaClient } from '@prisma/client';
import { ensureCoreRecordsWithClient } from './seeds/core';
export const prisma = global.prisma ??
    new PrismaClient({
        log: ['error', 'warn']
    });
if (process.env.NODE_ENV !== 'production') {
    global.prisma = prisma;
}
export const ensureCoreRecords = () => ensureCoreRecordsWithClient(prisma);
export { ensureCoreRecordsWithClient };
export { planCatalog } from './seeds/planCatalog';
