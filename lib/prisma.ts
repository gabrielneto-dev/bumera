import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

function createDefaultClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  return createPrismaClient(connectionString);
}

// Reuse one client across hot reloads in development.
export const prisma = globalForPrisma.prisma ?? createDefaultClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
