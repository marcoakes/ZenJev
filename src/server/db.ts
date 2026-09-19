import { PrismaClient } from '@prisma/client';
const globalDB = globalThis as unknown as { zenjevDB?: PrismaClient };
export const db = globalDB.zenjevDB ?? new PrismaClient({log:[]});
if (process.env.NODE_ENV !== 'production') globalDB.zenjevDB = db;
