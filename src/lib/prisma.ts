import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function databaseUrlWithPoolLimits(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") return value;
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", process.env.PRISMA_CONNECTION_LIMIT || "5");
    }
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", process.env.PRISMA_POOL_TIMEOUT || "30");
    }
    return url.toString();
  } catch {
    return value;
  }
}

const datasourceUrl = databaseUrlWithPoolLimits(process.env.DATABASE_URL);

export const prisma = globalForPrisma.prisma || new PrismaClient(
  datasourceUrl ? { datasourceUrl } : undefined
);

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
