import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import "dotenv/config";
import * as schema from "./src/db/schema.ts"; 

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL не найдена в переменных окружения!");
}

const client = postgres(connectionString, { prepare: false });
export const db = drizzle(client, { schema }); 