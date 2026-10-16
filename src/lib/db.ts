import { PrismaClient } from '@prisma/client'

// Ensure DATABASE_URL is set (CI/build environments may not have it)
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:/tmp/distort.db'
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db