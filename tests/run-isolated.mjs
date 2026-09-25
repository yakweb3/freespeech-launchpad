import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
const root = process.cwd(),
  port = 5174,
  origin = "http://127.0.0.1:" + port;
if (!existsSync("dist/server/wrangler.json"))
  throw new Error("Build the application first.");
try {
  await fetch(origin + "/api/forum/health", {
    signal: AbortSignal.timeout(500),
  });
  throw new Error(
    "The isolated test port is occupied. Stop the prior test server first.",
  );
} catch (error) {
  if (error.message.includes("occupied")) throw error;
}
const state = resolve(".sites-runtime/isolated-" + randomUUID());
mkdirSync(state, { recursive: true });
const base = [
  "--import",
  "./scripts/sites-env.mjs",
  "./node_modules/wrangler/bin/wrangler.js",
];
function command(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    windowsHide: true,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, FORUM_TEST_STATE: state },
  });
  if (result.status !== 0)
    throw new Error((result.stdout || "") + (result.stderr || ""));
  return result.stdout;
}
for (const migration of [
  "drizzle/0000_boring_nico_minoru.sql",
  "drizzle/0001_fuzzy_romulus.sql",
])
  command([
    ...base,
    "d1",
    "execute",
    "DB",
    "--local",
    "--config",
    "dist/server/wrangler.json",
    "--persist-to",
    state,
    "--file",
    migration,
    "--json",
  ]);
// These intentionally public fixture values are used ONLY in this loopback test process.
const server = spawn(
  process.execPath,
  [
    ...base,
    "dev",
    "--config",
    "dist/server/wrangler.json",
    "--local",
    "--persist-to",
    state,
    "--ip",
    "127.0.0.1",
    "--port",
    String(port),
    "--inspector-port",
    "0",
    "--var",
    "ADMIN_USER_IDS:qa_admin_env",
    "--var",
    "STAFF_ENCRYPTION_KEY:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    "--log-level",
    "error",
  ],
  { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
);
let log = "";
server.stdout.on("data", (d) => {
  log = (log + d).slice(-10000);
});
server.stderr.on("data", (d) => {
  log = (log + d).slice(-10000);
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (server.exitCode !== null)
      throw new Error("Test server stopped: " + log);
    try {
      const r = await fetch(origin + "/api/forum/health", {
        signal: AbortSignal.timeout(750),
      });
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error("Test server did not become ready: " + log);
  process.stdout.write(command(["tests/isolated-api.mjs"]));
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
