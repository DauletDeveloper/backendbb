const { drizzle } = require("drizzle-orm/postgres-js");
const postgres = require("postgres");
require("dotenv/config");
const schema = require("./src/db/schema.js");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL не найдена в переменных окружения!");
}

const client = postgres(connectionString, { prepare: false });
const db = drizzle(client, { schema });

module.exports = { db };
