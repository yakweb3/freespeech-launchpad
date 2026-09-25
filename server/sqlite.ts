import {
  createClient,
  type Client,
  type InValue,
  type ResultSet,
} from "@libsql/client";

let client: Client | undefined;
export function sqlClient() {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) throw new Error("TURSO_DATABASE_URL is not configured.");
    client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  }
  return client;
}
function result<T>(value: ResultSet) {
  return {
    results: value.rows.map((row) =>
      Object.fromEntries(Object.entries(row)),
    ) as T[],
    meta: { changes: value.rowsAffected },
    success: true,
  };
}
export class Prepared {
  constructor(
    readonly sql: string,
    readonly args: InValue[] = [],
  ) {}
  bind(...args: unknown[]) {
    return new Prepared(this.sql, args as InValue[]);
  }
  async first<T = Record<string, any>>() {
    return (await this.all<T>()).results[0] ?? null;
  }
  async all<T = Record<string, any>>() {
    return result<T>(
      await sqlClient().execute({ sql: this.sql, args: this.args }),
    );
  }
  async run() {
    return this.all();
  }
}
export const sqlite = {
  prepare(sql: string) {
    return new Prepared(sql);
  },
  async batch(queries: Prepared[]) {
    return (
      await sqlClient().batch(
        queries.map((q) => ({ sql: q.sql, args: q.args })),
        "write",
      )
    ).map((r) => result<Record<string, any>>(r));
  },
};
