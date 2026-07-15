import "dotenv/config";

import prismaConfig = require("prisma/config");

const { defineConfig } = prismaConfig;

export = defineConfig({
  schema: "prisma/schema.prisma",
  ...(process.env.DATABASE_URL
    ? { datasource: { url: process.env.DATABASE_URL } }
    : {}),
});
