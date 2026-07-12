require("dotenv/config");

const { defineConfig } = require("prisma/config");

module.exports = defineConfig({
  schema: "prisma/schema.prisma",
  ...(process.env.DATABASE_URL
    ? { datasource: { url: process.env.DATABASE_URL } }
    : {}),
});
