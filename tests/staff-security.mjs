import assert from "node:assert/strict";
import ts from "typescript";
import { readFile, writeFile } from "node:fs/promises";
const source = await readFile("lib/totp.ts", "utf8");
const url =
  "data:text/javascript;base64," +
  Buffer.from(
    ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    }).outputText,
  ).toString("base64");
const { base32, decode32, totp } = await import(url);
const secret = base32(new TextEncoder().encode("12345678901234567890"));
assert.equal(
  new TextDecoder().decode(decode32(secret)),
  "12345678901234567890",
);
for (const [seconds, expected] of [
  [59, "94287082"],
  [1111111109, "07081804"],
  [1111111111, "14050471"],
  [1234567890, "89005924"],
  [2000000000, "69279037"],
  [20000000000, "65353130"],
])
  assert.equal(await totp(secret, Math.floor(seconds / 30), 8), expected);
console.log(
  "PASS: all six RFC 6238 SHA-1 reference vectors, including dates beyond 2038.",
);
const origin = "http://localhost:5173";
const login = await fetch(origin + "/signin-with-chatgpt?return_to=/", {
  redirect: "manual",
});
let cookie = login.headers
  .getSetCookie()
  .map((s) => s.split(";")[0])
  .join("; ");
async function api(path, data, expected = 200) {
  const r = await fetch(origin + "/api/forum/" + path, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      cookie,
      ...(data === undefined
        ? {}
        : {
            "Content-Type": "application/json",
            "x-forum-request": "1",
            Origin: origin,
          }),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const value = await r.json();
  assert.equal(r.status, expected, JSON.stringify(value));
  for (const c of r.headers.getSetCookie()) {
    const part = c.split(";")[0],
      name = part.split("=")[0];
    cookie = cookie
      .split("; ")
      .filter((s) => !s.startsWith(name + "="))
      .concat(part)
      .join("; ");
  }
  return value;
}
const bootstrap = await api("bootstrap");
assert(bootstrap.user.onboarded, "Run local-api.mjs first");
await api("staff", undefined, 403);
let setupSecret;
if (!bootstrap.user.totp_enabled) {
  setupSecret = (await api("staff-setup", {})).secret;
  await writeFile(".sites-runtime/test-totp-secret", setupSecret);
} else
  setupSecret = (
    await readFile(".sites-runtime/test-totp-secret", "utf8")
  ).trim();
const code = await totp(setupSecret, Math.floor(Date.now() / 30000));
await api("staff-verify", { code });
await api("staff-verify", { code }, 403);
const dashboard = await api("staff");
assert(Array.isArray(dashboard.audit));
const target = "build_this_together";
await api("moderate", {
  action: "remove",
  target_type: "post",
  target_id: target,
  reason: "Local moderation workflow verification.",
});
let publicDetail = await fetch(origin + "/api/forum/posts/" + target);
assert.equal(publicDetail.status, 404);
const removed = await api("posts/" + target);
assert.equal(removed.post.status, "removed");
await api("moderate", {
  action: "restore",
  target_type: "post",
  target_id: target,
  reason: "Restored after local moderation verification.",
});
publicDetail = await fetch(origin + "/api/forum/posts/" + target);
assert.equal(publicDetail.status, 200);
await api(
  "moderate",
  {
    action: "ban",
    target_type: "user",
    target_id: bootstrap.user.id,
    reason: "Local self-restriction denial test.",
  },
  400,
);
await api("moderate", {
  action: "lock",
  target_type: "post",
  target_id: target,
  reason: "Local lock workflow verification.",
});
await api(
  "comments",
  {
    id: crypto.randomUUID(),
    post_id: target,
    body: "Must not publish on a locked discussion.",
  },
  403,
);
await api("moderate", {
  action: "unlock",
  target_type: "post",
  target_id: target,
  reason: "Restored after local lock verification.",
});
await api("staff-lock", {});
await api("staff", undefined, 403);
console.log(
  "PASS: staff gate, authenticator enrollment, verification, replay rejection, audit queue, remove/restore visibility, self-protection, lock enforcement, session revocation.",
);
