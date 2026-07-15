import adapterPg = require("@prisma/adapter-pg");
import prismaClient = require("@prisma/client");

require("dotenv/config");

const { PrismaPg } = adapterPg;
const { PrismaClient } = prismaClient;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

export = prisma;
