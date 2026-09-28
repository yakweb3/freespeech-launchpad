import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { randomUUID, randomBytes } from "node:crypto";
try {
  process.loadEnvFile(".env.local");
} catch {}
mkdirSync(".sites-runtime", { recursive: true });
const env = {
  ...process.env,
  TURSO_DATABASE_URL:
    "file:.sites-runtime/launchpad-test-" + randomUUID() + ".db",
  TURSO_AUTH_TOKEN: "",
  SOLANA_RPC_URL: "http://127.0.0.1:5176",
  APP_ORIGIN: "http://127.0.0.1:5175",
  BETTER_AUTH_SECRET: randomBytes(32).toString("base64"),
  ADMIN_USER_IDS: "",
  ADMIN_EMAILS: "",
};
env.CRON_SECRET = randomBytes(32).toString("base64url");
for (const port of [5175, 5176]) {
  try {
    await fetch("http://127.0.0.1:" + port, {
      signal: AbortSignal.timeout(300),
    });
    throw new Error("Test port occupied: " + port);
  } catch (e) {
    if (e.message.startsWith("Test port occupied")) throw e;
  }
}
const migration = spawnSync(process.execPath, ["scripts/migrate-vercel.mjs"], {
  env,
  windowsHide: true,
  encoding: "utf8",
});
if (migration.status !== 0)
  throw new Error(migration.stdout + migration.stderr);
const children = [];
let log = "";
function start(args) {
  const p = spawn(process.execPath, args, {
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(p);
  p.stdout.on("data", (d) => (log = (log + d).slice(-16000)));
  p.stderr.on("data", (d) => (log = (log + d).slice(-16000)));
  return p;
}
start(["tests/solana-rpc-fixture.mjs"]);
start([
  "node_modules/next/dist/bin/next",
  "start",
  "-H",
  "127.0.0.1",
  "-p",
  "5175",
]);
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      let r = await fetch(env.APP_ORIGIN + "/api/forum/bootstrap", {
        signal: AbortSignal.timeout(1000),
      });
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  if (!ready) throw new Error("Server failed to start");
  const test = start(["tests/launchpad-api.mjs"]);
  const code = await new Promise((r) => test.on("exit", r));
  if (code !== 0) throw new Error("Launchpad checks failed");
  console.log(log);
} catch (e) {
  console.error(log);
  throw e;
} finally {
  for (const p of children)
    if (p.exitCode === null) {
      if (process.platform === "win32")
        spawnSync("taskkill", ["/PID", String(p.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        });
      else p.kill();
    }
}
