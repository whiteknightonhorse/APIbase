import { PrismaClient } from '@prisma/client';

/**
 * Shared PrismaClient singleton (§12.194).
 *
 * All services and pipeline stages MUST use this singleton
 * instead of creating their own PrismaClient instances.
 * Prevents connection pool fragmentation.
 */

let prisma: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

/** Shut down Prisma connection (graceful shutdown). */
export async function shutdownPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}
