import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const adapter = new PrismaPg({ connectionString });
// Глобальный omit защищает от утечки секретов через include/select по всем
// запросам; логин переопределяет per-query через omit: { passwordHash: false }.
const prisma = new PrismaClient({
  adapter,
  omit: { customer: { passwordHash: true, totpSecret: true } },
});

export default prisma;
