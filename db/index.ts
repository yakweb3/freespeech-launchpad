import { sqlClient } from "@/server/sqlite";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

export function getDb() {
  return drizzle(sqlClient(), { schema });
}
