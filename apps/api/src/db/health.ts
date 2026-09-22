import type { PrismaClient } from '../generated/prisma/client.js';

export async function checkDatabaseHealth(prisma: PrismaClient): Promise<boolean> {
  await prisma.$queryRaw`SELECT 1`;
  return true;
}
