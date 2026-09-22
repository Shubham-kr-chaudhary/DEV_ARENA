import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadServerConfig } from '@devarena/config';
import { PrismaClient } from '../generated/prisma/client.js';

let prismaClient: PrismaClient | undefined;

export function getPrismaClient(): PrismaClient {
  if (prismaClient) {
    return prismaClient;
  }

  const { DATABASE_URL: connectionString } = loadServerConfig();
  const adapter = new PrismaPg({ connectionString });
  prismaClient = new PrismaClient({ adapter });

  return prismaClient;
}

export async function disconnectPrisma(): Promise<void> {
  if (!prismaClient) {
    return;
  }

  await prismaClient.$disconnect();
  prismaClient = undefined;
}
