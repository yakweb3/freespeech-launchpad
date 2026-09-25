import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/libsql";
import { sqlClient } from "./sqlite";
import * as schema from "@/db/auth-schema";
import { appOrigin } from "./origin";

let instance: ReturnType<typeof createAuth> | undefined;
function createAuth() {
  if (!process.env.BETTER_AUTH_SECRET)
    throw new Error("Authentication secret is not configured.");
  return betterAuth({
    appName: "FreeSpeech",
    baseURL: appOrigin(),
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(drizzle(sqlClient(), { schema }), {
      provider: "sqlite",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: false,
    },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 30,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 3600, max: 5 },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async () => {
            const result = await sqlClient().execute(
              "SELECT value FROM settings WHERE key='registrations_open'",
            );
            return result.rows[0]?.value !== "0";
          },
        },
      },
    },
  });
}
export function auth() {
  return (instance ??= createAuth());
}
