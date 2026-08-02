import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client.js";

let prismaClient: PrismaClient | undefined;

export function getPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required to create the Prisma client.");
  }

  prismaClient ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  return prismaClient;
}

export async function disconnectPrisma(): Promise<void> {
  await prismaClient?.$disconnect();
  prismaClient = undefined;
}
