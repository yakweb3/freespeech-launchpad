import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
const npmCli = process.argv[2];
if (!npmCli || !existsSync(npmCli))
  throw new Error("Pass the installed npm CLI JavaScript path.");
mkdirSync(".sites-runtime", { recursive: true });
const file = ".sites-runtime/vercel-secrets.json";
const values = existsSync(file)
  ? JSON.parse(readFileSync(file, "utf8"))
  : {
      BETTER_AUTH_SECRET: randomBytes(32).toString("base64"),
      STAFF_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
      OWNER_SETUP_CODE: randomBytes(32).toString("base64url"),
    };
writeFileSync(file, JSON.stringify(values, null, 2), { mode: 0o600 });
for (const [key, value] of Object.entries(values)) {
  const r = spawnSync(
    process.execPath,
    [
      npmCli,
      "exec",
      "--yes",
      "--package",
      "vercel",
      "--",
      "vercel",
      "env",
      "add",
      key,
      "production",
      "--sensitive",
      "--yes",
    ],
    { input: value, encoding: "utf8", windowsHide: true },
  );
  const output = (r.stdout + r.stderr).replaceAll(value, "[redacted]");
  if (r.status !== 0) throw new Error(output);
  console.log("Configured production " + key);
}
console.log(
  "Private recovery copy saved under ignored .sites-runtime/vercel-secrets.json. Do not commit it.",
);
