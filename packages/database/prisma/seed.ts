import { PrismaClient } from '@prisma/client';
import { ensureCoreRecordsWithClient } from '../src/seeds/core';

const prisma = new PrismaClient({
  log: ['error', 'warn']
});

const main = async () => {
  await ensureCoreRecordsWithClient(prisma);
};

main()
  .catch((error) => {
    console.error('⛔️ Failed to seed database', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
