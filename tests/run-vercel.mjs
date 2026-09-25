import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { randomUUID, randomBytes } from "node:crypto";
process.loadEnvFile(".env.local");
mkdirSync(".sites-runtime", { recursive: true });
const origin = "http://127.0.0.1:5175";
try {
  await fetch(origin, { signal: AbortSignal.timeout(500) });
  throw new Error("Test port occupied");
} catch (e) {
  if (e.message === "Test port occupied") throw e;
}
const env = {
  ...process.env,
  TURSO_DATABASE_URL: "file:.sites-runtime/vercel-test-" + randomUUID() + ".db",
  TURSO_AUTH_TOKEN: "",
  APP_ORIGIN: origin,
  BETTER_AUTH_SECRET: randomBytes(32).toString("base64"),
  STAFF_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  OWNER_SETUP_CODE: randomBytes(32).toString("base64url"),
  ADMIN_USER_IDS: "",
  ADMIN_EMAILS: "",
};
function command(args) {
  const r = spawnSync(process.execPath, args, {
    env,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(r.stdout + r.stderr);
  process.stdout.write(r.stdout);
}
command(["scripts/migrate-vercel.mjs"]);
const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "5175"],
  { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
);
let log = "";
server.stdout.on("data", (d) => (log = (log + d).slice(-10000)));
server.stderr.on("data", (d) => (log = (log + d).slice(-10000)));
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error(log);
    try {
      const r = await fetch(origin + "/api/forum/bootstrap", {
        signal: AbortSignal.timeout(1500),
      });
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error("Server did not start: " + log);
  command(["tests/vercel-api.mjs"]);
} catch (error) {
  console.error(log);
  throw error;
} finally {
  if (server.exitCode === null) {
    if (process.platform === "win32")
      spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    else server.kill("SIGTERM");
  }
}
